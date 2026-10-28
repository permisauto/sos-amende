"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireJuriste } from "@/lib/dal";
import { Prisma } from "@/prisma/generated-client";
import { estActivable } from "@/lib/failles";
import {
  estPropositionPromouvable,
  executerVeilleDila,
  extrairePropositionsEnAttente,
  regenererAnalysesAnciennes,
  retroRemplirFaillesVeille2,
} from "@/lib/veille-ingestion";
import {
  composerRegleProposition,
  propositionDepuisFormulaire,
  refPropositionDepuisSource,
  type ValeursProposition,
} from "@/lib/veille-extraction";
import type { PropositionVeille } from "@/lib/veille-extraction";
import { reglesDetectionPourQuestions } from "@/lib/questions";
import { invalidateQuestionsDynamiquesCache } from "@/lib/questions-dyn";

/** Budget du bouton « Extraire les propositions » (plus large que le lot auto). */
const BUDGET_EXTRACTION_LOT = 30;

export type VeilleState =
  | { error?: string; ok?: boolean; message?: string }
  | undefined;

/** Écarte définitivement une publication hors sujet. */
export async function ecarterSource(
  _prev: VeilleState,
  formData: FormData,
): Promise<VeilleState> {
  const user = await requireJuriste();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Source introuvable." };

  const source = await prisma.sourceJuridique.findUnique({ where: { id } });
  if (!source) return { error: "Source introuvable." };

  await prisma.sourceJuridique.update({
    where: { id },
    data: { statut: "ECARTE", reviewedAt: new Date(), reviewedBy: user.id },
  });
  // Refus synchronisé : si une faille PROPOSEE est déjà liée à cette
  // publication (auto-proposition), elle est écartée au même instant — sans
  // quoi elle resterait en attente dans la bibliothèque alors que sa source
  // est traitée.
  if (source.failleId) {
    await prisma.failleJuridique.updateMany({
      where: { id: source.failleId, statut: "PROPOSEE" },
      data: { statut: "INACTIVE" },
    });
    invalidateQuestionsDynamiquesCache();
  }
  revalidatePath("/dashboard/juriste/veille");
  revalidatePath("/dashboard/juriste/failles");
  return { ok: true, message: "Publication écartée." };
}

/** Relance l'ingestion à la main (utile après une coupure réseau). */
export async function relancerVeille(_prev: VeilleState): Promise<VeilleState> {
  await requireJuriste();
  const res = await executerVeilleDila();
  revalidatePath("/dashboard/juriste/veille");
  return {
    ok: true,
    message:
      res.totalRetenues > 0
        ? `${res.totalRetenues} nouvelle(s) publication(s) pertinente(s).`
        : "Aucune nouvelle publication pertinente.",
  };
}

/** Extrait toutes les propositions en attente (lot à budget élargi). */
export async function extrairePropositionsLot(
  _prev: VeilleState,
): Promise<VeilleState> {
  await requireJuriste();
  const bilan = await extrairePropositionsEnAttente(BUDGET_EXTRACTION_LOT);
  revalidatePath("/dashboard/juriste/veille");
  if (bilan.quotaAtteint) {
    return {
      message:
        "Quota IA du jour atteint : les extractions restantes seront reprises automatiquement (cron nocturne) ou demain.",
    };
  }
  const total = bilan.extraites + bilan.incompletes + bilan.echecs;
  if (total === 0) {
    return {
      message:
        "Rien à extraire : toutes les publications sont déjà traitées (ou score trop bas).",
    };
  }
  return {
    ok: true,
    message: `${bilan.extraites} proposition(s) extraite(s), ${bilan.incompletes} incomplète(s), ${bilan.echecs} en échec.`,
  };
}

/**
 * Régénère les analyses hérites (avant Veille 2.0) au format courant —
 * **admin seul**. Le bouton n'apparaît que pour l'admin ; les juristes ne
 * déclenchent jamais un retraitement de masse. Progressif : chaque clic
 * traite un lot borné, on rappuie pour avancer (la page ne fige pas).
 */
