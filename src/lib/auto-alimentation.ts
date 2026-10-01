// Auto-alimentation de la base juridique : synchronise la table
// `FailleJuridique` avec le catalogue sourcé (recherche documentaire,
// FAILLES.md §H). Idempotente et sans danger : elle insère / met à jour les
// entrées du catalogue en statut PROPOSEE — jamais ACTIVE, jamais utilisée par
// le moteur. L'admin ne fait que **valider** (ACTIVE) ou écarter (INACTIVE)
// les propositions, c'est lui qui « clique pour valider la mise à jour ».

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
 *  1. synchronise le catalogue sourcé en statut PROPOSEE (validation admin
 *     seule, jamais ACTIVE automatiquement) et trace le passage ;
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
    await enregistrerTraceAutoAlimentation({
      campagne: "catalogue",
      statut: "OK",
      traitees: catalogue,
      detail: `${catalogue} entrée(s) du catalogue synchronisée(s) en PROPOSEE.`,
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
