/**
 * Détection de la voie de procédure d'une contravention / d'un délit, à partir
 * du montant lu sur l'avis et du texte du document (module PUR, testé).
 *
 * Barème des amendes forfaitaires (source : code de la route, art. R. 48-1
 * CPP et textes fixant les montants) :
 *   1re classe : 11 € (majorée 33 €)
 *   2e classe  : 35 € (minorée 22 €, majorée 75 €)
 *   3e classe  : 68 € (minorée 45 €, majorée 180 €)
 *   4e classe  : 135 € (minorée 90 €, majorée 375 €) — consignation obligatoire
 *   5e classe  : 200 € (majorée 450 €) — consignation obligatoire
 *
 * Décision produit (2026-10-23) : les classes 1 à 3 relèvent de l'offre
 * « amende simple » (39 €), les classes 4 et 5 du **contentieux
 * contraventionnel** (149 €, consignation avant dépôt). Les infractions
 * délictuelles (AFD, grand excès de vitesse, conduite sans permis, sans
 * assurance, stupéfiants…) ne sont pas traitées : le client est orienté vers
 * un avocat, sans débit. Un montant non reconnu (ex. 1 500 €, montant de
 * jugement) laisse le client choisir : aucun débit avant confirmation.
 */

export type VoieProcedure =
  | "AMENDE_FORFAITAIRE"
  | "CONTENTIEUX_CONTRAVENTION"
  | "DELIT";

/** Résultat de la détection automatique (`INCONNU` = à confirmer par le client). */
export type VoieProcedureDetectee = VoieProcedure | "INCONNU";

export type ClasseContravention = 1 | 2 | 3 | 4 | 5;

export type ProcedureDetection = {
  voie: VoieProcedureDetectee;
  classe: ClasseContravention | null;
  /** Montant à consigner (contentieux uniquement), repris de l'avis. */
  consignationMontant: number | null;
  /** Explication affichée au client — jamais un fondement juridique. */
  motif: string;
};

const MONTANTS: Record<number, ClasseContravention> = {
  // 1re classe
  11: 1,
  17: 1,
  33: 1,
  // 2e classe
  22: 2,
  35: 2,
  75: 2,
  // 3e classe
  45: 3,
  68: 3,
  180: 3,
  // 4e classe
  90: 4,
  135: 4,
  375: 4,
  // 5e classe (amende forfaitaire et majorée)
  200: 5,
  450: 5,
};

/** Montants forfaitaires délictuels (AFD) usuels. Le texte prime toutefois. */
const MONTANTS_DELIT = new Set([500, 600, 640, 800, 1600]);

const MARQUEURS_DELIT_FORTS: RegExp[] = [
  /tribunal correctionnel/,
  /ordonnance penale/,
  /amende forfaitaire delictuelle/,
  /\bafd\b/,
  /stupefiant/,
  /sans permis/,
  /defaut de permis/,
  /sans assurance/,
  /defaut d'assurance/,
  /delit de fuite/,
  /citation directe/,
  /\bl\.\s*221-2\b/,
  /\bl\.\s*234-1\b/,
  /\bl\.\s*235-1\b/,
  /\bl\.\s*413-1\b/,
  /\bl\.\s*324-2\b/,
];

/**
 * « délit » seul est un marqueur **faible** : les avis de contravention
 * contiennent parfois ce mot dans une mention générale. Il ne l'emporte que
 * si le montant n'est pas un montant de contravention reconnu.
 */
const MARQUEUR_DELIT_FAIBLE = /\bdelit\b/;

/** Normalise un texte pour la recherche de marqueurs (minuscules, sans accents). */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Lit un montant en euros : « 135 € », « 135,00 € », « 1 500 € », 135.
 * `null` si la valeur n'est pas un montant positif exploitable.
 */
export function lireMontant(montant: unknown): number | null {
  if (typeof montant === "number") {
    return Number.isFinite(montant) && montant > 0 ? montant : null;
  }
  if (typeof montant !== "string") return null;
  let brut = montant
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/€|eur(?:os)?/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!brut) return null;
  if (brut.includes(",")) {
    brut = brut.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}\.\d{3}$/.test(brut)) {
    brut = brut.replace(".", "");
  }
  const valeur = Number(brut);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

