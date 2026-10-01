"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";
import { Prisma } from "@/generated/prisma/client";
import { executerVeilleDila } from "@/lib/veille-ingestion";
import type { JurisprudenceRef } from "@/lib/catalogue-sources";

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
  await requireJuriste();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Source introuvable." };

  await prisma.sourceJuridique.update({
    where: { id },
    data: { statut: "ECARTE", reviewedAt: new Date() },
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
