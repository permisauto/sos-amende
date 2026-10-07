import { expect, test } from "@playwright/test";
import { PV_PNG, analyserDossier, createDossier, loginAs } from "./helpers";

/**
 * Garde-fous de l'audit (lot 5) — comportements non couverts par les autres
 * specs : téléversement d'une preuve côté client et lecture seule côté juriste
 * de la bibliothèque juridique (aucun bouton d'administration).
 */
test.describe("Garde-fous audit (lot 5)", () => {
  test("le client téléverse une pièce justificative dans son dossier", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    const id = await createDossier(page);
    await analyserDossier(page);
    await page.goto(`/dashboard/cases/${id}`);

    const preuves = page.locator("#preuves");
    await expect(preuves).toBeVisible();
    await preuves
      .getByRole("button", { name: "Ajouter une pièce", exact: true })
      .click();
    await preuves
      .getByLabel("Nom de la pièce (optionnel)")
      .fill("Attestation lot5");
    await preuves.locator('input[type="file"]').setInputFiles({
      name: "attestation.png",
      mimeType: "image/png",
      buffer: PV_PNG,
    });
    await preuves
      .getByRole("button", { name: "Ajouter la pièce", exact: true })
      .click();
    await expect(preuves.getByText("Pièce ajoutée.")).toBeVisible();
    await expect(preuves.getByText("Attestation lot5")).toBeVisible();
  });

  test("la bibliothèque juriste est en lecture seule (aucune action admin)", async ({
    page,
  }) => {
    await loginAs(page, "e2e-juriste@test.local");
    await page.goto("/dashboard/juriste/failles");

    await expect(
      page.getByRole("heading", {
        name: "Bibliothèque des failles juridiques",
      }),
    ).toBeVisible();

    // Contrôles réservés à l'ADMIN : absents pour un juriste.
    await expect(page.getByText("Synchroniser et activer")).toHaveCount(0);
    await expect(page.getByText("Lancer l'auto-alimentation")).toHaveCount(0);
    await expect(page.getByText("Propositions à valider")).toHaveCount(0);

    // Les failles seedées restent visibles en consultation.
    await expect(
      page.getByRole("heading", { name: /Prescription/ }).first(),
    ).toBeVisible();
  });
});
