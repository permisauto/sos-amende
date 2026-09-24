import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

async function signerLettre(page: import("@playwright/test").Page) {
  const caseReutiliser = page.getByRole("checkbox", {
    name: /Réutiliser ma signature enregistrée/,
  });
  if (await caseReutiliser.isVisible().catch(() => false)) {
    await caseReutiliser.uncheck();
  }
  const canvas = page.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 40, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40, {
    steps: 8,
  });
  await page.mouse.move(box.x + box.width - 20, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Signer et générer le PDF" })
    .click();
}

test("synchronisation : pipeline juriste, lettres proposées, signature visible du juriste et suivi admin", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Client : dépôt + analyse → A_VERIFIER
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // 2) Juriste : la file est classée par étapes et le drawer propose les
  //    lettres ; approbation en canal LRAR (le client transmettra lui-même).
  const ctxJuriste = await browser.newContext();
  const pj = await ctxJuriste.newPage();
  await loginAs(pj, "e2e-juriste@test.local");

  await pj.goto("/dashboard/juriste");
  await expect(
    pj.getByRole("heading", { name: "Lettres à valider / à approuver" }),
  ).toBeVisible();

  await pj.goto(`/dashboard/juriste/${dossierId}`);

  // Drawer : lettres proposées générées depuis les failles candidate
  await pj.getByRole("button", { name: "Suggestions IA" }).click();
  await expect(
    pj.getByText("Lettres proposées pour ce dossier", { exact: true }),
  ).toBeVisible();
  await pj.getByRole("button", { name: /Fermer les suggestions/ }).click();

  await pj.getByLabel("Canal d'envoi de la contestation").selectOption("LRAR");
  // Canaux restreints au type (amende → ANTAI ou LRAR, jamais Télérecours)
  await expect(
    pj.getByLabel("Canal d'envoi de la contestation").locator('option[value="ANTAI"]'),
  ).toHaveCount(1);
  await expect(
    pj
      .getByLabel("Canal d'envoi de la contestation")
      .locator('option[value="TELERECOURS"]'),
  ).toHaveCount(0);
  await pj.getByRole("button", { name: "Valider et Envoyer" }).click();
  await expect(
    pj.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible();
  await ctxJuriste.close();

  // 3) Client : si la lettre n'a pas déjà été signée via la signature du profil
  //    (Cas A), le client signe lui-même → PRET, kit LRAR affiché.
  await page.goto(`/dashboard/cases/${dossierId}`);
  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible().catch(() => false)) {
    await signerLettre(page);
  }
  await expect(
    page.getByRole("button", { name: "J'ai envoyé ma contestation" }),
  ).toBeVisible();
  await expect(
    page.getByText("vérifiée et validée par un juriste", { exact: false }),
  ).toBeVisible();

  // 4) Juriste : la signature du client est visible dans la lettre (PDF
  //    signé régénéré) — synchronisation client → juriste.
  const ctxJuriste2 = await browser.newContext();
  const pj2 = await ctxJuriste2.newPage();
  await loginAs(pj2, "e2e-juriste@test.local");
  await pj2.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    pj2.getByText("Signature du client déjà apposée", { exact: true }),
  ).toBeVisible();
  // Récap « Envoi de la contestation » : canal LRAR retenu + pièces jointes
  await expect(
    pj2.getByText("Envoi de la contestation", { exact: true }),
  ).toBeVisible();
  await expect(
    pj2.getByText(
      "Lettre recommandée avec accusé de réception (envoi par le client)",
      { exact: true },
    ),
  ).toBeVisible();
  await ctxJuriste2.close();

  // 5) Admin : le suivi reflète la même étape (Prêt) — synchronisation
  //    juriste → admin.
  const ctxAdmin = await browser.newContext();
  const pa = await ctxAdmin.newPage();
  await loginAs(pa, "e2e-admin@test.local");
  await pa.goto("/dashboard/admin/dossiers");
  await expect(
    pa.getByText("Étape 6 / 7 — Prêt", { exact: true }).first(),
  ).toBeVisible();
  await ctxAdmin.close();
});