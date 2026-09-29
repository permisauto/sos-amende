import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const cleanKey = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
const resend = cleanKey ? new Resend(cleanKey) : null;

const EMAIL_FROM = (process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>")
  .replace(/\uFEFF/g, "")
  .trim();

const ACCUEIL = `<p>Connectez-vous à votre espace SOS Amende pour suivre votre dossier.</p>`;

const ROLES_LABEL: Record<string, string> = {
  CLIENT: "client",
  JURISTE: "juriste",
  ADMIN: "administrateur",
};

/**
 * Envoie au client l'e-mail avec le lien de dépôt assisté après validation de
 * la lettre par le juriste sur un canal en ligne (ANTAI/Télérecours). Le lien
 * mène à /recours/finaliser?token=... (Option 2, zéro iframe du portail
 * officiel) : le client dépose lui-même la contestation puis marque son
 * dossier. Défensif : sans AUTH_RESEND_KEY, aucun envoi (retourne false sans
 * lever d'erreur). Le lien reste créé quoi qu'il arrive.
 */
export async function notifierLienDepot(opts: {
  dossierId: string;
  url: string;
  expireLe: Date;
}): Promise<boolean> {
  if (!resend) return false;

  const dossier = await prisma.dossier.findUnique({
    where: { id: opts.dossierId },
    select: {
      type: true,
      canalEnvoi: true,
      extractedData: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!dossier?.user.email) return false;

  const data = (dossier.extractedData ?? {}) as { num_pv?: string };
  const ref = data.num_pv ? ` n° ${data.num_pv}` : "";
  const prenom = dossier.user.name ?? "Client";
  const canal = dossier.canalEnvoi === "TELERECOURS" ? "Télérecours" : "ANTAI";
  const expiration = opts.expireLe.toLocaleDateString("fr-FR");
  const etapes = dossier.type === "SUSPENSION"
    ? "connectez-vous à Télérecours citoyens puis suivez le guide qui s'affiche (FranceConnect)."
    : "ouvrez la page ANTAI « Désigner ou contester en ligne » puis suivez le guide qui s'affiche.";

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: dossier.user.email,
      subject: `SOS Amende — votre contestation${ref} est prête à déposer`,
      html: `
        <p>Bonjour ${prenom},</p>
        <p>Votre lettre de contestation${ref} a été validée par notre juriste et
        est à déposer sur le portail officiel <strong>${canal}</strong>.</p>
        <p><strong>Cliquez sur le lien ci-dessous</strong> : la page vous
        indique exactement la démarche à suivre (numéro à saisir, pièces à
        joindre — votre lettre signée et vos justificatifs y sont
        téléchargeables) et le dépôt se fait sur le site officiel, pas chez
        nous.</p>
        <p><a href="${opts.url}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Déposer ma contestation (${canal})</a></p>
        <p style="font-size:0.85em;color:#64748b">Ce lien est valable jusqu'au
        ${expiration} et est personnel à votre dossier. ${etapes}</p>
        ${ACCUEIL}`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * E-mail de bienvenue / notification à la création d'un compte (client,
 * juriste ou admin). Défensif : sans AUTH_RESEND_KEY, aucun envoi.
 */
export async function notifierCompteCree(
  email: string,
  role: string = "CLIENT",
  name?: string | null,
): Promise<boolean> {
  if (!resend) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";
  const prenom = (name ?? email).split(" ")[0];
  const label = ROLES_LABEL[role] ?? "membre";
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: role === "ADMIN" ? "SOS Amende — votre compte administrateur est prêt" : role === "JURISTE" ? "SOS Amende — votre compte juriste est prêt" : "Bienvenue sur SOS Amende",
      html: `
        <p>Bonjour ${prenom},</p>
        <p>Votre compte ${label} SOS Amende (${email}) a été créé.</p>
        <p>Pour vous connecter, cliquez sur le lien ci-dessous puis saisissez votre adresse
        e-mail : un lien de connexion sécurisé vous sera envoyé.</p>
        <p><a href="${appUrl}/login">${appUrl}/login</a></p>
        ${role === "JURISTE" || role === "ADMIN" ? `<p>Votre espace : ${appUrl}/dashboard</p>` : ACCUEIL}`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Notifie le client qu'un virement a été validé (crédit débloqué).
 */
export async function notifierPaiementValide(email: string, name?: string | null): Promise<boolean> {
  if (!resend) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";
  const prenom = (name ?? email).split(" ")[0];
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "SOS Amende — paiement validé",
      html: `
        <p>Bonjour ${prenom},</p>
        <p>Votre virement a été validé : votre crédit est débloqué et vous pouvez
        poursuivre votre dossier.</p>
        <p><a href="${appUrl}/dashboard">Accéder à mon espace</a></p>`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Notifie le client qu'un juriste lui a adressé un message sur son dossier
 * (demande de complément d'information ou de preuve). Défensif : no-op sans
 * AUTH_RESEND_KEY.
 */
export async function notifierMessage(
  dossier: { id: string; user: { email: string; name: string | null } },
  contenu: string,
): Promise<boolean> {
  if (!resend) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com";
  const prenom = dossier.user.name ?? "Client";
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: dossier.user.email,
      subject: "SOS Amende — nouveau message sur votre dossier",
      html: `
        <p>Bonjour ${prenom},</p>
        <p>Un juriste vous a adressé un message concernant votre dossier
        <a href="${appUrl}/dashboard/cases/${dossier.id}">n° ${dossier.id}</a>.</p>
        <blockquote style="border-left:3px solid #ddd;padding-left:12px;margin:12px 0;color:#555">
          ${contenu.replace(/</g, "&lt;").replace(/\n/g, "<br>")}
        </blockquote>
        <p>Vous pouvez répondre directement dans votre espace SOS Amende.</p>
        <p><a href="${appUrl}/dashboard/cases/${dossier.id}">${appUrl}/dashboard/cases/${dossier.id}</a></p>`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Notifie l'équipe administrative (veille juridique) : une nouvelle édition du
 * Journal officiel a été détectée par le cron quotidien. La veille n'invente
 * rien — elle demande seulement aux admins de vérifier si un texte récent
 * modifie une faille applicable (les propositions du catalogue restent à leur
 * validation). Défensif : sans AUTH_RESEND_KEY, aucun envoi.
 */
export async function notifierNouvellesPropositions(opts: {
  editionJorf: { fichier: string; dateEdition: string; heureEdition: string };
  lienJorf: string;
}): Promise<boolean> {
  if (!resend) return false;
  const { dateEdition, heureEdition } = opts.editionJorf;
  const dateLisible =
    `${dateEdition.slice(6, 8)}/${dateEdition.slice(4, 6)}/${dateEdition.slice(0, 4)}` +
    ` à ${heureEdition.slice(0, 2)}h${heureEdition.slice(2, 4)}`;
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true, name: true },
    });
    let envoyes = 0;
    for (const admin of admins) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: admin.email,
        subject: "SOS Amende — veille juridique : nouvelle édition du JORF détectée",
        html: `
          <p>Bonjour ${admin.name ?? "administrateur"},</p>
          <p>La veille juridique quotidienne a détecté une <strong>nouvelle édition
          du Journal officiel du ${dateLisible}</strong> (${opts.editionJorf.fichier}).</p>
          <p>Veuillez vérifier si un texte récent (code de la route, jurisprudence,
          procédure de contestation…) modifie une faille applicable : les
          propositions de la bibliothèque juridique restent en attente de votre
          validation.</p>
          <p><a href="${opts.lienJorf}">Consulter le Journal officiel</a> ·
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com"}/dashboard/juriste/failles">Bibliothèque juridique</a></p>
          <p style="color:#888;font-size:0.85em">Cette alerte est générée automatiquement par l'auto-alimentation quotidienne.</p>`,
      });
      envoyes += 1;
    }
    return envoyes > 0;
  } catch {
    return false;
  }
}

