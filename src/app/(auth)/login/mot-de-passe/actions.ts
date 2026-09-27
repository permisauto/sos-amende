"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { hashPassword } from "@/lib/password";

export type MotDePasseState = { error?: string } | undefined;

/**
 * Définit (ou redéfinit) le mot de passe du compte connecté. Utilisé pour :
 *  - la création obligatoire après la première connexion par magic-link
 *    (but : reconnecter le client par e-mail + mot de passe, sans relancer
 *    un lien à chaque fois) ;
 *  - la réinitialisation (« Mot de passe oublié ? » → magic-link → mode
 *    « redefinir ») depuis /login/mot-de-passe?mode=redefinir.
 * Hashé en scrypt (src/lib/password.ts) avant stockage, jamais en clair.
 */
export async function definirMotDePasse(
  _prev: MotDePasseState,
  formData: FormData,
): Promise<MotDePasseState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const mode = formData.get("mode") === "redefinir" ? "redefinir" : "creer";

  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (password !== confirmation) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const passwordHash = hashPassword(password);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  } catch {
    return { error: "Impossible d'enregistrer le mot de passe. Réessayez." };
  }

  // La création obligatoire termine par l'accès à l'espace ; le mode
  // « redefinir » ramène sur le login pour se reconnecter avec le nouveau
  // mot de passe (l'ancienne session magic-link reste valide, mais le
  // réflexe e-mail + mot de passe est le comportement attendu).
  redirect(mode === "redefinir" ? "/login" : "/dashboard");
}