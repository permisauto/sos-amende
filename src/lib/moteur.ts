export type ExtractedData = {
  nom?: string;
  plaque?: string;
  num_pv?: string;
  date?: string; // ISO yyyy-mm-dd
  heure?: string;
  numTelePaiement?: string;
  cle?: string;
  montant?: string;
  typeRadar?: string;
  radarId?: string;
  plaqueIncorrecte?: boolean;
  preuveEtalonnage?: string;
  // Questionnaire ciblé (flux A, étape 2) : contexte apporté par le client,
  // exploité par le juriste lors de la validation humaine.
  paiementDejaFait?: boolean;
  vehiculeCede?: boolean;
  vehiculeVole?: boolean;
  conducteurDifferent?: boolean;
};

export const FAILLE_IDS = {
  prescription: "faille-prescription-1-an",
  mentions: "faille-mentions-obligatoires",
  erreurPlaque: "faille-erreur-plaque",
  etalonnage: "faille-certificat-etalonnage",
} as const;

export function datePrescrite(datePv?: string): boolean {
  if (!datePv) return false;
  const d = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > 365 * 24 * 3600 * 1000;
}

/**
 * Délai réglementaire de contestation : 45 jours pour une amende forfaitaire,
 * 2 mois pour un recours gracieux de suspension de permis.
 * Retourne null si la date du PV est absente ou invalide.
 */
export function dateLimitePv(
  datePv?: string,
  type?: string,
): Date | null {
  if (!datePv) return null;
  const d = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const jours = type === "SUSPENSION" ? 60 : 45;
  const limite = new Date(d);
  limite.setUTCDate(limite.getUTCDate() + jours);
  return limite;
}

export function joursRestants(dateLimite?: Date | null): number {
  if (!dateLimite) return Number.POSITIVE_INFINITY;
  const restant = Math.ceil(
    (dateLimite.getTime() - Date.now()) / (24 * 3600 * 1000),
  );
  return restant + 0; // normalise -0 → 0
}

/**
 * Un radar doit disposer d'un certificat d'étalonnage valide le jour de
 * l'infraction. Si le certificat était expiré, la contravention est
 * contestable (faille "certificat d'étalonnage").
 */
export function etalonnageExpire(
  dateExpiration?: Date | string | null,
  datePv?: string,
): boolean {
  if (!dateExpiration || !datePv) return false;
  const exp = new Date(dateExpiration);
  const pv = new Date(`${datePv}T00:00:00Z`);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(pv.getTime())) return false;
  return pv.getTime() > exp.getTime();
}

export function detecterFaille(
  data: ExtractedData,
  failles: { id: string }[],
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): { id: string } | null {
  const premier = detecterFailles(data, null, failles, contexte)[0];
  return premier ? { id: premier } : null;
}

/**
 * Règles de détection automatique d'une faille (base juridique auto-alimentée).
 * Évaluées sur les données extraites (OCR + saisie humaine) et sur le texte
 * brut scanné du PV/lettre (Dossier.pvTexte).
 */
export type RegleDetection =
  | { type: "champAbsent"; champ: string }
  | { type: "datePrescrite" }
  | { type: "plaqueIncorrecte" }
  | { type: "etalonnageExpire" }
  | { type: "texteContient"; motif: string }
  | { type: "texteAbsent"; motif: string };

export type FailleDetectable = {
  id: string;
  reglesDetection?: RegleDetection[] | null;
};

// Ordre de priorité des failles connues (la première qui matche est retenue
// comme faille principale du dossier).
const PRIORITE_DETECTION = [
  FAILLE_IDS.prescription,
  FAILLE_IDS.erreurPlaque,
  FAILLE_IDS.mentions,
  FAILLE_IDS.etalonnage,
];

/**
 * Retourne les ids de TOUTES les failles candidates (dans l'ordre de
 * priorité). Une faille est candidate si l'une au moins de ses règles matche
 * (sémantique OU). Sans règles explicites, on retombe sur les prédicats
 * hérités pour les 4 failles connues ; une faille inconnue sans règle n'est
 * jamais détectée seule.
 */
