"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";

const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide.").trim(),
});

export type LoginState = {
  error?: string;
};

export async function loginWithEmail(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: "Veuillez saisir une adresse e-mail valide." };
  }

  try {
    await signIn("resend", { email: parsed.data.email, redirect: false });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "Une erreur est survenue lors de l'envoi du lien de connexion.",
      };
    }
    throw error;
  }
}

/**
 * Mode démo local uniquement : sans `AUTH_RESEND_KEY`, aucun e-mail n'est
 * envoyé — le lien est écrit dans un fichier (voir src/auth.ts). On le relit
 * pour l'afficher dans le navigateur. Garde-fou : `enDemo` est false dès que
 * Resend est configuré (prod) — le lien n'est jamais exposé.
 */
export async function recupererLienDev(email: string): Promise<{
  enDemo: boolean;
  url?: string;
}> {
  if (process.env.AUTH_RESEND_KEY) {
    return { enDemo: false };
  }

  const safe = email.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  const file = path.join(
    process.cwd(),
    "node_modules",
    ".cache",
    `dev-magic-link-${safe}.txt`,
  );

  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { url?: string };
    return { enDemo: true, url: parsed.url };
  } catch {
    return { enDemo: true };
  }
}
