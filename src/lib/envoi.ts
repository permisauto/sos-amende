/**
 * Libellés d'envoi dépendant du type d'infraction (AMENDE vs SUSPENSION).
 * Module pur (testable). Le contenu reste procédural — aucun fondement
 * juridique n'est inventé ici : les motifs et articles viennent uniquement
 * des `FailleJuridique.templateLettre` validés par l'admin.
 */

export type InfractionType = "AMENDE" | "SUSPENSION";

export type CanalEnvoi = "ANTAI" | "TELERECOURS" | "LRAR";

/**
 * Canaux d'envoi proposés selon le type d'infraction.
 * - AMENDE : ANTAI (envoi en ligne) ou LRAR (envoi par SOS Amende)
 * - SUSPENSION : Télérecours (envoi en ligne) ou LRAR (envoi par SOS Amende)
 */
export function canauxEnvoi(type: InfractionType): CanalEnvoi[] {
  return type === "SUSPENSION" ? ["TELERECOURS", "LRAR"] : ["ANTAI", "LRAR"];
}

export function libelleCanal(canal: CanalEnvoi): string {
  switch (canal) {
    case "ANTAI":
      return "ANTAI — envoi en ligne (automatique)";
    case "TELERECOURS":
      return "Télérecours — envoi en ligne (tribunal administratif)";
    case "LRAR":
      return "Lettre recommandée avec accusé de réception (envoi par SOS Amende)";
  }
}

export function libelleCanalDepuisStockage(
  canal: string | null | undefined,
  type: InfractionType,
): string {
  if (canal === "ANTAI" || canal === "TELERECOURS" || canal === "LRAR") {
    return libelleCanal(canal);
  }
  return libelleCanal(canauxEnvoi(type)[0]);
}

export function destinataireLrar(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "à l'adresse du préfet indiquée sur votre décision"
    : "à l'adresse de l'OMP indiquée sur votre avis de contravention";
}

export function pieceAJoindre(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "une copie de la décision de rétention ou d'invalidation"
    : "une copie de votre avis de contravention";
}

export function delaiLibelle(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "délai de recours (2 mois)"
    : "délai de contestation (45 jours)";
}

export function titreAnalyse(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "de votre décision de rétention ou d'invalidation"
    : "de votre avis de contravention";
}

/** Organisme destinataire de la contestation (envoi automatisé / accusé). */
export function organismeEnvoi(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "Télérecours (tribunal administratif)"
    : "ANTAI";
}

export function numeroRefLibelle(type: InfractionType): string {
  return type === "SUSPENSION" ? "Numéro de décision" : "Numéro de PV";
}

export function dateRefLibelle(type: InfractionType): string {
  return type === "SUSPENSION" ? "Date de la décision" : "Date du PV";
}

/**
 * Portail officiel de dépôt en ligne de la contestation.
 * - AMENDE : téléservice ANTAI « Désigner ou contester en ligne »
 * - SUSPENSION : Télérecours citoyens (tribunal administratif)
 * URLs officielles vérifiées (antai.gouv.fr / telerecours.fr).
 */
export function portailEnLigne(type: InfractionType): {
  label: string;
  url: string;
} {
  return type === "SUSPENSION"
    ? {
        label: "Télérecours citoyens (tribunal administratif)",
        url: "https://citoyens.telerecours.fr/#/authentication",
      }
    : {
        label: "ANTAI — Désigner ou contester en ligne",
        url: "https://www.usagers.antai.gouv.fr/demarches/saisienumero?lang=fr",
      };
}

/**
 * Civilité d'appel selon les bons usages de la correspondance administrative.
 * Destinataire inconnu ou collectif (OMP / service) → formule neutre
 * « Madame, Monsieur, ». Le préfet, lorsqu'identifié, peut recevoir une
 * formule propre (voir formatage par type), mais par défaut la formule neutre
 * reste la plus largement acceptée.
 */
export function formuleAppel(): string {
  return "Madame, Monsieur,";
}

/** Formule de politesse finale, alignée sur la formule d'appel neutre. */
export function formulePolitesse(): string {
  return "Je vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.";
}

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * Met une date ISO (`AAAA-MM-JJ`) en toutes lettres en français
 * (« 2026-05-01 » → « 1er mai 2026 »). Une valeur non reconnue est
 * retournée telle quelle (aucune valeur fabriquée).
 */
