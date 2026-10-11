import { expect, test } from "@playwright/test";
import { loginAs, PV_PNG } from "./helpers";

test("SIRET (lot 4) : questionnaire urgence pro → vérification API mock → badge juriste", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Client : dépôt d'un arrêté 3F (nom de fichier « arrete-… » → texte
  //    3F côté OCR mock — le groupe « Votre urgence » (radio R1 + SIRET)
  //    s'affiche pour toute suspension ; le SIRET reste filtré 3F/48SI).
  await loginAs(page, "e2e-client@test.local");
  await page.goto("/dashboard/cases/new");
  await page.getByLabel("Type d'infraction").selectOption("SUSPENSION");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "arrete-suspension.png",
      mimeType: "image/png",
      buffer: PV_PNG,
    });
  await page.getByRole("button", { name: /Lancer l'analyse/ }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  const dossierId = page.url().split("/").pop() as string;

  // 2) Formulaire : groupe « Votre urgence » visible (3F), radio situation
  //    + champ SIRET + encart Kbis (preuveClient portée sur la question).
  await expect(page.getByText("Votre urgence", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel(/SIRET de mon entreprise/),
  ).toBeVisible();
  await expect(page.getByText("Extrait Kbis")).toBeVisible();

  await page.getByLabel("Nom", { exact: true }).fill("DUPONT");
  await page
    .getByLabel("Plaque (si mentionnée)", { exact: true })
    .fill("AB-123-CD");
  await page
    .getByLabel("Numéro de décision", { exact: true })
    .fill("DEC-2026-0500");
  await page.getByLabel("Date de la décision", { exact: true }).fill("2026-07-01");
  await page
    .getByRole("radio", { name: /Salarié \/ Cadre/ })
    .check();
  await page
    .getByLabel(/SIRET de mon entreprise/)
    .fill("35600000066432");
  await page
    .getByRole("button", { name: "Analyser et générer la lettre" })
    .click();

  // Le dossier passe à l'examen juriste (pas de fondement validé automatique).
  await expect(
    page.getByText(/Examen par un juriste en cours|Lettre en cours de validation/),
  ).toBeVisible();

  // 3) Juriste : le badge « SIRET vérifié » affiche la dénomination mock
  //    (provider `SIRET_PROVIDER=mock`, sans appel réseau).
  const ctx = await browser.newContext();
  const juriste = await ctx.newPage();
  await loginAs(juriste, "e2e-juriste@test.local");
  await juriste.goto(`/dashboard/juriste/${dossierId}`);
  const badge = juriste.getByTestId("badge-siret-verifie");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("SAS ENTREPRISE MOCK");
  await expect(juriste.getByTestId("badge-urgence-pro")).toBeVisible();

  await ctx.close();
});
