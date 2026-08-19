import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

/** Fichier magic-link dev, dédié à l'email (voir src/auth.ts). */
function magicFile(email: string): string {
  const safe = email.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  return path.join(
    process.cwd(),
    "node_modules",
    ".cache",
    `dev-magic-link-${safe}.txt`,
  );
}

export const PV_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Dépôt d'un PV (suspension comprise) : crée un dossier EN_ANALYSE et renvoie son id. */
export async function createDossier(page: Page): Promise<string> {
  await page.goto("/dashboard/cases/new");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "pv.png", mimeType: "image/png", buffer: PV_PNG });
  await page.getByRole("button", { name: "Lancer le dossier" }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  return page.url().split("/").pop() as string;
}

/**
 * Analyse d'un dossier : l'OCR (provider mock) a pré-rempli le formulaire, la
 * relecture humaine confirme puis soumet (garde-fou human-in-the-loop).
 */
export async function analyserDossier(page: Page): Promise<void> {
  await expect(page.getByLabel("Plaque", { exact: true })).toHaveValue(
    "AB-123-CD",
  );
  await expect(
    page.getByLabel("Date du PV", { exact: true }),
  ).toHaveValue("2026-07-01");
  await expect(
    page.getByText(/pré-remplis par lecture automatique/),
  ).toBeVisible();

  await page.getByLabel("Nom", { exact: true }).fill("DUPONT");
  await page.getByLabel("Plaque", { exact: true }).fill("AB-123-CD");
  await page.getByLabel("Numéro de PV", { exact: true }).fill("123456789");
  await page.getByLabel("Date du PV", { exact: true }).fill("2026-07-01");
  await page
    .getByRole("button", { name: "Analyser et générer la lettre" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Signature de la lettre" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Lettre confidentielle — révélée après l'envoi validé par un juriste.",
      { exact: true },
    ),
  ).toBeVisible();
}

/**
 * Connexion dev via magic-link : en l'absence d'AUTH_RESEND_KEY, le lien est
 * écrit dans node_modules/.cache/dev-magic-link.txt (voir src/auth.ts) au lieu
 * d'être envoyé par e-mail.
 *
 * Plusieurs tests parallèles partagent le même compte (un fichier magic-link
 * par email) : le jeton est à usage unique, donc une tentative peut échouer
 * si un autre worker a consommé le lien. On réessaie la connexion (régénère
 * un jeton) jusqu'à réussite.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await unlink(magicFile(email)).catch(() => {});

    await page.goto("/login");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page
      .getByRole("button", { name: "Recevoir mon lien de connexion" })
      .click();

    const { url } = await readMagicLink(email);
    expect(url).toContain("/api/auth/callback/resend");

    await page.goto(url);
    await page.goto("/dashboard");
    try {
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
      return;
    } catch {
      if (attempt === 5) throw new Error(`Connexion impossible pour ${email}.`);
      await page.waitForTimeout(500 * attempt);
    }
  }
}

async function readMagicLink(
  email: string,
): Promise<{ identifier: string; url: string }> {
  const file = magicFile(email);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as { identifier: string; url: string };
      if (parsed.url) return parsed;
    } catch {
      // fichier pas encore écrit
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `Lien magic-link dev introuvable pour ${email} (node_modules/.cache).`,
  );
}