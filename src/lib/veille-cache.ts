import type { HistoriqueFaille } from "./failles-classement";

/**
 * Cache TTL des agrégats lourds de la page veille (articles couverts par les
 * failles actives + historique de réussite par article). Recalculés à chaque
 * rendu (filtre/pagination), ces lectures touchent `FailleJuridique` et, pour
 * l'historique, `DossierFaille`/`Dossier`. Le cache borne le coût à un
 * recalcul toutes les 5 min ; il est invalidé dès qu'une activation/écart/
 * modification change la donne (`invaliderCacheVeille`).
 *
 * Module **pur et sans dépendance lourde** (seul le type `HistoriqueFaille`)
 * : il est importé à la fois par `veille-ingestion` (lecture) et par les
 * actions d'écriture (`failles.ts`, `admin/actions.ts`, veille) — sans créer
 * de cycle d'import.
 */

export type CacheVeilleHistorique = ReadonlyMap<string, HistoriqueFaille>;

const TTL_MS = 5 * 60 * 1000;

let articles: { data: Set<string>; expiresAt: number } | null = null;
let historique: { data: CacheVeilleHistorique; expiresAt: number } | null = null;

export function lireCacheArticlesVeille(): Set<string> | null {
  if (articles && Date.now() < articles.expiresAt) return articles.data;
  return null;
}

export function ecrireCacheArticlesVeille(data: Set<string>): void {
  articles = { data, expiresAt: Date.now() + TTL_MS };
}

export function lireCacheHistoriqueVeille(): CacheVeilleHistorique | null {
  if (historique && Date.now() < historique.expiresAt) return historique.data;
  return null;
}

export function ecrireCacheHistoriqueVeille(data: CacheVeilleHistorique): void {
  historique = { data, expiresAt: Date.now() + TTL_MS };
}

export function invaliderCacheVeille(): void {
  articles = null;
  historique = null;
}
