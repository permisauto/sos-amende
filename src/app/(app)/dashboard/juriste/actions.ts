"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { remplirTemplate } from "@/lib/moteur";
import { notifierStatut } from "@/lib/notifications";
import { storageRead, storageWrite } from "@/lib/storage";
import { generateLettrePdf } from "@/lib/lettre-pdf";
import { soumettreDossier } from "@/lib/antai";
import { organismeEnvoi } from "@/lib/envoi";

export type ValidationState = { error?: string; ok?: boolean } | undefined;

const DECISION_OMP = ["ACCEPTE", "REJETE"] as const;

/**
 * Soumission de la contestation (lettre + pièces jointes) vers le portail
 * ANTAI / Télérecours dès la validation du juriste. En cas de succès le
 * dossier passe en ENVOYE avec accusé de dépôt ; en cas d'échec il reste
 * PRET/validé et le client conserve son kit LRAR en secours.
 */
async function soumettreEtMarquerEnvoye(dossierId: string) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      preuves: { orderBy: { createdAt: "asc" } },
      courriers: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
  // Garde de statut : seul un dossier PRET (signé, validé) peut être envoyé.
  // Évite un double envoi (course avec l'envoi LRAR du client, relance…).
  if (dossier.statut !== "PRET") {
    return {
      ok: false as const,
      error: "Ce dossier n'est plus en attente d'envoi (déjà transmis ?).",
    };
  }

  // Verrou atomique : la transition PRET → ENVOYE se fait AVANT l'appel
  // externe pour empêcher deux soumissions concurrentes (deux clics, relance
  // simultanée du client et du juriste). Si la soumission échoue, on revient
  // en PRET (le client conserve son kit LRAR en secours).
  const verrou = await prisma.dossier.updateMany({
    where: { id: dossier.id, statut: "PRET" },
    data: { statut: "ENVOYE" },
  });
  if (verrou.count === 0) {
    return { ok: false as const, error: "Dossier déjà envoyé." };
  }

  const organisme = organismeEnvoi(dossier.type);
  const result = await soumettreDossier(
    dossier,
    dossier.preuves.map((p) => ({ nom: p.nom })),
  );
  if (!result.ok) {
    // Rollback : retour en PRET (lettre validée) — le client peut poster en
    // LRAR ou le juriste relancer via `envoyerContestation`.
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
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const raw = String(formData.get("decisionOmp") ?? "");
  const decisionOmp = DECISION_OMP.find((d) => d === raw);
  if (!decisionOmp) {
    return { error: "Décision OMP invalide." };
  }
  const decisionDetail = String(formData.get("decisionDetail") ?? "").trim();

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
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
  redirect(`/dashboard/juriste/${dossier.id}?decision=ok`);
}

export async function validerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: { courriers: { orderBy: { createdAt: "asc" } } },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET") {
    return { error: "Le dossier doit être signé et prêt à l'envoi." };
  }
  const courrier = dossier.courriers[dossier.courriers.length - 1];
  if (!courrier?.pdfUrl) {
    return { error: "Aucune lettre signée à valider." };
  }

  // Validation humaine de la lettre (garde-fou).
  await prisma.$transaction([
    prisma.dossier.update({
      where: { id: dossier.id },
      data: { valideLe: new Date() },
    }),
    prisma.dossierEvent.create({
      data: { dossierId: dossier.id, type: "VALIDATION" },
    }),
  ]);

  // Notification (défensive : sans AUTH_RESEND_KEY, aucun e-mail envoyé).
  await notifierStatut(dossier.id).catch(() => false);

  // Envoi immédiat de la contestation (lettre + preuves) au portail
  // ANTAI / Télérecours. En cas d'échec le dossier reste validé et le client
  // conserve son kit LRAR en secours (bouton de relance côté juriste).
  const envoi = await soumettreEtMarquerEnvoye(dossier.id);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  if (envoi.ok) {
    redirect(`/dashboard/juriste/${dossier.id}?valide=ok&envoye=ok`);
  }
  redirect(`/dashboard/juriste/${dossier.id}?valide=ok&envoi=echec`);
}

