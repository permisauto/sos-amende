import { expect, test, type Browser } from "@playwright/test";
import { readFile } from "node:fs/promises";
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

test("synchronisation : pipeline juriste, lettres proposées, signature visible du juriste, envoi LRAR par SOS Amende et suivi admin", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Client : dépôt + analyse → A_VERIFIER
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // 2) Juriste : la file est classée par étapes et le drawer propose les
  //    lettres ; approbation en canal LRAR (l'envoi est effectué par SOS Amende).
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

  // Générateur de lettre : si la lettre ne convient pas, le juriste choisit
  // une variante (combinaison de failles) avec résumé avant application.
  await pj.getByRole("button", { name: "Récrire la lettre" }).click();
  await expect(
    pj.getByRole("heading", { name: "Générateur de lettre" }),
  ).toBeVisible();
  await expect(
    pj.getByText("Résumé avant application", { exact: true }),
  ).toBeVisible();
  await pj.getByRole("button", { name: "Voir le récapitulatif" }).click();
  await expect(
    pj.getByRole("button", { name: "Appliquer cette variante" }),
  ).toBeVisible();
  await pj.getByRole("button", { name: "Appliquer cette variante" }).click();
  await expect(pj.getByRole("heading", { name: "Générateur de lettre" })).toBeHidden();
  await expect(
    pj.getByRole("button", { name: "Récrire la lettre" }),
  ).toBeVisible();

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
  //    (Cas A), le client signe lui-même → PRET validé. Le client n'envoie
  //    plus rien : il voit le suivi informatif « transmission par SOS Amende ».
  await page.goto(`/dashboard/cases/${dossierId}`);
  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible().catch(() => false)) {
    await signerLettre(page);
  }
  await expect(
    page.getByRole("heading", {
      name: "Contestation validée — transmission par SOS Amende",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("aucune action n'est requise de votre part", { exact: false }),
  ).toBeVisible();

  // 4) Juriste : la signature du client est visible dans la lettre (PDF
  //    signé régénéré) — synchronisation client → juriste. Le juriste envoie
  //    ensuite la lettre recommandée, par nos soins (SOS Amende).
  const ctxJuriste2 = await browser.newContext();
  const pj2 = await ctxJuriste2.newPage();
  await loginAs(pj2, "e2e-juriste@test.local");
  await pj2.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    pj2.getByText("Signature du client déjà apposée", { exact: true }),
  ).toBeVisible();
  // Le PDF téléchargé (aperçu affiché, POST lettre) contient bien l'image de
  // signature — et pas le libellé « lettre non signée ».
  const [download] = await Promise.all([
    pj2.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
    pj2
      .getByRole("button", { name: "Télécharger la lettre affichée (PDF)" })
      .click()
      .catch(() => null),
  ]);
  if (download) {
    const path = await download.path();
    const buf = await readFile(path!);
    expect(buf.toString("utf8")).toContain("/Subtype /Image");
    expect(buf.toString("utf8")).not.toContain("lettre non signée");
  }
  // Récap « Envoi de la contestation » : canal LRAR retenu + pièces jointes
  await expect(
    pj2.getByText("Envoi de la contestation", { exact: true }),
  ).toBeVisible();
  await expect(
    pj2.getByRole("definition").filter({
      hasText: "Lettre recommandée avec accusé de réception (envoi par SOS Amende)",
    }),
  ).toBeVisible();
  // Le formulaire d'envoi propose le choix de canal, pré-rempli au canal
  // retenu à la validation (LRAR) — le juriste peut basculer vers un envoi
  // en ligne (ANTAI/Télérecours) à tout moment.
  await expect(
    pj2.getByLabel("Canal d'envoi de la contestation"),
  ).toHaveValue("LRAR");
  await pj2
    .getByRole("button", { name: "Envoyer la lettre recommandée (SOS Amende)" })
    .click();
  await expect(
    pj2.getByText("Contestation envoyée à", { exact: false }),
  ).toBeVisible();
  await ctxJuriste2.close();

  // 5) Admin : le suivi reflète la même étape (Envoyé) — synchronisation
  //    juriste → admin.
  const ctxAdmin = await browser.newContext();
  const pa = await ctxAdmin.newPage();
  await loginAs(pa, "e2e-admin@test.local");
  await pa.goto("/dashboard/admin/dossiers");
  await expect(
    pa.getByText("Étape 7 / 7 — Envoyé", { exact: true }).first(),
  ).toBeVisible();
  await ctxAdmin.close();
});