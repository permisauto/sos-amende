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
 *    transporter des métadonnées et des citations déjà publiées ; les
 *    propositions structurées extraites (IA) sont bornées aux verbatims et
 *    leur promotion automatique s'arrête à `PROPOSEE` (décision humaine
 *    obligatoire — cf. `proposerFaillesDepuisExtraction`).
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
  BUDGET_EXTRACTION,
  BUDGET_TEMPS_EXTRACTION_MS,
  SCORE_SEUIL_EXTRACTION,
  composerRegleProposition,
  extraireProposition,
  extractionDispo,
  propositionEchec,
  refPropositionDepuisSource,
  type PropositionVeille,
  type PublicationVeille,
} from "@/lib/veille-extraction";
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
  // Extraction des propositions (règle + articles) sur les publications
  // retenues : best-effort, bornée en nombre et en temps, jamais bloquante
  // — les appels restent stockés au fil de l'eau.
  await extraireApresIngestion();
  return {
    sources,
    totalRetenues: sources.reduce((n, s) => n + s.retenues, 0),
  };
}

// ---------------------------------------------------------------------------
// Extraction des propositions (lot L) : règle dégagée + articles retenus
// ---------------------------------------------------------------------------

export type BilanExtraction = {
  extraites: number;
  incompletes: number;
  echecs: number;
};

const BILAN_VIDE: BilanExtraction = { extraites: 0, incompletes: 0, echecs: 0 };

function publicationDepuisRow(row: SourceJuridique): PublicationVeille {
  return {
    titre: row.titre,
    juridiction: row.juridiction,
    dateSource: row.dateSource ? row.dateSource.toISOString().slice(0, 10) : null,
    ecli: row.ecli,
    url: row.url,
    source: row.source,
    contenu: row.contenu,
    citations: Array.isArray(row.citations) ? (row.citations as string[]) : [],
  };
}

function propositionEnregistree(
  row: SourceJuridique,
): { etat?: string; tentatives?: number } | null {
  return row.proposition as { etat?: string; tentatives?: number } | null;
}

/**
 * Publication éligible à (ré)extraction automatique :
 *  - aucune proposition encore (extraction initiale) ;
 *  - `echec` (relance à chaque passage, tant que l'appel échoue) ;
 *  - `incomplet` **jamais encore retentée** : une seule reprise automatique
 *    (anti ping-pong — au-delà, l'humain reprend la main via le bouton
 *    unitaire ou la correction dans le drawer).
 */
export function estCandidatExtraction(
  p: { etat?: string; tentatives?: number } | null,
): boolean {
  if (!p) return true;
  if (p.etat === "echec") return true;
  if (p.etat === "incomplet" && (p.tentatives ?? 0) < 1) return true;
  return false;
}

/**
 * Extrait la proposition d'une publication et la stocke (`SourceJuridique
 * .proposition`) : état `extrait`/`incomplet`, ou `echec` avec motif pour
 * relance ultérieure. Chaque passage sur une proposition déjà connue
 * incrémente `tentatives` (bornage des reprises automatiques des `incomplet`).
 * Ne lève jamais (null = écriture impossible).
 */
async function extraireEtStocker(
  row: SourceJuridique,
): Promise<PropositionVeille | null> {
  try {
    const avant = propositionEnregistree(row);
    const res = await extraireProposition(publicationDepuisRow(row));
    const proposition: PropositionVeille = res.ok
      ? res.proposition
      : propositionEchec(res.motif);
    if (avant) proposition.tentatives = (avant.tentatives ?? 0) + 1;
    await prisma.sourceJuridique.update({
      where: { id: row.id },
      data: { proposition: proposition as unknown as Prisma.InputJsonValue },
    });
    return proposition;
  } catch (e) {
    console.error(`veille-extraction: ${row.id} impossible`, e);
    return null;
  }
}

/**
 * Extrait les propositions des publications NOUVEAU encore non extraites,
 * en échec, ou incomplètes jamais retentées (`estCandidatExtraction`), mieux
 * scorées d'abord : `limite` au plus, score >= `minScore`, boîte de temps
 * `BUDGET_TEMPS_EXTRACTION_MS`. Sans IA (off/sans clé) : no-op.
 */
