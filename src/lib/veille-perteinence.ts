/**
 * Pertinence et brouillon de règle pour la veille DILA (auto-alimentation §H).
 *
 * Deux garanties structurantes, conformes au garde-fou « jamais inventer un
 * article » :
 *
 *  1. Le scoring ne fait que **compter des occurrences de termes métier** dans
 *     le texte réellement publié. Aucune décision de pertinence n'est prise.
 *  2. Le « brouillon de règle » est un **assemblage de citations littérales** :
 *     métadonnées de la source + passages verbatim. Le champ qui porte
 *     l'articulation juridique (ce que la décision impose) reste
 *     explicitement vide et à rédiger par le juriste. La machine ne rédige
 *     jamais de raisonnement juridique.
 *
 * Filtre strict (révision 2026-10-08, calibré sur les 18 publications
 * réellement écartées par le juriste) — une publication n'est retenue que si
 * **toutes** ces conditions sont réunies :
 *
 *  1. **Aucun terme hors-sujet** (`MOTS_CLES_EXCLUS`) : fiscal, urbanisme,
 *     étranger/asile, droit du travail, fonction publique, armes, agréments —
 *     présence = rejet net, quelle que soit la suite ;
 *  2. **Preuve de sujet** : au moins **2 termes core distincts**, ou **1 seul
 *     terme core de poids ≥ `POIDS_PREUVE_SUJET`** ;
 *  3. le score ≥ `SEUIL_PERTINENCE` ;
 *  4. au moins un passage citable verbatim.
 *
 * Fonctions pures, testées.
 */

import type { SourceDila } from "@/lib/veille-dila";

/**
 * Dictionnaire métier du produit (contestation d'amendes routières +
 * suspension de permis), en deux tiers.
 *
 * `MOTS_CLES_CORE` **qualifie** une publication : ce sont des marqueurs du
 * domaine. Une publication n'est retenue que si elle en contient au moins un.
 * C'est la séparation qui rend le filtre utilisable — la jurisprudence
 * administrative est truffée de vocabulaire générique (notification, mise en
 * demeure, prescription, tribunal administratif…) présent dans la quasi-totalité
 * des arrêtés, et qui écrasait le score des vrais sujets.
 *
 * `MOTS_CLES_AMBIGUS` regroupe les termes **ambigus** : ils ne qualifient
 * jamais seuls. « Éthylotest », « alcoolémie » et « radar » apparaissent aussi
 * bien dans le contentieux du travail (test d'alcoolémie après une faute
 * professionnelle) que dans le contentieux routier. Ils montent le score et
 * designate les bons passages, mais une publication n'est retenue que si un
 * terme non ambigu l'atteste également. Idem pour un texte qui dirait
 * simplement « ivresse au volant » sans citer le code de la route.
 *
 * `MOTS_CLES_APPUI` ne qualifie rien : il distingue, au sein des publications
 * déjà qualifiées, celles qui touchent la procédure de contestation.
 *
 * Les poids sont calibrés sur des archives réelles (CASS/JADE/JORF) — voir
 * `veille-perteinence.test.ts`, dont la rétro-calibration rejoue les 18
 * publications réelles écartées à la main par le juriste (2026-10).
 */
