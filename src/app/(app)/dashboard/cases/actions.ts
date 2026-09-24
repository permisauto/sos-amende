"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { storageRead, storageWrite } from "@/lib/storage";
import {
  FAILLE_IDS,
  dateLimitePv,
  detecterFailles,
  remplirLettreMulti,
  type ExtractedData,
  type RegleDetection,
} from "@/lib/moteur";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { extrairePv, normaliserPv } from "@/lib/ocr";
import { notifierStatut } from "@/lib/notifications";
import {
  lettreAvecPiecesVersees,
  listePiecesJointes,
  recupererPreuvesPourDossierId,
  typesPreuvesPourFailles,
} from "@/lib/preuves-api";
import { soumettreEtMarquerEnvoye } from "../juriste/actions";

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
  const signature = String(formData.get("signature") ?? "");

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
    // Gemini renvoie des champs structurés (plus fiables que les regex) ;
    // sinon on applique normaliserPv sur le texte brut (providers classiques).
    const struct = ocr.extrait;
    if (struct && Object.keys(struct).length > 0) {
      Object.assign(prefill, struct);
    } else {
      Object.assign(prefill, normaliserPv(ocr.texte));
    }
  }

  const prix = parsedType.data === "AMENDE" ? 39 : 59;

  // Signature du client capturée au dépôt : stockée une fois sur le profil,
  // réutilisée pour chaque lettre (plus besoin de la retracer par dossier).
  // Best-effort : en cas d'échec, le dépôt continue sans signature enregistrée.
  let signatureUrl: string | null = null;
  if (signature && signature.startsWith("data:image/png;base64,")) {
    try {
      const png = Buffer.from(signature.split(",")[1], "base64");
      if (png.length > 0) {
        signatureUrl = await storageWrite(
          `signatures/sig-${user.id}-${Date.now()}.png`,
          png,
        );
      }
    } catch (e) {
      console.error("createDossier: enregistrement signature échoué", e);
    }
  }

  const dossier = await prisma.$transaction(async (tx) => {
    if (signatureUrl) {
      await tx.user.update({
        where: { id: user.id },
        data: { signatureUrl },
      });
    }
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
    adresseIncorrecte: formData.get("adresseIncorrecte") === "on",
    travaux_présents: formData.get("travaux_présents") === "on",
    conditions_meteo:
      formData.get("conditions_meteo") === "on"
        ? "Pluie"
        : undefined,
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

  // Lettre multi-arguments : toutes les failles candidates sont juxtaposées
  // dans une seule lettre (chaque section reste un template admin validé).
  // La première candidate reste la faille principale (failleJuridiqueId).
  const candidatsFailles = candidats
    .map((id) => failles.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => !!f);
  const lettre = remplirLettreMulti(
    candidatsFailles.map((f) => ({
      id: f.id,
      titreFaille: f.titreFaille,
      articleLoi: f.articleLoi,
      templateLettre: f.templateLettre,
    })),
    data,
  );

  // Débit du crédit au moment de la mise en file de validation (payant) :
  // - faille + crédit disponible  → débit immédiat → EN_ATTENTE_VALIDATION ;
  // - faille sans crédit          → EN_ATTENTE_PAIEMENT (le virement est
  //   rattaché au dossier ; à sa validation l'admin consomme le crédit, net à
  //   zéro) ;
  // - sans faille (aucune lettre) → EN_ATTENTE_VALIDATION sans débit : le
  //   juriste examine le fondement, le crédit n'est jamais débité.
  const statut = await prisma.$transaction(async (tx) => {
    let next: "EN_ATTENTE_VALIDATION" | "EN_ATTENTE_PAIEMENT";
    if (faille) {
      const debit = await tx.user.updateMany({
        where: { id: user.id, credits: { gte: 1 } },
        data: { credits: { decrement: 1 } },
      });
      next =
        debit.count === 1 ? "EN_ATTENTE_VALIDATION" : "EN_ATTENTE_PAIEMENT";
    } else {
      next = "EN_ATTENTE_VALIDATION";
    }

    await tx.dossier.update({
      where: { id: dossier.id },
      data: {
        extractedData: data as object,
        failleJuridiqueId: faille?.id ?? null,
        lettreGeneree: lettre,
        dateLimite: dateLimitePv(data.date, dossier.type),
        statut: next,
      },
    });
    await tx.dossierEvent.create({
      data: { dossierId: dossier.id, type: "ANALYSE" },
    });
    await tx.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: faille ? "LETTRE_GENEREE" : "EN_ATTENTE",
        detail:
          next === "EN_ATTENTE_PAIEMENT"
            ? "En attente de paiement (virement bancaire)"
            : undefined,
      },
    });
    // Réinitialise les candidatures puis rejoue toutes les failles détectées
    // (une relance de l'analyse relance aussi la détection automatique).
    await tx.dossierFaille.deleteMany({ where: { dossierId: dossier.id } });
    for (const failleId of candidats) {
      await tx.dossierFaille.create({
        data: { dossierId: dossier.id, failleId, statut: "CANDIDATE" },
      });
    }
    return next;
  });

  // Preuves externes (météo, fiche radar, travaux) récupérées automatiquement
  // depuis les sources publiques, uniquement pour les types pertinents aux
  // failles détectées (voir PREUVES_PAR_FAILLE) — pas de preuve hors-sujet.
  // Best-effort : ne bloque jamais l'analyse.
  const typesPreuves = typesPreuvesPourFailles(candidats);
  await recupererPreuvesPourDossierId(prisma, dossier.id, {
    types: typesPreuves,
  }).catch(() => {});

  // Pièces versées : les preuves réellement récupérées sont citées par écrit
  // dans le corps de la lettre (inventaire factuel, jamais de texte inventé).
  const lettreVersee = await lettreAvecPiecesVersees(prisma, dossier.id, lettre);
  if (lettreVersee !== lettre) {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettreVersee },
    });
  }

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/juriste");
  if (statut === "EN_ATTENTE_PAIEMENT") {
    redirect(`/dashboard/paiement/${dossier.id}`);
  }
  redirect(`/dashboard/cases/${dossier.id}?analyse=ok`);
}

