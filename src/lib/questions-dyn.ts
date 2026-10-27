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
import type { RegleDetection } from "@/lib/moteur";

// Cache en mémoire avec TTL (5 min) + invalidation manuelle
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache: {
  data: Record<InfractionType, QuestionDynamique[]> | null;
  expiresAt: number;
} = { data: null, expiresAt: 0 };

function getCachedData(): Record<InfractionType, QuestionDynamique[]> | null {
  if (cache.data && Date.now() < cache.expiresAt) {
    return cache.data;
  }
  return null;
}

function setCachedData(data: Record<InfractionType, QuestionDynamique[]>): void {
  cache.data = data;
  cache.expiresAt = Date.now() + CACHE_TTL_MS;
}

/**
 * Trouve les IDs de failles ACTIVE d'un type donné qui ont une règle
 * `reponseVrai` sur le `champ` donné (question BOOLEAN cochée).
 * Permet de remplacer le mapping statique `FAILLES_PAR_REPONSE` par une
 * recherche en base — plus flexible si les failles sont renommées/ajoutées.
 */
export async function trouverFaillesParReponseVrai(
  typeInfraction: InfractionType,
  champ: string,
): Promise<string[]> {
  try {
    const failles = await prisma.failleJuridique.findMany({
      where: {
        statut: "ACTIVE",
        typeInfraction,
        reglesDetection: {
          path: "$",
          array_contains: { type: "reponseVrai", champ },
        },
      },
      select: { id: true },
    });
    return failles.map((f) => f.id);
  } catch (e) {
    console.error("questions-dyn: trouverFaillesParReponseVrai impossible", e);
    return [];
  }
}

export function invalidateQuestionsDynamiquesCache(): void {
  cache.data = null;
  cache.expiresAt = 0;
}

/**
 * Questions dynamiques par type d'infraction, pour alimenter le formulaire
 * d'analyse, la lecture des réponses côté serveur et l'affichage juriste.
 * Idempotent et best-effort : la DB en rade ne bloque jamais l'analyse
 * (questionnaire statique seul).
 * Cache TTL 5 min + invalidation manuelle via `invalidateQuestionsDynamiquesCache()`.
 */
export async function chargerQuestionsDynamiques(): Promise<
  Record<InfractionType, QuestionDynamique[]>
> {
  const cached = getCachedData();
  if (cached) return cached;

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
    setCachedData(out);
    return out;
  } catch (e) {
    console.error("questions-dyn: chargement impossible", e);
    return vides;
  }
}