import { z } from "zod";
import { appelerGeminiJson } from "@/lib/ia-gemini";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";
import {
  normaliserQuestionsDynamiques,
  type QuestionDynamique,
} from "@/lib/questions";

/**
 * Extraction de propositions structurées sur les publications de la veille
 * (lot L) : **articles retenus par la juridiction + règle dégagée**, bornés
 * aux verbatims du texte publié.
 *
 * Garde-fous anti-hallucination (même discipline que `parserReponseIa`) :
 *
 *  1. chaque article doit figurer **textuellement** dans le contenu de la
 *     publication → sinon il est retiré de la proposition ;
 *  2. chaque extrait qui fonde la règle doit être une citation présente dans
 *     le contenu (les citations tronquées « … » de la veille sont acceptées
 *     une fois leur suffixe retiré) ;
 *  3. sans au moins un article valide, une règle, une condition et un
 *     extrait, la proposition est `incomplet` : elle reste affichée pour
 *     lecture mais le bouton « Valider » est désactivé côté UI.
 *
 * Le module est **pur** (zod + appel réseau) : aucune écriture base — le
 * stockage (`SourceJuridique.proposition`) appartient à `veille-ingestion`.
 */

export type EtatProposition = "extrait" | "incomplet" | "echec";

export type PropositionVeille = {
  etat: EtatProposition;
  titre: string;
  typeInfraction: "AMENDE" | "SUSPENSION";
  /** Articles retenus par la juridiction, recopiés tels que cités (max 3). */
  articles: string[];
  /** Règle dégagée : ce que la décision/texte retient (reformulation). */
  regle: string;
  /** Conditions d'application (2 à 5) : ancrées en verbatim du document. */
  conditions: string[];
  resume: string;
  /** Citations verbatim du texte qui fondent la règle (max 3). */
  extraits: string[];
  /**
   * Paragraphe VERBATIM (20 à 600 car.) où la juridiction énonce le motif
   * décisif de sa décision (l'attendu/considérant de censure). Enrichissement
   * **optionnel** : jamais exigé pour l'état `extrait` (beaucoup de textes
   * JORF n'ont pas d'attendu structuré).
   */
  motifDecisif?: string;
  /**
   * Appréciation d'obsolescence (réforme postérieure au texte) — phrase de
   * mise en garde de l'IA. Affichée en **badge** uniquement : jamais de
   * changement de statut, la décision d'écarter revient à l'humain
   * (arbitrage 2026-10-10).
   */
  obsolescence?: string;
  /**
   * Template de lettre pré-rédigé par l'extraction (lot 3) : soumis au lint
   * `assainirTemplate` (whitelist de variables + articles ⊆ `articles[]`).
   * La faille créée en `PROPOSEE` le reçoit — **le moteur reste aveugle**,
   * seul le clic admin `PROPOSEE → ACTIVE` le rend utilisable.
   */
  templateLettre?: string;
  /**
   * Moyen de référé (paragraphe L. 521-2 CJA) — seulement pour les
   * suspensions, même lint. `undefined` sur les amendes.
   */
  templateRefere?: string;
  /** Pourquoi incomplet/échec — affiché à l'admin. */
  motif?: string;
  /**
   * D'où vient la proposition : `ia` (Gemini ou simulation de dev/E2E) ou
   * `locale` (extraction déterministe de secours, sans appel réseau — utilisée
   * quand l'IA est coupée, sans clé, ou en échec 429/503). Absent = `ia`
   * (propositions stockées avant cette distinction).
   */
  methode?: "ia" | "locale";
  /**
   * Veille 2.0 — issue de l'analyse prédiction : la décision est-elle
   * favorable aux automobilistes (gagnante) ou les rejette-t-elle (perdante) ?
   * **L'IA n'écartera jamais seule** (invariant D1 2026-10-12) : l'état
   * `extrait` peut porter un statut PERDANT, affiché en badge rouge — le clic
   * admin reste la seule voie d'écarter.
   */
  statutAnalyse?:
    | "SUCCES_AUTOMOBILISTE_GAGNANT"
    | "REJETE_AUTOMOBILISTE_PERDANT";
  /**
   * Métadonnées d'analyse (juridiction, ECLI, date, validité 2026) — pure
   * transparence pour l'admin, jamais un changement de statut.
   */
  analyse?: {
    juridiction: string;
    ecli: string;
    dateDecision: string;
    /** L'extraction signale une réforme postérieure (pas de censure seule). */
    valide2026: boolean;
    fondement: string;
  };
  /**
   * Motifs décisifs typés (considérant / attendu) — verbatim, max 3, chaque
   * citation passant le garde-fou `contenuVerbatim`.
   */
  motifsCles?: { type: "CONSIDERANT" | "ATTENDU"; verbatim: string; vice: string }[];
  /**
   * 3ᵉ parcours (veille 2.0) — recours gracieux / demandes gracieuses
   * (LRAR, préfet ou ministre) : même lint que `templateLettre`.
   * `undefined` sur les amendes (le parcours gracieux n'y est pas produit).
   */
  templateGracieux?: string;
  /**
   * Questions dynamiques pré-rédigées par l'extraction (capteurs de fait +
   * checklists de preuves) — bornées par `normaliserQuestionsDynamiques` (6
   * max). La faille ACTIVE les expose au questionnaire client ; le moteur ne
   * les lit que via les règles `reponseVrai`/`reponseFausse`/`reponseTexte`
   * mappées depuis `reglesDetectionPourQuestions`.
   */
  questionsDynamiques?: QuestionDynamique[];
  /**
   * Version du schéma de l'analyse. `2` = format Veille 2.0 (statutAnalyse,
   * analyse, motifsCles, questionsDynamiques, templateGracieux). Absent =
   * analyse héritée (avant la Veille 2.0) — c'est ce qui distingue, sans
   * migration de schéma, une analyse à régénérer d'une déjà régénérée.
   */
  schemaVeille?: 2;
  /** Date ISO de l'extraction. */
  extraitLe: string;
  /** (Ré)extractions automatiques déjà tentées sur cette proposition. */
  tentatives?: number;
  /**
   * Reprises de la **régénération** (`regenererAnalysesAnciennes`) sur une
   * proposition déjà au format v2. Compteur distinct de `tentatives` : celui-ci
   * est hérité des passages automatiques antérieurs et ne dit rien de la
   * régénération. `incomplet` n'est repris qu'une seule fois (même arbitrage
   * que `estCandidatExtraction`) — au-delà, l'admin corrige à la main.
   */
  regenTentatives?: number;
  /** Date ISO de la dernière correction manuelle (admin). */
  corrigeLe?: string;
};

export type PublicationVeille = {
  titre: string;
  juridiction: string | null;
  dateSource: string | null;
  ecli: string | null;
  url: string | null;
  source: string;
  contenu: string;
  citations: string[];
};

/** Score minimal pour l'extraction automatique (même seuil de pertinence). */
export const SCORE_SEUIL_EXTRACTION = 12;
/**
 * Nombre max de publications extraites par passage automatique. Le cron
 * rejoue les candidats restants à chaque passage : le lot du jour finit par
 * se vider tout seul (pic TA mensuel compris), la boîte de temps reste le
 * garde-fou réel.
 */
