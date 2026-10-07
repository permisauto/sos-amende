import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { prixBase } from "@/lib/tarifs";

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

export async function notifierDecisionsEnAttente(
  items: Array<{ id: string; numRef: string | null }>,
): Promise<boolean> {
  if (!resend) return false;
  const equipe = await prisma.user.findMany({
    where: { role: { in: ["JURISTE", "ADMIN"] } },
    select: { email: true, name: true },
  });
  if (equipe.length === 0) return false;
  const lignes = items
    .map(
      (d) =>
        `<li>Dossier <code>${d.id}</code>${d.numRef ? ` (PV n° ${d.numRef})` : ""} — décision LRAR attendue.</li>`,
    )
    .join("");
  let envoyes = 0;
  for (const membre of equipe) {
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: membre.email,
        subject: `SOS Amende — ${items.length} décision${items.length > 1 ? "s" : ""} LRAR en attente`,
        html: `
          <p>Bonjour ${membre.name ?? "membre de l'équipe"},</p>
          <p><strong>${items.length} dossier(s)</strong> transmis en lettre recommandée n'a/ont pas encore de réponse de l'administration (au-delà du délai attendu) :</p>
          <ul>${lignes}</ul>
          <p>Si le client a reçu la décision, enregistrez-la pour clore le dossier (statut « Résolu »).</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com"}/dashboard/juriste">Ouvrir le suivi des dossiers</a></p>
          <p style="color:#888;font-size:0.85em">Alerte générée automatiquement par le suivi quotidien des décisions.</p>`,
      });
      envoyes += 1;
    } catch {
      // défensif : un échec d'envoi n'interrompt pas le cron
    }
  }
  return envoyes > 0;
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
      type: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!dossier) return false;

  const data = (dossier.extractedData ?? {}) as { num_pv?: string };
  const ref = data.num_pv ? ` (PV n° ${data.num_pv})` : "";
  const prenom = dossier.user.name ?? "Client";
  const montant = dossier.prix ? `${dossier.prix} €` : `${prixBase(dossier.type)} €`;

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
        Il ne vous reste qu'à la signer électroniquement : vous recevrez ensuite
        le lien de dépôt assisté pour la transmettre sur le portail officiel.</p>
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
        lettre recommandée avec accusé de réception). ${
          dossier.type === "SUSPENSION"
            ? "Votre recours sera examiné par l'autorité compétente ; l'accusé de dépôt est consultable dans votre suivi."
            : "L'OMP examinera votre requête ; l'accusé de dépôt est consultable dans votre suivi."
        }</p>
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
        <strong>acceptée</strong>. ${
          dossier.type === "SUSPENSION"
            ? "La décision contestée est annulée."
            : "L'amende est annulée."
        }</p>
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
      from: EMAIL_FROM,
      to: dossier.user.email,
      subject,
      html,
    });
    return true;
  } catch {
    return false;
  }
}

/** Échappe le HTML — le texte vient des publications officielles. */
function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Digest hebdomadaire de la veille juridique (auto-alimentation §H).
 *
 * Remplace l'alerte quotidienne « nouvelle édition du JORF » : un seul e-mail
 * par semaine, récapitulatif, envoyé aux juristes et administrateurs — et
 * seulement s'il y a des sources nouvelles à lire. Rien n'est décidé ici : la
 * liste sert à orienter la lecture, la promotion en faille reste humaine.
 *
 * Défensif : sans `AUTH_RESEND_KEY` ne fait rien et retourne false.
 */
export async function notifierDigestVeille(opts: {
  lignes: {
    titre: string;
    source: string;
    score: number;
    resume: string;
    url: string | null;
  }[];
  jours: number;
}): Promise<boolean> {
  if (!resend || opts.lignes.length === 0) return false;
  const lienVeille = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://recours-permis-pv.com"}/dashboard/juriste/veille`;

  const items = opts.lignes
    .slice(0, 25)
    .map(
      (l) => `<li>
        <strong>${echapper(l.titre)}</strong>
        <em>(${echapper(l.source)} — score ${l.score})</em><br/>
        ${echapper(l.resume)}${l.url ? `<br/><a href="${l.url}">Lire la source sur Légifrance</a>` : ""}
      </li>`,
    )
    .join("\n");

  try {
    const equipe = await prisma.user.findMany({
      where: { role: { in: ["JURISTE", "ADMIN"] } },
      select: { email: true, name: true },
    });
    let envoyes = 0;
    for (const membre of equipe) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: membre.email,
        subject: `SOS Amende — veille juridique : ${opts.lignes.length} publication(s) à lire`,
        html: `
          <p>Bonjour ${echapper(membre.name ?? "")},</p>
          <p>La veille automatique a relevé <strong>${opts.lignes.length} publication(s)
          officielle(s) potentiellement pertinente(s)</strong> sur les
          ${opts.jours} derniers jours, sur les sources officielles DILA
          (jurisprudence administrative, Cour de cassation, Journal officiel).</p>
          <p>Ces publications sont <em>des sources</em>, pas des failles : lisez-les,
          puis promotez-en une en proposition si elle justifie un nouveau fondement.
          La règle et la lettre restent rédigées à la main.</p>
          <ul>${items}</ul>
          <p><a href="${lienVeille}">Ouvrir la veille juridique</a></p>
          <p style="color:#888;font-size:0.85em">Relevé automatique, une fois par semaine.</p>`,
      });
      envoyes += 1;
    }
    return envoyes > 0;
  } catch {
    return false;
  }
}
