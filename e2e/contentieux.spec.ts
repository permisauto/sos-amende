import { Client } from "pg";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { analyserDossier, createDossier, loginAs, loginAsJuriste, loginAsAdmin, creerClientE2E, uniqueEmail, dbUrl } from "./helpers";

async function validerPaiementContentieux(
  browser: Browser,
  email: string,
  whatsapp: string,
): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAsAdmin(page);

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
  await loginAsJuriste(page);

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
  const email = uniqueEmail("delit");
  await creerClientE2E("delit");
  await loginAs(page, email);

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

  const email = uniqueEmail("contentieux");
  const whatsapp = `+3369${Date.now().toString().slice(-8)}`;
  await creerClientE2E("contentieux");
  await loginAs(page, email);

  const dossierId = await createDossier(page, "contentieux.png");
  // 135 € → 4e classe : examen payant (149 €), redirection vers le paiement.
  await analyserDossier(page, "paiement");

  // Encart consignation (tribunal de police) + montant de l'offre contentieux.
  await expect(
    page.getByText("Contentieux contraventionnel (4e/5e classe)"),
  ).toBeVisible();
  await expect(page.getByText(/consignation/i).first()).toBeVisible();

  // Garde-fou : tant que le contentieux n'est pas paye (149 €), le dossier
  // reste bloque pour validation/envoi cote juriste.
  const ctxJuriste = await browser.newContext();
  const pageJuriste = await ctxJuriste.newPage();
  await loginAsJuriste(pageJuriste);
  await pageJuriste.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    pageJuriste.getByRole("button", { name: "Valider la lettre" }),
  ).toHaveCount(0);
  await ctxJuriste.close();

  // Créer un payment contentieux en base pour que l'admin puisse le valider
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    const userRes = await client.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const userId = userRes.rows[0]?.id;
    if (userId) {
      await client.query(
        `INSERT INTO "Payment" (id, "userId", "dossierId", amount, currency, status, kind, "optionLrar", "preuveUrl", "preuveNom", "preuveUploadedAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, 149.00, 'EUR', 'PENDING_VIREMENT', 'CONTENTIEUX', false, '/uploads/fake-proof.pdf', 'fake-proof.pdf', now(), now(), now())`,
        [userId, dossierId],
      );
    }
  } finally {
    await client.end();
  }

  // L'admin valide le virement → le dossier passe en validation juriste.
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
