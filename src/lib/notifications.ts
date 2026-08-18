import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = process.env.AUTH_RESEND_KEY
  ? new Resend(process.env.AUTH_RESEND_KEY)
  : null;

const ACCUEIL = `<p>Connectez-vous à votre espace SOS Amende pour suivre votre dossier.</p>`;

/**
 * Notifie le client d'un changement de statut de son dossier (défensif :
 * sans AUTH_RESEND_KEY, aucun e-mail n'est envoyé et la fonction renvoie
 * false sans jamais lever d'erreur). Complète les rappels J10/J3/J0.
 */
export async function notifierStatut(dossierId: string): Promise<boolean> {
  if (!resend) return false;

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    include: {
      user: { select: { email: true, name: true } },
      courriers: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!dossier) return false;

  const data = (dossier.extractedData ?? {}) as { num_pv?: string };
  const ref = data.num_pv ? ` (PV n° ${data.num_pv})` : "";
  const prenom = dossier.user.name ?? "Client";

  let subject = "";
  let html = "";

  switch (dossier.statut) {
    case "A_VERIFIER":
      if (!dossier.lettreGeneree) return false;
      subject = "Votre lettre de contestation est prête à signer";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été analysé : une lettre de contestation a été
        générée et est prête pour votre signature électronique.</p>
        <p>Pensez à la signer avant la date limite de contestation.</p>
        ${ACCUEIL}`;
      break;
    case "ENVOYE":
      subject = "Votre lettre de contestation a été envoyée";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été envoyé en recommandé avec accusé de
        réception. L'OMP examinera votre requête ; pensez à conserver le
        récépissé de votre envoi.</p>
        ${ACCUEIL}`;
      break;
    case "REJETE":
      subject = "Votre dossier a été rejeté";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Après examen par un juriste, aucun motif de contestation n'a été
        retenu pour votre dossier${ref}.</p>
        <p>Motif : ${dossier.motifRejet ?? "non précisé"}</p>
        ${ACCUEIL}`;
      break;
    case "EN_ANALYSE":
      subject = "Votre dossier a été retourné pour correction";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Un juriste a demandé des corrections sur votre dossier${ref}.
        Rouvrez-le depuis votre espace pour le mettre à jour.</p>
        ${ACCUEIL}`;
      break;
    case "RESOLU":
      subject =
        dossier.decisionOmp === "ACCEPTE"
          ? "Bonne nouvelle : votre contestation a été acceptée"
          : "Votre contestation a été rejetée";
      html =
        dossier.decisionOmp === "ACCEPTE"
          ? `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été examiné : la requête a été
        <strong>acceptée</strong>. L'amende est annulée.</p>
        ${ACCUEIL}`
          : `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été examiné : la requête a été rejetée.</p>
        ${dossier.decisionDetail ? `<p>Note du juriste : ${dossier.decisionDetail}</p>` : ""}
        ${ACCUEIL}`;
      break;
    default:
      return false;
  }

  try {
    await resend.emails.send({
      from: "SOS Amende <onboarding@resend.dev>",
      to: dossier.user.email,
      subject,
      html,
    });
    return true;
  } catch {
    return false;
  }
}