// Auto-alimentation de la base juridique : synchronise la table
// `FailleJuridique` avec le catalogue sourcé (recherche documentaire,
// FAILLES.md §H). Idempotente et sans danger : elle insère / met à jour les
// entrées du catalogue en statut PROPOSEE — jamais ACTIVE, jamais utilisée par
// le moteur.
//
// Deux chemins :
//   • **automatique** (cron `/api/cron/auto-alimentation`, ouverture de la page
//     bibliothèque) : reste en PROPOSEE — aucune activation sans geste humain ;
//   • **manuel admin** (bouton « Synchroniser et activer »,
//     `importerFaillesDepuisSources`) : synchronise puis passe en ACTIVE toutes
//     les propositions complètes via `activerPropositionsCompletes` — les
//     incomplètes (règle ou lettre à rédiger) restent en PROPOSEE.
//
// Dans les deux cas : jamais de rétrogradation (un INACTIVE reste écarté, un
// ACTIVE conserve son statut).

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CATALOGUE_SOURCES } from "@/lib/catalogue-sources";
import { synchroniserVeilleJorf } from "@/lib/veille-juridique";

/**
 * Synchronise la base juridique avec le catalogue sourcé. Toutes les entrées
 * sont upsertées en PROPOSEE (création ou mise à jour du contenu). Une faille
 * déjà ACTIVE/INACTIVE garde son statut — la synchronisation ne rétrograde
 * jamais une validation admin.
 *
 * Retourne le nombre d'entrées du catalogue traitées.
 * Résilient : si DB down, log et retourne 0 (mock gère l'affichage).
 */
export async function synchroniserCatalogue(): Promise<number> {
  let count = 0;
  try {
    for (const f of CATALOGUE_SOURCES) {
      const existing = await prisma.failleJuridique.findUnique({
        where: { id: f.id },
        select: { statut: true, regle: true },
      });
      if (existing?.statut === "INACTIVE") {
        continue;
      }
      if (existing?.statut === "ACTIVE") {
        if (!existing.regle) {
          await prisma.failleJuridique.update({
            where: { id: f.id },
            data: { regle: f.regle },
          });
          count += 1;
        }
        continue;
      }
      // Proposition encore incomplète dans le catalogue (`aCompleter` : article
      // et template vides) : si elle existe déjà en base, on ne réécrit JAMAIS
      // son contenu — l'admin peut l'avoir complétée manuellement (sourcer
      // l'article, rédiger le template) ; le catalogue vide l'écraserait.
      if (existing && f.aCompleter) continue;

      const data = {
        typeInfraction: f.typeInfraction,
        titreFaille: f.titreFaille,
        articleLoi: f.articleLoi,
        regle: f.regle,
        templateLettre: f.templateLettre,
        source: f.source,
        reglesDetection: f.reglesDetection as Prisma.InputJsonValue,
        jurisprudence: f.jurisprudence as Prisma.InputJsonValue,
      };

      await prisma.failleJuridique.upsert({
        where: { id: f.id },
        update: { ...data, statut: "PROPOSEE" },
        create: { ...data, id: f.id, statut: "PROPOSEE" },
      });
      count += 1;
    }
  } catch (e) {
    console.error("synchroniserCatalogue: DB indisponible, mock utilisé", e);
    // En mode dégradé, le mock affiche déjà les 28 failles du catalogue
    return 0;
  }
  return count;
}

/**
 * Option B de l'auto-alimentation : détecter les **écarts** entre le contenu
 * sourcé du catalogue et une faille déjà en base. `synchroniserCatalogue`
 * ne met jamais à jour le contenu d'une faille ACTIVE (cela écraserait une
 * validation admin) : les évolutions du catalogue restent donc invisibles.
 * On les rend ici lisibles, et l'admin les applique **explicitement**.
 *
 * Jamais de rétrogradation : une faille écartée (INACTIVE) n'est jamais
 * signalée comme « mise à jour disponible ».
 */
export type ChampEcart = { champ: string; actuel: string; propose: string };

export type EcartCatalogue = {
  id: string;
  titreFaille: string;
  typeInfraction: string;
  statut: string;
  champs: ChampEcart[];
};

/** Ligne de base minimale pour la comparaison. */
export type LigneBase = {
  id: string;
  titreFaille: string;
  articleLoi: string;
  regle: string | null;
  templateLettre: string;
  source: string | null;
  statut: string;
  reglesDetection: unknown;
  jurisprudence: unknown;
};

const CHAMPS_TEXTUELS = [
  "titreFaille",
  "articleLoi",
  "regle",
  "templateLettre",
  "source",
] as const;

const CHAMPS_JSON = ["reglesDetection", "jurisprudence"] as const;

const LIBELLES_CHAMPS: Record<string, string> = {
  titreFaille: "Titre de la faille",
  articleLoi: "Article de loi",
  regle: "Règle dégagée",
  templateLettre: "Template de lettre",
  source: "Source",
  reglesDetection: "Règles de détection",
  jurisprudence: "Jurisprudence",
};

/** JSON canonicalisé (clés triées) : la lecture jsonb réordonne les clés. */
function stable(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(stable);
  if (valeur && typeof valeur === "object") {
    return Object.fromEntries(
      Object.keys(valeur as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((valeur as Record<string, unknown>)[k])]),
    );
  }
  return valeur;
}

function canonique(valeur: unknown): string {
  if (typeof valeur === "string") return valeur.trim();
  if (valeur === null || valeur === undefined) return "";
  return JSON.stringify(stable(valeur));
}

