import { expect, test } from "@playwright/test";

/**
 * Création obligatoire du mot de passe après la première connexion :
 *  - 1re connexion par magic-link (compte sans mot de passe) → redirection
 *    vers /login/mot-de-passe ;
 *  - création du mot de passe → accès au dashboard ;
 *  - déconnexion puis reconnexion par e-mail + mot de passe (sans relancer
 *    de magic-link).
 */
test("première connexion : création obligatoire du mot de passe puis reconnexion", async ({
  page,
}) => {
  test.slow();

  // Compte jetable sans mot de passe (créé via la route de paiement).
  const email = `e2e-mdp-${Date.now()}@test.local`;
  const res = await page.request.post("/api/paiement/virement", {
    data: { type: "AMENDE", nom: "DUPONT", prenom: "Jean", email, whatsapp: "+33612345678" },
  });
  expect(res.ok()).toBeTruthy();

  // 1re connexion par magic-link.
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page
    .getByRole("button", { name: "Recevoir mon lien de connexion" })
    .click();

  // En dev (pas de Resend), le lien est écrit dans un fichier — on le relit
  // via la même mécanique que e2e/helpers.ts.
  const url = await readMagicLink(page, email);
  await page.goto(url);

  // Le dashboard exige un mot de passe tant qu'il n'est pas défini.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\/mot-de-passe/);
  await expect(
    page.getByRole("heading", { name: "Créez votre mot de passe" }),
  ).toBeVisible();

  await page.getByLabel("Mot de passe", { exact: true }).fill("MonMdpE2e2026!");
  await page
    .getByLabel("Confirmez le mot de passe", { exact: true })
    .fill("MonMdpE2e2026!");
  await page
    .getByRole("button", { name: "Créer mon mot de passe" })
    .click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

  // Déconnexion, puis reconnexion par mot de passe (plus de magic-link).
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await page.waitForURL("/", { timeout: 5_000 });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("MonMdpE2e2026!");
  await page
    .getByRole("button", { name: "Se connecter" })
    .click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
});

async function readMagicLink(
  page: import("@playwright/test").Page,
  email: string,
): Promise<string> {
  const safe = email.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  // Le fichier est écrit par src/auth.ts en mode dev.
  let raw: string | null = null;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const fs = await import("node:fs/promises");
      raw = await fs.readFile(
        `node_modules/.cache/dev-magic-link-${safe}.txt`,
        "utf8",
      );
      if (raw) break;
    } catch {
      // pas encore écrit
    }
    await page.waitForTimeout(300);
  }
  if (!raw) throw new Error("Magic-link introuvable pour la spec mot-de-passe.");
  return (JSON.parse(raw) as { url: string }).url;
}