import { z } from "zod";
import { appelerGeminiJson } from "@/lib/ia-gemini";

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
  /** Pourquoi incomplet/échec — affiché à l'admin. */
  motif?: string;
  /** Date ISO de l'extraction. */
  extraitLe: string;
  /** (Ré)extractions automatiques déjà tentées sur cette proposition. */
  tentatives?: number;
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
    "Tu analyses une publication officielle de veille juridique française (décision de juridiction ou texte publié).",
    "",
    "Réponds UNIQUEMENT par un objet JSON sans texte autour, de la forme :",
    '{"titre":"...","typeInfraction":"AMENDE|SUSPENSION","articles":["..."],"regle":"...","conditions":["..."],"resume":"...","extraits":["..."]}',
    "",
    "Règles absolues :",
    '1. articles : UNIQUEMENT les articles EXPLICITEMENT cités dans le document fourni, recopiés tels quels (ex. "C. route, art. L. 224-16"). Max 3. Jamais d\'article inventé, induit ou général.',
    "2. regle : en 2 à 4 phrases, ce que cette décision ou ce texte RETIENT (la solution retenue par la juridiction, le motif de la décision), uniquement à partir du document fourni. Aucun avis personnel, aucune prédiction.",
    '3. conditions : 2 à 5 conditions d\'application PRÉCISES de la règle — ce qu\'il faut que le cas d\'espèce vérifie pour que la règle joue (fait, délai, vice, qualité de la personne…) — recopiées mot pour mot dans le document (mêmes exigences de verbatim que les extraits). Si aucune condition n\'est textuellement dans le document, renvoie un tableau vide.',
    "4. resume : une phrase sur l'objet du litige ou la portée.",
    "5. extraits : 1 à 3 citations VERBATIM (20 à 400 caractères, recopiées mot pour mot) du document qui fondent la règle.",
    "6. typeInfraction : SUSPENSION si la décision porte sur le permis de conduire (suspension, invalidation, annulation, retrait de points, stage…) ; sinon AMENDE.",
    '7. Si le document ne permet pas d\'identifier au moins un article cité et une règle : renvoie {"titre":"...","typeInfraction":"...","articles":[],"regle":"","conditions":[],"resume":"","extraits":[]} — n\'invente jamais.',
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
 */
export function parserExtraction(
  brut: string,
  contenu: string,
): PropositionVeille | null {
  let json: unknown;
  try {
    json = JSON.parse(sansFences(brut));
  } catch {
    return null;
  }
  const parsed = schemaReponse.safeParse(json);
  if (!parsed.success) return null;
  const d = parsed.data;

  const articlesVus = new Set<string>();
  const articles: string[] = [];
  for (const a of d.articles.slice(0, 5)) {
    const article = a.trim();
    if (article.length < 3 || article.length > 120) continue;
    const cle = normaliserPourComparaison(article);
    if (articlesVus.has(cle)) continue;
    if (!contenuVerbatim(contenu, article)) continue;
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
    motif,
    extraitLe: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mock déterministe (dev/E2E — même esprit que reponseIaMock)
// ---------------------------------------------------------------------------

/** Réponse simulée : articles repérés par regex, règle = citation de tête. */
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
  return JSON.stringify({
    titre: pub.titre.slice(0, 120),
    typeInfraction,
    articles,
    regle: `Simulation (mock) : la juridiction retient que ${citation}`,
    conditions,
    resume: `Simulation (mock) : ${pub.titre.slice(0, 120)}`,
    extraits: pub.citations.slice(0, 2),
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
 * avec un motif prêt à afficher (IA coupée, appel en échec, réponse illisible).
 */
export async function extraireProposition(
  pub: PublicationVeille,
): Promise<ResultatExtraction> {
  const dispo = extractionDispo();
  if (dispo === "off" || dispo === "absent") {
    return {
      ok: false,
      motif:
        dispo === "off"
          ? "extraction IA désactivée (VERIF_IA_PROVIDER=off)"
          : "IA indisponible (GEMINI_API_KEY absente)",
    };
  }

  if (dispo === "mock") {
    const prop = parserExtraction(extractionMock(pub), pub.contenu);
    if (!prop) return { ok: false, motif: "réponse simulée illisible" };
    return { ok: true, proposition: prop };
  }

  const appel = await appelerGeminiJson(
    construirePromptExtraction(pub),
    "veille-extraction",
  );
  if (!appel.ok) return { ok: false, motif: appel.motif };
  const prop = parserExtraction(appel.texte, pub.contenu);
  if (!prop) {
    return { ok: false, motif: "réponse IA illisible" };
  }
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
  options: { extraits?: string[]; extraitLe?: string } = {},
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
      motif,
      extraitLe: options.extraitLe ?? new Date().toISOString(),
      corrigeLe: new Date().toISOString(),
    },
  };
}
