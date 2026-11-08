import "server-only";
import { prisma } from "./prisma";
import { chargerHistoriqueFailles } from "./failles-historique";

/**
 * Cockpit de pilotage (Pilier 5) — indicateurs de santé du produit :
 *
 *  1. le **funnel des dossiers** (détection → validation → envoi → décision) ;
 *  2. l'**efficacité des failles** (gagnées/perdues par faille, réutilise
 *     `failles-historique`) ;
 *  3. la **dérive du filtre de veille** (combien de publications le juriste
 *     écarte à la main — un taux élevé signale que le filtre laisse passer du
 *     hors-sujet).
 *
 * Tout est **best-effort** : une base en rade renvoie des zéros (jamais de 500).
 */

export type FunnelDossier = {
  total: number;
  enAnalyse: number;
  aValider: number;
  enAttenteSignature: number;
  enAttentePaiement: number;
  envoyes: number;
  resolus: number;
  rejetes: number;
  clôtures: number;
};

export async function chargerFunnel(): Promise<FunnelDossier> {
  const vide: FunnelDossier = {
    total: 0,
    enAnalyse: 0,
    aValider: 0,
    enAttenteSignature: 0,
    enAttentePaiement: 0,
    envoyes: 0,
    resolus: 0,
    rejetes: 0,
    clôtures: 0,
  };
  try {
    const groupes = await prisma.dossier.groupBy({ by: ["statut"], _count: true });
    const m = new Map(groupes.map((g) => [g.statut, g._count]));
    const n = (s: string) =>
      m.get(s as (typeof groupes)[number]["statut"]) ?? 0;
    const total = groupes.reduce((acc, g) => acc + (g._count ?? 0), 0);
    return {
      total,
      enAnalyse: n("EN_ANALYSE"),
      aValider: n("EN_ATTENTE_VALIDATION") + n("A_VERIFIER") + n("PRET"),
      enAttenteSignature: n("EN_ATTENTE_PRE_SIGNATURE"),
      enAttentePaiement: n("EN_ATTENTE_PAIEMENT") + n("BROUILLON"),
      envoyes: n("ENVOYE"),
      resolus: n("RESOLU"),
      rejetes: n("REJETE"),
      clôtures: n("ANNULE") + n("ERREUR_TECHNIQUE") + n("AVOCAT_REQUIS"),
    };
  } catch {
    return vide;
  }
}

export type EfficaciteFaille = {
  failleId: string;
  titre: string;
  typeInfraction: string;
  gagnes: number;
  perdus: number;
  total: number;
  taux: number | null; // 0..1, null si < 3 tranchés
};

/** Efficacité des failles (résultats OMP) jointe aux titres de la base. */
export async function chargerEfficaciteFailles(): Promise<EfficaciteFaille[]> {
  try {
    const [historique, failles] = await Promise.all([
      chargerHistoriqueFailles(),
      prisma.failleJuridique.findMany({
        where: { statut: "ACTIVE" },
        select: { id: true, titreFaille: true, typeInfraction: true },
      }),
    ]);
    const parId = new Map(failles.map((f) => [f.id, f]));
    return historique
      .filter((h) => parId.has(h.failleId))
      .map((h) => {
        const f = parId.get(h.failleId)!;
        const total = h.gagnes + h.perdus;
        return {
          failleId: h.failleId,
          titre: f.titreFaille,
          typeInfraction: f.typeInfraction,
          gagnes: h.gagnes,
          perdus: h.perdus,
          total,
          taux: total >= 3 ? h.gagnes / total : null,
        };
      })
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

export type DeriveFiltre = {
  ecartees: number;
  promues: number;
  nouvelles: number;
  /** Taux d'écart manuel sur les publications relues (0..1), null sans relecture. */
  tauxEcart: number | null;
};

/**
 * Dérive du filtre de veille : les publications que le juriste a **écartées à
 * la main** (hors sujet) vs celles **promues**. Un taux d'écart élevé (> 75 %)
 * signale que le filtre de pertinence (`veille-perteinence.ts`) laisse passer
 * trop de bruit — à recalibrer (`MOTS_CLES_EXCLUS` / poids).
 */
export async function chargerDeriveFiltre(): Promise<DeriveFiltre> {
  const vide: DeriveFiltre = {
    ecartees: 0,
    promues: 0,
    nouvelles: 0,
    tauxEcart: null,
  };
  try {
    const groupes = await prisma.sourceJuridique.groupBy({
      by: ["statut"],
      _count: true,
    });
    const m = new Map(groupes.map((g) => [g.statut, g._count]));
    const ecartees = m.get("ECARTE") ?? 0;
    const promues = m.get("PROMU") ?? 0;
    const nouvelles = m.get("NOUVEAU") ?? 0;
    const relues = ecartees + promues;
    return {
      ecartees,
      promues,
      nouvelles,
      tauxEcart: relues > 0 ? ecartees / relues : null,
    };
  } catch {
    return vide;
  }
}