export async function regenererAnalysesVeille(
  _prev: VeilleState,
): Promise<VeilleState> {
  await requireAdmin();
  const bilan = await regenererAnalysesAnciennes(BUDGET_EXTRACTION_LOT);
  revalidatePath("/dashboard/juriste/veille");
  if (bilan.quotaAtteint) {
    return {
      error:
        "Quota IA du jour atteint : la régénération reprendra automatiquement cette nuit (cron) — réessayez demain. Les analyses déjà traitées sont conservées.",
    };
  }
  if (bilan.iaIndisponible) {
    return {
      error:
        "IA indisponible (coupée ou sans clé) — aucune analyse régénérée. Les analyses existantes sont conservées.",
    };
  }
  // Repli local = l'IA a échoué (quota 429, panne) : le lot a été interrompu.
  // Ne surtout pas annoncer « régénéré » — ces passages ne sont pas des
  // analyses Veille 2.0 et resteraient en file.
  if (bilan.locales > 0) {
    const total = bilan.extraites + bilan.incompletes + bilan.echecs;
    return {
      error:
        total > 0
          ? `IA momentanément indisponible (quota atteint ou panne) : ${total} analyse(s) régénérée(s) avant l'arrêt du lot. Réessayez plus tard — les analyses non traitées restent en file.`
          : "IA momentanément indisponible (quota atteint ou panne) : aucune analyse régénérée. Réessayez plus tard.",
    };
  }
  const total = bilan.extraites + bilan.incompletes + bilan.echecs;
  if (total === 0) {
    return {
      ok: true,
      message:
        "Toutes les analyses sont déjà au format Veille 2.0 — rien à régénérer.",
    };
  }
  return {
    ok: true,
    message: `${total} analyse(s) régénérée(s) au format Veille 2.0 (${bilan.extraites} complète(s)). Rappuyez pour traiter le lot suivant.`,
  };
}

/**
 * Complète les failles `PROPOSEE` déjà liées à une source régénérée : recopie
 * `templateGracieux` et `questionsDynamiques` depuis la proposition v2 de la
 * source. Admin seul. Sans ce passage, l'admin juge une faille incomplète
 * (pas de 3ᵉ parcours gracieux ni de questions) au moment de devoir valider.
 */
export async function retroRemplirFaillesVeille(
  _prev: VeilleState,
): Promise<VeilleState> {
  await requireAdmin();
  const bilan = await retroRemplirFaillesVeille2();
  revalidatePath("/dashboard/juriste/veille");
  revalidatePath("/dashboard/juriste/failles");
  if (bilan.misesAJour === 0) {
    return {
      ok: true,
      message:
        "Aucune faille PROPOSEE liée à compléter — les propositions v2 sont déjà à jour (ou aucune source liée n'est encore régénérée).",
    };
  }
  return {
    ok: true,
    message: `${bilan.misesAJour} faille(s) PROPOSEE complétée(s) (gracieux + questions dynamiques). Consultez-les dans la bibliothèque juridique.`,
  };
}

/** Lit les champs édités du drawer, ou `null` si le bouton n'a envoyé que l'id. */
function lirePropositionFormulaire(formData: FormData): ValeursProposition | null {
  if (!formData.has("titre")) return null;
  return {
    titre: String(formData.get("titre") ?? ""),
    typeInfraction:
      formData.get("typeInfraction") === "SUSPENSION" ? "SUSPENSION" : "AMENDE",
    articles: String(formData.get("articles") ?? ""),
    regle: String(formData.get("regle") ?? ""),
    conditions: String(formData.get("conditions") ?? ""),
    resume: String(formData.get("resume") ?? ""),
    motifDecisif: String(formData.get("motifDecisif") ?? ""),
    templateLettre: String(formData.get("templateLettre") ?? ""),
    templateRefere: String(formData.get("templateRefere") ?? ""),
    templateGracieux: String(formData.get("templateGracieux") ?? ""),
  };
}

