import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

async function signerLettre(page: import("@playwright/test").Page) {
  // Si une signature a déjà été réutilisée (P2 : case « Réutiliser ma
  // signature enregistrée »), on la décoche pour retrouver le canvas.
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
  // Dépôt assisté : attendre que le dossier soit PRET (génération PDF + écriture
  // sous charge parallèle sur le même compte client → patience large).
  await expect(
    page.getByRole("button", { name: /déposé ma contestation/ }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function approuverLettre(browser: Browser, dossierId: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");
  await page.goto(`/dashboard/juriste/${dossierId}`);
  await page
    .getByLabel("Canal d'envoi de la contestation")
    .selectOption("ANTAI");
  await page
    .getByRole("button", { name: "Valider la lettre" })
    .click();
  // La validation est enregistrée dans les deux cas (signature déjà enregistrée
  // sur le profil → Cas A dossier PRET, sinon Cas B en attente de signature).
  await expect(
    page.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible();
  await ctx.close();
}

/**
 * Récupération AUTOMATIQUE de la décision : après le dépôt du client, aucun
 * juriste et aucun client ne saisit la décision — le cron interroge le portail
 * (mock en E2E) et clôt le dossier RESOLU de lui-même.
 */
test("suivi décision : le cron récupère la décision sans action du client", async ({
  page,
  browser,
  request,
}) => {
  test.slow();

  // Compte dédié (e2e-client-suivi@test.local) : sa signature de profil est
  // pré-posée par global-setup (Cas A déterministe — le dossier est PRET dès la
  // validation juriste, pas de canvas) et isolé du client partagé par les
  // autres specs.
  await loginAs(page, "e2e-client-suivi@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);
  await expect(
    page.getByText("En attente de validation du juriste", { exact: false }),
  ).toBeVisible();

  // Le juriste valide la lettre (canal ANTAI) → en attente de signature.
  await approuverLettre(browser, dossierId);
  await page.goto(`/dashboard/cases/${dossierId}`);

  // Le client signe (Cas B) puis dépose sa contestation sur le portail officiel.
  if (await page.locator("canvas").first().isVisible().catch(() => false)) {
    await signerLettre(page);
  }
  await page
    .getByRole("button", { name: /déposé ma contestation/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Contestation envoyée" }),
  ).toBeVisible();

  // Personne ne saisit rien : le cron interroge le portail (mock) et récupère
  // la décision. La passe est limitée AU dossier créé par ce test (aucun
  // impact sur les dossiers des specs parallèles).
  const res = await request.get(
    `/api/cron/recuperations-decisions?dossierId=${dossierId}`,
    { headers: { Authorization: "Bearer e2e-cron-secret" } },
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { decisions: number };
  expect(body.decisions).toBeGreaterThanOrEqual(1);

  // Le client voit le dossier résolu — sans avoir remonté la décision.
  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByText(/Dossier résolu : votre contestation a été (acceptée|rejetée)/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "La décision a été récupérée automatiquement par SOS Amende depuis le portail officiel.",
      { exact: true },
    ),
  ).toBeVisible();
});