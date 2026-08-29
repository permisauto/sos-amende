"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { storageWrite } from "@/lib/storage";
import {
  FAILLE_IDS,
  dateLimitePv,
  detecterFailles,
  remplirTemplate,
  type ExtractedData,
  type RegleDetection,
} from "@/lib/moteur";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { extrairePv, normaliserPv } from "@/lib/ocr";
import { notifierStatut } from "@/lib/notifications";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo

export type CreateDossierState = { error?: string } | undefined;

export async function createDossier(
  _prev: CreateDossierState,
  formData: FormData,
): Promise<CreateDossierState> {
  const user = await requireUser();

  const type = formData.get("type");
  const file = formData.get("pv");

  const parsedType = z.enum(["AMENDE", "SUSPENSION"]).safeParse(type);
  if (!parsedType.success) {
    return { error: "Type d'infraction invalide." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Veuillez sélectionner votre avis de contravention." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Format non supporté (JPEG, PNG, WebP ou PDF)." };
  }
  if (file.size > MAX_SIZE) {
    return { error: "Fichier trop volumineux (maximum 8 Mo)." };
  }

  // Parcours analyse d'abord : le dépôt est gratuit, le paiement n'intervient
  // qu'après le scoring si une faille est validée (le crédit sera débité à ce moment-là).
  const ext = (file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const safeName = `pv/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const pvUrl = await storageWrite(safeName, buffer);

  // OCR (garde-fou human-in-the-loop) : pré-remplit le formulaire d'analyse,
  // jamais l'analyse finale — un humain vérifie puis soumet.
  const prefill: Record<string, string> = {};
  const ocr = await extrairePv(buffer);
  if (ocr) {
    Object.assign(prefill, normaliserPv(ocr.texte));
  }

  const prix = parsedType.data === "AMENDE" ? 39 : 59;

  const dossier = await prisma.$transaction(async (tx) => {
    const d = await tx.dossier.create({
      data: {
        userId: user.id,
        type: parsedType.data,
        statut: "EN_ANALYSE",
        pvUrl,
        pvTexte: ocr?.texte ?? null, // texte brut scanné (détection par scan)
        prix,
        extractedData: prefill,
      },
    });
    await tx.dossierEvent.create({
      data: { dossierId: d.id, type: "CREATION" },
    });
    return d;
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/cases/${dossier.id}`);
}

const analyseSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  plaque: z.string().trim().optional(),
  num_pv: z.string().trim().min(1, "Numéro PV requis"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  heure: z.string().trim().optional(),
  montant: z.string().trim().optional(),
  numTelePaiement: z.string().trim().optional(),
  cle: z.string().trim().optional(),
  typeRadar: z.string().trim().optional(),
  radarId: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  lieu: z.string().trim().optional(),
  prefecture: z.string().trim().optional(),
  duree: z.string().trim().optional(),
  motif: z.string().trim().optional(),
});

export type AnalyseState = { error?: string } | undefined;

export async function analyserDossier(
  _prev: AnalyseState,
  formData: FormData,
): Promise<AnalyseState> {
  const user = await requireUser();

  const dossierId = String(formData.get("dossierId") ?? "");
  const parsed = analyseSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      error: "Champs obligatoires manquants ou invalides (nom, plaque, n° PV, date).",
    };
  }

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "EN_ANALYSE") {
    return { error: "Ce dossier n'est plus en attente d'analyse." };
  }

  const data: ExtractedData = {
    ...parsed.data,
    plaqueIncorrecte: formData.get("plaqueIncorrecte") === "on",
    paiementDejaFait: formData.get("paiementDejaFait") === "on",
    vehiculeCede: formData.get("vehiculeCede") === "on",
    vehiculeVole: formData.get("vehiculeVole") === "on",
    conducteurDifferent: formData.get("conducteurDifferent") === "on",
  };

  const failles = await prisma.failleJuridique.findMany({
    where: { statut: "ACTIVE", typeInfraction: dossier.type },
  });

  // Contexte étalonnage : si un radar est connu, sa date d'expiration permet
  // au moteur de détecter la faille « certificat d'étalonnage » avec preuve.
  let dateExpirationEtalonnage: Date | null = null;
  if (data.radarId) {
    const cal = await prisma.radarCalibration.findFirst({
      where: { radarId: data.radarId },
      orderBy: { dateExpiration: "desc" },
    });
    if (cal) dateExpirationEtalonnage = cal.dateExpiration;
  }

  // Détection par scan (données extraites + texte brut du PV) : toutes les
  // failles candidates sont enregistrées ; le juriste confirme/rejette ensuite.
  const candidats = detecterFailles(
    data,
    dossier.pvTexte,
    failles.map((f) => ({
      id: f.id,
      reglesDetection: f.reglesDetection as unknown as
        | RegleDetection[]
        | null,
    })),
    { dateExpirationEtalonnage },
  );

  const principalId = candidats[0] ?? null;
  const faille = principalId
    ? failles.find((f) => f.id === principalId) ?? null
    : null;

  if (principalId === FAILLE_IDS.etalonnage && data.radarId) {
    const cal = await prisma.radarCalibration.findFirst({
      where: { radarId: data.radarId },
      orderBy: { dateExpiration: "desc" },
    });
    if (cal) data.preuveEtalonnage = cal.preuveUrl;
  }

  const lettre = faille
    ? remplirTemplate(faille.templateLettre, data)
    : null;

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        extractedData: data as object,
        failleJuridiqueId: faille?.id ?? null,
        lettreGeneree: lettre,
        dateLimite: dateLimitePv(data.date, dossier.type),
        statut: "A_VERIFIER",
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ANALYSE",
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: faille ? "LETTRE_GENEREE" : "EN_ATTENTE",
      },
    }),
    // Réinitialise les candidatures puis rejoue toutes les failles détectées
    // (un retour à l'analyse relance la détection automatique).
    prisma.dossierFaille.deleteMany({ where: { dossierId: dossier.id } }),
    ...candidats.map((failleId) =>
      prisma.dossierFaille.create({
        data: { dossierId: dossier.id, failleId, statut: "CANDIDATE" },
      }),
    ),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath(`/dashboard/cases/${dossier.id}`);
  redirect(`/dashboard/cases/${dossier.id}?analyse=ok`);
}

