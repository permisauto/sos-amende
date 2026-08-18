import { expect, test } from "@playwright/test";

test("la landing affiche la promesse produit", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Contester vos amendes/i }),
  ).toBeVisible();
  await expect(page.getByText(/45 jours/i).first()).toBeVisible();
});

test("la page tarifs présente les deux offres", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText(/39\s*€/).first()).toBeVisible();
  await expect(page.getByText(/59\s*€/).first()).toBeVisible();
});

test("l'analyse démo affiche la mention de simulation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/analyse démo/i)).toBeVisible();
  await expect(page.getByText(/simulation de démonstration/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /lancer la démo/i }),
  ).toBeVisible();
});

test("la démo simule un PV amende : scan → score global → lettre générée", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /lancer la démo/i }).click();
  await expect(
    page.getByText("Score de réussite estimé", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/%/).first()).toBeVisible();
  await expect(page.getByText(/faille.*identifiée/i).first()).toBeVisible();
  await expect(page.getByText(/Document scanné/i)).toBeVisible();
  await expect(
    page.getByText("Lettre de recours générée", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Alex Martin/)).toBeVisible();
  await expect(
    page.getByText(/En attente de validation par un juriste/i),
  ).toBeVisible();
  await expect(
    page.getByText("Lettre validée par le juriste", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Validée par un juriste", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/ne constitue pas un avis juridique/i),
  ).toBeVisible();
});

test("la démo simule une lettre de suspension : scan → score global → lettre", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Document simulé").selectOption("SUSPENSION");
  await page.getByRole("button", { name: /lancer la démo/i }).click();
  await expect(
    page.getByText("Score de réussite estimé", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/%/).first()).toBeVisible();
  await expect(page.getByText(/faille.*identifiée/i).first()).toBeVisible();
  await expect(
    page.getByText("Lettre de recours générée", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(/En attente de validation par un juriste/i),
  ).toBeVisible();
  await expect(
    page.getByText("Lettre validée par le juriste", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Validée par un juriste", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/ne constitue pas un avis juridique/i),
  ).toBeVisible();
});