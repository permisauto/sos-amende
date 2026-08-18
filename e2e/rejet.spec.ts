import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

test("rejet juriste (statut REJETE) : motif affiché au client", async ({
  page,
  browser,
}) => {
  test.slow();

  // Le client dépose et analyse son PV → dossier « À vérifier » (lettre générée)
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // Le juriste rejette le dossier (A_VERIFIER : actions de rejet uniquement)
  const ctx = await browser.newContext();
  const juriste = await ctx.newPage();
  await loginAs(juriste, "e2e-juriste@test.local");
  await juriste.goto(`/dashboard/juriste/${dossierId}`);

  await expect(
    juriste.getByLabel("Motif du rejet (affiché au client)"),
  ).toHaveAttribute("required");

  await juriste
    .getByLabel("Motif du rejet (affiché au client)")
    .fill("Aucune faille juridique applicable à ce dossier.");
  await juriste.getByRole("button", { name: "Rejeter le dossier" }).click();
  await expect(
    juriste.getByText("Dossier rejeté, le client est informé du motif."),
  ).toBeVisible();

  // Le client voit le bandeau de rejet avec le motif
  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByText("Dossier rejeté après examen", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aucune faille juridique applicable à ce dossier.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Votre crédit a été rendu", { exact: false }),
  ).toBeVisible();

  // La timeline du dossier retrace l'événement de rejet avec le motif
  await expect(page.getByText("Suivi du dossier", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Dossier rejeté", { exact: true }),
  ).toBeVisible();

  await ctx.close();
});