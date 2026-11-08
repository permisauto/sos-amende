import type { HistoriqueFaille } from "@/lib/failles-classement";
import { extraireArticles, type SourcePreparable } from "@/lib/veille-prefiltre";

/**
 * Boucle de retour « décision OMP → efficacité » de la veille (Pilier 4).
 *
 * Principe : une faille dont le taux de réussite est élevé (dossiers gagnés /
 * tranchés) repose sur un fondement qui marche en pratique. Une publication de
 * veille qui cite le même article mérite donc d'être lue en priorité — c'est la
 * matière la plus susceptible de produire une faille efficace.
 *
 * Module **pur** : aucune lecture base (l'historique est fourni en paramètre),
 * aucun jugement juridique. Le bonus est **borné** pour ne jamais écraser le
 * pré-filtre déterministe ni le signal d'analyse IA.
 */

/** Plafond du bonus de résultat appliqué à la priorité de veille. */
export const BONUS_RESULTAT_VEILLE_MAX = 10;

export type HistoriqueParArticle = ReadonlyMap<string, HistoriqueFaille>;

/**
 * Agrège un historique de failles en une map par **article normalisé** : pour
 * chaque faille, on associe son taux de réussite aux articles qu'elle cite.
 * Deux failles citant le même article cumulent leurs résultats (poids cumulé).
 */
export function historiqueParArticle(
  historique: HistoriqueFaille[],
  failles: Array<{ failleId: string; articleLoi: string | null }>,
): HistoriqueParArticle {
  const parId = new Map(historique.map((h) => [h.failleId, h]));
  const acc = new Map<string, { gagnes: number; perdus: number }>();
  for (const f of failles) {
    const h = parId.get(f.failleId);
    if (!h) continue;
    for (const article of extraireArticles(f.articleLoi ?? "")) {
      const cur = acc.get(article) ?? { gagnes: 0, perdus: 0 };
      cur.gagnes += h.gagnes;
      cur.perdus += h.perdus;
      acc.set(article, cur);
    }
  }
  return new Map(
    [...acc.entries()].map(([article, v]) => [
      article,
      { failleId: article, gagnes: v.gagnes, perdus: v.perdus },
    ]),
  );
}

/**
 * Bonus de résultat appliqué à une publication de veille : on regarde les
 * articles qu'elle cite, et on prend le **meilleur** taux de réussite observé
 * parmi eux (une publication qui cite un gagnant avéré est priorisée). Borne
 * à `BONUS_RESULTAT_VEILLE_MAX`, et neutre sous 3 dossiers tranchés (même
 * exigence d'échantillon que `bonusHistorique`, dans `failles-classement`).
 */
export function bonusResultatVeille(
  source: SourcePreparable,
  historique: HistoriqueParArticle,
): number {
  if (historique.size === 0) return 0;
  const articles = extraireArticles(
    `${source.titre ?? ""} ${source.contenu ?? ""}`,
  );
  if (articles.length === 0) return 0;

  let meilleur = 0;
  for (const article of articles) {
    const h = historique.get(article);
    if (!h) continue;
    const total = h.gagnes + h.perdus;
    if (total < 3) continue; // échantillon trop faible : neutre
    const taux = h.gagnes / total;
    const bonus = Math.round(taux * BONUS_RESULTAT_VEILLE_MAX);
    if (bonus > meilleur) meilleur = bonus;
  }
  return Math.min(BONUS_RESULTAT_VEILLE_MAX, meilleur);
}