"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireJuriste } from "@/lib/dal";
import { Prisma } from "@/generated/prisma/client";
import {
  executerVeilleDila,
  extrairePropositionsEnAttente,
} from "@/lib/veille-ingestion";
import {
  composerRegleProposition,
  propositionDepuisFormulaire,
  refPropositionDepuisSource,
  type ValeursProposition,
} from "@/lib/veille-extraction";
import type { PropositionVeille } from "@/lib/veille-extraction";

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
 * conditions + articles + jurisprudence. Le template de lettre reste vide :
 * sans template, la faille ne peut **jamais** nourrir une lettre (garde-fous
 * `analyserDossier`/`confirmerFaille`) — l'admin rédige le template dans la
 * bibliothèque.
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

  const titreFaille =
    proposition.titre.length >= 5 ? proposition.titre : source.titre.slice(0, 120);
  const articleLoi = proposition.articles.join(" ; ");
  if (articleLoi.length < 2) return { error: "Aucun article retenu." };

  const regle = composerRegleProposition(proposition);
  const ref = refPropositionDepuisSource(source, proposition);

  const donnees = {
    typeInfraction: proposition.typeInfraction,
    titreFaille,
    articleLoi,
    regle,
    source: source.url ?? source.archive,
    jurisprudence: [ref] as unknown as Prisma.InputJsonValue,
    statut: "ACTIVE" as const,
  };

  // Deuxième entrée (auto-proposition de la veille) : la faille existe déjà
  // en PROPOSEE — on la **met à jour et l'active** (flip) au lieu d'en créer
  // une seconde. Un template déjà rédigé dans la bibliothèque est conservé.
  const dejaLiee = source.failleId
    ? await prisma.failleJuridique.findUnique({ where: { id: source.failleId } })
    : null;
  let failleId: string;
  if (dejaLiee) {
    failleId = dejaLiee.id;
    await prisma.failleJuridique.update({
      where: { id: dejaLiee.id },
      data: { ...donnees, templateLettre: dejaLiee.templateLettre },
    });
  } else {
    const faille = await prisma.failleJuridique.create({
      data: { ...donnees, templateLettre: "" },
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
  return {
    ok: true,
    message: `Lecture validée : faille « ${titreFaille} » ${
      dejaLiee ? "mise à jour et ACTIVÉE" : "créée et ACTIVÉE"
    }. Rédigez son template de lettre dans la bibliothèque juridique — sans template, elle ne peut pas encore alimenter une contestation.`,
  };
}
