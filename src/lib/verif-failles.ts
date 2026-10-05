import type { ExtractedData } from "./moteur";

/** Pièce réduite à ce qu'il faut pour dériver un fait (type + URL). */
export type PreuveLegere = { type: string; url?: string | null };

/** Métadonnée IA affichée au juriste sur une candidate (jamais un fondement). */
export type SuggestionIa = {
  source: "ia" | "mock";
  pertinence?: "forte" | "moyenne";
  justification?: string;
  controle?: string;
  signalement?: string;
  at?: string; // ISO — horodatage de la vérification
};

/**
 * Faits du dossier enrichis par les pièces versées : une attestation de vol,
 * de cession ou un relevé de paiement téléversé après l'analyse rend le fait
 * correspondant avéré (le questionnaire a pu être mal coché ou non coché).
 * Complète uniquement — jamais d'annulation d'un fait déjà saisi — et les
 * pièces externes récupérées automatiquement (METEO/RADAR/TRAVAUX) ne sont
 * prises en compte que pour TRAVAUX (chantier avéré sur le lieu).
 */
export function faitsDepuisPreuves(
  data: ExtractedData,
  preuves: PreuveLegere[],
): ExtractedData {
  const faits: ExtractedData = { ...data };
  const drapeaux: Array<
    [
      typePreuve: string,
      champ: "vehiculeVole" | "vehiculeCede" | "paiementDejaFait",
    ]
  > = [
    ["ATTESTATION_VOL", "vehiculeVole"],
    ["ATTESTATION_CESSION", "vehiculeCede"],
    ["RELEVE_PAIEMENT", "paiementDejaFait"],
  ];
  for (const p of preuves) {
    for (const [type, champ] of drapeaux) {
      if (p.type === type) faits[champ] = true;
    }
    if (p.type === "TRAVAUX") faits.travaux_présents = true;
  }
  return faits;
}

export type ExistantFaille = { failleId: string; statut: string };

export type MajSuggestion = { failleId: string; suggestionIa: SuggestionIa };

export type FusionCandidats = {
  /** Ids qui doivent alimenter la lettre (ordre de détection, confirmations incluses). */
  idsLettre: string[];
  /** Ids à créer en CANDIDATE (détections ou suggestions IA inédites). */
  nouvelles: string[];
  /** Lignes existantes à mettre à jour (justification / signalement IA). */
  majs: MajSuggestion[];
};

/**
 * Fusion détection/règles+IA × décisions du juriste (« Vérifier les failles »,
 * audit verification 2.0) :
 *
 * - les failles ÉCARTÉES par le juriste ne sont jamais ressuscitées, ni
 *   remises en lettre, même si la détection les re-matche ;
 * - les failles CONFIRMÉE restent dans la lettre même si la détection ne les
 *   ressort plus (la décision du juriste prime sur le moteur) ;
 * - les suggestions IA ne s'écrivent que sur des lignes existantes non
 *   écartées (une suggestion n'a jamais priorité sur un écart) ; un
 *   signalement IA n'est écrit que s'il n'y a pas déjà suggestion pour la
 *   même ligne.
 */
export function fusionnerCandidats(
  existants: ExistantFaille[],
  detectes: string[],
  suggestions: MajSuggestion[],
  signalements: MajSuggestion[],
): FusionCandidats {
  const statutParId = new Map(existants.map((e) => [e.failleId, e.statut]));
  const rejetees = new Set(
    existants.filter((e) => e.statut === "REJETEE").map((e) => e.failleId),
  );
  const confirmees = existants
    .filter((e) => e.statut === "CONFIRMEE")
    .map((e) => e.failleId);

  const detecteesValides = detectes.filter((id) => !rejetees.has(id));

  const idsLettre: string[] = [];
  for (const id of [...detecteesValides, ...confirmees]) {
    if (!idsLettre.includes(id)) idsLettre.push(id);
  }

  const nouvelles = detecteesValides.filter((id) => !statutParId.has(id));

  const majs: MajSuggestion[] = [];
  const dejaMaj = new Set<string>();
  for (const m of suggestions) {
    const statut = statutParId.get(m.failleId);
    if (statut === undefined || statut === "REJETEE") continue;
    if (dejaMaj.has(m.failleId)) continue;
    majs.push(m);
    dejaMaj.add(m.failleId);
  }
  for (const m of signalements) {
    if (dejaMaj.has(m.failleId)) continue;
    const statut = statutParId.get(m.failleId);
    if (statut === undefined || statut === "REJETEE") continue;
    majs.push(m);
    dejaMaj.add(m.failleId);
  }

  return { idsLettre, nouvelles, majs };
}

/** Égalité par ensemble d'ids (indépendant de l'ordre, sans doublon). */
export function memesIds(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const id of sa) if (!sb.has(id)) return false;
  return true;
}
