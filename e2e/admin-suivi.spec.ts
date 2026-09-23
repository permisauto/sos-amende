import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

/** Le juriste approuve la lettre du client E2E (→ `valideLe` renseigné). */
async function approuverDerniereLettre(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");
  await page.goto("/dashboard/juriste");
  await page.getByRole("link", { name: "Client E2E" }).first().click();
  await page.waitForURL(/\/dashboard\/juriste\/[^/]+$/);
  await page
    .getByLabel("Canal d'envoi de la contestation")
    .selectOption("ANTAI");
  await page.getByRole("button", { name: "Valider et Envoyer" }).click();
  await expect(
    page.getByText("en attente de la signature du client", {
      exact: false,
    }),
  ).toBeVisible();
  await ctx.close();
}

test.describe("Admin — suivi des dossiers & lettres vérifiées", () => {
  test("admin : consultation seule des dossiers (état d'avancement) puis des lettres vérifiées", async ({
    page,
    browser,
  }) => {
    test.slow();

    // Prépare un dossier : client crée + analyse (À valider), juriste approuve.
    await loginAs(page, "e2e-client@test.local");
    await createDossier(page);
    await analyserDossier(page);
    await approuverDerniereLettre(browser);

    // Admin : suivi des dossiers — vue d'ensemble par état d'avancement.
    const ctxAdmin = await browser.newContext();
    const apage = await ctxAdmin.newPage();
    await loginAs(apage, "e2e-admin@test.local");
    await apage.goto("/dashboard/admin/dossiers");
    await expect(
      apage.getByRole("heading", { name: "Suivi des dossiers" }),
    ).toBeVisible();
    await expect(apage.getByText("Dossiers en cours")).toBeVisible();
    await expect(
      apage.getByRole("paragraph").filter({ hasText: "À valider" }),
    ).toBeVisible();

    // La ligne du dossier apparaît avec son état d'avancement (étape / total).
    await expect(
      apage.getByRole("link", { name: "Client E2E" }).first(),
    ).toBeVisible();
    await expect(
      apage.getByText("Étape", { exact: false }).first(),
    ).toBeVisible();

    // Consultation seule : pas d'action possible depuis la vue admin.
    await expect(
      apage.getByRole("button", { name: "Valider et Envoyer" }),
    ).toHaveCount(0);
    await expect(
      apage.getByRole("button", { name: "Envoyer la contestation" }),
    ).toHaveCount(0);

    // Admin : lettres vérifiées — la lettre validée par le juriste est visible.
    await apage.goto("/dashboard/admin/lettres");
    await expect(
      apage.getByRole("heading", { name: "Lettres vérifiées" }),
    ).toBeVisible();
    const ligne = apage
      .getByRole("row")
      .filter({ hasText: "Client E2E" })
      .first();
    await expect(ligne).toBeVisible();

    // Consultation seule : le contenu est lisible, aucun bouton d'édition.
    await ligne.getByRole("link", { name: "Consulter" }).click();
    await expect(
      apage.getByRole("heading", { name: "Votre lettre de contestation" }),
    ).toHaveCount(0); // pas de form de lettre coté admin
    await expect(
      apage.locator("div", { hasText: "Je soussigné(e)" }).first(),
    ).toBeVisible();
    await expect(
      apage.getByRole("link", { name: /Télécharger la lettre \(PDF\)/ }),
    ).toBeVisible();
    await expect(
      apage.getByRole("link", { name: "Dossier (lecture seule)" }),
    ).toBeVisible();
    await expect(
      apage.getByRole("button", { name: "Valider et Envoyer" }),
    ).toHaveCount(0);
    await ctxAdmin.close();
  });
});