export type SignerState = { error?: string } | undefined;

export async function signerDossier(
  _prev: SignerState,
  formData: FormData,
): Promise<SignerState> {
  const user = await requireUser();

  const dossierId = String(formData.get("dossierId") ?? "");
  const signature = String(formData.get("signature") ?? "");

  const dossier = await prisma.dossier.findFirst({
    where: { id: dossierId, userId: user.id },
    include: { preuves: { orderBy: { createdAt: "asc" } } },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "A_VERIFIER" && dossier.statut !== "EN_ATTENTE_PRE_SIGNATURE") {
    return { error: "La signature n'est disponible qu'une fois la lettre validée par un juriste." };
  }
  if (!dossier.lettreGeneree) {
    return { error: "Aucune lettre à signer." };
  }

  // Le crédit est déjà consommé à l'analyse (EN_ATTENTE_VALIDATION) ou par la
  // validation du virement (EN_ATTENTE_PAIEMENT → EN_ATTENTE_VALIDATION) :
  // la signature ne débite plus rien.

  // Signature : celle capturée au dépôt (User.signatureUrl) est réutilisée ;
  // une nouvelle trace écrase la précédente et devient la référence du profil.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { signatureUrl: true },
  });
  let signatureDataUrl: string | null = null;
  let signatureUrl = userRow?.signatureUrl ?? null;
  if (signature.startsWith("data:image/png;base64,")) {
    signatureDataUrl = signature;
    const png = Buffer.from(signature.split(",")[1], "base64");
    if (png.length > 0) {
      try {
        signatureUrl = await storageWrite(
          `signatures/sig-${user.id}-${Date.now()}.png`,
          png,
        );
        await prisma.user.update({
          where: { id: user.id },
          data: { signatureUrl },
        });
      } catch (e) {
        console.error("signerDossier: maj signature profil échouée", e);
      }
    }
  } else if (signatureUrl) {
    const sig = await storageRead(signatureUrl);
    if (sig) {
      signatureDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    }
  }
  if (!signatureDataUrl) {
    return { error: "Signature invalide." };
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  const pdfBuffer = await generateLettrePdf(
    dossier.lettreGeneree,
    signatureDataUrl,
    piecesJointes,
  );
  const pdfName = `pdfs/lettre-${dossier.id}.pdf`;
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
  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);

  // Signature du client = feu vert à l'envoi (dossier déjà validé par le
  // juriste) : soumission immédiate au portail (ANTAI / Télérecours), sauf si
  // le canal LRAR a été choisi (SOS Amende envoie la lettre par nos soins — le
  // juriste déclenche le dépôt). Un dossier hérité en A_VERIFIER (jamais
  // validé) reste en PRET : le juriste le validera avant tout envoi.
  if (dossier.canalEnvoi === "LRAR" || !dossier.valideLe) {
    redirect(`/dashboard/cases/${dossier.id}?signe=ok`);
  }
  const envoi = await soumettreEtMarquerEnvoye(dossier.id);
  if (envoi.ok) {
    redirect(`/dashboard/cases/${dossier.id}?envoye=ok`);
  }
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