export function formaterDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return iso;
  const [, an, mois, jour] = match;
  const m = Number(mois);
  if (m < 1 || m > 12) return iso;
  const j = Number(jour);
  if (!Number.isInteger(j)) return iso;
  return `${j === 1 ? "1er" : j} ${MOIS_FR[m - 1]} ${an}`;
}

/**
 * Objet normalisé de la lettre, type-aware :
 * - AMENDE    → « Contestation de l'avis de contravention n° X du D »
 * - SUSPENSION → « Recours contre la décision de suspension n° X du D »
 * La date est écrite en toutes lettres (seule si réellement disponible,
 * aucune valeur fabriquée).
 */
export function objetLettre(opts: {
  type: InfractionType;
  numRef?: string | null;
  dateRef?: string | null;
}): string {
  const ref = opts.numRef ? ` n° ${opts.numRef}` : "";
  const dateFr = formaterDateFr(opts.dateRef);
  const date = dateFr ? ` du ${dateFr}` : "";
  return opts.type === "SUSPENSION"
    ? `Recours contre la décision de suspension${ref}${date}`
    : `Contestation de l'avis de contravention${ref}${date}`;
}

/**
 * Libellé du destinataire d'en-tête, type-aware :
 * - AMENDE    → l'Officier du ministère public près le tribunal compétent
 * - SUSPENSION → le préfet auteur de la décision
 * Formulation administrative générique : aucune adresse n'est inventée, la
 * précision est laissée au requérant.
 */
export function formuleEnTeteDestinataire(type: InfractionType): string {
  return type === "SUSPENSION"
    ? "Monsieur le Préfet"
    : "Monsieur l'Officier du ministère public";
}

/**
 * En-tête administrative de la lettre : bloc expéditeur (nom + adresse si
 * renseignés), destinataire type-aware, date de rédaction en toutes lettres.
 * Pure : rien n'est inventé, chaque bloc n'apparaît que si la donnée existe.
 */
export function enTeteLettre(opts: {
  type: InfractionType;
  nom?: string | null;
  adresse?: string | null;
  dateRedaction?: string | null;
}): string[] {
  const lignes: string[] = [];
  const expediteur = [opts.nom?.trim(), opts.adresse?.trim()].filter(Boolean);
  if (expediteur.length > 0) {
    lignes.push(...(expediteur as string[]));
  }
  lignes.push(formuleEnTeteDestinataire(opts.type));
  lignes.push("");
  const dateFr = formaterDateFr(opts.dateRedaction);
  if (dateFr) lignes.push(`Le ${dateFr}`);
  lignes.push("");
  return lignes;
}

/**
 * Habillage professionnel de la lettre générée : en-tête administrative
 * (coordonnées requérant si connues, destinataire type-aware, date de
 * rédaction en toutes lettres), Objet, formule d'appel « Madame, Monsieur, »,
 * corps validé par l'admin puis formule de politesse finale. La liste des
 * pièces jointes figure UNE seule fois, sous la signature, dans le PDF signé
 * (voir generateLettrePdf) — jamais doublée dans le corps. Pure : chaque bloc
 * n'apparaît que si sa donnée existe réellement (aucune valeur fabriquée).
 *
 * Idempotent : si la lettre a déjà été habillée (formule de politesse
 * présente), elle est retournée telle quelle — aucune re-formulation.
 */
export function formaterLettreOfficielle(opts: {
  type: InfractionType;
  corps: string;
  numRef?: string | null;
  dateRef?: string | null;
  nom?: string | null;
  adresse?: string | null;
  date?: string | null;
}): string {
  const corps = opts.corps.trim();
  if (!corps) return "";
  if (corps.includes(formulePolitesse())) return corps;

  const lignes: string[] = [];
  lignes.push(...enTeteLettre({
    type: opts.type,
    nom: opts.nom,
    adresse: opts.adresse,
    dateRedaction: opts.date,
  }));
  lignes.push(`Objet : ${objetLettre(opts)}`);
  lignes.push("");
  lignes.push(formuleAppel());
  lignes.push("");
  lignes.push(corps);
  lignes.push("");
  lignes.push(formulePolitesse());
  return lignes.join("\n");
}