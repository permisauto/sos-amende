import { z } from "zod";
import { appelerGeminiJson } from "@/lib/ia-gemini";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";

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
  /** Pourquoi incomplet/échec — affiché à l'admin. */
  motif?: string;
  /**
   * D'où vient la proposition : `ia` (Gemini ou simulation de dev/E2E) ou
   * `locale` (extraction déterministe de secours, sans appel réseau — utilisée
   * quand l'IA est coupée, sans clé, ou en échec 429/503). Absent = `ia`
   * (propositions stockées avant cette distinction).
   */
  methode?: "ia" | "locale";
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
  motifDecisif: z.string().max(700).default(""),
  obsolescence: z.string().max(400).default(""),
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
    '{"titre":"...","typeInfraction":"AMENDE|SUSPENSION","articles":["..."],"regle":"...","conditions":["..."],"resume":"...","extraits":["..."],"motifDecisif":"...","obsolescence":"..."}',
    "",
    "Règles absolues :",
    '1. articles : UNIQUEMENT les articles EXPLICITEMENT cités dans le document fourni, recopiés tels quels (ex. "C. route, art. L. 224-16"). Max 3. Jamais d\'article inventé, induit ou général.',
    "2. regle : en 2 à 4 phrases, ce que cette décision ou ce texte RETIENT (la solution retenue par la juridiction, le motif de la décision), uniquement à partir du document fourni. Aucun avis personnel, aucune prédiction.",
    '3. conditions : 2 à 5 conditions d\'application PRÉCISES de la règle — ce qu\'il faut que le cas d\'espèce vérifie pour que la règle joue (fait, délai, vice, qualité de la personne…) — recopiées mot pour mot dans le document (mêmes exigences de verbatim que les extraits). Si aucune condition n\'est textuellement dans le document, renvoie un tableau vide.',
    "4. resume : une phrase sur l'objet du litige ou la portée.",
    "5. extraits : 1 à 3 citations VERBATIM (20 à 400 caractères, recopiées mot pour mot) du document qui fondent la règle.",
    "6. typeInfraction : SUSPENSION si la décision porte sur le permis de conduire (suspension, invalidation, annulation, retrait de points, stage…) ; sinon AMENDE.",
    '7. Si le document ne permet pas d\'identifier au moins un article cité et une règle : renvoie {"titre":"...","typeInfraction":"...","articles":[],"regle":"","conditions":[],"resume":"","extraits":[],"motifDecisif":"","obsolescence":""} — n\'invente jamais.',
    '8. motifDecisif : le passage VERBATIM (20 à 600 caractères, recopié mot pour mot) où la juridiction énonce le motif décisif de sa décision (l\'attendu ou le considérant qui fonde la solution). Si aucun passage distinct ne se détache du texte, renvoie "".',
    '9. obsolescence : si la DATE du document est manifestement antérieure à une réforme connue du régime traité, une phrase courte de mise en garde pour l\'administrateur ; sinon "". N\'affirme aucune réforme qui n\'apparaît pas au document lui-même.',
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
  // Motif décisif simulé : première citation suffisamment longue réellement
  // présente dans le contenu (passe le garde-fou verbatim du parser).
  const motifDecisif = pub.citations.find(
    (c) => c.trim().length >= 20 && contenuVerbatim(pub.contenu, c),
  );
  // Obsolescence simulée et déterministe : décision datant d'avant 2020 →
  // drapeau testable en E2E sans appel réseau.
  const annee = pub.dateSource
    ? Number.parseInt(pub.dateSource.slice(0, 4), 10)
    : Number.NaN;
  const obsolescence =
    Number.isFinite(annee) && annee < 2020
      ? `Décision de ${annee} : vérifier qu'aucune réforme postérieure n'a modifié le régime applicable avant de l'invoquer.`
      : undefined;
  return JSON.stringify({
    titre: pub.titre.slice(0, 120),
    typeInfraction,
    articles,
    regle: `Simulation (mock) : la juridiction retient que ${citation}`,
    conditions,
    resume: `Simulation (mock) : ${pub.titre.slice(0, 120)}`,
    extraits: pub.citations.slice(0, 2),
    motifDecisif: motifDecisif ? motifDecisif.trim().slice(0, 600) : "",
    obsolescence: obsolescence ?? "",
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
  return JSON.stringify({
    titre: pub.titre.slice(0, 120),
    typeInfraction,
    articles,
    regle: `Extraction locale (sans IA) — citation de tête retenue : « ${citation} »`,
    conditions,
    resume: `Extraction locale (sans IA) : ${pub.titre.slice(0, 120)}`,
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
    const prop = parserExtraction(extractionMock(pub), pub.contenu);
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
    const prop = parserExtraction(appel.texte, pub.contenu);
    if (prop) return { ok: true, proposition: prop };
  }
  // IA en échec (429 quota, 503, réponse illisible…) : le secours local
  // garantit une proposition immédiate — l'étiquette UI « locale » et le
  // libellé de la règle signalent le repli à l'admin.
  return secoursLocal(pub);
}

/** Parse la réponse locale et l'étiquette `methode: "locale"`. */
function secoursLocal(pub: PublicationVeille): ResultatExtraction {
  const prop = parserExtraction(extractionLocale(pub), pub.contenu);
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
