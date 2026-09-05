// Auto-alimentation de la base juridique : synchronise la table
// `FailleJuridique` avec le catalogue sourcé (recherche documentaire,
// FAILLES.md §H). Idempotente et sans danger : elle insère / met à jour les
// entrées du catalogue en statut PROPOSEE — jamais ACTIVE, jamais utilisée par
// le moteur. L'admin ne fait que **valider** (ACTIVE) ou écarter (INACTIVE)
// les propositions, c'est lui qui « clique pour valider la mise à jour ».

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CATALOGUE_SOURCES } from "@/lib/catalogue-sources";

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