function marqueurDelit(
  texte: string | null | undefined,
  montantConnu: boolean,
): string | null {
  if (!texte) return null;
  const t = normaliser(texte);
  for (const re of MARQUEURS_DELIT_FORTS) {
    const m = t.match(re);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  if (!montantConnu) {
    const m = t.match(MARQUEUR_DELIT_FAIBLE);
    if (m) return m[0];
  }
  return null;
}

/** Montant le plus plausible parmi les montants trouvés dans un texte. */
export function montantDepuisTexte(texte: string | null | undefined): number | null {
  if (!texte) return null;
  const re = /(\d{1,3}(?:[\s.]\d{3})*(?:[,.]\d{2})?)\s*(?:€|euros?)/gi;
  for (const m of texte.matchAll(re)) {
    const v = lireMontant(m[1]);
    if (v !== null) return v;
  }
  return null;
}

/**
 * Détecte la voie de procédure.
 *
 * Priorité au **texte** (un délit reste un délit quel que soit le montant),
 * puis au barème des amendes forfaitaires. Un montant absent ou inconnu
 * renvoie `INCONNU` : le client choisit, aucun débit n'est déclenché avant
 * confirmation.
 */
export function detecterProcedure(entree: {
  montant?: unknown;
  texte?: string | null;
}): ProcedureDetection {
  const montant = lireMontant(entree.montant) ?? montantDepuisTexte(entree.texte);
  const classeBarème = montant !== null ? MONTANTS[montant] ?? null : null;
  const marqueur = marqueurDelit(entree.texte, classeBarème !== null);

  if (marqueur) {
    return {
      voie: "DELIT",
      classe: null,
      consignationMontant: null,
      motif: `Le document mentionne un délit (« ${marqueur} ») : SOS Amende ne traite pas les délits, un avocat est nécessaire.`,
    };
  }

  if (montant !== null && MONTANTS_DELIT.has(montant)) {
    return {
      voie: "DELIT",
      classe: null,
      consignationMontant: null,
      motif: `Montant de ${montant} € : amende forfaitaire délictuelle ou délit, un avocat est nécessaire.`,
    };
  }

  if (montant === null) {
    return {
      voie: "INCONNU",
      classe: null,
      consignationMontant: null,
      motif:
        "Montant introuvable ou non reconnu : précisez la procédure de votre document.",
    };
  }

  const classe = classeBarème;
  if (!classe) {
    return {
      voie: "INCONNU",
      classe: null,
      consignationMontant: null,
      motif: `Montant de ${montant} € non reconnu (montant de jugement ou majoration atypique) : précisez la procédure.`,
    };
  }

  if (classe <= 3) {
    return {
      voie: "AMENDE_FORFAITAIRE",
      classe,
      consignationMontant: null,
      motif: `Montant de ${montant} € : contravention de ${classe}e classe — contestation d'amende simple.`,
    };
  }

  return {
    voie: "CONTENTIEUX_CONTRAVENTION",
    classe,
    consignationMontant: montant,
    motif: `Montant de ${montant} € : contravention de ${classe}e classe — contentieux devant le tribunal de police, consignation obligatoire.`,
  };
}

export const VOIES_PROCEDURE: readonly VoieProcedure[] = [
  "AMENDE_FORFAITAIRE",
  "CONTENTIEUX_CONTRAVENTION",
  "DELIT",
];

/** Valide une valeur de formulaire (jamais une voie hors liste). */
export function lireVoieProcedure(v: unknown): VoieProcedure | null {
  return typeof v === "string" && (VOIES_PROCEDURE as readonly string[]).includes(v)
    ? (v as VoieProcedure)
    : null;
}

export function estContentieux(voie: string | null | undefined): boolean {
  return voie === "CONTENTIEUX_CONTRAVENTION";
}

export function estDelit(voie: string | null | undefined): boolean {
  return voie === "DELIT";
}

/** Libellé court pour l'UI (classe éventuelle ajoutée entre parenthèses). */
export function libelleVoieProcedure(
  voie: string | null | undefined,
  classe?: number | null,
): string {
  switch (voie) {
    case "AMENDE_FORFAITAIRE":
      return classe
        ? `Amende simple (${classe}e classe)`
        : "Amende simple";
    case "CONTENTIEUX_CONTRAVENTION":
      return classe
        ? `Contentieux contraventionnel (${classe}e classe)`
        : "Contentieux contraventionnel";
    case "DELIT":
      return "Délit — avocat nécessaire";
    default:
      return "Procédure à préciser";
  }
}
