import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

// Contrôle côte à côté (lot juriste) : la lettre à gauche, le texte extrait
// (OCR) à droite et toujours déplié pour une bonne visibilité — le document
// versé et les pièces suivent juste en dessous.

test.describe("Juriste — contrôle lettre / document", () => {
  test("lettre à gauche, texte OCR à droite, document et pièces en dessous", async ({
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

    // La lettre est à gauche, le texte OCR à droite — colonnes exploitablement
    // larges côte à côte en desktop (lg).
    const boutonModifier = jpage.getByRole("button", {
      name: "Modifier la lettre",
    });
    await expect(boutonModifier).toBeVisible();
    const lettreBox = (await boutonModifier.boundingBox())!;

    const ocr = jpage.getByTestId("ocr-texte");
    await expect(ocr).toBeVisible();
    await expect(
      ocr.getByRole("heading", { name: "Texte extrait (OCR)" }),
    ).toBeVisible();
    const ocrBox = (await ocr.boundingBox())!;
    expect(lettreBox.x).toBeLessThan(ocrBox.x);
    expect(ocrBox.width).toBeGreaterThan(300);

    // Le texte OCR est toujours déplié (pas de <details>) : contenu visible.
    await expect(ocr.getByText(/AB-123-CD/)).toBeVisible();

    // Document versé : déplacé en dessous, dans la rangée « Pièces ».
    const pv = jpage.getByTestId("pv-apercu");
    await expect(pv).toBeVisible();
    await expect(
      pv.getByRole("heading", { name: "Avis de contravention" }),
    ).toBeVisible();
    const pvBox = (await pv.boundingBox())!;
    expect(pvBox.y).toBeGreaterThan(ocrBox.y + ocrBox.height - 10);

    // « Prochaine étape » : bandeau pleine largeur sous les deux colonnes,
    // au-dessus de la rangée pièces (mesuré AVANT les clics de zoom, qui
    // font défiler la page et faussent les coordonnées — on se repère sur le
    // panneau OCR à hauteur fixe, le bouton « Modifier la lettre » pouvant
    // être hors zone visible dans la colonne scrollable).
    const prochaine = jpage.getByText("Prochaine étape");
    await expect(prochaine).toBeVisible();
    const prochaineBox = (await prochaine.boundingBox())!;
    expect(prochaineBox.y).toBeGreaterThan(ocrBox.y + ocrBox.height - 100);
    expect(prochaineBox.y).toBeLessThan(pvBox.y);
    expect(prochaineBox.x).toBeLessThanOrEqual(ocrBox.x + 1);

    // PV téléversé en image : zoom pilotable (100 % → 125 %).
    await expect(pv.getByRole("img", { name: "Avis de contravention" })).toBeVisible();
    await pv.getByRole("button", { name: "Agrandir l'aperçu" }).click();
    await expect(pv.getByText("125 %")).toBeVisible();
    await pv.getByRole("button", { name: "Réduire l'aperçu" }).click();
    await expect(pv.getByText("100 %")).toBeVisible();

    await ctx.close();
  });
});