export const BUDGET_EXTRACTION = 40;
/** Boîte de temps de l'extraction automatique (le cron veille est à 300 s). */
export const BUDGET_TEMPS_EXTRACTION_MS = 150_000;

// ---------------------------------------------------------------------------
// Normalisation / containment
// ---------------------------------------------------------------------------

/** Casse, accents et espaces ramenés à l'identique des deux côtés. */
export function normaliserPourComparaison(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Le passage est-il **littéralement** dans le texte publié ? */
export function contenuVerbatim(texte: string, passage: string): boolean {
  const p = passage
    .replace(/…/g, "")
    .trim();
  if (p.length < 15) return false;
  return normaliserPourComparaison(texte).includes(
    normaliserPourComparaison(p),
  );
}

// ---------------------------------------------------------------------------
// Lint des templates (lot 3) — whitelist de variables + articles bornés
// ---------------------------------------------------------------------------

/** Variables que `remplirTemplate` sait remplir dans une lettre. */
export const VARIABLES_LETTRE = [
  "nom",
  "plaque",
  "num_pv",
  "date",
  "montant",
  "radarId",
  "lieu",
] as const;

/** Variables supplémentaires du moyen de référé (pack Télérecours). */
export const VARIABLES_REFERE = [
  ...VARIABLES_LETTRE,
  "metier",
  "entreprise",
  "siret",
  "risque_licenciement",
] as const;

/** Toute référence d'article « L. 121-1 », « R. 47-1 », « D. 231-2 »… */
const RE_MENTION_ARTICLE = /\b([LRDC]\.?\s*\d{1,3}(?:-\d{1,3})+)\b/gi;

/** Forme comparable d'une référence : « Art. L. 121-1 » → « artl1211 ». */
function normaliserMentionArticle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Contrôle un template proposé par l'extraction : **soit il passe, soit il
 * est rejeté** (`undefined`) — jamais retouché (aucune réécriture cachée).
 *
 *  1. longueur 100 à 6 000 caractères ;
 *  2. chaque variable `{…}` appartient à la whitelist (le reste serait de
 *     toute façon effacé par `nettoyerLettre` à la génération) ;
 *  3. chaque référence d'article du texte appartient à `articles[]` (déjà
 *     verbatim sur la publication) — le référé cite en plus L. 521-2 CJA
 *     (seule référence légalement requise hors décision).
 *
 * Échec → le champ est laissé vide : le noyau de la proposition (articles,
 * règle, conditions) reste validable et la faille gardera son chip « Template
 * à rédager ». L'état `extrait`/`incomplet` **n'est jamais modifié** ici.
 */
