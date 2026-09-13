"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { consommerCreneau } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide.").trim(),
});

const loginPasswordSchema = z.object({
  email: z.email("Adresse e-mail invalide.").trim(),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

export type LoginState = {
  error?: string;
};

/** Résultat de la connexion par mot de passe (comptes internes). */
export type LoginPasswordState = { error?: string };

// Anti-abus des magic-links : au plus 5 liens par e-mail, 15 par IP, par
// fenêtre de 15 minutes (coût = envoi e-mail/écriture de fichier).
const FENETRE_MS = 15 * 60 * 1000;
const MAX_EMAIL = 5;
const MAX_IP = 15;

async function ipClient(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() ?? "inconnue").slice(0, 64);
}

export async function loginWithPassword(
  _prev: LoginPasswordState,
  formData: FormData,
): Promise<LoginPasswordState> {
  const parsed = loginPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Veuillez saisir une adresse e-mail et votre mot de passe." };
  }

  // Même fenêtre de garde que les magic-links (coût = appel authorize/scrypt).
  if (process.env.AUTH_RESEND_KEY) {
    const { email } = parsed.data;
    const creneauParams = { max: MAX_EMAIL, fenetreMs: FENETRE_MS } as const;
    const emailOk = consommerCreneau(
      `password:${email.toLowerCase()}`,
      creneauParams.max,
      creneauParams.fenetreMs,
    );
    const ipOk =
      consommerCreneau(`password:ip:${await ipClient()}`, MAX_IP, FENETRE_MS) > 0;
    if (emailOk === 0 || !ipOk) {
      return {
        error: "Trop de tentatives. Attendez quelques minutes avant de réessayer.",
      };
    }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    // Succès (pas d'erreur AuthError) : on bascule immédiatement sur le
    // tableau de bord. NEXT_REDIRECT est géré par le rendu serveur.
    redirect("/dashboard");
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Identifiants incorrects." };
    }
    throw error;
  }
}

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

  // Anti-abus : blocage temporaire si la limite est dépassée (e-mail ou IP).
  // Appliqué uniquement quand Resend est configuré (prod) — l'envoi réel a un
  // coût. En dev/E2E (fichier local), la limite n'est pas activée pour ne pas
  // casser les workers parallèles.
  if (process.env.AUTH_RESEND_KEY) {
    const email = parsed.data.email.toLowerCase();
    const ip = await ipClient();
    if (
      consommerCreneau(`login:${email}`, MAX_EMAIL, FENETRE_MS) === 0 ||
      consommerCreneau(`login:ip:${ip}`, MAX_IP, FENETRE_MS) === 0
    ) {
      return {
        error:
          "Trop de demandes. Attendez quelques minutes avant de réessayer.",
      };
    }
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
