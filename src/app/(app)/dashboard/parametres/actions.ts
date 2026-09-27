"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { storageDelete } from "@/lib/storage";
import { hashPassword, verifyPassword } from "@/lib/password";
import { signOut } from "@/auth";

export type SuppressionState = { error?: string } | undefined;

export type ChangerMotDePasseState = { ok?: boolean; error?: string } | undefined;

/**
 * Changement de mot de passe (client OU juriste/administrateur). Vérifie le
 * mot de passe actuel en base (scrypt) avant de définir le nouveau — le
 * compte est connecté par la session, seule la preuve du mot de passe courant
 * autorise la modification.
 */
export async function changerMotDePasse(
  _prev: ChangerMotDePasseState,
  formData: FormData,
): Promise<ChangerMotDePasseState> {
  const user = await requireUser();

  const actuel = String(formData.get("actuel") ?? "");
  const nouveau = String(formData.get("nouveau") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (nouveau.length < 8) {
    return { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." };
  }
  if (nouveau !== confirmation) {
    return { error: "Les deux nouveaux mots de passe ne correspondent pas." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser?.passwordHash || !verifyPassword(actuel, dbUser.passwordHash)) {
    return { error: "Mot de passe actuel incorrect." };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(nouveau) },
    });
  } catch {
    return { error: "Impossible de mettre à jour le mot de passe. Réessayez." };
  }
  return { ok: true };
}

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