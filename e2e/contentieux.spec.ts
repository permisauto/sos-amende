import { expect, test, type Browser, type Page } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

/**
 * Compte jetable (même approche que `rgpd.spec.ts`) : la route publique de
 * virement crée le compte sans toucher aux comptes partagés — le nom du client
 * est réécrit au paiement (« Jean DUPONT »), ce qui casserait les specs qui
 * cherchent « Client E2E ».
 */
async function creerCompteJetable(page: Page, email: string): Promise<void> {
  const res = await page.request.post("/api/paiement/virement", {
    data: {
      type: "AMENDE",
      nom: "DUPONT",
      prenom: "Jean",
      email,
      whatsapp: "+33612345678",
    },
  });
  expect(res.ok()).toBeTruthy();
  await loginAs(page, email);
}

async function validerPaiementContentieux(
  browser: Browser,
  email: string,
  whatsapp: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-admin@test.local");

  await page.goto(
    `/dashboard/admin/paiements?q=${encodeURIComponent(whatsapp)}`,
  );
  // Montant facturé rattaché au dossier : 149 € (offre contentieux).
  const ligne = page
    .getByRole("row")
    .filter({ hasText: whatsapp })
    .filter({ hasText: /149\s*€/ });
  await expect(ligne).toBeVisible();
  // Le montant facturé est bien celui de l'offre contentieux (149 €), jamais
  // le prix de l'amende simple (39 €).
  await expect(ligne.getByText(/149\s*€/)).toBeVisible();
  await expect(
    ligne.getByText("Offre Contentieux (tribunal de police)"),
  ).toBeVisible();
  await expect(ligne.getByText(email)).toBeVisible();

  await ligne.getByRole("button", { name: "Valider le paiement" }).click();
  await expect(page.getByText("Action effectuée.")).toBeVisible();

  await ctx.close();
}

async function validerLettreJuriste(
  browser: Browser,
  dossierId: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-juriste@test.local");

  await page.goto(`/dashboard/juriste/${dossierId}`);
  await page
    .getByLabel("Canal d'envoi de la contestation")
    .selectOption("ANTAI");
  await page.getByRole("button", { name: "Valider la lettre" }).click();
  await expect(
    page.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible();

  await ctx.close();
}

test("délit : orientation avocat, aucun paiement ni lettre", async ({
  page,
}) => {
  const email = `e2e-delit-${Date.now()}@test.local`;
  await creerCompteJetable(page, email);

  await createDossier(page, "delit.png");
  await analyserDossier(page, "avocat");

  // Encart d'orientation : procédure pénale, assistance d'un avocat requise.
  await expect(page.getByTestId("avocat-requis")).toBeVisible();
  await expect(
    page.getByText("Aucun paiement n'a été débité.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Demander un avocat" }),
  ).toBeVisible();

  // Statut client et absence totale de lettre / signature / paiement.
  await expect(
    page.getByText("Délit — orientation vers un avocat").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Signature de la lettre" }),
  ).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /finalisez votre paiement/i }),
  ).toHaveCount(0);
});

test("contentieux : 149 € payés avant validation et envoi", async ({
  page,
  browser,
}) => {
  test.slow();

  const email = `e2e-contentieux-${Date.now()}@test.local`;
  const whatsapp = `+3369${Date.now().toString().slice(-8)}`;
  await creerCompteJetable(page, email);

  const dossierId = await createDossier(page, "contentieux.png");
  // 135 € → 4e classe : examen payant (149 €), redirection vers le paiement.
  await analyserDossier(page, "paiement");

  // Encart consignation (tribunal de police) + montant de l'offre contentieux.
  await expect(
    page.getByText("Contentieux contraventionnel (4e/5e classe)"),
  ).toBeVisible();
  await expect(page.getByText(/consignation/i).first()).toBeVisible();

  // Virement de 149 € rattaché au dossier (jamais un crédit générique).
  await page.getByRole("textbox", { name: "Nom *", exact: true }).fill("DUPONT");
  await page
    .getByRole("textbox", { name: "Prénom *", exact: true })
    .fill("Jean");
  await page
    .getByRole("textbox", { name: "WhatsApp *", exact: true })
    .fill(whatsapp);
  await page
    .getByRole("button", { name: /Valider et recevoir le RIB \(149 €\)/ })
    .click();
  await expect(
    page.getByText("Demande de virement enregistrée", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Montant :").first()).toBeVisible();
  await expect(page.getByText(/149\s*€/).first()).toBeVisible();

  // L'admin encaisse le virement → le dossier passe en validation juriste.
  await validerPaiementContentieux(browser, email, whatsapp);

  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByText("Validation du juriste").first(),
  ).toBeVisible();

  // Le juriste peut alors valider la lettre (plus de blocage de facturation).
  await validerLettreJuriste(browser, dossierId);

  await page.goto(`/dashboard/cases/${dossierId}`);
  await expect(
    page.getByRole("heading", { name: "Signature de la lettre" }),
  ).toBeVisible();
  await expect(
    page.getByText("En attente de votre signature"),
  ).toBeVisible();
});
