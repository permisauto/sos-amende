import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

// Contrôle côte à côté (lot juriste) : la lettre à gauche, le texte extrait
// (OCR) à droite toujours déplié, bouton de téléchargement du document au pied
// du panneau OCR — plus d'aperçu intégré. Pièces justificatives, preuves
// externes et pièces manquantes empilées en dessous de la lettre.

test.describe("Juriste — contrôle lettre / document", () => {
  test("lettre à gauche, OCR à droite, bouton document sous l'OCR, pièces en dessous", async ({
    page,
    browser,
  }) => {
    // Deux connexions (client + juriste) + dépôt/analyse : sous charge
    // (workers parallèles) les relances magic-link dépassent les 30 s.
    test.slow();
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

    // Aucun aperçu intégré du document : un seul bouton, au pied du panneau
    // OCR, qui ouvre l'original dans un nouvel onglet.
    await expect(jpage.getByTestId("pv-apercu")).toHaveCount(0);
    const telecharger = ocr.getByRole("link", {
      name: /Télécharger le document/,
    });
    await expect(telecharger).toBeVisible();
    await expect(telecharger).toHaveAttribute("href", /\/uploads\//);
    await expect(telecharger).toHaveAttribute("target", "_blank");
    const boutonBox = (await telecharger.boundingBox())!;
    expect(boutonBox.y).toBeGreaterThan(ocrBox.y);
    expect(boutonBox.y).toBeLessThan(ocrBox.y + ocrBox.height);

    // « Prochaine étape » : bandeau pleine largeur sous les deux colonnes
    // (mesuré avant tout déclenchement de scroll).
    const prochaine = jpage.getByText("Prochaine étape");
    await expect(prochaine).toBeVisible();
    const prochaineBox = (await prochaine.boundingBox())!;
    expect(prochaineBox.y).toBeGreaterThan(ocrBox.y + ocrBox.height - 100);
    expect(prochaineBox.x).toBeLessThanOrEqual(ocrBox.x + 1);

    // Pièces justificatives empilées en dessous de la lettre (section).
    const preuves = jpage.getByRole("heading", {
      name: "Pièces justificatives (preuves)",
    });
    await expect(preuves).toBeVisible();
    const preuvesBox = (await preuves.boundingBox())!;
    expect(preuvesBox.y).toBeGreaterThan(prochaineBox.y);

    await ctx.close();
  });
});
