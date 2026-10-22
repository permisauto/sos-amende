/**
 * Pré-filtre déterministe de la veille juridique (Lot 1 — option C).
 *
 * La file « À lire » compte plusieurs centaines de publications et l'extraction
 * par IA dispose d'un **budget quotidien strict** (`GEMINI_QUOTA_JOUR`, 20
 * appels/jour, dont une part réservée à l'extraction). Extraire « les mieux
 * scoré » revient à dépenser ce budget sur les publications les plus bavardes,
 * pas sur les plus exploitables : le score de pertinence compte des mots-clés,
 * or les publications **écartées** à la main (hors sujet : fiscalité,
 * urbanisme, droit du travail…) scorment *mieux* que la file « À lire »
 * (39 de moyenne contre 17 en production).
 *
 * Ce module range donc les publications sur des **signaux mécaniques**,
 * calculables sans IA, sans réseau et sans jugement juridique :
 *
 *  1. le nombre de **termes du domaine** réellement présents ;
 *  2. la citation d'un **article de code** verbatim (« L. 234-1 ») — condition
 *     de l'extraction, qui n'accepte un article que s'il figure dans le texte ;
 *  3. le **doublon** : l'article cité est déjà couvert par une faille ACTIVE ;
 *  4. la présence d'un **dispositif** (« ORDONNE », « DÉCIDE ») extractible
 *     localement ;
 *  5. les **familles** du produit citées (vitesse, alcool, stationnement,
 *     permis) ;
 *  6. la **fraîcheur** de la décision ;
 *  7. les **échecs** d'extraction déjà subis (rotation du budget : une source
 *     qui échoue ne doit pas consommer seule le budget du jour).
 *
 * Aucun de ces signaux ne dit ce que la jurisprudence décide : ils disent
 * seulement **quelle publication mérite d'être lue en premier**, par l'IA ou
 * par l'humain. La qualification juridique reste à l'admin, et
 * `verifiee = true` n'est jamais posé ici.
 *
 * Module **pur** : aucune base, aucun réseau, aucun effet de bord.
 */

import { normaliser } from "@/lib/veille-perteinence";
import { extraireDispositif } from "@/lib/veille-texte";

/**
 * Familles du produit, repérées par leurs marqueurs textuels. Volontairement
 * restreint aux quatre familles *proprement* métier : la « procédure »
 * (notification, prescription, recours) traverse tout le contentieux
 * administratif et ne distinguerait rien.
 */
export const FAMILLES_PRODUIT: ReadonlyArray<{
  cle: string;
  libelle: string;
  termes: string[];
}> = [
  {
    cle: "vitesse",
    libelle: "vitesse",
    termes: [
      "excès de vitesse",
      "limitation de vitesse",
      "vitesse réglementaire",
      "vitesse mesurée",
      "contrôle automatique",
      "radar",
    ],
  },
  {
    cle: "alcool",
    libelle: "alcool",
    termes: ["alcool", "alcoolémie", "éthylotest", "éthylomètre", "ivresse"],
  },
  {
    cle: "stationnement",
    libelle: "stationnement",
    termes: [
      "stationnement",
      "stationner",
      "gênant",
      "défaut de stationnement",
      "zone à stationner",
    ],
  },
  {
    cle: "permis",
    libelle: "permis",
    termes: [
      "permis",
      "retrait de points",
      "retrait des points",
      "points de retrait",
      "points retirés",
      "invalidation",
      "48 si",
      "48si",
    ],
  },
];

/** Durée (jours) au-delà de laquelle une décision n'est plus « récente ». */
export const FRAICHEUR_JOURS = 180;

/**
 * Références d'articles de code : « L. 234-1 », « R224-3 », « article R. 121-3 ».
 * La lettre de la référence est **sensible à la casse** (majuscule) : le code
 * s'écrit « L. », « R. », « C. », « D. » — un « l 3 » de prose ne matche pas.
 */
const RE_ARTICLE = /\b([LRCD](?:\.\s?|\s)?\d{1,4}(?:-\d{1,4})?)\b/g;

/**
 * Références **sans lettre de code** : « art. 529 du Code de procédure
 * pénale », « article 530-1 ». Le préfixe « art. » est exigé (sinon tout
 * numéro du texte deviendrait un article). Normalisées avec le préfixe « A »
 * pour ne jamais entrer en collision avec « L. 530 ».
 */
const RE_ARTICLE_SANS_CODE = /\bart(?:icle)?\.?\s*(\d{1,4}(?:-\d{1,4})?)\b/gi;

/** Publication telle que consommée par le pré-filtre. */
export type SourcePreparable = {
  id: string;
  titre: string;
  contenu: string;
  score: number;
  /** Termes du domaine retenus à l'ingestion (`matchsCore`). */
  matchsCore?: string[] | null;
  /** Date de la décision (ISO). */
  dateSource?: string | null;
  /** État de la proposition existante : `extrait`/`incomplet`/`echec`. */
  etatProposition?: string | null;
  /** Nombre de passages automatiques déjà subis. */
  tentatives?: number | null;
};

export type PrioritePrefiltre = {
  /** Score de triage (peut être négatif). */
  score: number;
  /** Termes du domaine distincts trouvés. */
  coreDistincts: number;
  /** Familles du produit citées. */
  familles: string[];
  /** Première référence d'article citée (normalisée : « L234-1 »). */
  article: string | null;
  /** L'article cité est déjà couvert par une faille ACTIVE (doublon probable). */
  dejaCouvert: boolean;
  /** Un dispositif (« ORDONNE »…) est extractible localement. */
  dispositif: boolean;
  /** Échecs d'extraction déjà subis. */
  echecs: number;
  /** Explication lisible (jamais une conclusion juridique). */
  explication: string;
};

