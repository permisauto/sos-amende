/**
 * Parseurs des publications officielles DILA (opendata
 * `echanges.dila.gouv.fr/OPENDATA`) — auto-alimentation §H.
 *
 * Trois formats réels, un seul normalisé :
 *  - `CASS/` (hebdo)  `TEXTE_JURI_JUDI`   : Cour de cassation
 *  - `JADE/` (quotidien) `TEXTE_JURI_ADMIN` : juridictions administratives
 *  - `JORF/` (quotidien) `TEXTE_VERSION` : lois, décrets, arrêtés
 *
 * Ces parseurs sont PURS : ils prennent du XML et rendent un `SourceDila`
 * normalisé. Aucun accès réseau ni base de données ici. Le garde-fou reste
 * entier : on extrait des métadonnées et du texte **réellement publiés**
 * (ECLI, n° d'affaire, ELI Légifrance), jamais une interprétation.
 */

import { extraireTarGz, TAILLE_MAX_ARCHIVE, type EntreeTar } from "@/lib/tar";

export type { EntreeTar };

export type SourceDila = {
  /** Clé de dédup stable : l'ECLI si présent, sinon l'identifiant DILA. */
  cle: string;
  /** Identifiant DILA (JURITEXT…, CETATEXT…, JORFTEXT…). */
  id: string;
  source: "CASS" | "JADE" | "JORF";
  /** ARRET, LOI, DECRET, ARRETE… tel que publié. */
  nature: string;
  titre: string;
  juridiction: string | null;
  /** yyyy-mm-dd. */
  dateDecision: string | null;
  /** n° d'affaire (décision) ou NOR/numéro (texte). */
  reference: string | null;
  ecli: string | null;
  url: string | null;
  /** Texte intégral normalisé (balises retirées, entités décodées). */
  contenu: string;
};

export const LISTINGS_DILA = {
  CASS: "https://echanges.dila.gouv.fr/OPENDATA/CASS/",
  JADE: "https://echanges.dila.gouv.fr/OPENDATA/JADE/",
  JORF: "https://echanges.dila.gouv.fr/OPENDATA/JORF/",
} as const;

export type CodeSource = keyof typeof LISTINGS_DILA;

const RACINE_DECISION = /<TEXTE_JURI_(JUDI|ADMIN)>/;
const RACINE_TEXTE = /<TEXTE_VERSION>/;

/** `TEXTE_JURI_JUDI` = Cour de cassation, `TEXTE_JURI_ADMIN` = ordre administratif. */
const SOURCE_PAR_RACINE: Record<string, "CASS" | "JADE"> = {
  JUDI: "CASS",
  ADMIN: "JADE",
};

// ---------------------------------------------------------------------------
// Utilitaires XML (purs)
// ---------------------------------------------------------------------------

