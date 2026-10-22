import type { ExtractedData } from "./moteur";

/**
 * Ordonnancement et garde-fou d'incohérence des failles candidates d'un dossier.
 *
 * Module PUR (aucun accès base, aucun `server-only`) : il reçoit les failles
 * détectées + les faits/réponses + un historique de succès optionnel, et rend
 * un classement déterministe. Aucune décision juridique n'est prise ici : le
 * classement PROPOSE un ordre, le juriste reste seul décideur (invariant N3).
 */

/** Entrée minimale : ce qu'il faut pour classer une candidature. */
export type CandidatAclasser = {
  failleId: string;
  /** Score de corroboration documentaire (`scoreFaille`), 0 si inconnu. */
  score: number;
  /** Faille ACTIVE au catalogue ? (sinon jamais retenue, seulement signalée). */
  active: boolean;
  /** Retenue par le juriste (CONFIRMEE) ? Une confirmation prime sur le score. */
  confirmee?: boolean;
  /** Écartée par le juriste (REJETEE) ? Jamais remontée (compat. fusion). */
  rejetee?: boolean;
};

export type HistoriqueFaille = { failleId: string; gagnes: number; perdus: number };

export type ClassementFaille = {
  failleId: string;
  score: number;
  /** Score final = corroboration + bonus historique borné (documenté). */
  rang: number;
  /** Rang 0 = principale proposée ; au-delà, subsidiaires dans l'ordre. */
  rangOrdre: number;
};

/**
 * Bonus/malus historique : le taux de succès observé (Lot 2.5) module le
 * classement, mais reste BORNÉ pour ne jamais écraser la corroboration
 * documentaire. Un taux parfait sur 1 dossier ne doit pas battre un score
 * élevé : on borne l'effet à ±8 points, et on exige ≥ 3 dossiers tranchés.
 */
export const BONUS_HISTORIQUE_MAX = 8;
export const ECHANTILLON_HISTORIQUE_MIN = 3;

/** Nombre maximal de moyens assemblés dans une lettre (étape D). */
export const MAX_MOYENS_LETTRE = 3;

export function bonusHistorique(
  h: HistoriqueFaille | undefined,
): number {
  if (!h) return 0;
  const total = h.gagnes + h.perdus;
  if (total < ECHANTILLON_HISTORIQUE_MIN) return 0;
  const taux = h.gagnes / total;
  // Taux 0.5 = neutre ; au-dessus bonus, en dessous malus, borné.
  return Math.round((taux - 0.5) * 2 * BONUS_HISTORIQUE_MAX);
}

/** Alerte de contradiction entre faits déclarés au questionnaire. */
export type ContradictionFait = {
  /** Clé technique stable (dédup / tests). */
  cle: string;
  /** Explication en français, affichée au juriste (information seule). */
  message: string;
};

/**
 * Contradictions FACTUELLES entre réponses du questionnaire : deux faits qui ne
 * peuvent pas être vrais ensemble. On ne s'appuie que sur des drapeaux booléens
 * saisis par le client, jamais sur une inférence ni sur une règle de droit.
 *
 * Garde-fou juridique : deux moyens de droit distincts ne sont JAMAIS signalés
 * « incompatibles » — seule une contradiction de faits l'est, et l'alerte est
 * purement informative (le juriste décide).
 */
export function detecterContradictions(faits: ExtractedData): ContradictionFait[] {
  const d = faits as Record<string, unknown>;
  const alertes: ContradictionFait[] = [];

  if (d.vehiculeVole && d.conducteurDifferent) {
    alertes.push({
      cle: "vehicule-vole-vs-conducteur",
      message:
        "Le véhicule est déclaré volé alors qu'un conducteur différent du titulaire est aussi déclaré : ces deux faits sont incompatibles, à vérifier.",
    });
  }
  if (d.vehiculeCede && d.conducteurDifferent) {
    alertes.push({
      cle: "vehicule-cede-vs-conducteur",
      message:
        "Le véhicule est déclaré cédé avant l'infraction alors qu'un conducteur différent est aussi déclaré : à vérifier, un seul des deux peut fonder la contestation.",
    });
  }

  return alertes;
}

/**
 * Classe les candidats d'un dossier.
 *
 * Ordre : confirmées d'abord (décision juriste prime), puis par rang décroissant
 * (corroboration + bonus historique), repli déterministe sur l'ordre d'entrée.
 * Les failles non ACTIVE et les REJETEE sont conservées dans la sortie mais
 * marquées (rangOrdre = -1) : l'UI décide de les afficher ou non.
 */
export function classerCandidats(
  candidats: CandidatAclasser[],
  historique: HistoriqueFaille[] = [],
): ClassementFaille[] {
  const histoParId = new Map(historique.map((h) => [h.failleId, h]));
  const resultats: ClassementFaille[] = candidats.map((c) => {
    const rang = c.score + bonusHistorique(histoParId.get(c.failleId));
    return {
      failleId: c.failleId,
      score: c.score,
      rang,
      rangOrdre: -1,
    };
  });

  const ordreEntree = new Map(candidats.map((c, i) => [c.failleId, i]));

  const classables = resultats.filter((r) => {
    const c = candidats.find((x) => x.failleId === r.failleId)!;
    return !c.rejetee && c.active;
  });
  classables.sort((a, b) => {
    const ca = candidats.find((x) => x.failleId === a.failleId)!;
    const cb = candidats.find((x) => x.failleId === b.failleId)!;
    // 1. Confirmées d'abord.
    if (Boolean(ca.confirmee) !== Boolean(cb.confirmee)) {
      return ca.confirmee ? -1 : 1;
    }
    // 2. Rang décroissant.
    if (b.rang !== a.rang) return b.rang - a.rang;
    // 3. Repli déterministe : ordre de détection d'entrée.
    return (ordreEntree.get(a.failleId) ?? 0) - (ordreEntree.get(b.failleId) ?? 0);
  });
  classables.forEach((r, i) => {
    r.rangOrdre = i;
  });

  // Les non-classables gardent rangOrdre = -1.
  const parId = new Map(resultats.map((r) => [r.failleId, r]));
  return candidats.map((c) => parId.get(c.failleId)!);
}

/**
 * Sélection des moyens à assembler dans la lettre : la principale + les
 * subsidiaires, bornés à MAX_MOYENS_LETTRE. La principale est toujours la
 * première confirmée placée en tête de classement (ou à défaut la mieux
 * classée). Ne tronque jamais silencieusement : retourne aussi le nombre de
 * moyens laissés de côté pour que l'UI prévienne le juriste.
 */
export function selectionnerMoyens(
  classement: ClassementFaille[],
  candidats: CandidatAclasser[],
  max = MAX_MOYENS_LETTRE,
): { retenus: string[]; ecartes: string[] } {
  const eligibles = classement
    .filter((r) => r.rangOrdre >= 0)
    .sort((a, b) => a.rangOrdre - b.rangOrdre)
    .map((r) => r.failleId);
  if (eligibles.length <= max) return { retenus: eligibles, ecartes: [] };
  return {
    retenus: eligibles.slice(0, max),
    ecartes: eligibles.slice(max),
  };
}

/** La faille proposée comme principale (première du classement, ou null). */
export function principaleProposee(
  classement: ClassementFaille[],
): string | null {
  const premier = classement
    .filter((r) => r.rangOrdre >= 0)
    .sort((a, b) => a.rangOrdre - b.rangOrdre)[0];
  return premier?.failleId ?? null;
}
