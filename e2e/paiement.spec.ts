import { expect, test, type Browser } from "@playwright/test";
import { loginAs } from "./helpers";

async function validerVirementAdmin(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-admin@test.local");

  // Confirmer que la session est bien celle de l'admin
  await expect(page.getByRole("link", { name: "Bibliothèque juridique" })).toBeVisible();

  await page.goto("/dashboard/admin/paiements");
  // Le paiement du client jetable apparaît dans la file d'attente (tableau).
  const ligne = page.getByRole("row").filter({ hasText: email });
  // Identité complète affichée : nom, email et téléphone saisis au paiement.
  await expect(ligne.getByText("+33612345678")).toBeVisible();
  // Colonne « État » (même barre d'étape que le suivi des dossiers).
  await expect(ligne.getByText("En attente de décision")).toBeVisible();

  // Fiche client : le nom dans le tableau ouvre le détail du client
  // (identité, suivi des dossiers, historique des paiements — lecture seule).
  await ligne.getByRole("link", { name: "Jean DUPONT" }).click();
  await page.waitForURL(/\/dashboard\/admin\/paiements\/[a-z0-9]+/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Jean DUPONT" }),
  ).toBeVisible();
  await expect(page.getByText("+33612345678")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Suivi des dossiers" }),
  ).toBeVisible();
  await expect(page.getByText("Aucun dossier pour le moment.")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Historique des paiements" }),
  ).toBeVisible();
  await expect(page.getByText(/39\s*€/)).toBeVisible();

  // Retour au tableau pour valider le virement (+1 crédit).
  await page.goto("/dashboard/admin/paiements");
  const ligneValide = page.getByRole("row").filter({ hasText: email });
  await ligneValide.getByRole("button", { name: /Valider →/ }).click();
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
  // Bandeau espace client : le virement validé est notifié in-app.
  await expect(page.getByTestId("bandeau-paiement-valide")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Téléverser un PV — gratuit" }),
  ).toBeVisible();
});