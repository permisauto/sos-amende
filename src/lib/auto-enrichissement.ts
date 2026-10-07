import { prisma } from "@/lib/prisma";
import { enregistrerTraceAutoAlimentation } from "@/lib/auto-alimentation";
import {
  faitsDepuisPreuves,
  type MajSuggestion,
} from "@/lib/verif-failles";
import { verifierAvecIa, type CatalogueIa, type ReponseIa } from "@/lib/verif-ia";
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

// ---------------------------------------------------------------------------
// Lot H2 — motifs non couverts → proposition de faille (PROPOSEE)
// ---------------------------------------------------------------------------

export type MotifNonCouvert = ReponseIa["motifsNonCouverts"][number];

export type NouvelleFailleProposee = {
  id: string;
  typeInfraction: string;
  titreFaille: string;
  articleLoi: string;
  regle: string;
  source: string;
};

/** Plafond de propositions créées par un passage d'enrichissement. */
export const MAX_MOTIFS_NOUVEAUX = 3;

/** Normalisation partagée dédup (casse, accents, ponctuation). */
export function normaliserPourDedup(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugTitre(titre: string): string {
  const s = normaliserPourDedup(titre)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s || "motif").slice(0, 40);
}

function hashCourt(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * Plan pur des **nouvelles failles à proposer** en base (statut `PROPOSEE`,
 * posé par l'appelant). Garde-fous anti-hallucination :
 *
 * - dédup sur titre normalisé contre **tout** le catalogue existant (tout
 *   statut) — un motif déjà connu n'est jamais recréé ;
 * - `articleLoi` n'est conservé que si l'article cité par l'IA figure
 *   **textuellement** dans le texte OCR du document ; sinon champ vide
 *   (l'admin rédige avant activation — `estActivable` exige `regle` +
 *   `templateLettre`) ;
 * - jamais de template : la lettre viendra exclusivement d'une rédaction
 *   humaine validée (garde-fou V1 « l'IA ne rédige jamais de template ») ;
 * - plafond `MAX_MOTIFS_NOUVEAUX` par passage (pas de flood du catalogue).
 */
export function planNouvellesFailles(
  motifs: MotifNonCouvert[],
  titresExistants: string[],
  pvTexte: string,
  typeInfraction: string,
): NouvelleFailleProposee[] {
  const existants = new Set(titresExistants.map(normaliserPourDedup));
  const texte = normaliserPourDedup(pvTexte);
  const vus = new Set<string>();
  const plan: NouvelleFailleProposee[] = [];

  for (const m of motifs) {
    if (plan.length >= MAX_MOTIFS_NOUVEAUX) break;
    const titre = m.titre.trim();
    const observation = m.observation.trim();
    if (titre.length < 6 || observation.length < 15) continue;
    const cle = normaliserPourDedup(titre);
    if (!cle || existants.has(cle) || vus.has(cle)) continue;
    vus.add(cle);

    const cite = (m.articleCite ?? "").trim();
    const articleNorm = normaliserPourDedup(cite);
    const articleLoi =
      articleNorm.split(" ").length >= 2 && articleNorm.length >= 6
        ? texte.includes(articleNorm)
          ? cite
          : ""
        : "";

    plan.push({
      id: `proposition-ia-${slugTitre(titre)}-${hashCourt(cle)}`,
      typeInfraction,
      titreFaille: titre.slice(0, 180),
      articleLoi: articleLoi.slice(0, 180),
      regle: observation.slice(0, 1200),
      source: "Signalement IA (auto-enrichissement) — à valider par l'admin",
    });
  }
  return plan;
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
      nouvellesFailles: number;
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
 * - un motif non couvert crée au plus `MAX_MOTIFS_NOUVEAUX` lignes
 *   `FailleJuridique` en **PROPOSEE, sans template** (lettre impossible
 *   jusqu'à rédaction humaine + activation admin) — cf. `planNouvellesFailles` ;
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

    // Lot H2 : motif anormal non couvert par le catalogue → proposition de
    // faille globale en PROPOSEE (sans template, jamais détectée ni utilisée
    // dans une lettre tant que l'admin ne l'a pas activée). Créations
    // best-effort, idempotentes (`skipDuplicates` + dédup sur titre).
    let nouvellesFailles = 0;
    if (resultat.reponse.motifsNonCouverts.length > 0) {
      try {
        const titres = (
          await prisma.failleJuridique.findMany({
            select: { titreFaille: true },
          })
        ).map((f) => f.titreFaille);
        const propositions = planNouvellesFailles(
          resultat.reponse.motifsNonCouverts,
          titres,
          dossier.pvTexte ?? "",
          dossier.type,
        );
        if (propositions.length > 0) {
          await prisma.failleJuridique.createMany({
            data: propositions.map((p) => ({
              id: p.id,
              typeInfraction: p.typeInfraction,
              titreFaille: p.titreFaille,
              articleLoi: p.articleLoi,
              regle: p.regle,
              templateLettre: "",
              source: p.source,
              reglesDetection: [],
              jurisprudence: [],
              statut: "PROPOSEE" as const,
            })),
            skipDuplicates: true,
          });
          await prisma.dossierFaille.createMany({
            data: propositions.map((p) => ({
              dossierId,
              failleId: p.id,
              statut: "CANDIDATE" as const,
              suggestionIa: {
                source: resultat.source,
                signalement: p.regle,
                nouvelleProposition: true,
                at,
              },
            })),
            skipDuplicates: true,
          });
          nouvellesFailles = propositions.length;
        }
      } catch (e) {
        // Best-effort : une proposition non créée ne casse jamais l'enrichissement.
        console.error(
          "[auto-enrichissement] création de proposition impossible :",
          e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        );
      }
    }

    await enregistrerTraceAutoAlimentation({
      campagne: CAMPAGNE_AUTO_ENRICHISSEMENT,
      statut: "OK",
      traitees: suggestions.length + signalements.length,
      nouvelles: plan.creations.length,
      detail: `dossier=${dossierId} · suggestions=${suggestions.length} · signalements=${signalements.length} · créées=${plan.creations.length} · propositions=${nouvellesFailles} · source=${resultat.source}`,
    });

    return {
      statut: "ok",
      source: resultat.source,
      suggestions: suggestions.length,
      signalements: signalements.length,
      creees: plan.creations.length,
      majs: plan.majs.length,
      nouvellesFailles,
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
