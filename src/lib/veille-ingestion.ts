/**
 * Ingestion de la veille juridique DILA (auto-alimentation §H).
 *
 * Ce que fait le cron, pour chaque source surveillée (JADE quotidien, CASS
 * hebdomadaire, JORF quotidien, TA mensuel — cf. `veille-ta.ts`) :
 *   1. lit l'index du répertoire officiel et extrait les noms d'archives ;
 *   2. ignore les archives déjà ingérées (déduplication par nom de fichier) ;
 *   3. télécharge les nouvelles, les décompresse en mémoire, les analyse ;
 *   4. ne conserve que les publications **pertinentes** pour le produit ;
 *   5. déduplique les publications par `cle` (ECLI / id DILA) et écrit une
 *      trace `AutoAlimentationTrace` par source.
 *
 * Garde-fous :
 *  - rien n'est écrit sur disque (décompression en mémoire) ;
 *  - taille d'archive bornée (`TAILLE_MAX_ARCHIVE`) ;
 *  - échec d'une source = échec silencieux pour cette source, les autres
 *    continuent ; le cron ne lève jamais d'erreur ;
 *  - **aucun contenu juridique n'est fabriqué** : ce module ne fait que
 *    transporter des métadonnées et des citations déjà publiées.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { SourceJuridique } from "@/generated/prisma/client";
import {
  analyserArchiveGz,
  archiveAcceptable,
  dernierTokenValide,
  LISTINGS_DILA,
  type CodeSource,
  type SourceDila,
} from "@/lib/veille-dila";
import {
  archiveTaCible,
  lirePublicationsTa,
  MARQUEUR_TA_RE,
  urlArchiveTa,
} from "@/lib/veille-ta";
import {
  estPertinente,
  redigerBrouillonRegle,
  scorerPertinence,
} from "@/lib/veille-perteinence";
import { enregistrerTraceAutoAlimentation } from "@/lib/auto-alimentation";

const TIMEOUT_LISTING_MS = 15_000;
const TIMEOUT_ARCHIVE_MS = 60_000;
/** Le zip mensuel TA fait ~64 Mo : on laisse largement la marge. */
const TIMEOUT_ARCHIVE_TA_MS = 180_000;
export const TAILLE_MAX_ZIP_TA = 200 * 1024 * 1024;

export const SOURCES_VEILLE: CodeSource[] = ["JADE", "CASS", "JORF"];

// ---------------------------------------------------------------------------
// Lecture des index officiels
// ---------------------------------------------------------------------------

/**
 * Extrait les noms d'archives d'un index DILA, triés du plus ancien au plus
 * récent. Les noms portent un horodatage de longueur fixe (`PREFIXE_AAAAMMJJ-HHMMSS`)
 * : le tri lexical donne donc l'ordre chronologique réel.
 */
