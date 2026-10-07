import { prisma } from "@/lib/prisma";
import { enregistrerTraceAutoAlimentation } from "@/lib/auto-alimentation";
import {
  faitsDepuisPreuves,
  type MajSuggestion,
} from "@/lib/verif-failles";
import { verifierAvecIa, type CatalogueIa } from "@/lib/verif-ia";
import type { ExtractedData } from "@/lib/moteur";

/** Campagne de traçage dans `AutoAlimentationTrace`. */
export const CAMPAGNE_AUTO_ENRICHISSEMENT = "auto-enrichissement";

/** Candidature existante du dossier (DTO minimal pour le plan d'écriture). */
export type CandidatureExistante = {
  failleId: string;
  statut: string;
  suggestionIa?: unknown;
};

export type PlanEnrichissement = {
  /** Lignes à créer en CANDIDATE avec leur suggestion (ids inédits). */
  creations: MajSuggestion[];
  /** Lignes existantes sans annotation à compléter (jamais un écart, jamais un remplacé). */
  majs: MajSuggestion[];
};

/**
 * Plan d'écriture pur de l'enrichissement : calcule quelles suggestions/-
 * signalements IA écrire sur les candidatures du dossier. Garde-fous :
 *
 * - une faille ÉCARTÉE n'est jamais réécrite ni recréée ;
 * - une ligne qui porte déjà une annotation (`suggestionIa`) est laissée
 *   intacte — l'enrichissement automatique ne remplace jamais une décision
 *   ni une vérification déjà tracée ;
 * - un signalement ne crée jamais de ligne (il ne renseigne qu'une
 *   candidature déjà présente) ;
 * - un signalement n'écrase pas une suggestion pour la même faille.
 */
export function planEnrichissement(
  existants: CandidatureExistante[],
  suggestions: MajSuggestion[],
  signalements: MajSuggestion[],
): PlanEnrichissement {
  const parId = new Map(existants.map((e) => [e.failleId, e]));
  const rejettees = new Set(
    existants.filter((e) => e.statut === "REJETEE").map((e) => e.failleId),
  );
  const dejaNotees = new Set(
    existants
      .filter((e) => e.suggestionIa !== undefined && e.suggestionIa !== null)
      .map((e) => e.failleId),
  );

  const creations: MajSuggestion[] = [];
  const majs: MajSuggestion[] = [];
  const traites = new Set<string>();

  const pousser = (m: MajSuggestion, creerSiAbsent: boolean): void => {
    if (
      traites.has(m.failleId) ||
      rejettees.has(m.failleId) ||
      dejaNotees.has(m.failleId)
    ) {
      return;
    }
    const ex = parId.get(m.failleId);
    if (ex) {
      majs.push(m);
      traites.add(m.failleId);
    } else if (creerSiAbsent) {
      creations.push(m);
      traites.add(m.failleId);
    }
  };

  for (const s of suggestions) pousser(s, true);
  for (const s of signalements) pousser(s, false);

  return { creations, majs };
}

/**
 * L'enrichissement IA n'a de sens que si un provider est réellement
 * disponible : `VERIF_IA_PROVIDER=mock` (dev/E2E), `gemini`/vide avec
 * `GEMINI_API_KEY` présente, sinon rien (coupé ou non configuré).
 */
export function enrichissementActif(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const provider = (env.VERIF_IA_PROVIDER ?? "").toLowerCase();
  if (provider === "off") return false;
  if (provider === "mock") return true;
  return !!env.GEMINI_API_KEY;
}

export type ResultatEnrichissement =
  | { statut: "ignore"; motif: string }
  | {
      statut: "ok";
      source: "ia" | "mock";
      suggestions: number;
      signalements: number;
      creees: number;
      majs: number;
    }
  | { statut: "echec"; motif: string };

/**
 * Enrichissement post-analyse (fire-and-forget via `after()`) : la même
 * vérification cas d'espèce que « Vérifier les failles » (IA × catalogue,
 * ids du catalogue uniquement — jamais d'article inventé) est rejouée dès
 * l'analyse d'un dossier et ses suggestions sont versées dans les
 * candidatures (`DossierFaille.suggestionIa`), visibles dans le drawer du
 * juriste.
 *
 * Garde-fous :
 * - **jamais** de lettre régénérée, de statut modifié ou de faille
 *   confirmée : l'IA ne fait que proposer, le juriste confirme/écarte ;
 * - idempotent : un dossier déjà annoté (vérification manuelle ou passage
 *   précédent) est ignoré ;
 * - tracé dans `AutoAlimentationTrace` (campagne `auto-enrichissement`) :
 *   OK avec résumé, ECHEC avec motif ;
 * - best-effort total : aucune exception ne remonte à l'appelant.
 */
