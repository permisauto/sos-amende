"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { notifierCompteCree } from "@/lib/notifications";

export type CompteState = { ok?: boolean; error?: string } | undefined;

/**
 * Création d'un compte juriste par le super admin (ADMIN). Le compte est créé
 * avec le rôle JURISTE, puis un e-mail de bienvenue avec lien de connexion
 * (magic-link) est envoyé.
 */
export async function creerCompteJuriste(
  _prev: CompteState,
  formData: FormData,
): Promise<CompteState> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nom = String(formData.get("nom") ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Adresse e-mail invalide." };
  }
  if (!nom) return { error: "Nom du juriste requis." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "JURISTE") {
    return { error: "Un compte existe déjà avec cet e-mail (rôle non juriste)." };
  }

  await prisma.user.upsert({
    where: { email },
    update: { role: "JURISTE", name: nom },
    create: { email, name: nom, role: "JURISTE", credits: 0 },
  });

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