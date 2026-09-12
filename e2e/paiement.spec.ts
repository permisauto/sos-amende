import { expect, test, type Browser } from "@playwright/test";
import { loginAs } from "./helpers";

async function validerVirementAdmin(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-admin@test.local");

  // Confirmer que la session est bien celle de l'admin
  await expect(page.getByRole("link", { name: "Base juridique" })).toBeVisible();

  await page.goto("/dashboard/admin/paiements");
  // Le paiement du client jetable apparaît dans la file d'attente.
  const ligne = page
    .locator("div")
    .filter({ hasText: email })
    .filter({ has: page.getByRole("button", { name: /Valider →/ }) })
    .last();
  await ligne.getByRole("button", { name: /Valider →/ }).click();
  await expect(page.getByText("Action effectuée.")).toBeVisible();

  await ctx.close();
}

test("paiement virement (inscription inversée) : payer → compte créé → crédit débloqué par l'admin → connexion", async ({
  page,
  browser,
}) => {
  test.slow();

  // Email unique par run pour rester idempotent (la route virement crée le compte).
  const email = `e2e-payeur-${Date.now()}@test.local`;

  // Paiement d'abord, pas d'inscription (garde-fou « payment-first »).
  await page.goto("/paiement?type=AMENDE");
  await expect(
    page.getByRole("heading", { name: "Paiement — 39 € / amende" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Prénom *", exact: true }).fill("Jean");
  await page.getByRole("textbox", { name: "Nom *", exact: true }).fill("DUPONT");
  await page.getByRole("textbox", { name: "Email *", exact: true }).fill(email);
  await page
    .getByRole("textbox", { name: "WhatsApp *", exact: true })
    .fill("+33612345678");
  await page
    .getByRole("button", { name: "Valider et recevoir le RIB" })
    .click();

  // Le virement est enregistré : RIB affiché + compte créé.
  await expect(
    page.getByText(/Virement enregistré/),
  ).toBeVisible();

  // L'admin valide le virement → +1 crédit (le flux virement est le seul paiement V1).
  await validerVirementAdmin(browser, email);

  // Connexion magic-link puis dashboard : le compte a bien été créé
  // et le crédit débloque l'accès au dépôt.
  await loginAs(page, email);
  await expect(page.getByText("Crédits", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 crédit disponible", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Téléverser un PV — gratuit" }),
  ).toBeVisible();
});