export async function extrairePropositionsEnAttente(
  limite = BUDGET_EXTRACTION,
  minScore = SCORE_SEUIL_EXTRACTION,
): Promise<BilanExtraction> {
  const dispo = extractionDispo();
  if (dispo === "off" || dispo === "absent") return { ...BILAN_VIDE };

  let rows: SourceJuridique[];
  try {
    rows = await prisma.sourceJuridique.findMany({
      where: { statut: "NOUVEAU", score: { gte: minScore } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
  } catch (e) {
    console.error("veille-extraction: lecture des candidats impossible", e);
    return { ...BILAN_VIDE };
  }

  const candidats = rows
    .filter((r) => estCandidatExtraction(propositionEnregistree(r)))
    .slice(0, limite);

  const bilan = { ...BILAN_VIDE };
  const fin = Date.now() + BUDGET_TEMPS_EXTRACTION_MS;
  for (const row of candidats) {
    if (Date.now() > fin) break;
    const prop = await extraireEtStocker(row);
    if (prop?.etat === "extrait") bilan.extraites++;
    else if (prop?.etat === "incomplet") bilan.incompletes++;
    else bilan.echecs++;
  }
  // Après chaque lot d'extraction : les propositions complètes non encore
  // liées deviennent des failles PROPOSEE (auto-proposition, cf. plus bas).
  await proposerFaillesDepuisExtraction();
  return bilan;
}

/** Extrait la proposition d'une publication précise (bouton unitaire). */
export async function extrairePropositionSource(
  id: string,
): Promise<{ ok: boolean; proposition?: PropositionVeille; motif?: string }> {
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
  let row: SourceJuridique | null;
  try {
    row = await prisma.sourceJuridique.findUnique({ where: { id } });
  } catch {
    row = null;
  }
  if (!row) return { ok: false, motif: "Publication introuvable." };
  if (row.statut !== "NOUVEAU") {
    return { ok: false, motif: "Publication déjà traitée (promue ou écartée)." };
  }
  const prop = await extraireEtStocker(row);
  if (!prop) return { ok: false, motif: "Extraction impossible (base)." };
  if (prop.etat === "echec") return { ok: false, motif: prop.motif ?? "extraction en échec" };
  await proposerFaillesDepuisExtraction();
  return { ok: true, proposition: prop };
}

// ---------------------------------------------------------------------------
// Auto-proposition de failles (PROPOSEE) — « la veille propose, l'admin tranche »
// ---------------------------------------------------------------------------

/**
 * Titre normalisé pour la déduplication des propositions en attente : casse +
 * espaces réduits, sans ponctuation de fin. Un même arrêt repris par deux
 * extractions successives ne doit jamais produire deux propositions jumelles.
 */
export function normaliserTitreProposition(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Propose **automatiquement** une faille en statut `PROPOSEE` pour chaque
 * publication dont l'extraction est complète (`etat = extrait`) et qui n'est
 * encore liée à aucune faille.
 *
 * Garde-fous (assouplissement documenté de « la veille ne crée jamais de
 * faille » — cf. AGENTS.md) :
 *  - uniquement `PROPOSEE`, jamais `ACTIVE` : le moteur est aveugle à ce
 *    statut et la `templateLettre` reste vide → ni détection ni lettre ;
 *  - seule l'administration tranche (drawer de la veille → flip
 *    `PROPOSEE → ACTIVE`, ou bibliothèque → « Écarter ») ;
 *  - idempotent : liason par `SourceJuridique.failleId` + dédup par titre
 *    normalisé sur les seules `PROPOSEE` en attente ;
 *  - borné (50 par passage), best-effort, ne lève jamais ;
 *  - trace `AutoAlimentationTrace` (`proposition-veille`) si création.
 */
export async function proposerFaillesDepuisExtraction(): Promise<{
  creees: number;
  liees: number;
}> {
  try {
    const propositionComplete = { path: ["etat"], equals: "extrait" } as const;
    const rows = await prisma.sourceJuridique.findMany({
      where: {
        statut: "NOUVEAU",
        failleId: null,
        proposition: propositionComplete,
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
    if (rows.length === 0) return { creees: 0, liees: 0 };

    // Dédup par titre : une proposition en attente déjà posée pour le même
    // objet → on relie la source au lieu de créer un doublon.
    const proposees = await prisma.failleJuridique.findMany({
      where: { statut: "PROPOSEE" },
      select: { id: true, titreFaille: true },
    });
    const parTitre = new Map(
      proposees.map((f) => [normaliserTitreProposition(f.titreFaille), f.id]),
    );

    let creees = 0;
    let liees = 0;
    for (const row of rows) {
      const p = row.proposition as PropositionVeille | null;
      if (!p || p.etat !== "extrait" || !Array.isArray(p.articles)) continue;
      const titre =
        p.titre && p.titre.length >= 5 ? p.titre : row.titre.slice(0, 120);
      const articleLoi = p.articles.join(" ; ");
      if (articleLoi.length < 2) continue; // rien d'invoquable : on retentera
      const cleTitre = normaliserTitreProposition(titre);

      let failleId = parTitre.get(cleTitre);
      if (!failleId) {
        const faille = await prisma.failleJuridique.create({
          data: {
            typeInfraction: p.typeInfraction,
            titreFaille: titre,
            articleLoi,
            regle: composerRegleProposition(p),
            templateLettre: "",
            source: row.url ?? row.archive,
            jurisprudence: [refPropositionDepuisSource(row, p)] as unknown as Prisma.InputJsonValue,
            statut: "PROPOSEE",
          },
        });
        failleId = faille.id;
        parTitre.set(cleTitre, faille.id);
        creees++;
      } else {
        liees++;
      }
      // Update conditionnel : si un autre passage (cron + bouton en parallèle)
      // a déjà lié la source, on ne recolle pas par-dessus.
      await prisma.sourceJuridique.updateMany({
        where: { id: row.id, failleId: null },
        data: { failleId },
      });
    }

    if (creees + liees > 0) {
      await enregistrerTraceAutoAlimentation({
        campagne: "proposition-veille",
        statut: "OK",
        traitees: creees + liees,
        nouvelles: creees,
        detail: `creees=${creees} liees=${liees}`,
      });
    }
    return { creees, liees };
  } catch (e) {
    console.error("veille-extraction: auto-proposition de failles impossible", e);
    return { creees: 0, liees: 0 };
  }
}

/**
 * Invariant « la source suit sa faille » : quand l'admin tranche **depuis la
 * bibliothèque** (valider / écarter / activer une faille liée à une
 * publication), celle-ci quitte la file « À lire » — `NOUVEAU → PROMU`
 * (faille activée) ou `NOUVEAU → ECARTE` (faille écartée). Best-effort et
 * idempotent : ne touche qu'aux sources encore `NOUVEAU`.
 */
export async function synchroniserSourceLiee(
  failleId: string,
  decision: "PROMU" | "ECARTE",
  userId: string,
): Promise<void> {
  try {
    await prisma.sourceJuridique.updateMany({
      where: { failleId, statut: "NOUVEAU" },
      data: { statut: decision, reviewedAt: new Date(), reviewedBy: userId },
    });
  } catch (e) {
    console.error("veille: synchronisation de la source liée impossible", e);
  }
}

/** Extraction automatique post-ingestion : bornée, tracée, best-effort. */
async function extraireApresIngestion(): Promise<void> {
  try {
    const bilan = await extrairePropositionsEnAttente();
    const traitees = bilan.extraites + bilan.incompletes + bilan.echecs;
    if (traitees === 0) return;
    await enregistrerTraceAutoAlimentation({
      campagne: "extraction-veille",
      statut: bilan.echecs === 0 ? "OK" : "ECHEC",
      traitees,
      nouvelles: bilan.extraites,
      detail: `extraites=${bilan.extraites} incompletes=${bilan.incompletes} echecs=${bilan.echecs}`,
    });
  } catch (e) {
    console.error("veille-extraction: extraction automatique impossible", e);
  }
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
