import { expect, test } from "@playwright/test";
import { loginAs, PV_PNG } from "./helpers";

test("flux SUSPENSION (infra) : dépôt → analyse type-aware → attente juriste → rejet", async ({
  page,
  browser,
}) => {
  test.slow();

  // Le client crée un dossier SUSPENSION (sélecteur de type)
  await loginAs(page, "e2e-client@test.local");
  await page.goto("/dashboard/cases/new");
  await page.getByLabel("Type d'infraction").selectOption("SUSPENSION");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "decision.png", mimeType: "image/png", buffer: PV_PNG });
  await page.getByRole("button", { name: "Lancer le dossier" }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  const dossierId = page.url().split("/").pop() as string;

  // L'analyse est type-aware : libellés SUSPENSION + questionnaire masqué
  await expect(page.getByLabel("Numéro de décision", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Date de la décision", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Le questionnaire ciblé (paiement, cession, vol, conducteur)",
      { exact: false },
    ),
  ).toBeVisible();

  await page.getByLabel("Nom", { exact: true }).fill("DUPONT");
  await page.getByLabel("Plaque", { exact: true }).fill("AB-123-CD");
  await page.getByLabel("Numéro de décision", { exact: true }).fill("DEC-2026-0421");
  await page.getByLabel("Date de la décision", { exact: true }).fill("2026-07-01");
  await page
    .getByRole("button", { name: "Analyser et générer la lettre" })
    .click();

  // Aucun fondement SUSPENSION validé → examen par un juriste (garde-fou)
  await expect(
    page.getByText("Examen par un juriste en cours", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Suspension de permis : délais de recours très courts", {
      exact: true,
    }),
  ).toBeVisible();

  // Le juriste voit le dossier avec le callout d'urgence et peut le rejeter
  const ctx = await browser.newContext();
  const juriste = await ctx.newPage();
  await loginAs(juriste, "e2e-juriste@test.local");
  await juriste.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    juriste.getByText("Suspension de permis : délais de recours très courts", {
      exact: true,
    }),
  ).toBeVisible();
  await juriste
    .getByLabel("Motif du rejet (affiché au client)")
    .fill("Aucun fondement juridique validé pour cette décision de rétention.");
  await juriste.getByRole("button", { name: "Rejeter le dossier" }).click();
  await expect(
    juriste.getByText("Dossier rejeté, le client est informé du motif."),
  ).toBeVisible();

  // Le client retrouve le rejet (crédit rendu)
  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByText("Dossier rejeté après examen", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Votre crédit a été rendu", { exact: false }),
  ).toBeVisible();

  await ctx.close();
});