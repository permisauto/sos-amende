import { expect, test } from "@playwright/test";

test("le portail ANTAI mock accepte un dépôt et émet un accusé", async ({
  page,
}) => {
  await page.goto("/mock-antai");
  await page.getByLabel("Numéro PV").fill("E2E-00042");
  await page.getByLabel("Plaque").fill("AB-123-CD");
  await page.getByLabel("Requérant").fill("Dupont Test");
  await page
    .getByLabel("Lettre")
    .fill("Je conteste le PV E2E-00042 pour erreur de plaque.");

  await page.getByRole("button", { name: /Simuler le dépôt ANTAI/i }).click();

  await expect(page.getByText(/Dépôt accepté/i)).toBeVisible();
  await expect(page.getByText(/ANTAI-/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /accusé de dépôt/i }),
  ).toHaveAttribute("href", /^\/uploads\/preuves\//);
});