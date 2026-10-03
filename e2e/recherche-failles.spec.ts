import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// Recherche par mots-clés dans la bibliothèque juridique (admin + juriste).
// Le mot vit dans l'URL (`?q=`), comme le filtre `?f=` existant.

test.describe("Bibliothèque — recherche par mots-clés", () => {
  test("juriste : recherche, filtre qui conserve q, effacement", async ({
    page,
  }) => {
    await loginAs(page, "e2e-juriste@test.local");
    await page.goto("/dashboard/juriste/failles");

    const champ = page.getByLabel("Rechercher dans la bibliothèque");
    await expect(champ).toBeVisible();
    await champ.fill("etalonnage");
    await page.getByRole("button", { name: "Rechercher" }).click();

    await expect(page).toHaveURL(/[?&]q=etalonnage/);
    // compteur de résultats (accents insensibles : « etalonnage » → étalonnage)
    await expect(page.getByText(/failles? pour/)).toBeVisible();
    // le chip « Actives » conserve la recherche (q survit au filtre)
    await page
      .getByRole("link", { name: "Actives", exact: true })
      .click();
    await expect(page).toHaveURL(/q=etalonnage/);
    await expect(page.getByText(/failles? pour/)).toBeVisible();
    // effacement → retour à la liste complète
    await page.getByRole("link", { name: "Effacer", exact: true }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByText(/failles? pour/)).toHaveCount(0);
  });

  test("admin : recherche via URL + état vide avec effacement", async ({
    page,
  }) => {
    await loginAs(page, "e2e-admin@test.local");
    await page.goto("/dashboard/juriste/failles?q=suspension");
    await expect(page.getByLabel("Rechercher dans la bibliothèque")).toHaveValue(
      "suspension",
    );
    await expect(page.getByText(/failles? pour/).first()).toBeVisible();

    await page.getByLabel("Rechercher dans la bibliothèque").fill("zzzzz");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText(/Aucune faille pour/)).toBeVisible();
    await page.getByRole("link", { name: "Effacer la recherche" }).click();
    await expect(page).not.toHaveURL(/q=/);
  });
});