export type SignerState = { error?: string } | undefined;

export type EnvoyerState = { error?: string } | undefined;

/**
 * Envoi LRAR par le client (Option A v1) : la lettre validée par le juriste
 * est postée par le client lui-même (recommandé avec accusé de réception).
 * La transmission automatisée (RPA ANTAI) arrivera dans une étape ultérieure.
 */
export async function envoyerDossier(
  _prev: EnvoyerState,
  formData: FormData,
): Promise<EnvoyerState> {
  const user = await requireUser();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      error: "La lettre doit d'abord être validée par un juriste.",
    };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "ENVOYE" },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ENVOI",
        detail: "Envoyé par le client en recommandé avec accusé de réception",
      },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath(`/dashboard/cases/${dossier.id}`);
  redirect(`/dashboard/cases/${dossier.id}?envoye=ok`);
}

export async function signerDossier(
  _prev: SignerState,
  formData: FormData,
): Promise<SignerState> {
  const user = await requireUser();

  const dossierId = String(formData.get("dossierId") ?? "");
  const signature = String(formData.get("signature") ?? "");

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "A_VERIFIER") {
    return { error: "La signature n'est disponible qu'une fois la lettre générée." };
  }
  if (!dossier.lettreGeneree) {
    return { error: "Aucune lettre à signer." };
  }
  if (!signature.startsWith("data:image/png;base64,")) {
    return { error: "Signature invalide." };
  }

  // Paiement requis : le dépôt est gratuit, la signature débloque le crédit
  const debit = await prisma.user.updateMany({
    where: { id: user.id, credits: { gte: 1 } },
    data: { credits: { decrement: 1 } },
  });
  if (debit.count === 0) {
    return { error: "Paiement requis : finalisez votre paiement (Stripe ou virement) avant de signer." };
  }

  const png = Buffer.from(signature.split(",")[1], "base64");
  const sigName = `signatures/sig-${dossier.id}-${Date.now()}.png`;
  const pdfName = `pdfs/lettre-${dossier.id}.pdf`;

  const signatureUrl = await storageWrite(sigName, png);

  const pdfBuffer = await generateLettrePdf(dossier.lettreGeneree, signature);
  const pdfUrl = await storageWrite(pdfName, pdfBuffer);

  await prisma.courrier.create({
    data: {
      dossierId: dossier.id,
      signatureUrl,
      pdfUrl,
    },
  });

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "PRET" },
    }),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "SIGNATURE" },
    }),
  ]);

  revalidatePath(`/dashboard/cases/${dossier.id}`);
  redirect(`/dashboard/cases/${dossier.id}?signe=ok`);
}

export type DemanderAvocatState = { error?: string } | undefined;

/**
 * Mise en relation avocat (PLAN §2) : le client demande une orientation vers
 * un avocat partenaire. Aucune consultation juridique n'est faite ici — un
 * juriste traite la demande et affecte (ou refuse) un partenaire.
 */
export async function demanderAvocat(
  _prev: DemanderAvocatState,
  formData: FormData,
): Promise<DemanderAvocatState> {
  const user = await requireUser();

  const dossierId = String(formData.get("dossierId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }

  const existant = await prisma.lawyerMatch.findUnique({
    where: { dossierId: dossier.id },
  });
  if (existant) {
    return { error: "Une demande est déjà en cours pour ce dossier." };
  }

  await prisma.lawyerMatch.create({
    data: {
      dossierId: dossier.id,
      userId: user.id,
      motif: motif || null,
    },
  });

  revalidatePath(`/dashboard/cases/${dossier.id}`);
  return undefined;
}