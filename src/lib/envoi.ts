/**
 * Libellés d'envoi dépendant du type d'infraction (AMENDE vs SUSPENSION).
 * Module pur (testable). Le contenu reste procédural — aucun fondement
 * juridique n'est inventé ici : les motifs et articles viennent uniquement
 * des `FailleJuridique.templateLettre` validés par l'admin.
 */

export type InfractionType = "AMENDE" | "SUSPENSION";

export type CanalEnvoi = "ANTAI" | "TELERECOURS" | "LRAR";

/** Classification du document contesté (OCR, cf. `classifierDocType`). */
export type DocTypeAnalyse = "AMENDE" | "3F" | "48SI";

/** Lecture défensive du docType extrait (Json) — jamais de valeur fabriquée. */
export function lireDocType(v: unknown): DocTypeAnalyse | undefined {
  return v === "AMENDE" || v === "3F" || v === "48SI" ? v : undefined;
}

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

/**
 * Civilité du destinataire en suspension, selon le document contesté :
 * - **3F** (arrêté préfectoral) → le préfet, auteur de la décision ;
 * - **48SI** (invalidation pour solde nul) → le ministre de l'Intérieur,
 *   auteur de la notification (art. L. 223-3 : « le ministre de l'Intérieur
 *   notifie la décision ») ;
 * - docType inconnu → repli prudent sur le préfet (défaut SUSPENSION).
 */
function civiliteSuspension(docType?: DocTypeAnalyse | null): string {
  return docType === "48SI"
    ? "Monsieur le Ministre de l'Intérieur"
    : "Monsieur le Préfet";
}

export function destinataireLrar(
  type: InfractionType,
  docType?: DocTypeAnalyse | null,
): string {
  if (type !== "SUSPENSION") {
    return "à l'adresse de l'OMP indiquée sur votre avis de contravention";
  }
  return docType === "48SI"
    ? "à l'adresse de l'autorité indiquée sur votre notification de décision"
    : "à l'adresse du préfet indiquée sur votre décision";
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

/** Libellé du classificateur de document (AMENDE / 3F / 48SI). */
export function libelleDocType(docType: string | null | undefined): string | null {
  if (docType === "AMENDE") return "avis de contravention (amende)";
  if (docType === "3F") return "suspension préfectorale (3F)";
  if (docType === "48SI") return "invalidation du permis (48SI)";
  return null;
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
 * Civilité d'appel selon le destinataire (type-aware + docType en suspension) :
 * - AMENDE (OMP / service)        → formule neutre « Madame, Monsieur, »
 * - SUSPENSION 3F / inconnu       → « Monsieur le Préfet, »
 * - SUSPENSION 48SI               → « Monsieur le Ministre de l'Intérieur, »
 * La formule neutre reste la plus largement acceptée lorsque le destinataire
 * est un service ou reste indéterminé.
 */
export function formuleAppel(
  type: InfractionType,
  docType?: DocTypeAnalyse | null,
): string {
  if (type === "AMENDE") return "Madame, Monsieur,";
  return `${civiliteSuspension(docType)},`;
}

/**
 * Formule de politesse finale, alignée sur la formule d'appel du destinataire.
 * Le préfet ou le ministre reçoivent la civilité propre, l'OMP ou un service
 * la formule neutre.
 */
export function formulePolitesse(
  type: InfractionType,
  docType?: DocTypeAnalyse | null,
): string {
  if (type === "AMENDE") {
    return "Je vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.";
  }
  return `Je vous prie d'agréer, ${civiliteSuspension(docType)}, l'expression de ma considération distinguée.`;
}

/** Toutes les politesses connues — sert au test d'habillage idempotent. */
export function politessesConnues(): string[] {
  return [
    formulePolitesse("AMENDE"),
    formulePolitesse("SUSPENSION", "3F"),
    formulePolitesse("SUSPENSION", "48SI"),
    formulePolitesse("SUSPENSION"),
  ];
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
 * Libellé du destinataire d'en-tête, type-aware (+ docType en suspension) :
 * - AMENDE         → l'Officier du ministère public près le tribunal compétent
 * - SUSPENSION 3F  → le préfet auteur de l'arrêté
 * - SUSPENSION 48SI → le ministre de l'Intérieur, auteur de la notification
 * Formulation administrative générique : aucune adresse n'est inventée, la
 * précision est laissée au requérant.
 */
export function formuleEnTeteDestinataire(
  type: InfractionType,
  docType?: DocTypeAnalyse | null,
): string {
  if (type === "SUSPENSION") return civiliteSuspension(docType);
  return "Monsieur l'Officier du ministère public";
}

/**
 * En-tête administrative de la lettre : bloc expéditeur (nom + adresse si
 * renseignés), destinataire type-aware, date de rédaction en toutes lettres.
 * Pure : rien n'est inventé, chaque bloc n'apparaît que si la donnée existe.
 */
export function enTeteLettre(opts: {
  type: InfractionType;
  docType?: DocTypeAnalyse | null;
  nom?: string | null;
  adresse?: string | null;
  dateRedaction?: string | null;
}): string[] {
  const lignes: string[] = [];
  const expediteur = [opts.nom?.trim(), opts.adresse?.trim()].filter(Boolean);
  if (expediteur.length > 0) {
    lignes.push(...(expediteur as string[]));
  }
  lignes.push(formuleEnTeteDestinataire(opts.type, opts.docType));
  lignes.push("");
  const dateFr = formaterDateFr(opts.dateRedaction);
  if (dateFr) lignes.push(`Le ${dateFr}`);
  lignes.push("");
  return lignes;
}

/**
 * Habillage professionnel de la lettre générée : en-tête administrative
 * (coordonnées requérant si connues, destinataire type-aware, date de
 * rédaction en toutes lettres), Objet, formule d'appel type-aware
 * (« Madame, Monsieur, » à l'OMP / « Monsieur le Préfet » en suspension),
 * corps validé par l'admin puis formule de politesse finale alignée sur le
 * destinataire. La liste des
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
  docType?: DocTypeAnalyse | null;
  numRef?: string | null;
  dateRef?: string | null;
  nom?: string | null;
  adresse?: string | null;
  date?: string | null;
}): string {
  const corps = opts.corps.trim();
  if (!corps) return "";
  // Idempotent : une lettre déjà habillée (une quelconque des politesses
  // connues — neutre, préfet ou ministre) est retournée telle quelle —
  // aucune re-formulation, aucune double habilitation.
  if (politessesConnues().some((p) => corps.includes(p))) {
    return corps;
  }

  const lignes: string[] = [];
  lignes.push(
    ...enTeteLettre({
      type: opts.type,
      docType: opts.docType,
      nom: opts.nom,
      adresse: opts.adresse,
      dateRedaction: opts.date,
    }),
  );
  lignes.push(`Objet : ${objetLettre(opts)}`);
  lignes.push("");
  lignes.push(formuleAppel(opts.type, opts.docType));
  lignes.push("");
  lignes.push(corps);
  lignes.push("");
  lignes.push(formulePolitesse(opts.type, opts.docType));
  return lignes.join("\n");
}