/**
 * Notifie le client d'un changement de statut de son dossier (défensif :
 * sans AUTH_RESEND_KEY, aucun e-mail n'est envoyé et la fonction renvoie
 * false sans jamais lever d'erreur). Complète les rappels J10/J3/J0.
 */
export async function notifierStatut(dossierId: string): Promise<boolean> {
  if (!resend) return false;

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      statut: true,
      extractedData: true,
      lettreGeneree: true,
      motifRejet: true,
      decisionOmp: true,
      decisionDetail: true,
      prix: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!dossier) return false;

  const data = (dossier.extractedData ?? {}) as { num_pv?: string };
  const ref = data.num_pv ? ` (PV n° ${data.num_pv})` : "";
  const prenom = dossier.user.name ?? "Client";
  const montant = dossier.prix ? `${dossier.prix} €` : "39 €";

  let subject = "";
  let html = "";

  switch (dossier.statut) {
    case "EN_ATTENTE_PAIEMENT":
      subject = "Votre dossier est en attente de paiement";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Une faille juridique a été détectée pour votre dossier${ref} : votre
        analyse est gratuite, mais débloquer la lettre nécessite le règlement
        (${montant}) par virement bancaire.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com"}/dashboard/cases/${dossier.id}">Régler mon dossier</a></p>
        ${ACCUEIL}`;
      break;
    case "EN_ATTENTE_VALIDATION":
      if (!dossier.lettreGeneree) return false;
      subject = "Votre dossier est en cours de validation par un juriste";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été analysé : une lettre de contestation a été
        préparée et est en cours de validation par un juriste.</p>
        <p>Vous serez notifié dès qu'elle est prête pour votre signature.</p>
        ${ACCUEIL}`;
      break;
    case "EN_ATTENTE_PRE_SIGNATURE":
      subject = "Votre lettre validée est prête à signer";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Votre lettre de contestation${ref} a été validée par notre juriste.
        Il ne vous reste qu'à la signer électroniquement, elle sera transmise
        automatiquement.</p>
        ${ACCUEIL}`;
      break;
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
      subject = "Votre lettre de contestation a été transmise";
      html = `
        <p>Bonjour ${prenom},</p>
        <p>Votre dossier${ref} a été transmis par SOS Amende (en ligne ou en
        lettre recommandée avec accusé de réception). L'OMP examinera votre
        requête ; l'accusé de dépôt est consultable dans votre suivi.</p>
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