"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { hashPassword } from "@/lib/password";
import { notifierCompteCree } from "@/lib/notifications";

export type CompteState = { ok?: boolean; error?: string } | undefined;

/**
 * Création d'un compte juriste par le super admin (ADMIN). Le compte est créé
 * avec le rôle JURISTE et un mot de passe (défini par l'admin, haché en
 * scrypt avant stockage), puis un e-mail de bienvenue est envoyé.
 */
export async function creerCompteJuriste(
  _prev: CompteState,
  formData: FormData,
): Promise<CompteState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nom = String(formData.get("nom") ?? "").trim();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Adresse e-mail invalide." };
  }
  if (!nom) return { error: "Nom du juriste requis." };
  if (motDePasse.length < 8) {
    return {
      error: "Le mot de passe doit contenir au moins 8 caractères — l'admin le définit pour le juriste.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "JURISTE") {
    return { error: "Un compte existe déjà avec cet e-mail (rôle non juriste)." };
  }

  const passwordHash = hashPassword(motDePasse);

  // Persistance réelle : création (ou réactivation) du compte juriste avec
  // le hash scrypt. Échec => erreur renvoyée au formulaire (pas de 500).
  try {
    await prisma.user.upsert({
      where: { email },
      update: { name: nom, role: "JURISTE", passwordHash },
      create: { email, name: nom, role: "JURISTE", passwordHash },
    });
  } catch {
    return {
      error: "Impossible de créer le compte juriste (erreur base de données). Réessayez.",
    };
  }

  await notifierCompteCree(email, "JURISTE", nom);

  revalidatePath("/dashboard/admin/comptes");
  return { ok: true };
}

/** Liste des comptes juristes et administrateurs (lecture super admin). */
export async function listerComptesInternes() {
  return prisma.user.findMany({
    where: { role: { in: ["JURISTE", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}