export const MOTS_CLES_CORE: ReadonlyArray<{ terme: string; poids: number }> = [
  { terme: "amende forfaitaire", poids: 8 },
  { terme: "code de la route", poids: 6 },
  { terme: "suspension du permis", poids: 8 },
  { terme: "permis de conduire", poids: 6 },
  { terme: "constatation d'infraction", poids: 6 },
  { terme: "agent verbalisateur", poids: 5 },
  { terme: "ivresse au volant", poids: 6 },
  { terme: "conduite sous l'emprise", poids: 6 },
  { terme: "infraction d'ivresse", poids: 6 },
  { terme: "alcool au volant", poids: 6 },
  { terme: "retrait de points", poids: 4 },
  { terme: "contrôle automatique", poids: 4 },
  { terme: "réglementation routière", poids: 4 },
  { terme: "code de la sécurité intérieure", poids: 3 },
  // Excès de vitesse : la famille, directement qualifiante.
  { terme: "excès de vitesse", poids: 8 },
  { terme: "limitation de vitesse", poids: 7 },
  { terme: "vitesse réglementaire", poids: 6 },
  // Stationnement (verbalisation, zone, gênant/interdit).
  { terme: "stationnement", poids: 8 },
  { terme: "stationner", poids: 6 },
  // Suspension / invalidation du permis (variantes au-delà de « suspension du permis »).
  { terme: "suspension de permis", poids: 8 },
  { terme: "invalidation du permis", poids: 8 },
  // Alcool : les formules réelles du contentieux (« en état d'ivresse » est la
  // rédaction usuelle de l'article R. 234-1). « conduite en état d'ivresse »
  // contient « état d'ivresse » : les deux peuvent cumuler sur un même passage,
  // sans effet sur la preuve de sujet (borne ≥ 6 déjà remplie par le premier).
  { terme: "conduite en état d'ivresse", poids: 6 },
  { terme: "état d'ivresse", poids: 5 },
  // Mesure administrative prise contre le conducteur.
  { terme: "interdiction de conduire", poids: 6 },
  // Procédure d'amende : l'avis de contravention qualifie à lui seul (jamais
  // rencontré hors sujet sur le corpus de calibration).
  { terme: "avis de contravention", poids: 6 },
];

export const MOTS_CLES_AMBIGUS: ReadonlyArray<{ terme: string; poids: number }> = [
  { terme: "éthylotest", poids: 5 },
  { terme: "éthylomètre", poids: 5 },
  { terme: "alcoolémie", poids: 5 },
  { terme: "radar", poids: 2 },
  { terme: "procès-verbal", poids: 2 },
  { terme: "parking", poids: 2 },
];

/**
 * Termes hors-sujet : leur **présence seule** rejette la publication, quel que
 * soit le score (`MOTS_CLES_EXCLUS`). Chaque entrée est sourcée sur le corpus
 * de calibration — les 18 publications écartées à la main par le juriste
 * (2026-10) contenaient toutes au moins un de ces marqueurs, sauf deux cas de
 * droit pénal/CE que la preuve de sujet rejette seule.
 *
 * Ils désignent des domaines **étrangers au produit** (amendes routières +
 * suspension de permis) dont le vocabulaire invahissait le score : ces familles
 * apparaissent aussi dans les décisions sur la fiscalité, l'urbanisme, le
 * séjour des étrangers, le droit du travail, la fonction publique, les armes
 * et les agréments — jamais dans un vrai contentieux routier à qualifier.
 * Biais assumé du filtre « strict » : mieux vaut rater une publication limite
 * que présenter au juriste du hors-sujet.
 */
export const MOTS_CLES_EXCLUS: ReadonlyArray<string> = [
  // Fiscalité (CAA Douai 25DA01297, CAA Versailles 26VE00475, CAA Lyon 26LY00237).
  "impôt",
  "fiscal",
  // Urbanisme (CAA Lyon 25LY01154 : stationnement + « code de la route » cités
  // incidemment dans une décision sur un permis d'aménager).
  "urbanisme",
  "permis de construire",
  "permis d'aménager",
  "lotissement",
  "plan local d'urbanisme",
  // Séjour des étrangers / asile (CAA Paris 26PA00484, CAA Nantes 25NT02243…).
  "asile",
  "réfugié",
  "titre de séjour",
  "nationalité",
  // Droit du travail / formation professionnelle (CAA Marseille 26MA00112,
  // 25MA01867, 25MA00066 — « code de la route » et « permis de conduire » ne
  // figurent que dans la liste des actions de formation subventionnées ;
  // CAA Marseille 25MA03161 — licenciement après perte du permis).
  "code du travail",
  "formation professionnelle",
  "actions de formation",
  "licenciement",
  "inspection du travail",
  "convention collective",
  // Fonction publique (CAA Marseille 26MA00402).
  "fonction publique",
  // Armes (CAA Lyon 25LY00276 : interdiction de détenir des armes — le mot
  // « armes » nu est exclu car il se retrouve dans « alarmes » ; composés only).
  "munitions",
  "permis de chasse",
  "armes à feu",
  "détention d'armes",
  // Agréments / contrôle technique (CAA Bordeaux 24BX01993 : suspension de
  // l'agrément d'un centre de contrôle technique).
  "agrément",
  "contrôle technique",
];


