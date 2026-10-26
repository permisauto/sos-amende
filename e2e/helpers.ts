import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

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

/** URL de base de données pour les tests E2E. */
export function dbUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public"
  );
}

export const PV_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Génère un email unique pour un test E2E.
 * Format : e2e-{testName}-{timestamp}@test.local
 */
export function uniqueEmail(testName: string): string {
  return `e2e-${testName}-${Date.now()}@test.local`;
}

/**
 * Crée un client E2E directement en base avec crédits (pour tests isolés).
 * Retourne l'email créé.
 */
export async function creerClientE2E(testName: string, credits = 50): Promise<string> {
  const email = uniqueEmail(testName);
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    const e2ePwd =
      "scrypt$32768$8$1$f05734780417c278f0efd0dddd8cbcbd$2a6d4e183029e4b0cc51f69aa1810bb55ad06874af2055cbf1730f6e612a45bf9c1800d930a8a128d0edca11a2b26cf8ade73b4752390ceb7b88a0871c2f8212";
    await client.query(
      `INSERT INTO "User" (id, email, name, role, credits, "emailVerified", "passwordHash", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Client E2E', 'CLIENT', $2, now(), $3, now())
       ON CONFLICT (email) DO UPDATE SET
         "passwordHash" = EXCLUDED."passwordHash",
         credits = EXCLUDED.credits`,
      [email, credits, e2ePwd],
    );
  } finally {
    await client.end();
  }
  return email;
}

/**
 * Crée un compte E2E jetable via l'API de virement (payment-first).
 * Retourne l'email créé. Attention : pas de crédits tant que l'admin ne valide pas.
 */
export async function creerCompteE2E(
  page: Page,
  testName: string,
  overrides: { type?: "AMENDE" | "SUSPENSION"; nom?: string; prenom?: string; whatsapp?: string } = {},
): Promise<string> {
  const email = uniqueEmail(testName);
  const res = await page.request.post("/api/paiement/virement", {
    data: {
      type: overrides.type ?? "AMENDE",
      nom: overrides.nom ?? "DUPONT",
      prenom: overrides.prenom ?? "Jean",
      email,
      whatsapp: overrides.whatsapp ?? "+33612345678",
    },
  });
  expect(res.ok()).toBeTruthy();
  await loginAs(page, email);
  return email;
}

/**
 * Dépôt d'un PV (suspension comprise) : crée un dossier EN_ANALYSE et renvoie
 * son id. Le provider OCR mock route le document par le nom de fichier :
 * `contentieux.png` (4e classe) et `delit.png` (AFD) sont utilisés par
 * `contentieux.spec.ts`.
 */
export async function createDossier(
  page: Page,
  nomFichier = "pv.png",
): Promise<string> {
  await page.goto("/dashboard/cases/new");
  await page.locator('input[type="file"]').setInputFiles({
    name: nomFichier,
    mimeType: "image/png",
    buffer: PV_PNG,
  });
  await page.getByRole("button", { name: /Lancer l'analyse/ }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  return page.url().split("/").pop() as string;
}

/**
 * Analyse d'un dossier : l'OCR (provider mock) a pré-rempli le formulaire, la
 * relecture humaine confirme puis soumet (garde-fou human-in-the-loop).
 *
 * `attente` décrit l'écran d'arrivée, qui dépend de la voie de procédure :
 * - `validation` (défaut) : amende simple → EN_ATTENTE_VALIDATION ;
 * - `paiement` : contentieux (4e/5e classe) → redirect `/dashboard/paiement/[id]` ;
 * - `avocat` : délit → dossier AVOCAT_REQUIS (`?avocat=1`).
 */
export async function analyserDossier(
  page: Page,
  attente: "validation" | "paiement" | "avocat" = "validation",
): Promise<void> {
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

  if (attente === "paiement") {
    await page.waitForURL(/\/dashboard\/paiement\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: /Contentieux contraventionnel/ }),
    ).toBeVisible();
    return;
  }
  if (attente === "avocat") {
    await page.waitForURL(/\/dashboard\/cases\/[^/?]+\?avocat=1$/);
    await expect(page.getByTestId("avocat-requis")).toBeVisible();
    return;
  }

  await expect(
    page.getByRole("heading", {
      name: "Lettre en cours de validation",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("En attente de validation du juriste", { exact: false }),
  ).toBeVisible();
}

/**
 * Connexion dev via magic-link : en l'absence d'AUTH_RESEND_KEY, le lien est
 * écrit dans node_modules/.cache/dev-magic-link.txt (voir src/auth.ts) au lieu
 * d'être envoyé par e-mail.
 *
 * Chaque email a son propre fichier magic-link (pas de course entre workers).
 * Le jeton est à usage unique : on réessaie la connexion (régénère un jeton)
 * jusqu'à réussite.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await unlink(magicFile(email)).catch(() => {});

    await ouvrirFormulaireConnexion(page);
    await page.getByLabel("Adresse e-mail").fill(email);
    await page
      .getByRole("button", { name: "Recevoir mon lien de connexion" })
      .click();

    const { url } = await readMagicLink(email);
    expect(url).toContain("/api/auth/callback/resend");

    await page.goto(url);
    await page.goto("/dashboard");
    try {
      // Compte sans mot de passe (1re connexion) : le dashboard redirige vers
      // la création d'un mot de passe — on la complète avec un mot de passe de
      // test (comme le seed/global-setup) pour accéder à l'espace.
      if (page.url().includes("/login/mot-de-passe")) {
        await page.getByLabel("Mot de passe", { exact: true }).fill("MdpE2e2026!");
        await page
          .getByLabel("Confirmez le mot de passe", { exact: true })
          .fill("MdpE2e2026!");
        await page
          .getByRole("button", { name: "Créer mon mot de passe" })
          .click();
      }
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
      return;
    } catch {
      if (attempt === 5) throw new Error(`Connexion impossible pour ${email}.`);
      await page.waitForTimeout(500 * attempt);
    }
  }
}

/**
 * Connexion en tant que juriste/admin (comptes partagés, créés par seed/global-setup).
 * Ces comptes ont déjà un passwordHash.
 */
export async function loginAsJuriste(page: Page): Promise<void> {
  await loginAs(page, "e2e-juriste@test.local");
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, "e2e-admin@test.local");
}

/**
 * Ouvre `/login` avec un contexte vierge.
 *
 * Piège sous charge : `@auth/core` re-signe le JWT et renvoie `Set-Cookie` à
 * CHAQUE évaluation de session — une réponse RSC encore en vol (prefetch du
 * dashboard précédent) peut donc ré-émettre l'ancien cookie juste après le
 * purge des cookies, ce qui fait rediriger `/login` vers `/dashboard` et
 * `loginAs` n'y trouve plus de formulaire. On laisse d'abord le réseau se
 * calmer (flush des réponses en vol), on purge, et on repurge si la
 * redirection a eu lieu.
 */
async function ouvrirFormulaireConnexion(page: Page): Promise<void> {
  await page
    .waitForLoadState("networkidle", { timeout: 3_000 })
    .catch(() => {});
  for (let tentative = 1; tentative <= 3; tentative++) {
    if (tentative > 1) await page.waitForTimeout(500);
    await page.context().clearCookies();
    await page.goto("/login");
    if (!page.url().includes("/dashboard")) return;
  }
  throw new Error(
    `Impossible d'ouvrir /login : redirigé vers ${page.url()} malgré le purge des cookies.`,
  );
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