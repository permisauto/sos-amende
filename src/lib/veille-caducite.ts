import { extraireArticles } from "@/lib/veille-prefiltre";

/**
 * Veille de caducité : une faille ACTIVE qui cite un article peut devenir
 * obsolète si un texte ingéré postérieurement l'abroge ou le modifie. Ce module
 * **pur** (aucun accès base, aucune qualification juridique) ne fait que
 * **signaler** ce croisement : la décision d'écarter reste humaine.
 */

/** Marqueurs textuels d'abrogation/modification d'un article (tolérants aux
 * accents par normalisation préalable dans `detecterCaducite`). */
const MARQUEURS_CADUCITE = /abrog|modifi|remplac|reforme|supprime/;

export type AlerteCaducite = {
  /** Référence normalisée de l'article concerné (« L224-2 »). */
  article: string;
  /** Titre ou identifiant de la publication qui abroge/modifie. */
  provenance: string;
  /** Passage court du texte contenant le marqueur, pour la lecture humaine. */
  extrait: string;
};

/**
 * Liste des références d'articles citées par une chaîne `articleLoi` (forme
 * libre « Article L. 234-1 du code de la route ; R. 47-1 »), normalisées.
 * S'appuie sur `extraireArticles` (pré-filtre) — jamais d'article inventé.
 */
export function articlesCitesFaille(articleLoi: string | null | undefined): string[] {
  if (!articleLoi) return [];
  return extraireArticles(articleLoi);
}

/**
 * Détecte, dans un texte nouvellement ingéré, les marqueurs d'abrogation ou de
 * modification touchant **les articles cités** d'une faille active. Retourne la
 * liste des articles concernés (vides si aucun) — sans jamais conclure que la
 * faille est obsolète : c'est un signal pour le juriste.
 */
export function detecterCaducite(
  texte: string,
  articlesSurveilles: ReadonlySet<string>,
): string[] {
  if (!texte || articlesSurveilles.size === 0) return [];
  // Normalisation (minuscules, sans accents) pour un matche robuste des
  // marqueurs d'abrogation. On travaille sur le texte entier : découper en
  // phrases casserait mal les « L. 224-2 » (le point de la lettre d'article).
  const norm = texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!MARQUEURS_CADUCITE.test(norm)) return [];
  // Le texte parle d'abrogation/modification : on signale les articles
  // surveillés qui y sont cités (jamais de conclusion sur l'obsolescence).
  const cites = extraireArticles(texte);
  const concerne: string[] = [];
  for (const a of cites) {
    if (articlesSurveilles.has(a) && !concerne.includes(a)) concerne.push(a);
  }
  return concerne;
}

/**
 * Extrait un court passage (max `longueur` car.) contenant le marqueur de
 * caducité autour d'un article, pour l'afficher au juriste. Verbatim, jamais
 * réécrit.
 */
export function extraitCaducite(
  texte: string,
  article: string,
  longueur = 200,
): string {
  const idx = texte.indexOf(article);
  if (idx === -1) return texte.slice(0, longueur);
  const debut = Math.max(0, idx - 40);
  return texte
    .slice(debut, debut + longueur)
    .replace(/\s+/g, " ")
    .trim();
}