export const MOTS_CLES_APPUI: ReadonlyArray<{ terme: string; poids: number }> = [
  { terme: "contestation", poids: 3 },
  { terme: "délai de contestation", poids: 4 },
  { terme: "vice de procédure", poids: 3 },
  { terme: "prescription", poids: 2 },
  { terme: "commission de recours", poids: 2 },
  { terme: "notification", poids: 1 },
  { terme: "mise en demeure", poids: 1 },
  { terme: "majoration", poids: 1 },
  { terme: "tribunal administratif", poids: 1 },
  { terme: "recommandé", poids: 1 },
  { terme: "clémence", poids: 1 },
  { terme: "récusation", poids: 1 },
  { terme: "poursuite", poids: 1 },
  // Procédure contentieuse de l'amende (commande de payer / injonction de payer)
  // et contestation liée à la signalisation (balisage, travaux, panneaux).
  { terme: "injonction de payer", poids: 3 },
  { terme: "commande de payer", poids: 3 },
  { terme: "signalisation", poids: 1 },
  { terme: "signalement", poids: 1 },
];

export const SEUIL_PERTINENCE = 12;
/** Poids minimal d'un terme core pour qu'il suffise seul à prouver le sujet. */
export const POIDS_PREUVE_SUJET = 6;
export const MAX_CITATIONS = 5;
export const LONGUEUR_CITATION = 420;

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Normalise pour la recherche : minuscules, sans accents, apostrophes plates. */
export function normaliser(s: string): string {
  return sansAccents(s)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s ]+/g, " ");
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

export type Pertinence = {
  score: number;
  /** Termes qui qualifient le domaine (MOTS_CLES_CORE trouvés). */
  matchsCore: string[];
  /**
   * Termes contextuels trouvés : MOTS_CLES_APPUI (procédure de contestation) et
   * MOTS_CLES_AMBIGUS (« éthylotest », « radar »…). Les deux sont enregistrés
   * dans la même colonne : ni l'un ni l'autre ne qualifie seul une publication.
   */
  matchsAppui: string[];
  /** Tous les termes trouvés, core d'abord. */
  matchs: string[];
  /** Termes hors-sujet détectés (MOTS_CLES_EXCLUS) : leur présence rejette. */
  matchsExclus: string[];
  citations: string[];
};

/**
 * Découpe le contenu en phrases et renvoie, **verbatim**, celles qui portent
 * au moins un terme retenu. Aucun mot n'est ajouté, reformulé ou coupé au
 * milieu d'un mot.
 */
