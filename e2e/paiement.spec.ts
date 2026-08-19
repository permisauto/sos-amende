import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("paiement mock (inscription inversée) : payer → compte crédité → connexion", async ({
  page,
}) => {
  test.slow();

  // Email unique par run pour rester idempotent (le webhook crée le compte).
  const email = `e2e-payeur-${Date.now()}@test.local`;

  // Paiement d'abord, pas d'inscription (garde-fou « payment-first »).
  await page.goto(`/mock-stripe?type=AMENDE&email=${email}`);
  await expect(
    page.getByRole("heading", { name: "Contestation d'amende" }),
  ).toBeVisible();
  await expect(page.getByText("39 €", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Payer 39 €/ }).click();
  await expect(
    page.getByText("Paiement validé (démo)", { exact: false }),
  ).toBeVisible();

  // Le webhook (simulé) a créé/upgradé le compte avec 1 crédit :
  // connexion magic-link puis dashboard.
  await loginAs(page, email);
  await expect(page.getByText("Crédits", { exact: true })).toBeVisible();
  await expect(page.getByText("Crédits", { exact: true }).locator("..")).toContainText("1");
  // Le crédit débloque l'accès au dépôt.
  await expect(
    page.getByRole("link", { name: "Téléverser un PV" }),
  ).toBeVisible();
});