"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireJuriste } from "@/lib/dal";
import { Prisma } from "@/generated/prisma/client";
import {
  executerVeilleDila,
  extrairePropositionSource,
  extrairePropositionsEnAttente,
} from "@/lib/veille-ingestion";
import type { PropositionVeille } from "@/lib/veille-extraction";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";

/** Budget du bouton « Extraire les propositions » (plus large que le lot auto). */
const BUDGET_EXTRACTION_LOT = 30;

export type VeilleState =
  | { error?: string; ok?: boolean; message?: string }
  | undefined;

const promotingSchema = z.object({
  id: z.string().min(1),
  typeInfraction: z.enum(["AMENDE", "SUSPENSION"]),
  titreFaille: z.string().min(5, "Titre trop court (5 caractères minimum)."),
  articleLoi: z.string().min(2, "Article de référence obligatoire."),
});

/** Écarte définitivement une publication hors sujet. */
export async function ecarterSource(
  _prev: VeilleState,
  formData: FormData,
): Promise<VeilleState> {
  const user = await requireJuriste();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Source introuvable." };

  await prisma.sourceJuridique.update({
    where: { id },
    data: { statut: "ECARTE", reviewedAt: new Date(), reviewedBy: user.id },
  });
  revalidatePath("/dashboard/juriste/veille");
  return { ok: true, message: "Publication écartée." };
}

/**
 * Promeut une publication de la veille en **proposition** de faille.
 *
 * Ce qui est copié automatiquement, et uniquement cela : la référence de la
 * source (ECLI, juridiction, date, URL Légifrance) et son résumé, tels que
 * publiés. Le champ « règle dégagée » et le template de lettre restent
 * **vides** : ils sont rédigés par le juriste, puis validés par l'admin. La
 * faille est créée en PROPOSEE, donc jamais utilisée par le moteur en l'état.
 */