export async function enrichirApresOcr(
  dossierId: string,
): Promise<ResultatEnrichissement> {
  if (!enrichissementActif()) {
    return {
      statut: "ignore",
      motif: "IA non configurée (VERIF_IA_PROVIDER / GEMINI_API_KEY)",
    };
  }

  try {
    const dossier = await prisma.dossier.findUnique({
      where: { id: dossierId },
      include: {
        preuves: { select: { type: true, url: true } },
        faillesRetenues: {
          select: { failleId: true, statut: true, suggestionIa: true },
        },
      },
    });
    if (!dossier) return { statut: "ignore", motif: "dossier introuvable" };
    if (
      dossier.faillesRetenues.some(
        (f) => f.suggestionIa !== undefined && f.suggestionIa !== null,
      )
    ) {
      return {
        statut: "ignore",
        motif: "dossier déjà enrichi ou vérifié (annotation existante)",
      };
    }

    const failles = await prisma.failleJuridique.findMany({
      where: { statut: "ACTIVE", typeInfraction: dossier.type },
    });
    if (failles.length === 0) {
      return { statut: "ignore", motif: "catalogue ACTif vide pour ce type" };
    }

    // Faits du dossier enrichis par les pièces versées — identique au
    // contexte de « Vérifier les failles » (sans remarques juriste : aucune
    // saisie humaine n'existe encore à ce stade).
    const data = (dossier.extractedData ?? {}) as ExtractedData;
    const faits = faitsDepuisPreuves(data, dossier.preuves);
    if (!faits.conditions_meteo && dossier.conditions_meteo) {
      faits.conditions_meteo = dossier.conditions_meteo;
    }

    const catalogueIa: CatalogueIa[] = failles.map((f) => ({
      id: f.id,
      titreFaille: f.titreFaille,
      articleLoi: f.articleLoi,
      regle: f.regle ?? null,
      jurisprudence: (
        Array.isArray(f.jurisprudence)
          ? (f.jurisprudence as Array<{ resume?: unknown }>)
              .map((j) => j.resume)
              .filter((r): r is string => typeof r === "string" && r.length > 0)
          : []
      ).slice(0, 3),
    }));
    const faitsIa: Record<string, unknown> = {
      ...faits,
      type: dossier.type,
      textePv: (dossier.pvTexte ?? "").slice(0, 4000),
      dateLimite: dossier.dateLimite
        ? dossier.dateLimite.toISOString().slice(0, 10)
        : null,
    };

    const resultat = await verifierAvecIa(faitsIa, catalogueIa);
    if (resultat.source === "indisponible") {
      await enregistrerTraceAutoAlimentation({
        campagne: CAMPAGNE_AUTO_ENRICHISSEMENT,
        statut: "ECHEC",
        detail: `dossier=${dossierId} — ${resultat.motif}`,
      });
      return { statut: "echec", motif: resultat.motif };
    }

    const at = new Date().toISOString();
    const suggestions: MajSuggestion[] = resultat.reponse.suggestions.map(
      (s) => ({
        failleId: s.id,
        suggestionIa: {
          source: resultat.source,
          pertinence: s.pertinence,
          justification: s.justification,
          controle: s.controle,
          at,
        },
      }),
    );
    const signalements: MajSuggestion[] = resultat.reponse.signalements.map(
      (s) => ({
        failleId: s.id,
        suggestionIa: {
          source: resultat.source,
          signalement: s.motif,
          at,
        },
      }),
    );

    const plan = planEnrichissement(
      dossier.faillesRetenues,
      suggestions,
      signalements,
    );
    if (plan.creations.length > 0 || plan.majs.length > 0) {
      await prisma.$transaction([
        ...plan.creations.map((c) =>
          prisma.dossierFaille.create({
            data: {
              dossierId,
              failleId: c.failleId,
              statut: "CANDIDATE",
              suggestionIa: c.suggestionIa as object,
            },
          }),
        ),
        ...plan.majs.map((m) =>
          prisma.dossierFaille.updateMany({
            where: { dossierId, failleId: m.failleId },
            data: { suggestionIa: m.suggestionIa as object },
          }),
        ),
      ]);
    }

    await enregistrerTraceAutoAlimentation({
      campagne: CAMPAGNE_AUTO_ENRICHISSEMENT,
      statut: "OK",
      traitees: suggestions.length + signalements.length,
      nouvelles: plan.creations.length,
      detail: `dossier=${dossierId} · suggestions=${suggestions.length} · signalements=${signalements.length} · créées=${plan.creations.length} · source=${resultat.source}`,
    });

    return {
      statut: "ok",
      source: resultat.source,
      suggestions: suggestions.length,
      signalements: signalements.length,
      creees: plan.creations.length,
      majs: plan.majs.length,
    };
  } catch (e) {
    console.error(
      "[auto-enrichissement] échec :",
      e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    );
    await enregistrerTraceAutoAlimentation({
      campagne: CAMPAGNE_AUTO_ENRICHISSEMENT,
      statut: "ECHEC",
      detail: `dossier=${dossierId} — erreur interne`,
    });
    return { statut: "echec", motif: "erreur interne" };
  }
}
