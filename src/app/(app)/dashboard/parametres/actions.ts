"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { storageDelete } from "@/lib/storage";
import { signOut } from "@/auth";

export type SuppressionState = { error?: string } | undefined;

/**
 * Effacement RGPD (art. 17) : supprime le compte, tous les dossiers,
 * paiements, mises en relation et fichiers associés (cascade Prisma + pièces
 * stockées localement/S3, best-effort), puis déconnecte l'utilisateur.
 */
export async function supprimerCompte(
  _prev: SuppressionState,
  formData: FormData,
): Promise<SuppressionState> {
  const user = await requireUser();

  if (formData.get("confirm") !== "on") {
    return { error: "Veuillez cocher la confirmation de suppression." };
  }

  const dossiers = await prisma.dossier.findMany({
    where: { userId: user.id },
    include: { courriers: true, preuves: true },
  });

  const fichiers: (string | null | undefined)[] = [];
  for (const d of dossiers) {
    fichiers.push(d.pvUrl);
    for (const p of d.preuves) {
      fichiers.push(p.url);
    }
    for (const c of d.courriers) {
      fichiers.push(c.pdfUrl, c.signatureUrl, c.preuveDepotUrl);
    }
    if (
      typeof d.extractedData === "object" &&
      d.extractedData !== null &&
      "preuveEtalonnage" in d.extractedData
    ) {
      fichiers.push(String(d.extractedData.preuveEtalonnage));
    }
  }

  await prisma.user.delete({ where: { id: user.id } });

  // Best-effort : la base est la source de vérité, un échec de suppression
  // de fichier ne doit pas bloquer l'effacement du compte.
  await Promise.allSettled(fichiers.map((f) => storageDelete(f)));

  await signOut({ redirect: false });
  redirect("/login?compte-supprime=1");
}