export async function promouvoirSource(
  _prev: VeilleState,
  formData: FormData,
): Promise<VeilleState> {
  const user = await requireJuriste();
  const parsed = promotingSchema.safeParse({
    id: formData.get("id"),
    typeInfraction: formData.get("typeInfraction"),
    titreFaille: formData.get("titreFaille"),
    articleLoi: formData.get("articleLoi"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  }
  const { id, typeInfraction, titreFaille, articleLoi } = parsed.data;

  const source = await prisma.sourceJuridique.findUnique({ where: { id } });
  if (!source) return { error: "Source introuvable." };
  if (source.statut === "PROMU" && source.failleId) {
    return { error: "Cette publication a déjà été promue." };
  }

  // Référence de jurisprudence au format de la base juridique, `verifiee: false`
  // tant qu'un juriste n'a pas confirmé la lecture sur la source primaire.
  const ref: JurisprudenceRef = {
    reference: [source.ecli ?? source.reference ?? source.idDila]
      .filter(Boolean)
      .join(" — "),
    juridiction: source.juridiction ?? source.source,
    date: source.dateSource ? source.dateSource.toISOString().slice(0, 10) : null,
    url: source.url,
    verifiee: false,
    resume: source.contenu
      ? source.contenu.slice(0, 300).trim() + (source.contenu.length > 300 ? "…" : "")
      : null,
  };

  const data = {
    typeInfraction,
    titreFaille,
    articleLoi,
    regle: null as string | null,
    templateLettre: "",
    source: source.url ?? source.archive,
    jurisprudence: [ref] as unknown as Prisma.InputJsonValue,
  };

  const faille = await prisma.failleJuridique.create({
    data: { ...data, statut: "PROPOSEE" },
  });

  await prisma.sourceJuridique.update({
    where: { id },
    data: { statut: "PROMU", failleId: faille.id, reviewedAt: new Date(), reviewedBy: user.id },
  });

  revalidatePath("/dashboard/juriste/veille");
  revalidatePath("/dashboard/juriste/failles");
  return {
    ok: true,
    message: `Proposition « ${titreFaille} » créée. Rédigez la règle et le template, puis faites-la valider par un administrateur.`,
  };
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

/**
 * Extrait la proposition structurée (articles retenus + règle dégagée) d'une
 * publication — bouton unitaire. L'extraction ne valide rien : l'admin décide
 * ensuite (valider → faille ACTIVE au template à rédiger, ou écarter).
 */
export async function extrairePropositionAction(
  _prev: VeilleState,
  formData: FormData,
): Promise<VeilleState> {
  await requireJuriste();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Source introuvable." };

  const res = await extrairePropositionSource(id);
  revalidatePath("/dashboard/juriste/veille");
  if (!res.ok) return { error: res.motif ?? "Extraction impossible." };
  return res.proposition?.etat === "incomplet"
    ? {
        error: `Proposition incomplète : ${res.proposition.motif ?? "à vérifier"}. Le bouton Valider reste désactivé.`,
      }
    : {
        ok: true,
        message:
          "Proposition extraite : articles retenus par la juridiction et règle dégagée — à valider ou écarter.",
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
        "Rien à extraire : toutes les publications sont déjà traitées, ou l'IA est indisponible.",
    };
  }
  return {
    ok: true,
    message: `${bilan.extraites} proposition(s) extraite(s), ${bilan.incompletes} incomplète(s), ${bilan.echecs} en échec.`,
  };
}

/**
 * Valide la proposition extraite d'une publication après lecture (lot M) :
 * crée la faille **ACTIVE immédiate** (choix produit explicite), pré-remplie —
 * règle dégagée + conditions d'application + articles + jurisprudence. Le
 * template de lettre reste vide : sans template, la faille ne peut **jamais**
 * nourrir une lettre (garde-fous `analyserDossier`/`confirmerFaille`) —
 * l'admin rédige le template dans la bibliothèque. Décision **admin seul**
 * (`requireAdmin`).
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
  const prop = source.proposition as PropositionVeille | null;
  if (!prop || prop.etat !== "extrait") {
    return {
      error:
        "Proposition absente ou incomplète : relancez l'extraction, puis vérifiez-la avant validation.",
    };
  }

  const titreFaille =
    prop.titre.length >= 5 ? prop.titre : source.titre.slice(0, 120);
  const articleLoi = prop.articles.join(" ; ");
  if (articleLoi.length < 2) return { error: "Aucun article retenu." };

  const conditions = prop.conditions ?? [];
  const regle = [
    prop.regle.trim(),
    conditions.length
      ? `Conditions d'application :\n${conditions.map((c) => `- ${c}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const ref: JurisprudenceRef = {
    reference: [source.ecli ?? source.reference ?? source.idDila]
      .filter(Boolean)
      .join(" — "),
    juridiction: source.juridiction ?? source.source,
    date: source.dateSource ? source.dateSource.toISOString().slice(0, 10) : null,
    url: source.url,
    verifiee: false,
    resume: prop.resume || prop.extraits[0] || null,
  };

  const faille = await prisma.failleJuridique.create({
    data: {
      typeInfraction: prop.typeInfraction,
      titreFaille,
      articleLoi,
      regle,
      templateLettre: "",
      source: source.url ?? source.archive,
      jurisprudence: [ref] as unknown as Prisma.InputJsonValue,
      statut: "ACTIVE",
    },
  });

  await prisma.sourceJuridique.update({
    where: { id },
    data: {
      statut: "PROMU",
      failleId: faille.id,
      reviewedAt: new Date(),
      reviewedBy: user.id,
    },
  });

  revalidatePath("/dashboard/juriste/veille");
  revalidatePath("/dashboard/juriste/failles");
  return {
    ok: true,
    message: `Lecture validée : faille « ${titreFaille} » créée et ACTIVÉE. Rédigez son template de lettre dans la bibliothèque juridique — sans template, elle ne peut pas encore alimenter une contestation.`,
  };
}
