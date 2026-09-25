"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuristeRedacteur } from "@/lib/dal";
import {
  FAILLE_IDS,
  detecterFailles,
  remplirLettreMulti,
  type ExtractedData,
  type RegleDetection,
} from "@/lib/moteur";
import { notifierStatut } from "@/lib/notifications";
import { storageRead, storageWrite } from "@/lib/storage";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { soumettreDossier } from "@/lib/antai";
import { generatePreuvePdf } from "@/lib/preuve-pdf";
import { destinataireLrar, canauxEnvoi, formaterLettreOfficielle, organismeEnvoi, type CanalEnvoi } from "@/lib/envoi";
import { setDemoLettre } from "@/lib/demo-lettres";
import { lettreAvecPiecesVersees, listePiecesJointes, recupererPreuvesPourDossierId } from "@/lib/preuves-api";

export type ValidationState = { error?: string; ok?: boolean } | undefined;

const DECISION_OMP = ["ACCEPTE", "REJETE"] as const;

const DEMO_IDS = new Set([
  "pv-analyse-001",
  "pv-sign-002",
  "pv-pret-003",
  "pv-envoye-004",
  "pv-rejete-005",
  "pv-resolu-006",
  "dec-analyse-007",
  "dec-sign-008",
  "dec-pret-009",
]);

function isDemoId(id: string): boolean {
  return DEMO_IDS.has(id) || id.startsWith("pv-") || id.startsWith("dec-");
}

/**
 * Soumission de la contestation (lettre + pièces jointes) vers le portail
 * ANTAI / Télérecours dès la validation du juriste. En cas de succès le
 * dossier passe en ENVOYE avec accusé de dépôt ; en cas d'échec il reste
 * PRET/validé — le juriste peut relancer ou basculer sur le canal lettre
 * recommandée (envoyée par SOS Amende).
 */
