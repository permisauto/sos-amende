import "server-only";
import { prisma } from "./prisma";
import type { HistoriqueFaille } from "./failles-classement";

/**
 * Historique de résultat par faille (Lot 2.5) — calcul À LA VOLÉE, sans migration.
 *
 * On lit les dossiers tranchés (décision OMP renseignée : `ACCEPTE` = gagné,
 * `REJETE` = perdu) et on attribue le résultat aux failles **retenues par le
 * juriste** (statut `CONFIRMEE`) ; à défaut, à la faille principale du
 * dossier (celle qui a porté la lettre). Aucune donnée n'est inventée : un
 * dossier sans décision ne compte pas, et un dossier n'est jamais compté deux
 * fois (la faille principale n'est imputée que si AUCUNE faille n'a été
 * confirmée).
 *
 * Agrégation faite en base (`groupBy`) : le résultat est exact, sans troncature
 * arbitraire ni chargement de tous les dossiers en mémoire. Best-effort
 * (retourne `[]` en cas d'erreur DB — la page reste utilisable).
 */
export async function chargerHistoriqueFailles(): Promise<HistoriqueFaille[]> {
  try {
    const parId = new Map<string, HistoriqueFaille>();
    const touch = (failleId: string): HistoriqueFaille => {
      const existant = parId.get(failleId);
      if (existant) return existant;
      const cree: HistoriqueFaille = { failleId, gagnes: 0, perdus: 0 };
      parId.set(failleId, cree);
      return cree;
    };

    // 1. Failles retenues par le juriste : comptage exact en base.
    const [gagnes, perdus] = await Promise.all([
      prisma.dossierFaille.groupBy({
        by: ["failleId"],
        where: { statut: "CONFIRMEE", dossier: { decisionOmp: "ACCEPTE" } },
        _count: { _all: true },
      }),
      prisma.dossierFaille.groupBy({
        by: ["failleId"],
        where: { statut: "CONFIRMEE", dossier: { decisionOmp: "REJETE" } },
        _count: { _all: true },
      }),
    ]);
    for (const g of gagnes) {
      touch(g.failleId).gagnes += g._count._all;
    }
    for (const p of perdus) {
      touch(p.failleId).perdus += p._count._all;
    }

    // 2. Dossiers tranchés SANS aucune faille confirmée : le résultat revient
    //    à la faille principale (celle qui a porté la lettre). Projection
    //    minimale (2 scalaires), best-effort.
    const sansConfirmee = await prisma.dossier.findMany({
      where: {
        decisionOmp: { in: ["ACCEPTE", "REJETE"] },
        failleJuridiqueId: { not: null },
        faillesRetenues: { none: { statut: "CONFIRMEE" } },
      },
      select: { decisionOmp: true, failleJuridiqueId: true },
    });
    for (const d of sansConfirmee) {
      if (!d.failleJuridiqueId) continue;
      const h = touch(d.failleJuridiqueId);
      if (d.decisionOmp === "ACCEPTE") h.gagnes += 1;
      else h.perdus += 1;
    }

    return [...parId.values()];
  } catch {
    return [];
  }
}
