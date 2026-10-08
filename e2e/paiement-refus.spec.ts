import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("refus de virement : motif obligatoire, décision tracée côté admin, bandeau + e-mail côté client", async ({
  page,
  browser,
}) => {
  test.slow();

  // Email unique par run pour rester idempotent (la route virement crée le compte).
  const email = `e2e-refus-${Date.now()}@test.local`;
  const motif = "Preuve illisible — montant non conforme au virement";

  // 1. Création du paiement via le formulaire public (payment-first).
  await page.goto("/paiement?type=AMENDE");
  await expect(
    page.getByRole("heading", { name: "Paiement — 39 € / amende" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Prénom *", exact: true }).fill("Rita");
  await page.getByRole("textbox", { name: "Nom *", exact: true }).fill("TESTEUR");
  await page
    .getByRole("textbox", { name: "Email *", exact: true })
    .fill(email);
  await page
    .getByRole("textbox", { name: "WhatsApp *", exact: true })
    .fill("+33699887766");
  await page
    .getByRole("button", { name: "Valider et recevoir le RIB" })
    .click();
  await expect(page.getByText(/Virement enregistré/)).toBeVisible();

  // 2. L'admin refuse avec un motif (obligatoire — champ exigeant).
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await loginAs(admin, "e2e-admin@test.local");
  await expect(
    admin.getByRole("link", { name: "Bibliothèque juridique" }),
  ).toBeVisible();

  await admin.goto("/dashboard/admin/paiements");
  const ligne = admin.getByRole("row").filter({ hasText: email });
  // Identité complète : nom, email et téléphone.
  await expect(ligne.getByText("+33699887766")).toBeVisible();
  await ligne
    .getByRole("textbox", { name: "Motif du refus" })
    .fill(motif);
  await ligne.getByRole("button", { name: "Refuser" }).click();
  await expect(admin.getByText("Action effectuée.")).toBeVisible();

  // 3. Le refus reste consultable (historique) avec son motif.
  await admin.getByRole("link", { name: "Refusés" }).click();
  const refusee = admin.getByRole("row").filter({ hasText: email });
  await expect(refusee.getByText(motif)).toBeVisible();
  await expect(refusee.getByText("Refusé", { exact: true })).toBeVisible();

  // 4. Côté client : bandeau rouge dans l'espace + motif + lien de nouveau virement.
  await loginAs(page, email);
  await expect(page.getByText("Crédits", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucun crédit disponible", { exact: true })).toBeVisible();
  await expect(page.getByTestId("bandeau-paiement-refuse")).toBeVisible();
  await expect(page.getByText(motif)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Refaire un virement" }),
  ).toBeVisible();

  await ctx.close();
});