export function listerArchives(listing: string, code: CodeSource): string[] {
  const re = new RegExp(`(${code}_\\d{8}-\\d{6}\\.tar\\.gz)`, "g");
  const vus = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(listing)) !== null) vus.add(m[1]);
  return [...vus].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function recupererListing(code: CodeSource): Promise<string[]> {
  try {
    const res = await fetch(LISTINGS_DILA[code], {
      signal: AbortSignal.timeout(TIMEOUT_LISTING_MS),
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return [];
    return listerArchives(await res.text(), code);
  } catch {
    return [];
  }
}

/** Token de reprise attendu dans le détail d'une trace : la dernière archive réellement ingérée. */
const MARQUEUR_ARCHIVE_RE = /derniere=([A-Z]+_\d{8}-\d{6}\.tar\.gz)/;

/**
 * Archive déjà ingérée, d'après les traces récentes de cette source. On
 * remonte jusqu'au premier token valide : une trace « ECHEC » sans token
 * (index injoignable) ou l'ancien marqueur `derniere=aucune` ne doit pas
 * écraser le vrai point de reprise — au risque de sauter des archives ou de
 * reprendre l'ingestion depuis le début de l'historique.
 */
export async function derniereArchiveTraitee(code: CodeSource): Promise<string | null> {
  try {
    const traces = await prisma.autoAlimentationTrace.findMany({
      where: { campagne: `veille-dila:${code}` },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { detail: true },
    });
    return dernierTokenValide(
      traces.map((t) => t.detail),
      MARQUEUR_ARCHIVE_RE,
    );
  } catch {
    return null;
  }
}

/**
 * Archives à traiter : celles postérieures à la dernière ingérée, dans la
 * limite de `maxArchives` (une coupure réseau ne doit pas faire télécharger
 * plusieurs mois d'archives d'un coup).
 */
export function archivesATraiter(
  archives: string[],
  derniere: string | null,
  maxArchives = 3,
): string[] {
  const candidates = derniere
    ? archives.filter((a) => a.localeCompare(derniere, undefined, { numeric: true }) > 0)
    : archives.slice(-1);
  return candidates.slice(0, maxArchives);
}

export async function telechargerArchive(
  code: CodeSource,
  nom: string,
): Promise<Buffer | null> {
  try {
    const res = await fetch(`${LISTINGS_DILA[code]}${nom}`, {
      signal: AbortSignal.timeout(TIMEOUT_ARCHIVE_MS),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return archiveAcceptable(buf.length) ? buf : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

function dateIsoOuNull(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Enregistre une publication pertinente, ou `null` si déjà connue. */
export async function enregistrerSource(
  source: SourceDila,
  archive: string,
): Promise<SourceJuridique | null> {
  const p = scorerPertinence(source);
  if (!estPertinente(p)) return null;

  const data = {
    cle: source.cle,
    idDila: source.id,
    source: source.source,
    nature: source.nature,
    titre: source.titre,
    juridiction: source.juridiction,
    dateSource: dateIsoOuNull(source.dateDecision),
    reference: source.reference,
    ecli: source.ecli,
    url: source.url,
    contenu: source.contenu,
    citations: p.citations as unknown as Prisma.InputJsonValue,
    matchsCore: p.matchsCore as unknown as Prisma.InputJsonValue,
    matchsAppui: p.matchsAppui as unknown as Prisma.InputJsonValue,
    score: p.score,
    brouillonRegle: redigerBrouillonRegle(source, p),
    archive,
  };

  try {
    // `cle` est unique : une republication de la même décision est ignorée.
    return await prisma.sourceJuridique.create({ data });
  } catch {
    return null;
  }
}

export type BilanSource = {
  source: CodeSource | "TA";
  archives: number;
  archive: string | null;
  publiees: number;
  retenues: number;
  erreur: string | null;
};

/**
 * Ingère une source : liste, télécharge les nouvelles archives, enregistre
 * les publications pertinentes, trace. Ne lève jamais.
 */
export async function ingererSource(code: CodeSource): Promise<BilanSource> {
  const bilan: BilanSource = {
    source: code,
    archives: 0,
    archive: null,
    publiees: 0,
    retenues: 0,
    erreur: null,
  };

  // Point de reprise lu AVANT l'index : il doit figurer dans tous les types
  // de trace (y compris « index injoignable »), sinon une coupure réseau
  // efface le marqueur et les archives intermédiaires sont sautées.
  const derniere = await derniereArchiveTraitee(code);

  const listing = await recupererListing(code);
  if (listing.length === 0) {
    bilan.erreur = "index injoignable";
    bilan.archive = derniere;
    await enregistrerTraceAutoAlimentation({
      campagne: `veille-dila:${code}`,
      statut: "ECHEC",
      traitees: 0,
      nouvelles: 0,
      detail: `0 archive(s), derniere=${derniere ?? "aucune"}, 0 publication(s) — ERREUR: index injoignable`,
    });
    return bilan;
  }

  const aTraiter = archivesATraiter(listing, derniere);
  bilan.archives = aTraiter.length;

  for (const nom of aTraiter) {
    const gz = await telechargerArchive(code, nom);
    if (!gz) {
      // Échec de téléchargement (transitoire la plupart du temps) : on arrête
      // le lot SANS avancer le marqueur — le point de reprise reste au dernier
      // lot réussi et l'archive ratée sera reprise au prochain passage. Une
      // archive sautée au milieu serait perdue définitivement.
      bilan.erreur = `archive ${nom} illisible ou trop grosse`;
      break;
    }
    let publications: SourceDila[] = [];
    try {
      publications = analyserArchiveGz(code, gz);
    } catch (e) {
      // Archive corrompue : on la marque traitée (inutile de la revoir) et on
      // continue — se bloquer dessus arrêterait toute ingestion future.
      bilan.erreur = `analyse ${nom} impossible — archive sautée`;
      console.error("veille-dila: archive illisible", nom, e);
    }
    bilan.publiees += publications.length;
    for (const p of publications) {
      if (await enregistrerSource(p, nom)) bilan.retenues += 1;
    }
    // Marqueur avancé seulement après téléchargement réussi de l'archive
    // (jamais avant : un simple échec réseau ne doit pas la marquer traitée).
    bilan.archive = nom;
  }

  await enregistrerTraceAutoAlimentation({
    campagne: `veille-dila:${code}`,
    statut: bilan.erreur ? "ECHEC" : "OK",
    traitees: bilan.publiees,
    nouvelles: bilan.retenues,
    detail: `${bilan.archives} archive(s), derniere=${
      bilan.archive ?? derniere ?? "aucune"
    }, ${bilan.retenues} publication(s) pertinente(s)${
      bilan.erreur ? ` — ERREUR: ${bilan.erreur}` : ""
    }`,
  });

  return bilan;
}

export type BilanVeille = {
  sources: BilanSource[];
  totalRetenues: number;
};

// ---------------------------------------------------------------------------
// Source TA (tribunaux administratifs, zip mensuel)
// ---------------------------------------------------------------------------

/** Dernière archive mensuelle réellement ingérée (`TA_AAAAMM.zip`), ou null. */
export async function derniereArchiveTa(): Promise<string | null> {
  try {
    const traces = await prisma.autoAlimentationTrace.findMany({
      where: { campagne: "veille-ta" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { detail: true },
    });
    return dernierTokenValide(
      traces.map((t) => t.detail),
      MARQUEUR_TA_RE,
    );
  } catch {
    return null;
  }
}

/**
 * Ingère le zip mensuel des TA, **une fois par mois, à partir du 8ᵉ jour**
 * (`archiveTaCible`) et seulement s'il n'a pas déjà été traité (marqueur
 * `derniere=`). Aucune trace hors fenêtre ni quand le mois est déjà ingéré :
 * les traces ne disent que ce qui s'est réellement passé (téléchargement ou
 * échec), utile pour l'encart « Dernières campagnes ».
 *
 * Journalisme ligne à ligne (générateur) : chaque XML est scoré et éventuel-
 * lement persisté avant d'en lire un autre — jamais les 19 000 en mémoire.
 * Ne lève jamais : échec réseau = trace ECHEC **sans** avancer le marqueur
 * (le zip sera retéléchargé au prochain passage), analyse corrompue = trace
 * ECHEC (le mois ne sera pas repassé, à reprendre à la main si besoin).
 */
export async function ingererSourceTa(): Promise<BilanSource> {
  const bilan: BilanSource = {
    source: "TA",
    archives: 0,
    archive: null,
    publiees: 0,
    retenues: 0,
    erreur: null,
  };

  const cible = archiveTaCible(new Date());
  if (!cible) return bilan; // jours 1→7 : zip pas encore stabilisé
  const derniere = await derniereArchiveTa();
  if (cible === derniere) return bilan; // mois déjà ingéré

  let zip: Buffer | null = null;
  try {
    const res = await fetch(urlArchiveTa(cible), {
      signal: AbortSignal.timeout(TIMEOUT_ARCHIVE_TA_MS),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= TAILLE_MAX_ZIP_TA) zip = buf;
    }
  } catch {
    zip = null;
  }

  if (!zip) {
    bilan.erreur = `archive ${cible} illisible ou trop grosse`;
    await enregistrerTraceAutoAlimentation({
      campagne: "veille-ta",
      statut: "ECHEC",
      traitees: 0,
      nouvelles: 0,
      detail: `0 archive(s), derniere=${derniere ?? "aucune"}, 0 publication(s) — ERREUR: ${bilan.erreur}`,
    });
    return bilan;
  }

  bilan.archives = 1;
  try {
    for (const pub of lirePublicationsTa(zip)) {
      bilan.publiees += 1;
      if (await enregistrerSource(pub, cible)) bilan.retenues += 1;
    }
  } catch (e) {
    console.error("veille-ta: archive illisible", cible, e);
    bilan.erreur = `analyse ${cible} impossible — archive non marquée traitée`;
  }
  // Marqueur avancé seulement si l'archive a été lue en entier : sur un zip
  // corrompu, le mois reste à reprendre.
  if (!bilan.erreur) bilan.archive = cible;

  await enregistrerTraceAutoAlimentation({
    campagne: "veille-ta",
    statut: bilan.erreur ? "ECHEC" : "OK",
    traitees: bilan.publiees,
    nouvelles: bilan.retenues,
    detail: `${bilan.archives} archive(s), derniere=${
      bilan.archive ?? derniere ?? "aucune"
    }, ${bilan.retenues} publication(s) pertinente(s)${
      bilan.erreur ? ` — ERREUR: ${bilan.erreur}` : ""
    }`,
  });

  return bilan;
}

/** Exécution complète : les 3 sources quotidiennes DILA, puis la source TA. */
export async function executerVeilleDila(
  filtre?: ReadonlySet<string>,
): Promise<BilanVeille> {
  const sources: BilanSource[] = [];
  for (const code of SOURCES_VEILLE) {
    if (filtre && !filtre.has(code)) continue;
    sources.push(await ingererSource(code));
  }
  if (!filtre || filtre.has("TA")) sources.push(await ingererSourceTa());
  return {
    sources,
    totalRetenues: sources.reduce((n, s) => n + s.retenues, 0),
  };
}

// ---------------------------------------------------------------------------
// Digest hebdomadaire
// ---------------------------------------------------------------------------

export type LigneDigest = {
  titre: string;
  source: string;
  score: number;
  resume: string;
  url: string | null;
};

/**
 * Sources NOUVEAU des `jours` derniers jours, triées par score décroissant.
 * Utilisé par le digest e-mail et par la page « Veille ».
 */
export async function sourcesNouvelles(jours = 7, limite = 50): Promise<LigneDigest[]> {
  const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000);
  try {
    const rows = await prisma.sourceJuridique.findMany({
      where: { statut: "NOUVEAU", createdAt: { gte: depuis } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: limite,
      select: {
        titre: true,
        source: true,
        score: true,
        citations: true,
        url: true,
      },
    });
    return rows.map((r) => {
      const citations = Array.isArray(r.citations) ? (r.citations as string[]) : [];
      return {
        titre: r.titre,
        source: r.source,
        score: r.score,
        resume: citations[0] ?? "Aucun passage retenu.",
        url: r.url,
      };
    });
  } catch (e) {
    console.error("veille-dila: lecture des sources nouvelles impossible", e);
    return [];
  }
}