/**
 * Relance de l'envoi par le juriste quand la validation a été enregistrée mais
 * que la soumission au portail a échoué (dossier PRET + validé, jamais ENVOYE).
 */
export async function envoyerContestation(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" || !dossier.valideLe) {
    return {
      error: "La contestation doit être validée et pas encore envoyée.",
    };
  }

  const envoi = await soumettreEtMarquerEnvoye(dossierId);

  revalidatePath("/dashboard/juriste");
  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
  if (envoi.ok) {
    redirect(`/dashboard/juriste/${dossier.id}?envoye=ok`);
  }
  return { error: envoi.error };
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
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const lettre = String(formData.get("lettre") ?? "").trim();
  if (lettre.length < 10) {
    return { error: "La lettre doit contenir du texte." };
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: { courriers: { orderBy: { createdAt: "asc" } } },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "A_VERIFIER" && dossier.statut !== "PRET") {
    return { error: "La lettre ne peut être modifiée qu'avant validation." };
  }

  const courrier = dossier.courriers[dossier.courriers.length - 1];
  let pdfUrl: string | null = courrier?.pdfUrl ?? null;
  if (courrier?.signatureUrl) {
    // Lettre déjà signée : on régénère le PDF avec la signature existante.
    // Si la signature ne peut pas être relue, on refuse de modifier la lettre
    // plutôt que de laisser un PDF périmé (nouveau texte, vieux PDF signé).
    const sig = await storageRead(courrier.signatureUrl);
    if (!sig) {
      return {
        error:
          "Impossible de relire la signature existante pour régénérer le PDF. La lettre n'a pas été modifiée.",
      };
    }
    const sigDataUrl = `data:image/png;base64,${sig.toString("base64")}`;
    const pdfBuffer = await generateLettrePdf(lettre, sigDataUrl);
    pdfUrl = await storageWrite(
      `pdfs/lettre-${dossier.id}-${Date.now()}.pdf`,
      pdfBuffer,
    );
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
  return { ok: true };
}

export async function retournerDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET") {
    return { error: "Seul un dossier signé peut être retourné." };
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
  redirect(`/dashboard/juriste/${dossier.id}?retourne=ok`);
}

export async function rejeterDossier(
  _prev: ValidationState,
  formData: FormData,
): Promise<ValidationState> {
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (motif.length < 10) {
    return { error: "Un motif de rejet d'au moins 10 caractères est requis." };
  }

  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId } });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "PRET" && dossier.statut !== "A_VERIFIER") {
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
  redirect(`/dashboard/juriste/${dossier.id}?rejete=ok`);
}

export type TraiterAvocatState = { error?: string } | undefined;

export type TraiterFailleState = { error?: string } | undefined;

/**
 * Confirmation d'une faille candidate par le juriste : elle devient la faille
 * principale du dossier et la lettre est régénérée à partir de son template
 * validé (base juridique qui s'alimente par ces validations).
 */
export async function confirmerFaille(
  _prev: TraiterFailleState,
  formData: FormData,
): Promise<TraiterFailleState> {
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
    return { error: "Dossier introuvable." };
  }
  if (dossier.statut !== "A_VERIFIER" && dossier.statut !== "PRET") {
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

  const data = (dossier.extractedData ?? {}) as Record<string, unknown>;
  const lettre = remplirTemplate(faille.templateLettre, data);

  await prisma.$transaction([
    // une seule faille principale par dossier
    prisma.dossierFaille.updateMany({
      where: { dossierId, statut: "CONFIRMEE" },
      data: { statut: "CANDIDATE" },
    }),
    prisma.dossierFaille.upsert({
      where: { dossierId_failleId: { dossierId, failleId } },
      create: { dossierId, failleId, statut: "CONFIRMEE" },
      update: { statut: "CONFIRMEE" },
    }),
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

  revalidatePath(`/dashboard/juriste/${dossier.id}`);
  revalidatePath(`/dashboard/cases/${dossier.id}`);
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
  await requireJuriste();

  const dossierId = String(formData.get("dossierId") ?? "");
  const failleId = String(formData.get("failleId") ?? "");

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
  });
  if (!dossier) {
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
  await requireJuriste();

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