/**
 * Normalise une référence d'article pour comparaison : « L. 234-1 » →
 * « L234-1 ». Le mot « article » en tête est retiré (« Article R. 121-3 » →
 * « R121-3 ») : les champs `articleLoi` des failles s'écrivent souvent
 * « Article L. 234-1 du code de la route ».
 */
export function normaliserArticle(article: string): string {
  return article
    .toUpperCase()
    .replace(/^ARTICLES?\s*/, "")
    .replace(/[^A-Z0-9-]/g, "");
}

/** Références d'articles citées dans un texte, normalisées et sans doublon. */
export function extraireArticles(texte: string): string[] {
  if (!texte) return [];
  const out = new Set<string>();
  for (const m of texte.matchAll(RE_ARTICLE)) {
    const norm = normaliserArticle(m[1]);
    if (norm) out.add(norm);
  }
  for (const m of texte.matchAll(RE_ARTICLE_SANS_CODE)) {
    const norm = `A${m[1]}`;
    if (norm) out.add(norm);
  }
  return [...out];
}

/** Familles du produit citées dans un texte. */
export function famillesCitees(texte: string): string[] {
  const norm = normaliser(texte);
  if (!norm) return [];
  return FAMILLES_PRODUIT.filter((f) =>
    f.termes.some((t) => norm.includes(normaliser(t))),
  ).map((f) => f.libelle);
}

function estRecent(dateSource: string | null | undefined, maintenant: Date): boolean {
  if (!dateSource) return false;
  const d = new Date(dateSource);
  if (Number.isNaN(d.getTime())) return false;
  const diff = maintenant.getTime() - d.getTime();
  return diff >= 0 && diff <= FRAICHEUR_JOURS * 86_400_000;
}

/**
 * Priorité déterministe d'une publication.
 *
 * @param articlesCouverts références déjà couvertes par une faille ACTIVE
 *        (normalisées) — sert à détecter les doublons.
 */
export function prioritePrefiltre(
  source: SourcePreparable,
  articlesCouverts: ReadonlySet<string> = new Set<string>(),
  maintenant: Date = new Date(),
): PrioritePrefiltre {
  const texte = `${source.titre ?? ""} ${source.contenu ?? ""}`;
  const coreDistincts = new Set(
    (source.matchsCore ?? []).map((t) => normaliser(t)).filter(Boolean),
  ).size;
  const familles = famillesCitees(texte);
  const articles = extraireArticles(texte);
  const nouveaux = articles.filter((a) => !articlesCouverts.has(a));
  const dejaCouvert = articles.length > 0 && nouveaux.length === 0;
  const dispositif = extraireDispositif(source.contenu ?? "") !== null;
  const echecs =
    source.etatProposition === "echec" ? Math.max(1, source.tentatives ?? 1) : 0;
  const recent = estRecent(source.dateSource, maintenant);

  let score = 0;
  const parts: string[] = [];

  if (coreDistincts > 0) {
    score += Math.min(coreDistincts, 4) * 3;
    parts.push(
      `${coreDistincts} terme${coreDistincts > 1 ? "s" : ""} du domaine`,
    );
  }
  if (articles.length > 0) {
    score += 6;
    parts.push(`cite ${articles[0]}`);
  }
  if (dejaCouvert) {
    score -= 8;
    parts.push("article déjà couvert (doublon probable)");
  } else if (nouveaux.length > 1) {
    score += Math.min(nouveaux.length - 1, 2) * 2;
  }
  if (dispositif) {
    score += 4;
    parts.push("dispositif extractible");
  }
  if (familles.length > 0) {
    score += Math.min(familles.length, 3) * 2;
    parts.push(`familles : ${familles.join(", ")}`);
  }
  if (recent) {
    score += 2;
    parts.push("décision récente");
  }
  if (echecs > 0) {
    score -= Math.min(echecs, 3) * 4;
    parts.push(`${echecs} échec${echecs > 1 ? "s" : ""} d'extraction`);
  }

  return {
    score,
    coreDistincts,
    familles,
    article: articles[0] ?? null,
    dejaCouvert,
    dispositif,
    echecs,
    explication: parts.length > 0 ? parts.join(" · ") : "aucun signal",
  };
}

export type SourcePriorisee = {
  source: SourcePreparable;
  priorite: PrioritePrefiltre;
};

/**
 * Classe les publications par priorité décroissante. L'ordre est **déterministe**
 * : priorité, puis score de pertinence, puis identifiant — deux exécutions
 * sur la même file donnent le même ordre.
 */
export function classerParPriorite(
  sources: readonly SourcePreparable[],
  articlesCouverts: ReadonlySet<string> = new Set<string>(),
  maintenant: Date = new Date(),
): SourcePriorisee[] {
  return sources
    .map((source) => ({
      source,
      priorite: prioritePrefiltre(source, articlesCouverts, maintenant),
    }))
    .sort(
      (a, b) =>
        b.priorite.score - a.priorite.score ||
        b.source.score - a.source.score ||
        a.source.id.localeCompare(b.source.id),
    );
}

/** Résumé court pour l'interface (« Priorité 18 · cite L234-1 »). */
export function resumePriorite(p: PrioritePrefiltre): string {
  return `Priorité ${p.score} · ${p.explication}`;
}
