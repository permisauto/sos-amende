/**
 * Libellés d'envoi dépendant du type d'infraction (AMENDE vs SUSPENSION).
 * Module pur (testable). Le contenu reste procédural — aucun fondement
 * juridique n'est inventé ici : les motifs et articles viennent uniquement
 * des `FailleJuridique.templateLettre` validés par l'admin.
 */

import { destinataireRequete, tribunalPourAdresse } from "./tribunal-administratif";

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
 *
 * Usage : courrier adressé à l'administration (LRAR — recours gracieux ou
 * hiérarchique). La voie contentieuse (Télérecours — recours pour excès de
 * pouvoir) vise le **tribunal administratif** et non l'administration :
 * voir `civiliteJugeAdministratif`.
 */
function civiliteSuspension(docType?: DocTypeAnalyse | null): string {
  return docType === "48SI"
    ? "Monsieur le Ministre de l'Intérieur"
    : "Monsieur le Préfet";
}

/**
 * Formule d'appel et destinataire de la **requête contentieuse** (recours pour
 * excès de pouvoir) : le juge, non l'administration. La juridiction
 * territorialement compétente (R. 221-3 CJA) est déduite du département du
 * requérant quand son adresse est connue (voir `tribunal-administratif.ts`) ;
 * sans adresse exploitable la formule reste générique, la juridiction étant
 * précisée au dépôt (Télérecours).
 */
export function civiliteJugeAdministratif(tribunal?: string | null): string {
  return destinataireRequete(tribunal ?? null);
}