export async function soumettreEtMarquerEnvoye(dossierId: string) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
  // Garde de statut : seul un dossier PRET (signé, validé) peut être envoyé.
  // Évite un double envoi (course de relance, envoi LRAR par nos soins…).
  if (dossier.statut !== "PRET") {
    return {
      ok: false as const,
      error: "Ce dossier n'est plus en attente d'envoi (déjà transmis ?).",
    };
  }
  // Garde-fou canal : un dossier au canal lettre recommandée ne doit jamais
  // partir en soumission en ligne — l'envoi LRAR est effectué par SOS Amende
  // (`envoyerParLrar`), pas par ce portail.
  if (dossier.canalEnvoi === "LRAR") {
    return {
      ok: false as const,
      error:
        "Canal lettre recommandée retenu : la contestation est envoyée par SOS Amende (LRAR), pas en ligne.",
    };
  }

  // Verrou atomique : la transition PRET → ENVOYE se fait AVANT l'appel
  // externe pour empêcher deux soumissions concurrentes (deux clics, relance
  // simultanée du client et du juriste). Si la soumission échoue, on revient
  // en PRET (lettre validée, relançable).
  const verrou = await prisma.dossier.updateMany({
    where: { id: dossier.id, statut: "PRET" },
    data: { statut: "ENVOYE" },
  });
  if (verrou.count === 0) {
    return { ok: false as const, error: "Dossier déjà envoyé." };
  }

  const organisme = organismeEnvoi(dossier.type);
  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });
  const result = await soumettreDossier(
    dossier,
    piecesJointes.map((nom) => ({ nom })),
  );
  if (!result.ok) {
    // Rollback : retour en PRET (lettre validée) — le juriste relance ou
    // bascule sur le canal lettre recommandée (SOS Amende) via
    // `envoyerContestation`.
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "PRET" },
    });
    return result;
  }

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  await prisma.$transaction([
    ...(courrier
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { preuveDepotUrl: result.preuveUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ENVOI",
        detail: `Envoyé à ${organisme} (n° dépôt ${result.numeroDepot}).`,
      },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  return { ok: true as const, numeroDepot: result.numeroDepot };
}

export async function enregistrerDecisionOmp(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const raw = String(formData.get("decisionOmp") ?? "");
  const decisionOmp = DECISION_OMP.find((d) => d === raw);
  if (!decisionOmp) {
    return { error: "Décision OMP invalide." };
  }
  const decisionDetail = String(formData.get("decisionDetail") ?? "").trim();

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?decision=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "ENVOYE") {
    return { error: "La décision OMP ne s'applique qu'aux dossiers envoyés." };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        statut: "RESOLU",
        decisionOmp,
        decisionDetail: decisionDetail || null,
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "DECISION",
        detail: decisionDetail || decisionOmp,
      },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?decision=ok`);
}

export async function validerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const canalSaisi = String(formData.get("canalEnvoi") ?? "");
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      courriers: { orderBy: { createdAt: "asc" } },
      user: { select: { signatureUrl: true } },
      preuves: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?valide=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  // Statuts éligibles : EN_ATTENTE_VALIDATION (nouveau flux) et legs
  // PRET/A_VERIFIER (dossiers démarrés avant la refonte, démos).
  if (
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "A_VERIFIER"
  ) {
    return { error: "Seul un dossier en attente de validation peut être approuvé." };
  }
  if (!dossier.lettreGeneree) {
    return { error: "Aucune lettre générée à valider." };
  }

  // Canal d'envoi choisi par le juriste, restreint au type d'infraction
  // (AMENDE : ANTAI/LRAR, SUSPENSION : Télérecours/LRAR).
  const canaux = canauxEnvoi(dossier.type);
  let canal: CanalEnvoi = canaux[0];
  if (canalSaisi) {
    const valide = canaux.some((c) => c === canalSaisi);
    if (!valide) {
      return {
        error:
          "Canal d'envoi invalide pour ce type de dossier (amende : ANTAI ou lettre recommandée ; suspension : Télérecours ou lettre recommandée).",
      };
    }
    canal = canalSaisi as CanalEnvoi;
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  // La lettre validée cite par écrit les pièces réellement versées (mention
  // des preuves récupérées) — y compris pour les dossiers analysés avant cette
  // évolution ; le PDF signé reprend ce même texte. Habillage professionnel
  // (Objet, Madame, Monsieur, politesse) appliqué aussi aux anciennes lettres.
  const lettreFinale = formaterLettreOfficielle({
    type: dossier.type,
    corps: await lettreAvecPiecesVersees(
      prisma,
      dossier.id,
      dossier.lettreGeneree,
    ),
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    dateRef: typeof dataExt["date"] === "string" ? (dataExt["date"] as string) : null,
  });

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  const dejaSigne = !!courrier?.pdfUrl;
  const signatureProfil = dossier.user?.signatureUrl ?? null;

  // Cas A : la signature capturée au dépôt (User.signatureUrl) permet de
  // produire directement la lettre signée — l'envoi suit immédiatement après
  // validation, sans repasser par la signature du client.
  let pdfSigne: { pdfUrl: string; signatureUrl: string } | null = null;
  if (!dejaSigne && signatureProfil) {
    const sig = await storageRead(signatureProfil);
    if (sig) {
      try {
        const pdfBuffer = await generateLettrePdf(
          lettreFinale,
          `data:image/png;base64,${sig.toString("base64")}`,
          piecesJointes,
        );
        const pdfUrl = await storageWrite(
          `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
          pdfBuffer,
        );
        pdfSigne = { pdfUrl, signatureUrl: signatureProfil };
      } catch (e) {
        // Signature illisible : repli sur le cas B sans bloquer le juriste.
        console.error("validerDossier: génération PDF pré-signé échouée", e);
      }
    }
  }

  const estSigne = dejaSigne || !!pdfSigne;

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        statut: estSigne ? "PRET" : "EN_ATTENTE_PRE_SIGNATURE",
        valideLe: new Date(),
        canalEnvoi: canal,
        lettreGeneree: lettreFinale,
      },
    }),
    ...(pdfSigne
      ? [
          prisma.courrier.create({
            data: {
              dossierId: dossier.id,
              signatureUrl: pdfSigne.signatureUrl,
              pdfUrl: pdfSigne.pdfUrl,
            },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "VALIDATION" },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");

  // Cas B : la lettre validée attend la signature du client.
  if (!estSigne) {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok`);
  }

  // Lettre déjà signée : envoi immédiat (sauf canal LRAR → SOS Amende envoie
  // la lettre par nos soins ; le juriste déclenche le dépôt via
  // `envoyerContestation`).
  if (canal === "LRAR") {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok`);
  }

  const envoi = await soumettreEtMarquerEnvoye(dossier.id);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  if (envoi.ok) {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok&envoye=ok`);
  }
  redirect(`/dashboard/juriste/${dossier.id}?valide=ok&envoi=echec`);
}

/**
 * Relance / déclenchement de l'envoi par le juriste quand la validation a été
 * enregistrée (dossier PRET + validé, jamais ENVOYE). Pour le canal LRAR,
 * l'envoi est fait par nos soins (SOS Amende expédie la lettre recommandée) :
 * le juriste enregistre le dépôt et le numéro de recommandé. Pour un canal en
 * ligne (ANTAI / Télérecours), la soumission passe par le portail mock.
 */
export async function envoyerContestation(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const canalSaisi = String(formData.get("canalEnvoi") ?? "");
  const numeroRecommandé = String(formData.get("numeroRecommandé") ?? "").trim();
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?envoye=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      error: "La contestation doit être validée et pas encore envoyée.",
    };
  }

  // Canal d'envoi : par défaut celui retenu à la validation ; le juriste peut
  // basculer au moment de l'envoi (ANTAI↔LRAR / Télérecours↔LRAR).
  let canal: CanalEnvoi =
    (dossier.canalEnvoi as CanalEnvoi | null) ?? canauxEnvoi(dossier.type)[0];
  if (canalSaisi) {
    const valide = canauxEnvoi(dossier.type).some((c) => c === canalSaisi);
    if (!valide) {
      return {
        error:
          "Canal d'envoi invalide pour ce type de dossier (amende : ANTAI ou lettre recommandée ; suspension : Télérecours ou lettre recommandée).",
      };
    }
    canal = canalSaisi as CanalEnvoi;
  }

  // Canal LRAR : l'envoi est effectué par SOS Amende (par nos soins). Le
  // juriste enregistre le dépôt de la lettre recommandée avec accusé de
  // réception — l'accusé de dépôt est généré sur-le-champ.
  if (canal === "LRAR") {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { canalEnvoi: canal },
    });
    const envoi = await envoyerParLrar(dossier.id, { numeroRecommandé });
    revalidatePath("/dashboard/juriste");
    revalidatePath(`/dashboard/juriste/${dossier.id}`);
    revalidatePath(`/dashboard/cases/${dossier.id}`);
    revalidatePath("/dashboard/admin/dossiers");
    if (envoi.ok) {
      redirect(`/dashboard/juriste/${dossier.id}?envoye=ok`);
    }
    return { error: envoi.error };
  }

  await prisma.dossier.update({
    where: { id: dossier.id },
    data: { canalEnvoi: canal },
  });

  const envoi = await soumettreEtMarquerEnvoye(dossierId);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  if (envoi.ok) {
    redirect(`/dashboard/juriste/${dossier.id}?envoye=ok`);
  }
  return { error: envoi.error };
}

/**
 * Envoi LRAR par nos soins : SOS Amende expédie la lettre recommandée avec
 * accusé de réception pour le compte du client. Verrou atomique PRET → ENVOYE
 * (jamais d'envoi en ligne sur ce canal), accusé de dépôt LRAR généré et
 * rattaché au courrier existant.
 */
export async function envoyerParLrar(
  dossierId: string,
  opts: { numeroRecommandé?: string } = {},
) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      ok: false as const,
      error: "La contestation doit être validée et pas encore envoyée.",
    };
  }

  const verrou = await prisma.dossier.updateMany({
    where: { id: dossier.id, statut: "PRET" },
    data: { statut: "ENVOYE" },
  });
  if (verrou.count === 0) {
    return { ok: false as const, error: "Dossier déjà envoyé." };
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  const numero = opts.numeroRecommandé || `LRAR-${Date.now().toString(36).toUpperCase()}`;
  const dateDepot = new Date().toISOString();
  let preuveUrl: string | null = null;
  try {
    const pdf = await generatePreuvePdf({
      numeroDepot: numero,
      dateDepot,
      numPv: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : "—",
      plaque: typeof dataExt["plaque"] === "string" ? (dataExt["plaque"] as string) : undefined,
      type: dossier.type,
      nom: typeof dataExt["nom"] === "string" ? (dataExt["nom"] as string) : undefined,
      organisme:
        dossier.type === "SUSPENSION" ? "Préfecture" : "OMP",
      preuves: piecesJointes,
      lrar: true,
    });
    preuveUrl = await storageWrite(`preuves/lrar-${dossier.id}-${Date.now()}.pdf`, pdf);
  } catch (e) {
    console.error("envoyerParLrar: génération accusé LRAR échouée", e);
  }

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  await prisma.$transaction([
    ...(courrier
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { preuveDepotUrl: preuveUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ENVOI",
        detail: `Envoyé par SOS Amende en lettre recommandée avec accusé de réception (n° ${numero}) — ${destinataireLrar(dossier.type)}.`,
      },
    }),
  ]);

  await notifierStatut(dossier.id).catch(() => false);

  return { ok: true as const, numeroDepot: numero };
}

export type VerificationPousseeState = { error?: string; ok?: boolean } | undefined;

/**
 * Vérification poussée (action déclenchée par le juriste sur un dossier en
 * EN_ATTENTE_VALIDATION) : ses remarques sont annexées au texte scanné et le
 * moteur relance la détection de failles sur ce contexte enrichi. La lettre
 * est régénérée si de nouvelles failles sont trouvées ; aucune donnée
 * juridique n'est inventée — les seules sources restent les templates
 * validés par l'admin (FailleJuridique ACTIVE).
 */
export async function relancerVerificationPoussee(
  _prev: VerificationPousseeState,
  formData: FormData,
): Promise<VerificationPousseeState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const remarques = String(formData.get("remarques") ?? "").trim();
  if (remarques.length < 10) {
    return {
      error:
        "Précisez vos remarques (au moins 10 caractères) avant la vérification poussée.",
    };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "A_VERIFIER"
  ) {
    return {
      error:
        "La vérification poussée n'est disponible que sur un dossier en attente de validation.",
    };
  }

  const data = (dossier.extractedData ?? {}) as ExtractedData;
  const texteAjour = [
    dossier.pvTexte,
    `[Vérification poussée du juriste — ${remarques}]`,
  ]
    .filter(Boolean)
    .join("\n");

  const failles = await prisma.failleJuridique.findMany({
    where: { statut: "ACTIVE", typeInfraction: dossier.type },
  });

  let dateExpirationEtalonnage: Date | null = null;
  if (data.radarId) {
    const cal = await prisma.radarCalibration.findFirst({
      where: { radarId: data.radarId },
      orderBy: { dateExpiration: "desc" },
    });
    if (cal) dateExpirationEtalonnage = cal.dateExpiration;
  }

  const candidats = detecterFailles(
    data,
    texteAjour,
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

  // Lettre multi-arguments : la relance régénère une lettre qui juxtapose
  // toutes les failles candidates sur le contexte enrichi du juriste.
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

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: {
        remarquesJuriste: remarques,
        pvTexte: texteAjour,
        failleJuridiqueId: faille?.id ?? null,
        lettreGeneree: lettre,
        extractedData: data as object,
      },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "VERIFICATION_POUSSEE",
        detail: remarques,
      },
    }),
    ...(lettre
      ? [
          prisma.dossierEvent.create({
            data: {
              dossierId: dossier.id,
              type: "LETTRE_GENEREE",
              detail: "Lettre régénérée après vérification poussée.",
            },
          }),
        ]
      : []),
    prisma.dossierFaille.deleteMany({ where: { dossierId: dossier.id } }),
    ...candidats.map((failleId) =>
      prisma.dossierFaille.create({
        data: { dossierId: dossier.id, failleId, statut: "CANDIDATE" },
      }),
    ),
  ]);

  // Mention écrite des pièces réellement récupérées dans la lettre régénérée.
  const lettreAvecPieces = await lettreAvecPiecesVersees(
    prisma,
    dossier.id,
    lettre,
  );
  const docVerif = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const lettreOfficielleVerif = formaterLettreOfficielle({
    type: dossier.type,
    corps: lettreAvecPieces,
    numRef: typeof docVerif["num_pv"] === "string" ? (docVerif["num_pv"] as string) : null,
    dateRef: typeof docVerif["date"] === "string" ? (docVerif["date"] as string) : null,
  });
  if (lettreOfficielleVerif !== lettre) {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettreOfficielleVerif },
    });
  }

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return { ok: true };
}

/**
 * Modification de la lettre générée par le juriste avant validation :
 *  - A_VERIFIER : la lettre n'est pas encore signée — seul le texte change ;
 *  - PRET : la lettre est signée — le PDF est régénéré en recollant
 *    automatiquement la signature existante en bas de la nouvelle lettre.
 * La signature est toujours réappliquée : le juriste n'a pas à la retracer.
 */
export async function modifierLettre(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const lettre = String(formData.get("lettre") ?? "").trim();
  if (lettre.length < 10) {
    return { error: "La lettre doit contenir du texte." };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      courriers: { orderBy: { createdAt: "asc" } },
      preuves: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      // Dossier de démonstration (fallback mock sans ligne DB) : mémorise l'édition pour que le téléchargement reflète la prévisualisation
      setDemoLettre(dossierId, lettre);
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      return { ok: true };
    }
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION"
  ) {
    return { error: "La lettre ne peut être modifiée qu'avant validation." };
  }

  const dataExt = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const piecesJointes = listePiecesJointes({
    type: dossier.type,
    conditionsMeteo: dossier.conditions_meteo,
    numRef: typeof dataExt["num_pv"] === "string" ? (dataExt["num_pv"] as string) : null,
    preuves: dossier.preuves.map((p) => ({ nom: p.nom, type: p.type, url: p.url })),
  });

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  let pdfUrl: string | null = courrier?.pdfUrl ?? null;
  if (courrier?.signatureUrl) {
    // Lettre déjà signée : on régénère le PDF avec la signature existante.
    // Si la signature ne peut pas être relue (fichier manquant, S3 indisponible),
    // on régénère quand même un PDF sans signature plutôt que de bloquer le juriste.
    const sig = await storageRead(courrier.signatureUrl);
    const sigDataUrl = sig ? `data:image/png;base64,${sig.toString("base64")}` : null;
    try {
      const pdfBuffer = await generateLettrePdf(lettre, sigDataUrl, piecesJointes);
      pdfUrl = await storageWrite(
        `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
        pdfBuffer,
      );
    } catch (e) {
      console.error("modifierLettre: génération PDF échouée", e);
      // On sauvegarde au moins le texte même si le PDF échoue
    }
  } else if (courrier) {
    // Lettre signée sans signature PNG (cas rare) : régénère un PDF sans signature
    try {
      const pdfBuffer = await generateLettrePdf(lettre, null, piecesJointes);
      pdfUrl = await storageWrite(
        `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
        pdfBuffer,
      );
    } catch (e) {
      console.error("modifierLettre: génération PDF sans signature échouée", e);
    }
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettre },
    }),
    ...(courrier && pdfUrl
      ? [
          prisma.courrier.update({
            where: { id: courrier.id },
            data: { pdfUrl },
          }),
        ]
      : []),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "LETTRE_GENEREE",
        detail: "Lettre modifiée par le juriste.",
      },
    }),
  ]);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return { ok: true };
}

export async function retournerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?retourne=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" && dossier.statut !== "EN_ATTENTE_VALIDATION") {
    return { error: "Seul un dossier en attente de validation peut être retourné." };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "EN_ANALYSE", valideLe: null },
    }),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "RETOUR" },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?retourne=ok`);
}

export async function rejeterDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (motif.length < 10) {
    return { error: "Un motif de rejet d'au moins 10 caractères est requis." };
  }

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    if (isDemoId(dossierId)) {
      revalidatePath("/dashboard/juriste");
      revalidatePath(`/dashboard/juriste/${dossierId}`);
      redirect(`/dashboard/juriste/${dossierId}?rejete=ok`);
    }
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "PRET" &&
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION" &&
    dossier.statut !== "EN_ATTENTE_PRE_SIGNATURE"
  ) {
    return { error: "Seul un dossier en attente peut être rejeté." };
  }

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { statut: "REJETE", motifRejet: motif },
    }),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "REJET", detail: motif },
    }),
    // Aucune lettre transmise : le crédit consommé au dépôt est rendu au client
    // (il peut lancer un nouveau dossier sans repayer).
    prisma.user.update({
      where: { id: dossier.userId },
      data: { credits: { increment: 1 } },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  redirect(`/dashboard/juriste/${dossier.id}?rejete=ok`);
}

export type TraiterAvocatState = { error?: string } | undefined;

export type TraiterFailleState = { error?: string } | undefined;

/**
 * Confirmation d'une faille candidate par le juriste : elle devient la faille
 * principale du dossier et la lettre est régénérée en juxtaposant la faille
 * confirmée aux autres failles toujours candidates (les écartées sont
 * exclues). La base juridique s'alimente par ces validations.
 */
export async function confirmerFaille(
  _prev: TraiterFailleState,
  formData: FormData,
): Promise<TraiterFailleState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) return undefined;
    return { error: "Dossier introuvable." };
  }
  if (
    dossier.statut !== "A_VERIFIER" &&
    dossier.statut !== "PRET" &&
    dossier.statut !== "EN_ATTENTE_VALIDATION"
  ) {
    return {
      error:
        "La faille ne peut être confirmée que tant que la lettre n'est pas envoyée.",
    };
  }
  const faille = await prisma.failleJuridique.findUnique({
    where: { id: failleId },
  });
  if (!faille) {
    return { error: "Faille introuvable." };
  }
  // Garde-fou : seules les failles validées par l'admin (ACTIVE) alimentent
  // les lettres — jamais une proposition (PROPOSEE) ni une écartée (INACTIVE).
  if (faille.statut !== "ACTIVE") {
    return {
      error: "Cette faille n'est pas validée par la base juridique (ACTIVE).",
    };
  }

  const data = (dossier.extractedData ?? {}) as ExtractedData;

  // 1) Une seule faille principale par dossier : la confirmation écarte la
  //    précédente en tant que principale (elle redevient candidate).
  await prisma.$transaction([
    prisma.dossierFaille.updateMany({
      where: { dossierId, statut: "CONFIRMEE" },
      data: { statut: "CANDIDATE" },
    }),
    prisma.dossierFaille.upsert({
      where: { dossierId_failleId: { dossierId, failleId } },
      create: { dossierId, failleId, statut: "CONFIRMEE" },
      update: { statut: "CONFIRMEE" },
    }),
  ]);

  // 2) Lettre multi-arguments : la faille confirmée (en premier) est
  //    juxtaposée aux autres failles toujours candidates — jamais une écartée.
  const retenues = await prisma.dossierFaille.findMany({
    where: {
      dossierId,
      statut: { in: ["CONFIRMEE", "CANDIDATE"] },
      faille: { statut: "ACTIVE" },
    },
    include: { faille: true },
  });
  retenues.sort(
    (a, b) =>
      Number(b.statut === "CONFIRMEE") - Number(a.statut === "CONFIRMEE"),
  );
  const lettre = remplirLettreMulti(
    retenues.map((df) => ({
      id: df.faille.id,
      titreFaille: df.faille.titreFaille,
      articleLoi: df.faille.articleLoi,
      templateLettre: df.faille.templateLettre,
    })),
    data,
  );

  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { failleJuridiqueId: faille.id, lettreGeneree: lettre },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "LETTRE_GENEREE",
        detail: `Faille retenue par le juriste : ${faille.titreFaille}`,
      },
    }),
  ]);

  // Mention écrite des pièces réellement récupérées dans la lettre régénérée.
  const lettreAvecPieces = await lettreAvecPiecesVersees(
    prisma,
    dossier.id,
    lettre,
  );
  const docConfirme = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const lettreOfficielle = formaterLettreOfficielle({
    type: dossier.type,
    corps: lettreAvecPieces,
    numRef: typeof docConfirme["num_pv"] === "string" ? (docConfirme["num_pv"] as string) : null,
    dateRef: typeof docConfirme["date"] === "string" ? (docConfirme["date"] as string) : null,
  });
  if (lettreOfficielle !== lettre) {
    await prisma.dossier.update({
      where: { id: dossier.id },
      data: { lettreGeneree: lettreOfficielle },
    });
  }

  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return undefined;
}

