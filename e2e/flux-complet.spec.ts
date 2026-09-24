import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

async function signerLettre(page: import("@playwright/test").Page) {
  // Si une signature a déjà été réutilisée (P2 : case « Réutiliser ma
  // signature enregistrée »), on la décoche pour retrouver le canvas de
  // signature — le test trace toujours une nouvelle signature.
  const caseReutiliser = page.getByRole("checkbox", {
    name: /Réutiliser ma signature enregistrée/,
  });
  if (await caseReutiliser.isVisible().catch(() => false)) {
    await caseReutiliser.uncheck();
  }
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
  // Signature validée par le juriste → envoi automatique à ANTAI (mock)
  await expect(
    page.getByRole("heading", { name: "Contestation envoyée" }),
  ).toBeVisible();
}

async function approuverLettre(browser: Browser, dossierId: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");

  // Confirmer que la session est bien celle du juriste
  await expect(page.getByText("Juriste E2E", { exact: true })).toBeVisible();

  await page.goto(`/dashboard/juriste/${dossierId}`);
  await page
    .getByLabel("Canal d'envoi de la contestation")
    .selectOption("ANTAI");
  await page
    .getByRole("button", { name: "Valider et Envoyer" })
    .click();
  // Lettre validée (sans signature) → en attente de la signature du client
  await expect(
    page.getByText("en attente de la signature du client", {
      exact: false,
    }),
  ).toBeVisible();
  // La timeline juriste retrace la validation (l'envoi viendra après la
  // signature du client)
  await expect(
    page.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible();

  await ctx.close();
}

async function decisionOmpJuriste(browser: Browser, dossierId: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");

  await page.goto(`/dashboard/juriste/${dossierId}`);

  await expect(
    page.getByText("Dossier envoyé — contestation transmise", {
      exact: true,
    }),
  ).toBeVisible();
  // La lettre envoyée reste visible et téléchargeable côté juriste (B)
  await expect(
    page.getByRole("link", { name: "Télécharger la lettre (PDF)" }).first(),
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

test("flux complet : dépôt → analyse → validation juriste → signature → envoi automatique ANTAI → décision OMP", async ({
  page,
  browser,
}) => {
  test.slow();

  await loginAs(page, "e2e-client@test.local");

  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // Le client voit sa lettre, en attente de validation du juriste
  await expect(
    page.getByText("En attente de validation du juriste", { exact: false }),
  ).toBeVisible();

  // Le juriste approuve la lettre → en attente de la signature du client
  await approuverLettre(browser, dossierId);
  await page.goto(`/dashboard/cases/${dossierId}`);

  // Le client signe → la lettre validée est transmise automatiquement à ANTAI
  // (mock). Si la lettre a déjà été signée via la signature du profil (Cas A),
  // l'envoi a déjà eu lieu et le canvas n'est pas affiché.
  if (await page.locator("canvas").first().isVisible().catch(() => false)) {
    await signerLettre(page);
  }

  // Côté client : la contestation est envoyée, la lettre est révélée
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
  await decisionOmpJuriste(browser, dossierId);

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