export function extraireCitations(
  contenu: string,
  termesRetenus: string[],
  max = MAX_CITATIONS,
): string[] {
  if (!contenu || termesRetenus.length === 0) return [];
  const normalises = termesRetenus.map(normaliser);

  const phrases = contenu
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40);

  const vues = new Set<string>();
  const out: string[] = [];
  for (const phrase of phrases) {
    const n = normaliser(phrase);
    if (!normalises.some((t) => n.includes(t))) continue;
    if (vues.has(phrase)) continue;
    vues.add(phrase);
    out.push(
      phrase.length > LONGUEUR_CITATION
        ? `${phrase.slice(0, LONGUEUR_CITATION).trimEnd()}…`
        : phrase,
    );
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Score de pertinence d'une publication : somme des poids des termes
 * effectivement trouvés (core en poids plein, appui et ambigus en demi-poids),
 * +2 par réoccurrence supplémentaire (plafonné à 3), le titre comptant double.
 */
export function scorerPertinence(source: SourceDila): Pertinence {
  const corps = normaliser(`${source.titre} ${source.titre} ${source.contenu}`);
  const matchsCore: string[] = [];
  const matchsAppui: string[] = [];
  const matchsExclus: string[] = [];
  let score = 0;

  const cumuler = (terme: string, poids: number, cible: string[], facteur: number) => {
    const n = occurrences(corps, normaliser(terme));
    if (n === 0) return;
    cible.push(terme);
    score += (poids + Math.min(n - 1, 3) * 2) * facteur;
  };

  for (const { terme, poids } of MOTS_CLES_CORE) cumuler(terme, poids, matchsCore, 1);
  for (const { terme, poids } of MOTS_CLES_APPUI) cumuler(terme, poids, matchsAppui, 0.5);
  for (const { terme, poids } of MOTS_CLES_AMBIGUS) cumuler(terme, poids, matchsAppui, 0.5);

  // Les marqueurs hors-sujet ne participent jamais au score : ils rejettent.
  for (const terme of MOTS_CLES_EXCLUS) {
    if (occurrences(corps, normaliser(terme)) > 0) matchsExclus.push(terme);
  }

  const matchs = [...matchsCore, ...matchsAppui];
  return {
    score,
    matchsCore,
    matchsAppui,
    matchs,
    matchsExclus,
    citations: extraireCitations(source.contenu, matchs),
  };
}

const POIDS_CORE = new Map(MOTS_CLES_CORE.map((m) => [m.terme, m.poids]));

/**
 * Une publication n'est retenue que si elle passe les **quatre** verrous du
 * filtre strict : aucun terme hors-sujet, preuve de sujet (au moins deux
 * termes core distincts, ou un seul d'au moins `POIDS_PREUVE_SUJET`), score au
 * seuil, et un passage citable. Le test de preuve de sujet est ce qui élimine
 * le bruit : « code de la sécurité intérieure » seul (poids 3) ne qualifie
 * jamais, même répété, même accompagné de termes d'appui.
 */
export function estPertinente(p: Pertinence): boolean {
  if (p.matchsExclus.length > 0) return false;
  const sujetProuve =
    p.matchsCore.length >= 2 ||
    p.matchsCore.some((t) => (POIDS_CORE.get(t) ?? 0) >= POIDS_PREUVE_SUJET);
  return sujetProuve && p.score >= SEUIL_PERTINENCE && p.citations.length > 0;
}

function dateLisible(iso: string | null): string {
  if (!iso) return "date inconnue";
  const [a, m, j] = iso.split("-");
  return a && m && j ? `${j}/${m}/${a}` : iso;
}

/**
 * Brouillon de règle ASSEMBLÉ, jamais rédigé : métadonnées sourcées,
 * citations littérales, et un champ d'articulation vide balisé pour le
 * juriste. Ce texte est une **proposition** : il ne devient utilisable par
 * le moteur qu'après validation admin d'une `FailleJuridique` complète.
 */
export function redigerBrouillonRegle(source: SourceDila, p: Pertinence): string {
  const ref = [source.juridiction, source.titre].filter(Boolean).join(" — ");
  const lignes: string[] = [
    "## Brouillon automatique — à reprendre par le juriste",
    "",
    `**Source** : ${ref || source.id}`,
    `**Référence** : ${[source.ecli, source.reference, dateLisible(source.dateDecision)]
      .filter(Boolean)
      .join(" — ")}`,
  ];
  if (source.url) lignes.push(`**Lien source** : ${source.url}`);
  lignes.push(
    `**Termes retenus** : ${p.matchs.join(", ")} (score ${p.score})`,
    "",
    "**Passages retenus (citation littérale, non réécrit)**",
  );
  for (const c of p.citations) lignes.push(`> ${c}`);
  lignes.push(
    "",
    "**Règle dégagée — À RÉDIGER**",
    "[À compléter : articuler ici, à partir des passages ci-dessus, ce que la",
    "décision ou le texte impose. Ce champ est volontairement vide — la machine",
    "ne qualifie pas le texte, elle ne fait que le citer.]",
  );
  return lignes.join("\n");
}

/** Résumé d'une ligne pour les tableaux d'UI et le digest e-mail. */
export function resumeSource(source: SourceDila, p: Pertinence): string {
  const base = `${source.titre} (${dateLisible(source.dateDecision)})`;
  return p.citations.length ? `${base} — ${p.citations[0]}` : base;
}
