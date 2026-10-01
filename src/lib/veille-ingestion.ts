/**
 * Ingestion de la veille juridique DILA (auto-alimentation §H).
 *
 * Ce que fait le cron, pour chaque source surveillée (JADE quotidien, CASS
 * hebdomadaire, JORF quotidien) :
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
  LISTINGS_DILA,
  type CodeSource,
  type SourceDila,
} from "@/lib/veille-dila";
import {
  estPertinente,
  redigerBrouillonRegle,
  scorerPertinence,
} from "@/lib/veille-perteinence";
import { enregistrerTraceAutoAlimentation } from "@/lib/auto-alimentation";

const TIMEOUT_LISTING_MS = 15_000;
const TIMEOUT_ARCHIVE_MS = 60_000;

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

/** Archive déjà ingérée, d'après la dernière trace de cette source. */
export async function derniereArchiveTraitee(code: CodeSource): Promise<string | null> {
  try {
    const trace = await prisma.autoAlimentationTrace.findFirst({
      where: { campagne: `veille-dila:${code}` },
      orderBy: { createdAt: "desc" },
      select: { detail: true },
    });
    return trace?.detail?.match(/derniere=([^\s]+)/)?.[1] ?? null;
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
  source: CodeSource;
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

  const listing = await recupererListing(code);
  if (listing.length === 0) {
    bilan.erreur = "index injoignable";
    return bilan;
  }

  const derniere = await derniereArchiveTraitee(code);
  const aTraiter = archivesATraiter(listing, derniere);
  bilan.archives = aTraiter.length;

  for (const nom of aTraiter) {
    bilan.archive = nom;
    const gz = await telechargerArchive(code, nom);
    if (!gz) {
      bilan.erreur = `archive ${nom} illisible ou trop grosse`;
      continue;
    }
    let publications: SourceDila[];
    try {
      publications = analyserArchiveGz(code, gz);
    } catch (e) {
      bilan.erreur = `analyse ${nom} impossible`;
      console.error("veille-dila: archive illisible", nom, e);
      continue;
    }
    bilan.publiees += publications.length;
    for (const p of publications) {
      if (await enregistrerSource(p, nom)) bilan.retenues += 1;
    }
  }

  await enregistrerTraceAutoAlimentation({
    campagne: `veille-dila:${code}`,
    statut: bilan.erreur ? "ECHEC" : "OK",
    traitees: bilan.publiees,
    nouvelles: bilan.retenues,
    detail: `${bilan.archives} archive(s), derniere=${
      bilan.archive ?? "aucune"
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

/** Exécution complète : toutes les sources surveillées, en série. */
export async function executerVeilleDila(
  filtre?: ReadonlySet<string>,
): Promise<BilanVeille> {
  const sources: BilanSource[] = [];
  for (const code of SOURCES_VEILLE) {
    if (filtre && !filtre.has(code)) continue;
    sources.push(await ingererSource(code));
  }
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