/** Titre de tête de la requête introductive d'instance (REP). */
export function titreRequete(): string {
  return "REQUÊTE INTRODUCTIVE D'INSTANCE EN ANNULATION POUR EXCÈS DE POUVOIR";
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
  contentieux = false,
): string {
  if (type === "AMENDE") return "Madame, Monsieur,";
  if (contentieux) {
    return "Monsieur le Président, Mesdames et Messieurs les Conseillers,";
  }
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
  contentieux = false,
): string {
  if (type === "AMENDE") {
    return "Je vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.";
  }
  if (contentieux) {
    return "Je vous prie d'agréer, Monsieur le Président, Mesdames et Messieurs les Conseillers, l'expression de ma haute considération.";
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
    formulePolitesse("SUSPENSION", null, true),
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
  contentieux = false,
  tribunal?: string | null,
): string {
  if (type === "SUSPENSION") {
    return contentieux
      ? civiliteJugeAdministratif(tribunal)
      : civiliteSuspension(docType);
  }
  return "Monsieur l'Officier du ministère public";
}

/**
 * Identité du requérant pour l'en-tête de la lettre : le nom (nom + prénom
 * concaténés) et l'adresse **extraits du document par l'OCR** et relus par
 * l'humain au formulaire d'analyse d'abord ; `User.name` (profil, saisi au
 * paiement) ne sert que de repli pour le nom si l'OCR n'a rien lu. Jamais de
 * valeur inventée : sans donnée, `null` — l'en-tête omet simplement la ligne.
 */
export function identiteExtrait(
  data: unknown,
  profilName: string | null | undefined,
): { nom: string | null; adresse: string | null } {
  const lire = (cle: string): string | null => {
    const v = (data as Record<string, unknown> | null | undefined)?.[cle];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    nom: lire("nom") ?? (profilName?.trim() || null),
    adresse: lire("adresse"),
  };
}

/**
 * En-tête administrative de la lettre : bloc expéditeur (nom + adresse si
 * renseignés), destinataire type-aware, date de rédaction en toutes lettres.
 * Pure : rien n'est inventé, chaque bloc n'apparaît que si la donnée existe.
 */
export function enTeteLettre(opts: {
  type: InfractionType;
  docType?: DocTypeAnalyse | null;
  contentieux?: boolean;
  tribunal?: string | null;
  nom?: string | null;
  adresse?: string | null;
  dateRedaction?: string | null;
}): string[] {
  const lignes: string[] = [];
  const expediteur = [opts.nom?.trim(), opts.adresse?.trim()].filter(Boolean);
  if (expediteur.length > 0) {
    lignes.push(...(expediteur as string[]));
  }
  if (opts.contentieux) lignes.push(titreRequete());
  lignes.push(
    formuleEnTeteDestinataire(
      opts.type,
      opts.docType,
      opts.contentieux,
      opts.tribunal,
    ),
  );
  lignes.push("");
  const dateFr = formaterDateFr(opts.dateRedaction);
  if (dateFr) lignes.push(`Le ${dateFr}`);
  lignes.push("");
  return lignes;
}

/**
 * Extrait le corps d'une lettre déjà habillée (en-tête + Objet + formule
 * d'appel + corps + politesse) : renvoie le texte situé entre la formule
 * d'appel et la formule de politesse finale. Sert à ré-habiller une lettre
 * lorsqu'on change de destinataire (ex. lettre d'abord adressée au préfet puis
 * convertie en requête contentieuse adressée au tribunal administratif).
 * Une lettre non reconnue comme habillée est renvoyée telle quelle (aucune
 * altération hasardeuse).
 */
export function corpsDepuisLettreHabillee(lettre: string): string {
  const texte = lettre.trim();
  const appels = [
    formuleAppel("AMENDE"),
    formuleAppel("SUSPENSION", null, true),
    formuleAppel("SUSPENSION", "3F"),
    formuleAppel("SUSPENSION", "48SI"),
    formuleAppel("SUSPENSION"),
  ];
  let debut = -1;
  for (const a of appels) {
    const i = texte.indexOf(a);
    if (i !== -1 && (debut === -1 || i < debut)) debut = i + a.length;
  }
  if (debut === -1) return texte;
  let fin = -1;
  for (const p of politessesConnues()) {
    const j = texte.lastIndexOf(p);
    if (j !== -1 && j > debut && (fin === -1 || j < fin + p.length)) {
      fin = j;
    }
  }
  if (fin === -1 || fin <= debut) return texte;
  return texte.slice(debut, fin).trim();
}

/**
 * Habillage professionnel de la lettre générée : en-tête administrative
 * (coordonnées requérant si connues, destinataire type-aware, date de
 * rédaction en toutes lettres), Objet, formule d'appel type-aware
 * (« Madame, Monsieur, » à l'OMP / « Monsieur le Préfet » en suspension / au
 * tribunal administratif en voie contentieuse), corps validé par l'admin puis
 * formule de politesse finale alignée sur le destinataire. La liste des
 * pièces jointes figure UNE seule fois, sous la signature, dans le PDF signé
 * (voir generateLettrePdf) — jamais doublée dans le corps. Pure : chaque bloc
 * n'apparaît que si sa donnée existe réellement (aucune valeur fabriquée).
 *
 * Idempotent : une lettre déjà habillée avec le **même destinataire** est
 * retournée telle quelle. En revanche, si la lettre porte une politesse d'un
 * autre destinataire et que le canal demandé change la voie (contentieuse vs
 * administrative), le corps est extrait et re-habillé au bon destinataire.
 */
export function formaterLettreOfficielle(opts: {
  type: InfractionType;
  corps: string;
  docType?: DocTypeAnalyse | null;
  /** Canal d'envoi : `TELERECOURS` = requête contentieuse (tribunal
   * administratif, REP) ; `LRAR`/`ANTAI`/vide = courrier à l'administration. */
  canal?: CanalEnvoi | null;
  numRef?: string | null;
  dateRef?: string | null;
  nom?: string | null;
  adresse?: string | null;
  date?: string | null;
}): string {
  const brut = opts.corps.trim();
  if (!brut) return "";

  // Voie contentieuse (recours pour excès de pouvoir déposé via Télérecours) :
  // la requête vise le tribunal administratif, non l'administration.
  const contentieux = opts.type === "SUSPENSION" && opts.canal === "TELERECOURS";
  // Juridiction territorialement compétente déduite du département du requérant
  // (R. 221-3 CJA) — `null` si l'adresse ne permet pas de l'identifier.
  const tribunal = contentieux ? tribunalPourAdresse(opts.adresse) : null;
  const politesseCible = formulePolitesse(opts.type, opts.docType, contentieux);

  // Idempotent : déjà habillée au **bon** destinataire.
  if (brut.includes(politesseCible)) {
    return brut;
  }

  // Déjà habillée à un **autre** destinataire : on récupère le corps et on le
  // ré-habille (changement de voie — ex. lettre préfet → requête TA). Sinon on
  // part du corps brut.
  const dejaHabillee = politessesConnues().some((p) => brut.includes(p));
  const corps = dejaHabillee ? corpsDepuisLettreHabillee(brut) : brut;

  const lignes: string[] = [];
  lignes.push(
    ...enTeteLettre({
      type: opts.type,
      docType: opts.docType,
      contentieux,
      tribunal,
      nom: opts.nom,
      adresse: opts.adresse,
      dateRedaction: opts.date,
    }),
  );
  lignes.push(`Objet : ${objetLettre(opts)}`);
  lignes.push("");
  lignes.push(formuleAppel(opts.type, opts.docType, contentieux));
  lignes.push("");
  lignes.push(corps);
  lignes.push("");
  lignes.push(formulePolitesse(opts.type, opts.docType, contentieux));
  return lignes.join("\n");
}