export function detecterFailles(
  data: ExtractedData,
  texte: string | null | undefined,
  failles: FailleDetectable[],
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): string[] {
  const byId = new Map(failles.map((f) => [f.id, f]));
  const connues = PRIORITE_DETECTION.filter((id) => byId.has(id));
  const autres = failles
    .filter((f) => !PRIORITE_DETECTION.includes(f.id as (typeof PRIORITE_DETECTION)[number]))
    .map((f) => f.id);

  const candidates: string[] = [];
  for (const id of [...connues, ...autres]) {
    const faille = byId.get(id);
    if (faille && reglesMatchent(faille, data, texte, contexte)) {
      candidates.push(id);
    }
  }
  return candidates;
}

function reglesMatchent(
  faille: FailleDetectable,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  if (faille.reglesDetection && faille.reglesDetection.length > 0) {
    return faille.reglesDetection.some((regle) =>
      evalRegle(regle, data, texte, contexte),
    );
  }
  return predicatHerite(faille.id, data, texte, contexte);
}

function evalRegle(
  regle: RegleDetection,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  switch (regle.type) {
    case "champAbsent": {
      const valeur = (data as Record<string, unknown>)[regle.champ];
      return valeur == null || valeur === "";
    }
    case "datePrescrite":
      return datePrescrite(data.date);
    case "plaqueIncorrecte":
      return data.plaqueIncorrecte === true;
    case "etalonnageExpire":
      return (
        !!contexte?.dateExpirationEtalonnage &&
        etalonnageExpire(contexte.dateExpirationEtalonnage, data.date)
      );
    case "texteContient":
      return (
        !!texte && texte.toLowerCase().includes(regle.motif.toLowerCase())
      );
    case "texteAbsent":
      return (
        !!texte && !texte.toLowerCase().includes(regle.motif.toLowerCase())
      );
  }
}

// Prédicats hérités pour les failles connues sans règles explicites.
function predicatHerite(
  id: string,
  data: ExtractedData,
  _texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): boolean {
  switch (id) {
    case FAILLE_IDS.prescription:
      return datePrescrite(data.date);
    case FAILLE_IDS.erreurPlaque:
      return data.plaqueIncorrecte === true;
    case FAILLE_IDS.mentions:
      return !data.numTelePaiement || !data.cle;
    case FAILLE_IDS.etalonnage:
      return (
        !!contexte?.dateExpirationEtalonnage &&
        etalonnageExpire(contexte.dateExpirationEtalonnage, data.date)
      );
    default:
      return false;
  }
}

export function remplirTemplate(
  template: string,
  data: ExtractedData,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (data as Record<string, string | boolean | undefined>)[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Score de confiance d'une faille candidate (démo/simulation) : nombre de
 * règles qui matchent rapporté au nombre de règles évaluées. Retourne null si
 * aucune règle ne matche (faille non candidate). Sans règles explicites, on
 * évalue le prédicat hérité (1/1 s'il matche). Ne constitue pas un avis
 * juridique — la validation reste humaine (juriste).
 */
export function scoreFaille(
  faille: FailleDetectable,
  data: ExtractedData,
  texte: string | null | undefined,
  contexte?: { dateExpirationEtalonnage?: Date | string | null },
): { matchees: number; total: number; score: number } | null {
  const regles = faille.reglesDetection ?? [];
  let matchees = 0;
  let total = 0;
  if (regles.length > 0) {
    for (const regle of regles) {
      total += 1;
      if (evalRegle(regle, data, texte, contexte)) matchees += 1;
    }
  } else {
    total = 1;
    if (predicatHerite(faille.id, data, texte, contexte)) matchees = 1;
  }
  if (matchees === 0) return null;
  return { matchees, total, score: Math.round((matchees / total) * 100) };
}