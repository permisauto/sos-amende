import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

// Contrôle côte à côté (lot juriste) : le document versé par le client s'affiche
// face à la lettre, pleine largeur — le juriste confronte les deux sans quitter
// la page, avec le texte OCR replié sous le média.

test.describe("Juriste — contrôle lettre / document", () => {
  test("le document du client et la lettre s'affichent côte à côte", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    const dossierId = await createDossier(page);
    await analyserDossier(page);

    const ctx = await browser.newContext();
    const jpage = await ctx.newPage();
    await loginAs(jpage, "e2e-juriste@test.local");
    await jpage.goto(`/dashboard/juriste/${dossierId}`);

    // Section unique « Lettre de contestation » (en-tête pleine largeur).
    const titreSection = jpage.getByRole("heading", {
      name: "Lettre de contestation",
      exact: true,
    });
    await expect(titreSection).toBeVisible();

    // Aperçu du document : titre type-aware + document présent.
    const pv = jpage.getByTestId("pv-apercu");
    await expect(pv).toBeVisible();
    await expect(
      pv.getByRole("heading", { name: "Avis de contravention" }),
    ).toBeVisible();

    // Côte à côte en desktop (lg) : le document est à gauche de la lettre et
    // les deux colonnes sont exploitablement larges.
    const pvBox = (await pv.boundingBox())!;
    const boutonModifier = jpage.getByRole("button", {
      name: "Modifier la lettre",
    });
    await expect(boutonModifier).toBeVisible();
    const lettreBox = (await boutonModifier.boundingBox())!;
    expect(pvBox.x).toBeLessThan(lettreBox.x);
    expect(pvBox.width).toBeGreaterThan(300);
    expect(lettreBox.x).toBeGreaterThan(pvBox.x + pvBox.width - 10);

    // Le texte OCR extrait est replié sous le média et se déplie.
    const ocr = pv.getByText("Texte extrait (OCR)");
    await expect(ocr).toBeVisible();
    await ocr.click();
    await expect(pv.getByText(/AB-123-CD/)).toBeVisible();

    // PV téléversé en image : zoom pilotable (100 % → 125 %).
    await expect(pv.getByRole("img", { name: "Avis de contravention" })).toBeVisible();
    await pv.getByRole("button", { name: "Agrandir l'aperçu" }).click();
    await expect(pv.getByText("125 %")).toBeVisible();
    await pv.getByRole("button", { name: "Réduire l'aperçu" }).click();
    await expect(pv.getByText("100 %")).toBeVisible();

    // « Prochaine étape » : bandeau pleine largeur sous les deux colonnes.
    const prochaine = jpage.getByText("Prochaine étape");
    await expect(prochaine).toBeVisible();
    const prochaineBox = (await prochaine.boundingBox())!;
    expect(prochaineBox.x).toBeLessThanOrEqual(pvBox.x + 1);
    expect(prochaineBox.y).toBeGreaterThan(pvBox.y);

    await ctx.close();
  });
});