/**
 * Validation (ou correction seule) de la proposition d'une publication après
 * lecture dans le drawer — décision **admin seul** (`requireAdmin`). Deux
 * entrées sur le même formulaire :
 *
 *  - **carte** (aucun champ édité) : la proposition stockée doit être
 *    complète (`etat === "extrait"`) — comportement historique ;
 *  - **drawer en édition** (champs présents) : les valeurs soumises sont
 *    recontrôlées par `propositionDepuisFormulaire` (lot O) — l'admin peut
 *    donc **compléter une proposition `incomplet` puis la valider dans la
 *    foulée** : le contrôle porte sur les valeurs soumises, plus sur l'état
 *    de l'extraction.
 *
 * `intention=brouillon` : écrit les corrections dans
 * `SourceJuridique.proposition` **sans créer de faille** (l'admin finira
 * plus tard). `intention=valider` (défaut) : crée la faille **ACTIVE
 * immédiate** (choix produit explicite), pré-remplie — règle dégagée +
 * conditions + articles + jurisprudence + **template pré-rédigé par
 * l'extraction** (lot 3 ; s'il est vide, la faille garde le chip « Template
 * à rédiger » et ne peut encore nourrir aucune lettre).
 */
export async function validerPropositionSource(
  _prev: VeilleState,
  formData: FormData,
): Promise<VeilleState> {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Source introuvable." };

  const source = await prisma.sourceJuridique.findUnique({ where: { id } });
  if (!source) return { error: "Source introuvable." };
  if (source.statut !== "NOUVEAU") {
    return { error: "Publication déjà traitée (promue ou écartée)." };
  }
  const stockee = source.proposition as PropositionVeille | null;
  const intention =
    formData.get("intention") === "brouillon" ? "brouillon" : "valider";

  let proposition: PropositionVeille;
  let corrigee = false;
  const formulaire = lirePropositionFormulaire(formData);
  if (formulaire) {
    const res = propositionDepuisFormulaire(formulaire, {
      extraits: stockee && stockee.etat !== "echec" ? stockee.extraits : [],
      extraitLe: stockee?.extraitLe,
      obsolescence: stockee?.obsolescence,
      // Veille 2.0 : l'admin n'édite ni l'analyse prédiction ni les questions
      // — les champs v2 sont préservés à la correction.
      statutAnalyse: stockee?.statutAnalyse,
      analyse: stockee?.analyse,
      motifsCles: stockee?.motifsCles,
      questionsDynamiques: stockee?.questionsDynamiques,
    });
    if (!res.ok) return { error: res.erreur };
    proposition = res.proposition;
    corrigee = true;
    if (intention === "brouillon") {
      await prisma.sourceJuridique.update({
        where: { id },
        data: { proposition: proposition as unknown as Prisma.InputJsonValue },
      });
      revalidatePath("/dashboard/juriste/veille");
      return proposition.etat === "extrait"
        ? {
            ok: true,
            message:
              "Corrections enregistrées : la proposition est complète — validez-la quand vous voulez.",
          }
        : {
            ok: true,
            message: `Corrections enregistrées — proposition encore incomplète : ${
              proposition.motif ?? "à compléter"
            }.`,
          };
    }
  } else {
    if (intention === "brouillon") {
      return { error: "Aucune correction soumise." };
    }
    if (!stockee || stockee.etat !== "extrait") {
      return {
        error:
          "Proposition absente ou incomplète : corrigez-la depuis « Lire la décision », ou relancez l'extraction.",
      };
    }
    proposition = stockee;
  }

  if (proposition.etat !== "extrait") {
    return {
      error: `Proposition incomplète : ${
        proposition.motif ?? "à compléter"
      }. Corrigez-la avant validation.`,
    };
  }

  if (!estPropositionPromouvable(proposition)) {
    if (proposition.statutAnalyse === "REJETE_AUTOMOBILISTE_PERDANT") {
      return {
        error:
          "Décision perdante pour les automobilistes : seule une décision favorable peut être validée.",
      };
    }
    return {
      error:
        "Proposition non promotable : seule une décision favorable peut être validée.",
    };
  }

  const titreFaille =
    proposition.titre.length >= 5 ? proposition.titre : source.titre.slice(0, 120);
  const articleLoi = proposition.articles.join(" ; ");
  if (articleLoi.length < 2) return { error: "Aucun article retenu." };

  const regle = composerRegleProposition(proposition);
  const ref = refPropositionDepuisSource(source, proposition);
  // Veille 2.0 : règles de détection mappées des questions dynamiques (types
  // additifs du moteur) + 3ᵉ template (gracieux) — champs distincts (D5).
  const regles = reglesDetectionPourQuestions(proposition.questionsDynamiques ?? []);

  // Deuxième entrée (auto-proposition de la veille) : la faille existe déjà
  // en PROPOSEE — on la met à jour (flip) au lieu d'en créer une seconde. Un
  // template déjà rédigé dans la bibliothèque est conservé ; sinon on reprend
  // celui de la proposition (lot 3).
  const dejaLiee = source.failleId
    ? await prisma.failleJuridique.findUnique({ where: { id: source.failleId } })
    : null;
  const templateLettre =
    dejaLiee?.templateLettre || proposition.templateLettre || "";
  const templateRefere =
    dejaLiee?.templateRefere || proposition.templateRefere || "";
  const templateGracieux =
    dejaLiee?.templateGracieux || proposition.templateGracieux || "";

  // Garde-fou lettre vide (mêmes règles que les autres chemins d'activation,
  // via `estActivable` — source unique de vérité) : sans règle dégagée ni
  // template de lettre, une faille ACTIVE ne peut alimenter aucune
  // contestation (le moteur l'écarte d'office comme lettre principale). On
  // crée donc la faille en **PROPOSEE** — elle apparaît dans la bibliothèque
  // avec le chip « Template à rédiger », l'admin la rédige puis l'active.
  // Avant ce verrou, valider une proposition sans template la passait quand
  // même en ACTIVE (3 failles lettre-vide constatées en prod le 2026-10-18).
  const statutFaille: "ACTIVE" | "PROPOSEE" = estActivable({
    regle,
    templateLettre,
  })
    ? "ACTIVE"
    : "PROPOSEE";

  const donnees = {
    typeInfraction: proposition.typeInfraction,
    titreFaille,
    articleLoi,
    regle,
    source: source.url ?? source.archive,
    // La référence est celle de la décision que l'admin vient de lire dans le
    // drawer : sur une activation, elle est donc vérifiée (plus de badge
    // « À vérifier » sur une faille ACTIVE). En PROPOSEE, elle reste à vérifier.
    jurisprudence: [
      { ...ref, verifiee: statutFaille === "ACTIVE" },
    ] as unknown as Prisma.InputJsonValue,
    statut: statutFaille,
    ...(regles.length
      ? { reglesDetection: regles as unknown as Prisma.InputJsonValue }
      : {}),
    ...(proposition.questionsDynamiques?.length
      ? {
          questionsDynamiques:
            proposition.questionsDynamiques as unknown as Prisma.InputJsonValue,
        }
      : {}),
  };

  let failleId: string;
  if (dejaLiee) {
    failleId = dejaLiee.id;
    await prisma.failleJuridique.update({
      where: { id: dejaLiee.id },
      data: { ...donnees, templateLettre, templateRefere, templateGracieux },
    });
  } else {
    const faille = await prisma.failleJuridique.create({
      data: { ...donnees, templateLettre, templateRefere, templateGracieux },
    });
    failleId = faille.id;
  }

  await prisma.sourceJuridique.update({
    where: { id },
    data: {
      ...(corrigee
        ? { proposition: proposition as unknown as Prisma.InputJsonValue }
        : {}),
      statut: "PROMU",
      failleId,
      reviewedAt: new Date(),
      reviewedBy: user.id,
    },
  });

  revalidatePath("/dashboard/juriste/veille");
  revalidatePath("/dashboard/juriste/failles");
  invalidateQuestionsDynamiquesCache();
  const etat = statutFaille === "ACTIVE" ? "ACTIVÉE" : "enregistrée en proposition";
  return {
    ok: true,
    message: `Lecture validée : faille « ${titreFaille} » ${
      dejaLiee ? `mise à jour et ${etat}` : `créée et ${etat}`
    }. ${
      statutFaille === "ACTIVE"
        ? "Template de lettre pré-rédigé inclus : relisez-le dans la bibliothèque juridique avant usage."
        : "Aucun template de lettre exploitable : elle reste en « Proposition » dans la bibliothèque juridique (chip « Template à rédiger ») — rédigez la lettre puis activez-la."
    }${
      templateGracieux
        ? " Demande gracieuse (3ᵉ parcours) également pré-rédigée."
        : ""
    }`,
  };
}