/** Décode les entités XML usuelles rencontrées dans les exports DILA. */
export function decoderEntites(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Contenu de la première occurrence d'une balise (brut, balises incluses). */
export function extraireTag(xml: string, tag: string): string | null {
  const autoFermante = new RegExp(`<${tag}\\s*/>`);
  if (autoFermante.test(xml)) return "";
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * Transforme un fragment XML DILA en texte lisible : `<br/>` et `</p>` en
 * sauts de ligne, autres balises supprimées, entités décodées, espaces
 * normalisés. Les marqueurs DILA `<SM>` (sommaire) et `<TP>` (titre de partie)
 * disparaissent aussi.
 */
export function texteDeXml(inner: string): string {
  return decoderEntites(
    inner
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<\/?(SM|TP)[^>]*>/gi, "")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Raccourci : texte normalisé de la première balise demandée. */
function texteTag(xml: string, tag: string): string | null {
  const inner = extraireTag(xml, tag);
  return inner === null ? null : texteDeXml(inner) || null;
}

function premier(...valeurs: (string | null | undefined)[]): string | null {
  for (const v of valeurs) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function dateIso(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** URL Légifrance d'une décision à partir de son identifiant DILA. */
export function urlDecisionLelegifrance(id: string): string {
  return `https://www.legifrance.gouv.fr/juri/id/${id}`;
}

// ---------------------------------------------------------------------------
// Analyseurs par format
// ---------------------------------------------------------------------------

/**
 * Décisions de justice : `TEXTE_JURI_JUDI` (CASS) et `TEXTE_JURI_ADMIN`
 * (JADE). Mêmes balises de métadonnées aux profondeurs légèrement différentes,
 * d'où l'extraction par nom de balise plutôt que par chemin.
 */
export function analyserDecision(
  xml: string,
  source: "CASS" | "JADE",
): SourceDila | null {
  const id = texteTag(xml, "ID");
  if (!id) return null;

  const ecli = texteTag(xml, "ECLI");
  const reference = premier(
    texteTag(xml, "NUMERO_AFFAIRE"),
    texteTag(xml, "NUMERO"),
  );
  const titre = texteTag(xml, "TITRE") ?? `Décision ${id}`;

  return {
    cle: ecli ?? id,
    id,
    source,
    nature: texteTag(xml, "NATURE") ?? "ARRET",
    titre,
    juridiction: texteTag(xml, "JURIDICTION"),
    dateDecision: dateIso(texteTag(xml, "DATE_DEC")),
    reference,
    ecli,
    url: urlDecisionLelegifrance(id),
    contenu: texteTag(xml, "CONTENU") ?? "",
  };
}

/**
 * Textes legislatifs : `TEXTE_VERSION` (JORF). `ID_ELI` est l'URL
 * pérenne Légifrance du texte — on la conserve telle quelle.
 */
export function analyserTexteJorf(xml: string): SourceDila | null {
  const id = texteTag(xml, "ID");
  if (!id) return null;

  const eli = texteTag(xml, "ID_ELI");
  return {
    cle: id,
    id,
    source: "JORF",
    nature: texteTag(xml, "NATURE") ?? "TEXTE",
    titre:
      texteTag(xml, "TITREFULL") ?? texteTag(xml, "TITRE") ?? `Texte ${id}`,
    juridiction: premier(texteTag(xml, "AUTORITE"), texteTag(xml, "MINISTERE")),
    dateDecision: dateIso(premier(texteTag(xml, "DATE_TEXTE"), texteTag(xml, "DATE_PUBLI"))),
    reference: premier(texteTag(xml, "NOR"), texteTag(xml, "NUM_PARITION")),
    ecli: null,
    url: eli ?? `https://www.legifrance.gouv.fr/jorf/id/${id}`,
    contenu: texteTag(xml, "CONTENU") ?? "",
  };
}

/**
 * Analyse une archive déjà décompressée : aiguille chaque `.xml` vers le bon
 * analyseur d'après sa balise racine. Les `ARTICLE` (un par article, très
 * nombreux et redondants avec le texte complet) sont ignorés — on ingère le
 * texte au bon grain, une seule fois.
 *
 * La source d'une décision est déduite de sa **balise racine**, pas du nom de
 * l'archive : c'est le XML lui-même qui l'authoritative.
 */
export function analyserArchive(
  _code: CodeSource,
  entrees: EntreeTar[] | Buffer,
): SourceDila[] {
  const liste = Array.isArray(entrees) ? entrees : extraireTarGz(entrees);
  const resultats: SourceDila[] = [];
  for (const entree of liste) {
    if (!entree?.chemin?.toLowerCase().endsWith(".xml")) continue;
    const xml = entree.contenu.toString("utf8");

    if (RACINE_TEXTE.test(xml)) {
      const t = analyserTexteJorf(xml);
      if (t) resultats.push(t);
      continue;
    }
    const racine = RACINE_DECISION.exec(xml);
    if (racine) {
      const code = SOURCE_PAR_RACINE[racine[1]];
      if (code) {
        const d = analyserDecision(xml, code);
        if (d) resultats.push(d);
      }
    }
  }
  return resultatosUnique(resultats);
}

/** Dédoublonne par `cle` en conservant l'ordre d'apparition. */
function resultatosUnique(liste: SourceDila[]): SourceDila[] {
  const vus = new Set<string>();
  return liste.filter((s) => {
    if (vus.has(s.cle)) return false;
    vus.add(s.cle);
    return true;
  });
}

/**
 * Résout le code source depuis le nom du fichier d'archive
 * (`CASS_20260914-210916.tar.gz` → `CASS`).
 */
export function sourceDeArchive(nomFichier: string): CodeSource | null {
  const m = nomFichier.match(/^(CASS|JADE|JORF)_/);
  return m ? (m[1] as CodeSource) : null;
}

/** Archive trop grosse ou illisible : on n'ingère pas (garde-fou). */
export function archiveAcceptable(taille: number): boolean {
  return Number.isFinite(taille) && taille > 0 && taille <= TAILLE_MAX_ARCHIVE;
}

/** Raccourci de test/convenience : décompresse puis analyse. */
export function analyserArchiveGz(source: CodeSource, gz: Buffer): SourceDila[] {
  return analyserArchive(source, extraireTarGz(gz));
}

/**
 * Extrait l'état de reprise le plus récent parmi des détails de traces
 * (`AutoAlimentationTrace.detail`), en remontant de la trace la plus
 * récente vers la plus ancienne.
 *
 * Ignore les lignes sans token valide : trace « ECHEC » sans état (répertoire
 * DILA injoignable) et ancien marqueur poison `derniere=aucune` (écrit quand
 * rien n'était à traiter — le traiter comme un marqueur réel faisait
 * reprendre l'ingestion depuis le début de l'historique). Le premier token
 * trouvé est donc toujours un vrai point de reprise.
 *
 * `motif` doit capturer l'état dans le groupe 1 et ne doit pas être global.
 */
export function dernierTokenValide(
  details: readonly (string | null | undefined)[],
  motif: RegExp,
): string | null {
  for (const d of details) {
    if (!d) continue;
    const m = d.match(motif);
    if (m?.[1]) return m[1];
  }
  return null;
}