export function assainirTemplate(
  brut: string,
  articles: string[],
  options: { refere?: boolean } = {},
): string | undefined {
  const t = brut.trim();
  if (t.length < 100 || t.length > 6000) return undefined;

  const variables = (
    options.refere ? VARIABLES_REFERE : VARIABLES_LETTRE
  ) as readonly string[];
  for (const m of t.matchAll(/\{(\w+)\}/g)) {
    if (!variables.includes(m[1])) return undefined;
  }

  const refs = articles.map((a) => normaliserMentionArticle(a));
  for (const m of t.matchAll(RE_MENTION_ARTICLE)) {
    const ref = normaliserMentionArticle(m[1]);
    const connu =
      refs.some((a) => a.includes(ref)) ||
      (options.refere === true && ref === "l5212");
    if (!connu) return undefined;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Verbatim des articles
// ---------------------------------------------------------------------------

/**
 * L'article est-il **cité dans la publication** ? Contrairement à
 * `contenuVerbatim`, la comparaison porte sur la **référence légale**
 * (`RE_MENTION_ARTICLE` → « artl1211 ») et non sur la chaîne complète :
 *
 *  * un article nu (« L. 223-3 » = 8 car.) était rejeté par le plancher de
 *    15 caractères de `contenuVerbatim` — plancher qui, ailleurs, est déjà
 *    assuré par le minimum du champ appelant (conditions ≥ 15, motifs ≥ 20) ;
 *  * la forme libre du modèle (« C. route, art. L. 223-3 ») n'est presque
 *    jamais contiguë au texte publié.
 *
 * L'anti-invention est préservée : la référence doit être littéralement
 * citée dans le document, sinon `false`. Une citation qui n'est aucune
 * référence d'article (`L. 121` sans groupe `-n`) est rejetée.
 */
export function articleVerbatim(texte: string, citation: string): boolean {
  const cibles = referencesLegales(citation);
  if (cibles.length === 0) return false;
  const cites = new Set(referencesLegales(texte));
  return cibles.every((c) => cites.has(c));
}

/** Références légales normalisées d'une citation : « artl1211 », « r471 »… */
function referencesLegales(citation: string): string[] {
  return [...citation.matchAll(RE_MENTION_ARTICLE)].map((m) =>
    normaliserMentionArticle(m[1]),
  );
}

// ---------------------------------------------------------------------------
// Prompt + parsing
// ---------------------------------------------------------------------------

const schemaReponse = z.object({
  titre: z.string().min(5).max(200),
  typeInfraction: z.enum(["AMENDE", "SUSPENSION"]),
  articles: z.array(z.string()).max(5).default([]),
  regle: z.string().max(2500).default(""),
  conditions: z.array(z.string()).max(6).default([]),
  resume: z.string().max(1200).default(""),
  extraits: z.array(z.string()).max(5).default([]),
  motifDecisif: z.string().max(700).default(""),
  obsolescence: z.string().max(400).default(""),
  templateLettre: z.string().max(6000).default(""),
  templateRefere: z.string().max(4000).default(""),
  // 3ᵉ parcours (veille 2.0) : émis par le mock/secours local pour les
  // suspensions ; strippé des anciennes propositions stockées.
  templateGracieux: z.string().max(6000).default(""),
  // Optionnel : le mock/secours local ne l'émettent pas (legacy pur) — le
  // parser v2 lit aussi ce champ pour étiqueter les sorties anciennes.
  statut_analyse: z
    .enum(["SUCCES_AUTOMOBILISTE_GAGNANT", "REJETE_AUTOMOBILISTE_PERDANT"])
    .optional(),
});

/** Schéma **v2** (veille 2.0) — cible du prompt Gemini : enveloppe structurée
 * avec analyse de prédiction, motifs typés (considérant/attendu), 3 parcours
 * de courriers (OMP / référé / gracieux) et questions UX. Chaque bloc est
 * tolérant (l'IA peut omettre un paragraphe inapplicable). */
const schemaReponseV2 = z.object({
  statut_analyse: z.enum([
    "SUCCES_AUTOMOBILISTE_GAGNANT",
    "REJETE_AUTOMOBILISTE_PERDANT",
  ]),
  analyse: z
    .object({
      juridiction: z.string().max(200).default(""),
      ecli: z.string().max(120).default(""),
      date_decision: z.string().max(40).default(""),
      jurisprudence_valide_en_2026: z.boolean().default(true),
      fondement_regle_de_droit_degagee: z.string().max(2500).default(""),
    })
    .prefault({}),
  motifs_cles: z
    .array(
      z.object({
        type: z.enum(["CONSIDERANT", "ATTENDU"]),
        verbatim: z.string().max(700).default(""),
        vice: z.string().max(200).default(""),
      }),
    )
    .max(5)
    .default([]),
  generation_templates_recours: z
    .object({
      titre_faille_catalogue: z.string().max(200).default(""),
      conditions_application: z.array(z.string()).max(6).default([]),
      articles_loi_vises: z.array(z.string()).max(5).default([]),
      parcours_amende_contestation_omp: z
        .object({
          applicable: z.boolean().default(false),
          paragraphe_lettre_contestation_amende: z.string().max(6000).default(""),
        })
        .prefault({}),
      parcours_suspension_recours_au_fond_avec_refere: z
        .object({
          applicable: z.boolean().default(false),
          paragraphe_recours_exces_de_pouvoir_fond: z.string().max(6000).default(""),
          paragraphe_memoire_refere_suspension_urgence: z.string().max(4000).default(""),
        })
        .prefault({}),
      parcours_suspension_amiable: z
        .object({
          applicable: z.boolean().default(false),
          paragraphe_recours_gracieux_prefet_ou_ministre: z.string().max(6000).default(""),
        })
        .prefault({}),
    })
    .prefault({}),
  auto_alimentation_questions_ux_et_preuves: z
    .object({
      questions: z.array(z.unknown()).max(8).default([]),
    })
    .prefault({}),
});

export function construirePromptExtraction(pub: PublicationVeille): string {
  const entete = [
    pub.juridiction,
    pub.ecli ? `ECLI : ${pub.ecli}` : null,
    pub.dateSource ? `Date : ${pub.dateSource}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    "Tu es analyste juridique (droit des transports et contentieux routier français). Tu analyses une publication officielle de veille : décision de juridiction (TA, CAA, CE, Cass.) ou texte réglementaire.",
    "",
    "Réponds UNIQUEMENT par un objet JSON valide — aucun texte autour, aucune balise ```markdown, aucun commentaire.",
    "Forme exacte attendue :",
    '{',
    '"statut_analyse": "SUCCES_AUTOMOBILISTE_GAGNANT" | "REJETE_AUTOMOBILISTE_PERDANT",',
    '"analyse": {"juridiction":"...","ecli":"...","date_decision":"...","jurisprudence_valide_en_2026":true,"fondement_regle_de_droit_degagee":"..."},',
    '"motifs_cles": [{"type":"CONSIDERANT"|"ATTENDU","verbatim":"...","vice":"..."}],',
    '"generation_templates_recours": {',
    '  "titre_faille_catalogue":"...",',
    '  "conditions_application":["..."],',
    '  "articles_loi_vises":["..."],',
    '  "parcours_amende_contestation_omp": {"applicable":false,"paragraphe_lettre_contestation_amende":""},',
    '  "parcours_suspension_recours_au_fond_avec_refere": {"applicable":false,"paragraphe_recours_exces_de_pouvoir_fond":"","paragraphe_memoire_refere_suspension_urgence":""},',
    '  "parcours_suspension_amiable": {"applicable":false,"paragraphe_recours_gracieux_prefet_ou_ministre":""}',
    '},',
    '"auto_alimentation_questions_ux_et_preuves": {"questions": [{"id":"...","libelle":"...","type":"BOOLEAN"|"TEXT","declencheur":true|false|"TEXT_PRESENT","preuves":[{"intitule":"...","argument":"..."}]}]}',
    "}",
    "",
    "Règles absolues :",
    '1. statut_analyse : SUCCES_AUTOMOBILISTE_GAGNANT si la décision est FAVORABLE aux automobilistes / usagers (annulation, décharge, sursis, réduction de sanction, exigences de motivation ou de délai retenues contre l\'administration…). REJETE_AUTOMOBILISTE_PERDANT si la juridiction REJETE le recours de l\'usager (irrecevable, non fondé, moyens écartés). Cette appréciation n\'entraîne JAMAIS l\'écartement automatique : elle est un signal pour l\'humain.',
    "2. articles_loi_vises : UNIQUEMENT les articles EXPLICITEMENT cités dans le document, recopiés tels quels (ex. \"C. route, art. L. 224-16\"). Max 3. Jamais d'article inventé, induit ou général.",
    "3. fondement_regle_de_droit_degagee : en 2 à 4 phrases, ce que cette décision RETIENT (solution, motif), uniquement à partir du document. Aucun avis, aucune prédiction.",
    "4. conditions_application : 2 à 5 conditions d'application PRÉCISES (fait, délai, vice, qualité…) recopiées mot pour mot dans le document. Tableau vide si aucune n'est textuellement présente.",
    "5. motifs_cles : 1 à 3 passages VERBATIM (20 à 600 caractères, recopiés mot pour mot) où la juridiction énonce le motif décisif — type CONSIDERANT pour les cours d'appel / cour administrative d'appel et le Conseil d'État, ATTENDU pour les tribunaux administratifs et la Cour de cassation. `vice` = nom court du vice (ex. \"défaut de motivation\", \"vice de procédure\") ou \"\". Tableau vide si aucun passage distinct ne se détache.",
    '6. analyse.jurisprudence_valide_en_2026 : true si le texte ne montre AUCUNE trace de réforme postérieure le rendant obsolète ; false seulement si une réforme est MANIFESTE dans le document (date + texte). Ne jamais spéculer.',
    "7. typeInfraction implicite : parcours_amende_contestation_omp.applicable = true SI et SEULEMENT si la décision porte sur une AMENDE / contravention / transaction pénale. parcours_suspension_* applicable = true SI la décision porte sur le PERMIS (suspension, invalidation, annulation, retrait de points, stage). Un seul parcours principal est applicable.",
    "8. titre_faille_catalogue : titre court (10 à 120 caractères) résumant le fondement exploitable (ex. \"Défaut de motivation de la suspension du permis\").",
    "9. parcours_amende_contestation_omp.paragraphe_lettre_contestation_amende : SI applicable, le CORPS d'une lettre de contestation OMP au 1ère personne (style soutenu, 400 à 2 500 caractères) qui reprend le fondement et les motifs_cles, invoquant UNIQUEMENT les articles de articles_loi_vises. Variables autorisées — exactement celles-ci entre accolades, aucune autre : {nom} {plaque} {num_pv} {date} {montant} {radarId} {lieu}. Ne reprends AUCUN fait d'espèce absent du document. Sinon \"\".",
    "10. parcours_suspension_recours_au_fond_avec_refere.paragraphe_recours_exces_de_pouvoir_fond : SI applicable, le paragraphe du recours au fond (400 à 2 500 caractères, mêmes variables que 9).",
    "11. parcours_suspension_recours_au_fond_avec_refere.paragraphe_memoire_refere_suspension_urgence : SI applicable, le moyen du référé-suspension — l'article applicable est L. 521-2 du code de justice administrative (doute sérieux + atteinte grave et manifestement illégale). 400 à 1 500 caractères. Variables : {nom} {num_pv} {date} {metier} {entreprise} {siret} {risque_licenciement}. Sinon \"\".",
    "12. parcours_suspension_amiable.paragraphe_recours_gracieux_prefet_ou_ministre : SI applicable (et seulement pour une suspension/invalidation où un recours gracieux a du sens), le CORPS d'une demande gracieuse au 1ère personne (400 à 2 500 caractères, mêmes variables que 9) — elle est envoyée en lettre recommandée, elle est autonome de la lettre de recours. Sinon \"\".",
    "13. auto_alimentation_questions_ux_et_preuves.questions : 0 à 6 questions que le CLIENT doit pouvoir répondre par oui/non (BOOLEAN) ou par un texte court (TEXT) pour documenter le cas d'espèce AU TITRE de ce fondement. Chaque question a un id court [a-z0-9_]{3,60} (ex. \"notification_recu_48h\"), un libellé en français, un declencheur (true = la réponse oui déclenche le fondement ; false = la réponse non le déclenche ; \"TEXT_PRESENT\" pour une question TEXT), et 0 ou 1 preuve suggérée {intitule, argument} que le client pourrait téléverser. Les questions portent sur des FAITS vérifiables par le client (notification reçue, délai respecté, état du véhicule…), JAMAIS sur des qualifications juridiques. Si aucune question utile, tableau vide.",
    "14. Si le document ne permet pas d'identifier au moins un article cité et un fondement : renvoie le JSON complet avec tableaux vides et chaînes vides — n'invente JAMAIS.",
    "",
    "=== PUBLICATION ===",
    `${pub.titre}${entete ? ` — ${entete}` : ""}`,
    "",
    "=== PASSAGES DÉJÀ RETENUS PAR LE FILTRE DE PERTINENCE ===",
    pub.citations.length ? pub.citations.join("\n") : "(aucun)",
    "",
    "=== TEXTE INTÉGRAL ===",
    pub.contenu.slice(0, 12_000),
  ].join("\n");
}

function sansFences(brut: string): string {
  return brut
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

/**
 * Parse + valide la réponse de l'IA, puis applique les garde-fous de
 * verbatim. `null` = réponse illisible (l'appelant marque `echec`).
 *
 * **Veille 2.0** : le schéma v2 (enveloppe structurée) est essayé en premier ;
 * une réponse au format plat legacy (mock, secours local, anciennes
 * propositions) bascule sur le parser historique — jamais de perte.
 */
export function parserExtraction(
  brut: string,
  contenu: string,
  titreSource?: string,
): PropositionVeille | null {
  let json: unknown;
  try {
    json = JSON.parse(sansFences(brut));
  } catch {
    return null;
  }
  const v2 = schemaReponseV2.safeParse(json);
  if (v2.success) return proposerDepuisV2(v2.data, contenu, titreSource);
  const legacy = schemaReponse.safeParse(json);
  if (legacy.success) return proposerDepuisLegacy(legacy.data, contenu);
  return null;
}

/** Dérive le type d'infraction depuis les parcours applicables (v2) — avec
 * repli sur les mots-clés du titre + du contenu si aucun parcours n'est marqué. */
function typeInfractionDepuisParcours(
  d: z.infer<typeof schemaReponseV2>,
  contenu: string,
  titreSource?: string,
): "AMENDE" | "SUSPENSION" {
  const s = d.generation_templates_recours;
  if (
    s.parcours_suspension_recours_au_fond_avec_refere.applicable ||
    s.parcours_suspension_amiable.applicable
  ) {
    return "SUSPENSION";
  }
  if (s.parcours_amende_contestation_omp.applicable) return "AMENDE";
  return /permis|suspension|invalidation|retrait de points|annulation du permis/i.test(
    `${titreSource ?? ""} ${contenu}`,
  )
    ? "SUSPENSION"
    : "AMENDE";
}

/** Mapping v2 → `PropositionVeille`, garde-fous verbatim + lint templates. */
function proposerDepuisV2(
  d: z.infer<typeof schemaReponseV2>,
  contenu: string,
  titreSource?: string,
): PropositionVeille {
  const s = d.generation_templates_recours;
  const typeInfraction = typeInfractionDepuisParcours(d, contenu, titreSource);
  const perdant = d.statut_analyse === "REJETE_AUTOMOBILISTE_PERDANT";

  // Articles : verbatim exigé (référence légale), max 3, dédup **par
  // référence** — « L. 223-3 » et « C. route, art. L. 223-3 » désignent le
  // même article et ne doivent pas consommer deux des trois emplacements.
  const articlesVus = new Set<string>();
  const articles: string[] = [];
  for (const a of s.articles_loi_vises.slice(0, 5)) {
    const article = a.trim();
    if (article.length < 3 || article.length > 120) continue;
    const refs = referencesLegales(article);
    if (refs.length === 0) continue;
    const cle = refs.join("+");
    if (articlesVus.has(cle)) continue;
    if (!articleVerbatim(contenu, article)) continue;
    articlesVus.add(cle);
    articles.push(article);
    if (articles.length >= 3) break;
  }

  // Motifs clés : verbatim exigé, max 3, dédup + typage conservé.
  const motifsVus = new Set<string>();
  const motifsCles: NonNullable<PropositionVeille["motifsCles"]> = [];
  const extraits: string[] = [];
  let motifDecisif: string | undefined;
  for (const m of d.motifs_cles.slice(0, 5)) {
    const verbatim = m.verbatim.trim();
    if (verbatim.length < 20 || verbatim.length > 600) continue;
    const cle = normaliserPourComparaison(verbatim);
    if (motifsVus.has(cle)) continue;
    if (!contenuVerbatim(contenu, verbatim)) continue;
    motifsVus.add(cle);
    const vice = m.vice.trim().slice(0, 200);
    motifsCles.push({ type: m.type, verbatim, vice });
    extraits.push(verbatim);
    if (!motifDecisif) motifDecisif = verbatim;
    if (motifsCles.length >= 3) break;
  }

  // Conditions d'application : verbatim exigé, max 5, dédup.
  const conditionsVues = new Set<string>();
  const conditions: string[] = [];
  for (const c of s.conditions_application.slice(0, 6)) {
    const condition = c.trim();
    if (condition.length < 15 || condition.length > 300) continue;
    const cle = normaliserPourComparaison(condition);
    if (conditionsVues.has(cle)) continue;
    if (!contenuVerbatim(contenu, condition)) continue;
    conditionsVues.add(cle);
    conditions.push(condition);
    if (conditions.length >= 5) break;
  }

  const regle = d.analyse.fondement_regle_de_droit_degagee.trim();

  // Templates : lint pur — le champ est vidé en cas d'échec. Sur une décision
  // PERDANTE, aucun template n'est conservé (invariant : rien de rédigable à
  // partir d'un fondement que la juridiction a elle-même écarté).
  const templateLettre = perdant
    ? undefined
    : typeInfraction === "AMENDE"
      ? assainirTemplate(
          s.parcours_amende_contestation_omp.paragraphe_lettre_contestation_amende,
          articles,
        )
      : assainirTemplate(
          s.parcours_suspension_recours_au_fond_avec_refere
            .paragraphe_recours_exces_de_pouvoir_fond,
          articles,
        );
  const templateRefere =
    !perdant && typeInfraction === "SUSPENSION"
      ? assainirTemplate(
          s.parcours_suspension_recours_au_fond_avec_refere
            .paragraphe_memoire_refere_suspension_urgence,
          articles,
          { refere: true },
        )
      : undefined;
  const templateGracieux =
    !perdant &&
    typeInfraction === "SUSPENSION" &&
    s.parcours_suspension_amiable.applicable
      ? assainirTemplate(
          s.parcours_suspension_amiable.paragraphe_recours_gracieux_prefet_ou_ministre,
          articles,
        )
      : undefined;

  // Questions dynamiques : défensif (normalisation bornée), jamais sur perdant.
  const questionsDynamiques = perdant
    ? []
    : normaliserQuestionsDynamiques(
        d.auto_alimentation_questions_ux_et_preuves.questions,
      );

  // Obsolescence : jamais d'affirmation hors document — le seul signal
  // structurel est le booléen `jurisprudence_valide_en_2026`. La date de la
  // décision est rappelée dans la phrase pour situer le lecteur.
  const dateDecision = d.analyse.date_decision.trim().slice(0, 40);
  const obsolescence = d.analyse.jurisprudence_valide_en_2026
    ? undefined
    : `Extraction : la jurisprudence n'est plus réputée valide en 2026 (réforme détectée dans le document${dateDecision ? `, décision du ${dateDecision}` : ""}). Vérifier sur la source avant usage.`;

  const complet =
    articles.length > 0 &&
    regle.length >= 15 &&
    extraits.length > 0 &&
    conditions.length > 0;

  const motif = complet
    ? undefined
    : [
        articles.length === 0
          ? "aucun article cité textuellement dans le document"
          : null,
        regle.length < 15 ? "règle dégagée absente ou trop courte" : null,
        conditions.length === 0
          ? "aucune condition d'application textuellement trouvée"
          : null,
        extraits.length === 0
          ? "aucun extrait verbatim trouvé à l'appui de la règle"
          : null,
      ]
        .filter(Boolean)
        .join(" ; ") || "proposition incomplète";

  return {
    etat: complet ? "extrait" : "incomplet",
    titre: (s.titre_faille_catalogue.trim() || titreSource?.trim() || "Proposition de veille").slice(0, 200),
    typeInfraction,
    articles,
    regle,
    conditions,
    resume: regle.slice(0, 1200) || (titreSource ?? "").slice(0, 1200),
    extraits,
    ...(motifDecisif ? { motifDecisif } : {}),
    ...(obsolescence ? { obsolescence } : {}),
    ...(templateLettre ? { templateLettre } : {}),
    ...(templateRefere ? { templateRefere } : {}),
    ...(templateGracieux ? { templateGracieux } : {}),
    statutAnalyse: d.statut_analyse,
    analyse: {
      juridiction: d.analyse.juridiction.trim().slice(0, 200),
      ecli: d.analyse.ecli.trim().slice(0, 120),
      dateDecision: d.analyse.date_decision.trim().slice(0, 40),
      valide2026: d.analyse.jurisprudence_valide_en_2026,
      fondement: regle.slice(0, 2500),
    },
    ...(motifsCles.length ? { motifsCles } : {}),
    ...(questionsDynamiques.length ? { questionsDynamiques } : {}),
    motif,
    schemaVeille: 2,
    extraitLe: new Date().toISOString(),
  };
}

/** Parser historique (format plat) — conservé pour le mock, le secours local
 * et la relecture des propositions stockées avant le v2. */
function proposerDepuisLegacy(
  d: z.infer<typeof schemaReponse>,
  contenu: string,
): PropositionVeille {
  const articlesVus = new Set<string>();
  const articles: string[] = [];
  for (const a of d.articles.slice(0, 5)) {
    const article = a.trim();
    if (article.length < 3 || article.length > 120) continue;
    const refs = referencesLegales(article);
    if (refs.length === 0) continue;
    const cle = refs.join("+");
    if (articlesVus.has(cle)) continue;
    if (!articleVerbatim(contenu, article)) continue;
    articlesVus.add(cle);
    articles.push(article);
    if (articles.length >= 3) break;
  }

  const extraitsVus = new Set<string>();
  const extraits: string[] = [];
  for (const e of d.extraits.slice(0, 5)) {
    const extrait = e.trim();
    if (extrait.length < 20 || extrait.length > 500) continue;
    const cle = normaliserPourComparaison(extrait);
    if (extraitsVus.has(cle)) continue;
    if (!contenuVerbatim(contenu, extrait)) continue;
    extraitsVus.add(cle);
    extraits.push(extrait);
    if (extraits.length >= 3) break;
  }

  const conditionsVues = new Set<string>();
  const conditions: string[] = [];
  for (const c of d.conditions.slice(0, 6)) {
    const condition = c.trim();
    if (condition.length < 15 || condition.length > 300) continue;
    const cle = normaliserPourComparaison(condition);
    if (conditionsVues.has(cle)) continue;
    if (!contenuVerbatim(contenu, condition)) continue;
    conditionsVues.add(cle);
    conditions.push(condition);
    if (conditions.length >= 5) break;
  }

  const regle = d.regle.trim();

  // Motif décisif : même discipline verbatim que les extraits — un passage
  // non présent dans le document est retiré (jamais d'attendu fabriqué).
  const motifDecisifBrut = d.motifDecisif.trim();
  const motifDecisif =
    motifDecisifBrut.length >= 20 &&
    motifDecisifBrut.length <= 600 &&
    contenuVerbatim(contenu, motifDecisifBrut)
      ? motifDecisifBrut
      : undefined;

  // Obsolescence : appréciation (pas une citation) — bornée, affichée en
  // badge sans jamais changer l'état de la proposition.
  const obsolescence = (() => {
    const o = d.obsolescence.trim();
    return o.length >= 10 && o.length <= 400 ? o : undefined;
  })();

  // Templates (lot 3) : lint pur — soit le texte passe, soit il est rejeté
  // (champ vidé). Ne touche jamais à l'état de la proposition. Sur une
  // décision PERDANTE, aucun template n'est conservé (même discipline que le
  // parser v2 : rien de rédigable sur un fondement écarté par la juridiction).
  const perdant = d.statut_analyse === "REJETE_AUTOMOBILISTE_PERDANT";
  const templateLettre = perdant
    ? undefined
    : assainirTemplate(d.templateLettre, articles);
  const templateRefere =
    !perdant && d.typeInfraction === "SUSPENSION"
      ? assainirTemplate(d.templateRefere, articles, { refere: true })
      : undefined;
  const templateGracieux =
    !perdant && d.typeInfraction === "SUSPENSION"
      ? assainirTemplate(d.templateGracieux, articles)
      : undefined;

  const complet =
    articles.length > 0 &&
    regle.length >= 15 &&
    extraits.length > 0 &&
    conditions.length > 0;

  const motif = complet
    ? undefined
    : [
        articles.length === 0
          ? "aucun article cité textuellement dans le document"
          : null,
        regle.length < 15 ? "règle dégagée absente ou trop courte" : null,
        conditions.length === 0
          ? "aucune condition d'application textuellement trouvée"
          : null,
        extraits.length === 0
          ? "aucun extrait verbatim trouvé à l'appui de la règle"
          : null,
      ]
        .filter(Boolean)
        .join(" ; ") || "proposition incomplète";

  return {
    etat: complet ? "extrait" : "incomplet",
    titre: d.titre.trim().slice(0, 200),
    typeInfraction: d.typeInfraction,
    articles,
    regle,
    conditions,
    resume: d.resume.trim(),
    extraits,
    ...(motifDecisif ? { motifDecisif } : {}),
    ...(obsolescence ? { obsolescence } : {}),
    ...(templateLettre ? { templateLettre } : {}),
    ...(templateRefere ? { templateRefere } : {}),
    ...(templateGracieux ? { templateGracieux } : {}),
    ...(d.statut_analyse ? { statutAnalyse: d.statut_analyse } : {}),
    motif,
    extraitLe: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mock déterministe (dev/E2E — même esprit que reponseIaMock)
// ---------------------------------------------------------------------------

/**
 * Squelette de lettre / de moyen de référé déterministe, partagé par le mock
 * (dev/E2E) et le secours local (prod sans IA) : construit **à partir des
 * articles déjà trouvés dans le contenu**, donc soumis au même
 * `assainirTemplate` que la sortie IA. Aucun fait d'espèce — seuls des
 * libellés procéduraux et la référence d'article déjà verbatim.
 */
export function templatesMechaniques(
  articles: string[],
  typeInfraction: "AMENDE" | "SUSPENSION",
): {
  templateLettre: string;
  templateRefere: string;
  templateGracieux: string;
} {
  const brut = articles[0] ?? "";
  const article = brut.replace(/^(?:article|art\.)\s*/i, "");
  const objet =
    typeInfraction === "SUSPENSION"
      ? "la décision contestée n° {num_pv} en date du {date}"
      : "l'avis de contravention n° {num_pv} en date du {date}";
  const templateLettre = article
    ? [
        `Je soussigné(e) {nom}, conteste par la présente ${objet}. La contestation est prise au titre de l'article ${article}.`,
        `La contestation est fondée : les conditions d'application de ce texte n'étaient pas réunies au moment des faits tels qu'ils sont constants, et la sanction prononcée ne peut dès lors être maintenue.`,
        `Je demande en conséquence l'annulation intégrale de la sanction prononcée et le remboursement des sommes éventuellement versées.`,
      ].join("\n\n")
    : "";
  const templateRefere =
    typeInfraction === "SUSPENSION" && article
      ? [
          `Monsieur le Président du tribunal administratif siégeant en formation de référé,`,
          `Aux termes de l'article L. 521-2 du code de justice administrative, il existe, dans un litige sérieux, un motif d'ordonner la mesure sollicitée lorsque l'exécution de la décision contestée porte une atteinte grave et manifestement illégale.`,
          `En l'espèce, l'application de l'article ${article} est contestable au regard des éléments constants du dossier : le doute sérieux sur la légalité de la décision contestée justifie la suspension de son exécution.`,
        ].join("\n\n")
      : "";
  // 3ᵉ parcours (veille 2.0) : demande gracieuse autonome (LRAR) — squelette
  // mécanique identique au lettrage, même discipline de variables.
  const templateGracieux =
    typeInfraction === "SUSPENSION" && article
      ? [
          `Je soussigné(e) {nom}, forme par la présente une demande de grâce gracieuse à l'encontre de ${objet}.`,
          `La mesure de sanction repose sur l'application de l'article ${article} ; je demande respectueusement qu'il soit renoncé à son exécution au vu des circonstances du dossier et de ma situation personnelle.`,
          `Je vous prie de bien vouloir faire droit à ma demande et vous prie d'agréer, Monsieur le Préfet, l'expression de ma haute considération.`,
        ].join("\n\n")
      : "";
  return { templateLettre, templateRefere, templateGracieux };
}

/**
 * Réponse simulée au **format v2** (veille 2.0) : articles repérés par regex,
 * règle = citation de tête, statut d'analyse déterministe (`PERDANT` dans le
 * titre/ECLI) — le parser v2 s'applique donc au mock comme en prod. Aucune
 * question UX simulée (le mock n'invente jamais de capteur de fait).
 */
export function extractionMock(pub: PublicationVeille): string {
  const re = /(?:article|art\.)\s*([LRDC]\.?\s*\d{1,3}(?:-\d{1,3})?)/gi;
  const articles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(pub.contenu)) !== null && articles.length < 3) {
    const article = m[0].trim();
    if (!articles.some((a) => normaliserPourComparaison(a) === normaliserPourComparaison(article))) {
      articles.push(article);
    }
  }
  const typeInfraction =
    /permis|suspension|invalidation|retrait de points|annulation du permis/i.test(
      `${pub.titre} ${pub.contenu}`,
    )
      ? "SUSPENSION"
      : "AMENDE";
  const citation = pub.citations[0] ?? pub.contenu.slice(0, 200);
  // Conditions : passages déjà retenus par le filtre de pertinence (donc
  // présents textuellement) — le mock passe toujours le garde-fou verbatim.
  const conditions = pub.citations
    .slice(0, 3)
    .filter((c) => normaliserPourComparaison(pub.contenu).includes(normaliserPourComparaison(c)));
  if (conditions.length === 0 && pub.contenu.trim().length >= 15) {
    conditions.push(pub.contenu.trim().slice(0, 150));
  }
  // Motifs décisifs simulés : citations suffisamment longues réellement
  // présentes dans le contenu (passent le garde-fou verbatim du parser v2).
  const motifs = pub.citations
    .filter((c) => c.trim().length >= 20 && contenuVerbatim(pub.contenu, c))
    .slice(0, 3)
    .map((c) => ({ type: "ATTENDU" as const, verbatim: c.trim().slice(0, 600), vice: "" }));
  // Obsolescence simulée et déterministe : décision d'avant 2020 →
  // drapeau testable en E2E sans appel réseau (booléen v2, la phrase de
  // mise en garde est fabriquée par le parser).
  const annee = pub.dateSource
    ? Number.parseInt(pub.dateSource.slice(0, 4), 10)
    : Number.NaN;
  const obsolete = Number.isFinite(annee) && annee < 2020;
  // Statut d'analyse : marqueur `PERDANT` dans le titre ou l'ECLI →
  // décision rejetée (badge rouge, templates/questions jamais proposés).
  const statutAnalyse: "SUCCES_AUTOMOBILISTE_GAGNANT" | "REJETE_AUTOMOBILISTE_PERDANT" =
    /PERDANT/i.test(`${pub.titre} ${pub.ecli ?? ""}`)
      ? "REJETE_AUTOMOBILISTE_PERDANT"
      : "SUCCES_AUTOMOBILISTE_GAGNANT";
  const perdant = statutAnalyse === "REJETE_AUTOMOBILISTE_PERDANT";
  const templates = templatesMechaniques(articles, typeInfraction);
  const regle = `Simulation (mock) : la juridiction retient que ${citation}`;
  const s = {
    titre_faille_catalogue: pub.titre.slice(0, 120),
    conditions_application: conditions,
    articles_loi_vises: articles,
    parcours_amende_contestation_omp:
      typeInfraction === "AMENDE"
        ? {
            applicable: true,
            paragraphe_lettre_contestation_amende: perdant ? "" : templates.templateLettre,
          }
        : { applicable: false, paragraphe_lettre_contestation_amende: "" },
    parcours_suspension_recours_au_fond_avec_refere:
      typeInfraction === "SUSPENSION"
        ? {
            applicable: true,
            paragraphe_recours_exces_de_pouvoir_fond: perdant ? "" : templates.templateLettre,
            paragraphe_memoire_refere_suspension_urgence: perdant ? "" : templates.templateRefere,
          }
        : {
            applicable: false,
            paragraphe_recours_exces_de_pouvoir_fond: "",
            paragraphe_memoire_refere_suspension_urgence: "",
          },
    parcours_suspension_amiable:
      typeInfraction === "SUSPENSION"
        ? {
            applicable: true,
            paragraphe_recours_gracieux_prefet_ou_ministre: perdant ? "" : templates.templateGracieux,
          }
        : { applicable: false, paragraphe_recours_gracieux_prefet_ou_ministre: "" },
  };
  return JSON.stringify({
    statut_analyse: statutAnalyse,
    analyse: {
      juridiction: pub.juridiction ?? "",
      ecli: pub.ecli ?? "",
      date_decision: pub.dateSource ?? "",
      jurisprudence_valide_en_2026: !obsolete,
      fondement_regle_de_droit_degagee: regle,
    },
    motifs_cles: motifs,
    generation_templates_recours: s,
    auto_alimentation_questions_ux_et_preuves: { questions: [] },
  });
}

/**
 * Extraction **locale de secours** (sans IA, sans réseau) : même discipline
 * que le mock — articles repérés par regex dans le contenu (le parser applique
 * ensuite le garde-fou verbatim), conditions et extraits = citations déjà
 * retenues par le filtre de pertinence (donc littéralement présentes).
 *
 * Utilisée dès que l'IA est indisponible (`off`, `absent`) ou en échec
 * (429 quota / 503) : la proposition reste **immédiatement disponible** pour
 * l'admin (valider / corriger / écarter) au lieu d'un `echec` muet. La règle
 * est volontairement la citation de tête, explicitement étiquetée « locale » :
 * l'admin la corrige dans le drawer avant validation si besoin.
 */
export function extractionLocale(pub: PublicationVeille): string {
  const re = /(?:article|art\.)\s*([LRDC]\.?\s*\d{1,3}(?:-\d{1,3})?)/gi;
  const articles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(pub.contenu)) !== null && articles.length < 3) {
    const article = m[0].trim();
    if (!articles.some((a) => normaliserPourComparaison(a) === normaliserPourComparaison(article))) {
      articles.push(article);
    }
  }
  const typeInfraction =
    /permis|suspension|invalidation|retrait de points|annulation du permis/i.test(
      `${pub.titre} ${pub.contenu}`,
    )
      ? "SUSPENSION"
      : "AMENDE";
  const citation = pub.citations[0] ?? pub.contenu.slice(0, 200);
  const conditions = pub.citations
    .slice(0, 3)
    .filter((c) => normaliserPourComparaison(pub.contenu).includes(normaliserPourComparaison(c)));
  if (conditions.length === 0 && pub.contenu.trim().length >= 15) {
    conditions.push(pub.contenu.trim().slice(0, 150));
  }
  const templates = templatesMechaniques(articles, typeInfraction);
  return JSON.stringify({
    titre: pub.titre.slice(0, 120),
    typeInfraction,
    articles,
    regle: `Extraction locale (sans IA) — citation de tête retenue : « ${citation} »`,
    conditions,
    resume: `Extraction locale (sans IA) : ${pub.titre.slice(0, 120)}`,
    extraits: pub.citations.slice(0, 2),
    ...templates,
  });
}

// ---------------------------------------------------------------------------
// Orchestration provider
// ---------------------------------------------------------------------------

export type ExtractionDispo = "mock" | "gemini" | "off" | "absent";

/** Provider effectivement actif pour l'extraction (V1 : mêmes variables IA). */
export function extractionDispo(): ExtractionDispo {
  const provider = (process.env.VERIF_IA_PROVIDER ?? "").toLowerCase();
  if (provider === "off") return "off";
  if (provider === "mock") return "mock";
  return process.env.GEMINI_API_KEY ? "gemini" : "absent";
}

export type ResultatExtraction =
  | { ok: true; proposition: PropositionVeille }
  | { ok: false; motif: string };

/**
 * Extrait la proposition d'une publication. Jamais d'exception : `ok:false`
 * avec un motif prêt à afficher uniquement si même le secours local échoue
 * (réponse illisible — quasi impossible sur sa propre sortie).
 *
 * **Disponibilité immédiate** : quand l'IA est coupée (`off`), sans clé
 * (`absent`) ou en échec (429 quota / 503 / réponse illisible), on bascule sur
 * `extractionLocale` (sans réseau) au lieu de renvoyer un `echec` — la
 * proposition reste consultable/correctible/validable par l'admin.
 */
export async function extraireProposition(
  pub: PublicationVeille,
): Promise<ResultatExtraction> {
  const dispo = extractionDispo();

  if (dispo === "mock") {
    const prop = parserExtraction(extractionMock(pub), pub.contenu, pub.titre);
    if (!prop) return { ok: false, motif: "réponse simulée illisible" };
    return { ok: true, proposition: prop };
  }

  if (dispo === "off" || dispo === "absent") {
    return secoursLocal(pub);
  }

  const appel = await appelerGeminiJson(
    construirePromptExtraction(pub),
    "veille-extraction",
  );
  if (appel.ok) {
    const prop = parserExtraction(appel.texte, pub.contenu, pub.titre);
    if (prop) return { ok: true, proposition: prop };
  }
  // IA en échec (429 quota, 503, réponse illisible…) : le secours local
  // garantit une proposition immédiate — l'étiquette UI « locale » et le
  // libellé de la règle signalent le repli à l'admin.
  return secoursLocal(pub);
}

/** Parse la réponse locale et l'étiquette `methode: "locale"`. */
function secoursLocal(pub: PublicationVeille): ResultatExtraction {
  const prop = parserExtraction(extractionLocale(pub), pub.contenu, pub.titre);
  if (!prop) return { ok: false, motif: "extraction locale illisible" };
  prop.methode = "locale";
  return { ok: true, proposition: prop };
}

/** Proposition d'échec stockable (état `echec` en base). */
export function propositionEchec(motif: string): PropositionVeille {
  return {
    etat: "echec",
    titre: "",
    typeInfraction: "AMENDE",
    articles: [],
    regle: "",
    conditions: [],
    resume: "",
    extraits: [],
    motif,
    extraitLe: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Correction manuelle (admin) — lot O
// ---------------------------------------------------------------------------

export type ValeursProposition = {
  titre: string;
  typeInfraction: "AMENDE" | "SUSPENSION";
  /** Articles saisis : un par ligne. */
  articles: string;
  regle: string;
  /** Conditions d'application saisies : une par ligne. */
  conditions: string;
  resume: string;
  /** Motif décisif saisi par l'admin (verbatim de la décision lu). */
  motifDecisif: string;
  /** Template de lettre relu/écrit par l'admin (vide = chip « à rédiger »). */
  templateLettre?: string;
  /** Moyen de référé relu/écrit par l'admin (suspension seulement). */
  templateRefere?: string;
  /** Demande gracieuse relu/écrite par l'admin (3ᵉ parcours, suspension). */
  templateGracieux?: string;
};

export type ResultatFormulation =
  | { ok: true; proposition: PropositionVeille }
  | { ok: false; erreur: string };

/** Découpe une liste saisie « un élément par ligne » (CR/LF tolérés). */
export function lignesListe(brut: string): string[] {
  return brut
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function dedupLignes(lignes: string[]): string[] {
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const l of lignes) {
    const cle = normaliserPourComparaison(l);
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(l);
  }
  return sortie;
}

/**
 * Construit (ou corrige) une proposition à partir des valeurs **saisies par
 * l'admin** dans le formulaire du drawer (lot O).
 *
 * Garde-fous :
 *  - mêmes contrôles de forme que `parserExtraction` (longueurs bornées,
 *    déduplication) mais **sans** exigence de verbatim : la saisie manuelle
 *    est signée par l'humain, pas générée par l'IA ;
 *  - l'état passe à `extrait` (donc validable) dès qu'il y a au moins un
 *    article, une règle de 15 caractères et une condition — les extraits
 *    verbatim de l'extraction sont conservés pour transparence mais ne
 *    bloquent plus la validation **après** correction ;
 *  - jamais d'article « inventé » : ce champ n'existe que s'il est tapé par
 *    l'admin qui vient de lire la décision.
 */
export function propositionDepuisFormulaire(
  valeurs: ValeursProposition,
  options: {
    extraits?: string[];
    extraitLe?: string;
    /** Drapeau d'obsolescence IA conservé à la correction (jamais édité). */
    obsolescence?: string;
    /** Champs v2 préservés à la correction (l'admin n'édite pas l'analyse
     * prédiction ni les questions — il peut rédiger le 3ᵉ template). */
    statutAnalyse?: PropositionVeille["statutAnalyse"];
    analyse?: PropositionVeille["analyse"];
    motifsCles?: PropositionVeille["motifsCles"];
    questionsDynamiques?: QuestionDynamique[];
  } = {},
): ResultatFormulation {
  const titre = valeurs.titre.trim();
  if (titre.length < 5) {
    return { ok: false, erreur: "Titre trop court (5 caractères minimum)." };
  }
  if (titre.length > 200) {
    return { ok: false, erreur: "Titre trop long (200 caractères maximum)." };
  }

  const articles = dedupLignes(lignesListe(valeurs.articles));
  if (articles.length > 5) {
    return { ok: false, erreur: "Au plus 5 articles retenus." };
  }
  for (const a of articles) {
    if (a.length < 3 || a.length > 120) {
      return {
        ok: false,
        erreur: `Article invalide (3 à 120 caractères par ligne) : « ${a.slice(0, 60)} »`,
      };
    }
  }

  const conditions = dedupLignes(lignesListe(valeurs.conditions));
  if (conditions.length > 6) {
    return { ok: false, erreur: "Au plus 6 conditions d'application." };
  }
  for (const c of conditions) {
    if (c.length < 15 || c.length > 300) {
      return {
        ok: false,
        erreur: `Condition invalide (15 à 300 caractères par ligne) : « ${c.slice(0, 60)} »`,
      };
    }
  }

  const regle = valeurs.regle.trim();
  if (regle.length > 2500) {
    return { ok: false, erreur: "Règle dégagée trop longue (2 500 caractères maximum)." };
  }

  // Motif décisif : bornes seulement — la saisie est signée par l'humain qui
  // vient de lire la décision, aucune exigence de verbatim (comme la règle).
  const motifDecisif = valeurs.motifDecisif.trim();
  if (motifDecisif.length > 0 && motifDecisif.length < 20) {
    return { ok: false, erreur: "Motif décisif trop court (20 caractères minimum, ou vide)." };
  }
  if (motifDecisif.length > 600) {
    return { ok: false, erreur: "Motif décisif trop long (600 caractères maximum)." };
  }

  // Templates (lot 3) : bornes seulement sur la saisie humaine (le lint
  // verbatim/articles ne s'applique qu'à la sortie IA de `parserExtraction`).
  // Un template vidé volontairement remet le chip « Template à rédiger ».
  const templateLettre = (valeurs.templateLettre ?? "").trim();
  if (templateLettre.length > 6000) {
    return { ok: false, erreur: "Template de lettre trop long (6 000 caractères maximum)." };
  }
  const templateRefere = (valeurs.templateRefere ?? "").trim();
  if (templateRefere.length > 4000) {
    return { ok: false, erreur: "Moyen de référé trop long (4 000 caractères maximum)." };
  }
  const templateGracieux = (valeurs.templateGracieux ?? "").trim();
  if (templateGracieux.length > 6000) {
    return { ok: false, erreur: "Demande gracieuse trop longue (6 000 caractères maximum)." };
  }

  const complet = articles.length > 0 && regle.length >= 15 && conditions.length > 0;
  const motif = complet
    ? undefined
    : [
        articles.length === 0 ? "aucun article retenu" : null,
        regle.length < 15 ? "règle dégagée absente ou trop courte" : null,
        conditions.length === 0 ? "aucune condition d'application" : null,
      ]
        .filter(Boolean)
        .join(" ; ") || "proposition incomplète";

  return {
    ok: true,
    proposition: {
      etat: complet ? "extrait" : "incomplet",
      titre,
      typeInfraction: valeurs.typeInfraction === "SUSPENSION" ? "SUSPENSION" : "AMENDE",
      articles,
      regle,
      conditions,
      resume: valeurs.resume.trim().slice(0, 1200),
      extraits: (options.extraits ?? []).slice(0, 3),
      ...(motifDecisif ? { motifDecisif } : {}),
      ...(options.obsolescence ? { obsolescence: options.obsolescence } : {}),
      ...(templateLettre ? { templateLettre } : {}),
      ...(templateRefere && valeurs.typeInfraction === "SUSPENSION"
        ? { templateRefere }
        : {}),
      ...(templateGracieux && valeurs.typeInfraction === "SUSPENSION"
        ? { templateGracieux }
        : {}),
      ...(options.statutAnalyse ? { statutAnalyse: options.statutAnalyse } : {}),
      ...(options.analyse ? { analyse: options.analyse } : {}),
      ...(options.motifsCles?.length ? { motifsCles: options.motifsCles } : {}),
      ...(options.questionsDynamiques?.length
        ? { questionsDynamiques: options.questionsDynamiques }
        : {}),
      motif,
      extraitLe: options.extraitLe ?? new Date().toISOString(),
      corrigeLe: new Date().toISOString(),
    },
  };
}

/**
 * Règle dégagée + bloc « Conditions d'application » — format **partagé** entre
 * la validation depuis le drawer (`validerPropositionSource`) et la création
 * automatique de proposition (`proposerFaillesDepuisExtraction`) : les deux
 * chemins doivent produire exactement le même contenu en base.
 */
export function composerRegleProposition(p: PropositionVeille): string {
  const conditions = p.conditions ?? [];
  return [
    p.regle.trim(),
    conditions.length
      ? `Conditions d'application :\n${conditions.map((c) => `- ${c}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type ChampsSourceRef = {
  ecli: string | null;
  reference: string | null;
  idDila: string;
  juridiction: string | null;
  source: string;
  dateSource: Date | null;
  url: string | null;
};

/**
 * Référence de jurisprudence au format de la base juridique, depuis la
 * publication source (partagée validation drawer / auto-proposition) :
 * `verifiee: false` tant qu'aucun humain n'a confirmé sur la source primaire.
 */
export function refPropositionDepuisSource(
  s: ChampsSourceRef,
  p: PropositionVeille,
): JurisprudenceRef {
  return {
    reference: [s.ecli ?? s.reference ?? s.idDila].filter(Boolean).join(" — "),
    juridiction: s.juridiction ?? s.source,
    date: s.dateSource ? s.dateSource.toISOString().slice(0, 10) : null,
    url: s.url,
    verifiee: false,
    resume: p.resume || p.extraits[0] || null,
  };
}
