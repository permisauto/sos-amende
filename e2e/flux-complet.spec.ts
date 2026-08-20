import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

async function signerLettre(page: import("@playwright/test").Page) {
  const canvas = page.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 40, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40, {
    steps: 8,
  });
  await page.mouse.move(box.x + box.width - 20, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Signer et générer le PDF" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lettre signée" }),
  ).toBeVisible();
}

async function approuverLettre(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");

  // Confirmer que la session est bien celle du juriste
  await expect(page.getByText("Juriste E2E", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Espace juriste" }),
  ).toBeVisible();

  await page.goto("/dashboard/juriste");
  await page.getByRole("link", { name: "Client E2E" }).first().click();
  await page.waitForURL(/\/dashboard\/juriste\/[^/]+$/);
  await page
    .getByRole("button", { name: "Approuver la lettre et envoyer la contestation" })
    .click();
  // Validation → envoi automatique à ANTAI (mock) avec accusé de dépôt
  await expect(
    page.getByText("Lettre validée et contestation envoyée à ANTAI", {
      exact: false,
    }),
  ).toBeVisible();
  // La timeline juriste retrace la validation puis l'envoi
  await expect(
    page.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Envoyé à ANTAI", { exact: false }).first(),
  ).toBeVisible();

  await ctx.close();
}

async function decisionOmpJuriste(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");

  await page.goto("/dashboard/juriste?f=ENVOYE");
  await page.getByRole("link", { name: "Client E2E" }).first().click();
  await page.waitForURL(/\/dashboard\/juriste\/[^/]+$/);

  await expect(
    page.getByText("Dossier envoyé — contestation transmise", {
      exact: true,
    }),
  ).toBeVisible();

  // Suivi post-envoi : le juriste enregistre la décision OMP → dossier Résolu
  await page
    .getByLabel("Décision de l'OMP")
    .selectOption({ label: "Requête acceptée (amende annulée)" });
  await page
    .getByLabel("Note (optionnelle, affichée au client)")
    .fill("Annulation confirmée par l'OMP.");
  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await expect(
    page.getByText("Décision OMP enregistrée, dossier résolu.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Dossier résolu — décision : requête acceptée",
    }),
  ).toBeVisible();

  await ctx.close();
}

test("flux complet : dépôt → analyse → signature → validation juriste → envoi automatique ANTAI → décision OMP", async ({
  page,
  browser,
}) => {
  test.slow();

  await loginAs(page, "e2e-client@test.local");

  const dossierId = await createDossier(page);
  await analyserDossier(page);
  await signerLettre(page);

  // Le client voit sa lettre signée, en attente de validation du juriste
  await expect(
    page.getByText("En attente de validation du juriste", { exact: false }),
  ).toBeVisible();

  // Le juriste approuve la lettre → envoi automatique à ANTAI (mock)
  await approuverLettre(browser);
  await page.goto(`/dashboard/cases/${dossierId}`);

  // Côté client : la contestation est envoyée, la lettre est révélée
  await expect(
    page.getByRole("heading", { name: "Contestation envoyée" }),
  ).toBeVisible();
  await expect(
    page.getByText("Envoyé à ANTAI", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Votre lettre de contestation" }),
  ).toBeVisible();
  await expect(
    page.getByText("vérifiée et validée par un juriste", { exact: false }),
  ).toBeVisible();

  // Le juriste enregistre la décision OMP → dossier Résolu
  await decisionOmpJuriste(browser);

  // Le client retrouve la décision : dossier résolu
  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByText(
      "Dossier résolu : votre contestation a été acceptée",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Envoyé à ANTAI", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Décision OMP enregistrée", { exact: false }),
  ).toBeVisible();
});