/**
 * Rejet d'une faille candidate par le juriste : elle ne sera pas utilisée
 * pour ce dossier (l'alimentation de la base conserve le statut du candidat).
 */
export async function rejeterFaille(
  _prev: TraiterFailleState,
  formData: FormData,
): Promise<TraiterFailleState> {
  await requireJuristeRedacteur();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
    if (isDemoId(dossierId)) return undefined;
    return { error: "Dossier introuvable." };
  }

  await prisma.$transaction([
    prisma.dossierFaille.upsert({
      where: { dossierId_failleId: { dossierId, failleId } },
      create: { dossierId, failleId, statut: "REJETEE" },
      update: { statut: "REJETEE" },
    }),
    prisma.dossierEvent.create({
      data: {
        dossierId: dossier.id,
        type: "ANALYSE",
        detail: "Faille écartée par le juriste.",
      },
    }),
  ]);

  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  revalidatePath("/dashboard/admin/dossiers");
  return undefined;
}

const AVOCAT_ACTIONS = ["AFFECTE", "REFUSE"] as const;

/**
 * Mise en relation avocat (PLAN §2) : le juriste affecte un avocat partenaire
 * au dossier (AFFECTE) ou refuse la demande (REFUSE, note au client).
 */
export async function traiterDemandeAvocat(
  _prev: TraiterAvocatState,
  formData: FormData,
): Promise<TraiterAvocatState> {
  await requireJuristeRedacteur();

  const matchId = String(formData.get("matchId") ?? "");
  const action = AVOCAT_ACTIONS.find((a) => a === formData.get("action"));

  const match = await prisma.lawyerMatch.findUnique({
    where: { id: matchId },
    include: { dossier: true },
  });
  if (!match) {
    return { error: "Demande introuvable." };
  }
  if (match.statut !== "DEMANDE") {
    return { error: "Cette demande a déjà été traitée." };
  }

  if (action === "AFFECTE") {
    const partnerName = String(formData.get("partnerName") ?? "").trim();
    if (partnerName.length < 2) {
      return { error: "Le nom de l'avocat partenaire est requis." };
    }
    await prisma.lawyerMatch.update({
      where: { id: match.id },
      data: {
        statut: "AFFECTE",
        partnerName,
        partnerBarreau: String(formData.get("partnerBarreau") ?? "").trim() || null,
        partnerEmail: String(formData.get("partnerEmail") ?? "").trim() || null,
        note: String(formData.get("note") ?? "").trim() || null,
      },
    });
  } else if (action === "REFUSE") {
    const note = String(formData.get("note") ?? "").trim();
    if (note.length < 10) {
      return { error: "Une note d'au moins 10 caractères est requise pour refuser." };
    }
    await prisma.lawyerMatch.update({
      where: { id: match.id },
      data: { statut: "REFUSE", note },
    });
  } else {
    return { error: "Action invalide." };
  }

  revalidatePath(`/dashboard/juriste/${match.dossierId}`);
  revalidatePath(`/dashboard/cases/${match.dossierId}`);
  return undefined;
}

export type PreuvesApiState = { ok?: boolean; error?: string; ajoutees?: string[] };

/**
 * Récupération des preuves externes (météo, fiche radar, travaux) pour un
 * dossier, depuis les sources publiques. Best-effort : n'ajoute que des
 * preuves réellement obtenues, et ne fait jamais échouer le flux.
 */
export async function recupererPreuvesApi(
  dossierId: string,
): Promise<PreuvesApiState> {
  await requireJuristeRedacteur();

  if (isDemoId(dossierId)) return { ok: true, ajoutees: [] };

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { id: true },
  });
  if (!dossier) return { error: "Dossier introuvable." };

  const { ajoutees } = await recupererPreuvesPourDossierId(prisma, dossierId);
  revalidatePath(`/dashboard/juriste/${dossierId}`);
  revalidatePath(`/dashboard/cases/${dossierId}`);
  return { ok: true, ajoutees };
}
