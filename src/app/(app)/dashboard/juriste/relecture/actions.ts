"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireJuriste } from "@/lib/dal";

export type RelectureState = { ok?: boolean; error?: string } | undefined;

/**
 * Marque une faille ACTIVE comme « relue » par le juriste : pose `reluLe`
 * (horodatage) et `reluPar` (identité). C'est la trace de la relecture du
 * contenu juridique (article + règle + template) — prérequis produit avant
 * lancement public. Aucun changement de statut : la faille reste ACTIVE.
 */
export async function marquerFailleRelue(
  _prev: RelectureState,
  formData: FormData,
): Promise<RelectureState> {
  const user = await requireJuriste();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Faille manquante." };

  try {
    await prisma.failleJuridique.update({
      where: { id },
      data: {
        reluLe: new Date(),
        reluPar: user.email ?? user.id,
      },
    });
  } catch {
    return { error: "Impossible de marquer cette faille comme relue." };
  }

  revalidatePath("/dashboard/juriste/relecture");
  revalidatePath("/dashboard/juriste/failles");
  return { ok: true };
}