export function detecterMisesAJourCatalogue(
  catalogue: readonly (typeof CATALOGUE_SOURCES)[number][],
  lignes: readonly LigneBase[],
): EcartCatalogue[] {
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const ecarts: EcartCatalogue[] = [];

  for (const entree of catalogue) {
    const ligne = parId.get(entree.id);
    if (!ligne || ligne.statut === "INACTIVE") continue;
    // Source incomplète : rien d'applicable (article/template vides) — signaler
    // un écart proposant du vide reviendrait à inviter à écraser une complétion
    // manuelle de l'admin.
    if (entree.aCompleter) continue;

    const champs: ChampEcart[] = [];
    for (const nom of CHAMPS_TEXTUELS) {
      const actuel = canonique(ligne[nom]);
      const propose = canonique(entree[nom]);
      if (actuel !== propose) {
        champs.push({
          champ: LIBELLES_CHAMPS[nom] ?? nom,
          actuel,
          propose,
        });
      }
    }
    for (const nom of CHAMPS_JSON) {
      const actuel = canonique(ligne[nom]);
      const propose = canonique(entree[nom]);
      if (actuel !== propose) {
        champs.push({
          champ: LIBELLES_CHAMPS[nom] ?? nom,
          actuel,
          propose,
        });
      }
    }

    if (champs.length > 0) {
      ecarts.push({
        id: entree.id,
        titreFaille: entree.titreFaille,
        typeInfraction: entree.typeInfraction,
        statut: ligne.statut,
        champs,
      });
    }
  }

  return ecarts;
}

/**
 * Lit la base et retourne les failles du catalogue dont le contenu a évolué
 * (vide si la DB est indisponible). À afficher à l'admin sur la bibliothèque.
 */
export async function listerMisesAJourCatalogue(): Promise<EcartCatalogue[]> {
  try {
    const lignes: LigneBase[] = await prisma.failleJuridique.findMany({
      where: { id: { in: CATALOGUE_SOURCES.map((f) => f.id) } },
      select: {
        id: true,
        titreFaille: true,
        articleLoi: true,
        regle: true,
        templateLettre: true,
        source: true,
        statut: true,
        reglesDetection: true,
        jurisprudence: true,
      },
    });
    return detecterMisesAJourCatalogue(CATALOGUE_SOURCES, lignes);
  } catch (e) {
    console.error("listerMisesAJourCatalogue: DB indisponible", e);
    return [];
  }
}

/**
 * Enregistre une trace d'une exécution de l'auto-alimentation (campagne
 * « catalogue » ou « veille-jorf ») dans `AutoAlimentationTrace`. Best-effort :
 * jamais bloquant.
 */
export async function enregistrerTraceAutoAlimentation(opts: {
  campagne: string;
  statut: string;
  traitees?: number;
  nouvelles?: number;
  detail?: string;
}): Promise<void> {
  try {
    await prisma.autoAlimentationTrace.create({
      data: {
        campagne: opts.campagne,
        statut: opts.statut,
        traitees: opts.traitees ?? 0,
        nouvelles: opts.nouvelles ?? 0,
        detail: opts.detail ?? null,
      },
    });
  } catch {
    /* trace best-effort : ne bloque jamais le cron */
  }
}

/**
 * Exécution quotidienne de l'auto-alimentation (Vercel Cron
 * `/api/cron/auto-alimentation`) :
 *  1. synchronise le catalogue sourcé en statut PROPOSEE (le cron n'active
 *     **jamais** : seule la synchronisation manuelle de l'admin, « Synchroniser
 *     et activer », passe en ACTIVE) et trace le passage ;
 *  2. veille juridique : détecte les nouvelles éditions du JORF et les trace.
 *
 * L'ingestion du **contenu** des publications (décisions, textes) est une
 * étape distincte : voir `executerVeilleDila` / `/api/cron/veille-dila`, et le
 * digest hebdomadaire `/api/cron/digest-veille`. L'ancien e-mail quotidien
 * « nouvelle édition du JORF » a été supprimé : le JORF paraît tous les jours,
 * l'alerte quotidienne n'était pas actionnable.
 *
 * Retourne un résumé exploitable par la route cron.
 */
export async function executerAutoAlimentation(): Promise<{
  catalogue: number;
  veilleEdition: string | null;
  veilleNouvelle: boolean;
}> {
  let catalogue = 0;
  try {
    catalogue = await synchroniserCatalogue();
    // Option B : on signale (sans rien appliquer) les failles dont le contenu
    // source a évolué — l'admin les applique depuis la bibliothèque.
    const misesAJour = await listerMisesAJourCatalogue();
    await enregistrerTraceAutoAlimentation({
      campagne: "catalogue",
      statut: "OK",
      traitees: catalogue,
      detail: `${catalogue} entrée(s) du catalogue synchronisée(s) en PROPOSEE ; ${misesAJour.length} mise(s) à jour disponible(s) en attente d'application manuelle.`,
    });
  } catch (e) {
    console.error("executerAutoAlimentation: échec synchronisation catalogue", e);
    await enregistrerTraceAutoAlimentation({
      campagne: "catalogue",
      statut: "ECHEC",
      detail: "erreur pendant la synchronisation du catalogue",
    });
  }

  const veille = await synchroniserVeilleJorf();

  return {
    catalogue,
    veilleEdition: veille.edition ? veille.edition.fichier : null,
    veilleNouvelle: veille.nouvelle,
  };
}
