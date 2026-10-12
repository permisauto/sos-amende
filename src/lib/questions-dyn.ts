// Chargement serveur des questions dynamiques du catalogue (veille 2.0).
// Seules les failles **ACTIVE** nourrissent le questionnaire client : une
// question `PROPOSEE`/`INACTIVE` n'apparaît jamais (mêmes garde-fous que le
// moteur). Module serveur (prisma) — les helpers purs restent dans
// `questions.ts`.

import { prisma } from "@/lib/prisma";
import {
  fusionnerQuestionsDynamiques,
  type QuestionDynamique,
} from "@/lib/questions";
import type { InfractionType } from "@/lib/envoi";

/**
 * Questions dynamiques par type d'infraction, pour alimenter le formulaire
 * d'analyse, la lecture des réponses côté serveur et l'affichage juriste.
 * Idempotent et best-effort : la DB en rade ne bloque jamais l'analyse
 * (questionnaire statique seul).
 */
export async function chargerQuestionsDynamiques(): Promise<
  Record<InfractionType, QuestionDynamique[]>
> {
  const vides: Record<InfractionType, QuestionDynamique[]> = {
    AMENDE: [],
    SUSPENSION: [],
  };
  try {
    const failles = await prisma.failleJuridique.findMany({
      where: { statut: "ACTIVE", typeInfraction: { in: ["AMENDE", "SUSPENSION"] } },
      select: { typeInfraction: true, questionsDynamiques: true },
    });
    const out: Record<InfractionType, QuestionDynamique[]> = {
      AMENDE: [],
      SUSPENSION: [],
    };
    for (const f of failles) {
      const type = f.typeInfraction as InfractionType;
      if (!out[type]) continue;
      out[type] = fusionnerQuestionsDynamiques([
        ...out[type],
        f.questionsDynamiques,
      ]);
    }
    return out;
  } catch (e) {
    console.error("questions-dyn: chargement impossible", e);
    return vides;
  }
}
