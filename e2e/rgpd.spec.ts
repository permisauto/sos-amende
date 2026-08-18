import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { loginAs, PV_PNG } from "./helpers";

test("RGPD : export des données (portabilité) puis effacement du compte", async ({
  page,
}) => {
  test.slow();

  // Compte jetable (créé par le webhook mock, paiement d'abord) pour ne jamais
  // toucher aux comptes partagés par les autres tests.
  const email = `e2e-rgpd-${Date.now()}@test.local`;

  await page.goto(`/mock-stripe?type=AMENDE&email=${email}`);
  await page.getByRole("button", { name: /Payer 39 €/ }).click();
  await expect(
    page.getByText("Paiement validé (démo)", { exact: false }),
  ).toBeVisible();

  await loginAs(page, email);

  // Un dossier pour que l'export contienne des données réelles.
  await page.goto("/dashboard/cases/new");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "pv.png", mimeType: "image/png", buffer: PV_PNG });
  await page.getByRole("button", { name: "Lancer le dossier" }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);

  // Portabilité : téléchargement JSON contenant profil + dossier.
  await page.goto("/dashboard/parametres");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: "Télécharger mes données (JSON)" })
      .click(),
  ]);
  const json = JSON.parse(
    await readFile(await download.path(), "utf8"),
  ) as {
    utilisateur: { email: string };
    dossiers: unknown[];
  };
  expect(json.utilisateur.email).toBe(email);
  expect(json.dossiers.length).toBeGreaterThan(0);

  // Effacement (RGPD art. 17) : suppression du compte jetable.
  await page
    .getByRole("button", { name: "Supprimer définitivement mon compte" })
    .click();
  await expect(
    page.getByText("Veuillez cocher la confirmation de suppression."),
  ).toBeVisible();

  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Supprimer définitivement mon compte" })
    .click();
  await expect(page).toHaveURL(/\/login\?compte-supprime=1/);
  await expect(
    page.getByText("Votre compte et vos données ont été supprimés."),
  ).toBeVisible();
});