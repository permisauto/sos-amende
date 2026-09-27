/**
 * Veille juridique quotidienne (auto-alimentation §H) : surveille les
 * publications officielles et signale à l'équipe toute nouvelle édition du
 * Journal officiel de la République française (JORF).
 *
 * Source réelle : le répertoire opendata DILA/JORF (echanges.dila.gouv.fr),
 * dont chaque édition est un fichier `JORF_<AAAAMMJJ>-<HHMMSS>.tar.gz`. On ne
 * télécharge AUCUN archive (fichiers lourds, inadaptés à un cron serverless) :
 * on lit seulement l'index du répertoire pour détecter l'édition la plus
 * récente. La veille ne crée JAMAIS de faille automatiquement à partir d'un
 * texte interprété (garde-fou anti-hallucination) : elle alerte l'équipe
 * (admin) pour qu'elle vérifie si un texte récent modifie les failles
 * applicables, et laisse les propositions du catalogue à la validation humain.
 */

import { prisma } from "@/lib/prisma";

export const JORF_LISTING_URL = "https://echanges.dila.gouv.fr/OPENDATA/JORF/";

export type EditionJorf = {
  dateEdition: string; // AAAAMMJJ (parution du journal)
  heureEdition: string; // HHMMSS
  fichier: string; // JORF_20260611-215545.tar.gz — identifiant unique et comparable
};

const FETCH_TIMEOUT_MS = 10_000;
const EDITION_RE = /JORF_(\d{8})-(\d{6})\.tar\.gz/g;

/**
 * Extrait la dernière édition JORF présente dans l'index du répertoire
 * (listing texte). Fonction pure, testée. Toutes les éditions portent un
 * préfixe de longueur fixe : la comparaison lexicale du nom de fichier donne
 * bien le « dernier » Journal officiel publié.
 */
export function extraireDerniereEditionJorf(listing: string): EditionJorf | null {
  let meilleure: EditionJorf | null = null;
  const re = new RegExp(EDITION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(listing)) !== null) {
    const dateEdition = m[1];
    const heureEdition = m[2];
    const fichier = m[0];
    if (
      !meilleure ||
      fichier.localeCompare(meilleure.fichier, undefined, { numeric: true }) > 0
    ) {
      meilleure = { dateEdition, heureEdition, fichier };
    }
  }
  return meilleure;
}

/**
 * Formate une édition JORF pour un affichage humain (ex. « 11/06/2026 à 21h55 »).
 * Fonction pure, testée.
 */
export function formaterEditionJorf(e: EditionJorf): string {
  const d = e.dateEdition;
  const h = e.heureEdition;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)} à ${h.slice(0, 2)}h${h.slice(2, 4)}`;
}

/**
 * Télécharge l'index du répertoire JORF et retourne la dernière édition publiée.
 * Best-effort : en cas d'erreur réseau ou de format inattendu, retourne null
 * (ne fait jamais échouer le cron).
 */
export async function recupererDerniereEditionJorf(): Promise<EditionJorf | null> {
  try {
    const res = await fetch(JORF_LISTING_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return null;
    return extraireDerniereEditionJorf(await res.text());
  } catch {
    return null;
  }
}

/**
 * Token d'identification d'une édition persisté dans la trace
 * `AutoAlimentationTrace` (« veille-jorf », champ detail).
 */
export function tokenEditionJorf(e: EditionJorf): string {
  return `edition=${e.fichier}`;
}

/**
 * Lit la dernière édition JORF connue (issue de la dernière trace veille-jorf).
 */
async function derniereEditionConnue(): Promise<string | null> {
  try {
    const trace = await prisma.autoAlimentationTrace.findFirst({
      where: { campagne: "veille-jorf" },
      orderBy: { createdAt: "desc" },
      select: { detail: true },
    });
    const m = trace?.detail?.match(/edition=([^\s]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Synchronisation quotidienne de la veille JORF : lit l'index officiel,
 * compare à la dernière édition connue, enregistre une trace
 * `AutoAlimentationTrace`. Retourne true si une nouvelle édition a été
 * détectée depuis la dernière exécution (pour déclencher la notification).
 * Bienveillant : source injoignable → trace ECHEC, pas d'erreur levée.
 */
export async function synchroniserVeilleJorf(): Promise<{
  edition: EditionJorf | null;
  nouvelle: boolean;
}> {
  const edition = await recupererDerniereEditionJorf();
  if (!edition) {
    try {
      await prisma.autoAlimentationTrace.create({
        data: {
          campagne: "veille-jorf",
          statut: "ECHEC",
          detail: "répertoire JORF injoignable",
        },
      });
    } catch {
      /* trace best-effort */
    }
    return { edition: null, nouvelle: false };
  }

  const connue = await derniereEditionConnue();
  // Première exécution : on enregistre l'édition de référence sans alerter —
  // il n'y a pas encore de « nouvelle » édition à signaler.
  const nouvelle = connue !== null && edition.fichier !== connue;
  try {
    await prisma.autoAlimentationTrace.create({
      data: {
        campagne: "veille-jorf",
        statut: "OK",
        traitees: 1,
        nouvelles: nouvelle ? 1 : 0,
        detail: `${tokenEditionJorf(edition)} (${formaterEditionJorf(edition)}${nouvelle ? " — NOUVELLE édition détectée" : ""})`,
      },
    });
  } catch {
    /* trace best-effort */
  }
  return { edition, nouvelle };
}