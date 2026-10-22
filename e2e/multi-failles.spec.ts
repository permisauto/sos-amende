import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

/**
 * Lot 2 — exploitation du multi-failles :
 * 1) les failles candidates sont ORDONNÉES (rang + score de corroboration) ;
 * 2) la lettre est plafonnée à 3 moyens (les autres sont signalés, pas
 *    tronqués en silence) ;
 * 3) l'écartement INDIVIDUEL exige un motif (apprentissage) ;
 * 4) le juriste peut les ÉCARTER EN MASSE avec un motif ;
 * 5) l'écartement refuse les failles déjà retenues (CONFIRMEE) et une faille
 *    écartée n'est plus confirmable.
 */
test("multi-failles : classement, plafond de moyens, écartement avec motif", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Client : dépôt + analyse → A_VERIFIER
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // 2) Juriste : ouvre le dossier et le drawer des suggestions
  const ctx = await browser.newContext();
  const pj = await ctx.newPage();
  await loginAs(pj, "e2e-juriste@test.local");
  await pj.goto(`/dashboard/juriste/${dossierId}`);
  await pj.getByRole("button", { name: "Suggestions IA" }).click();

  const lignes = pj.locator('[data-testid^="selection-"]');
  const nb = await lignes.count();
  expect(nb).toBeGreaterThan(1); // un dossier à plusieurs failles

  // 3) Le score de corroboration est affiché (jamais un % de réussite)
  await expect(pj.getByText(/corroboration \d+%/).first()).toBeVisible();

  // 4) Le classement est proposé dans l'ordre (rang 1, puis rang 2…)
  await expect(pj.getByTestId("rang-0")).toBeVisible();
  const rang1 = await pj.getByTestId("rang-0").textContent();
  expect(rang1).toContain("Principale proposée");

  // 5) La lettre est plafonnée à 3 moyens : les autres sont signalés
  await expect(pj.getByTestId("moyens-ecartes")).toBeVisible();
  await expect(pj.getByText(/La lettre est limitée à 3 moyen\(s\)/)).toBeVisible();

  // 6) Écartement INDIVIDUEL : le motif est exigé
  const motifIndividuel = pj.getByTestId("motif-ecartement-individuel").first();
  await motifIndividuel.fill("ab");
  await pj.getByRole("button", { name: "Écarter", exact: true }).first().click();
  await expect(pj.getByText(/motif d'écartement d'au moins 5 caractères/i)).toBeVisible();

  // 7) Avec un motif valide, l'écartement individuel passe
  await motifIndividuel.fill("Faits non transposables au dossier");
  await pj.getByRole("button", { name: "Écarter", exact: true }).first().click();
  await expect(pj.getByText("Écartée", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });

  // 8) Écartement EN MASSE : le motif est EXIGÉ
  await pj.getByTestId("selectionner-tout").check();
  await pj.getByTestId("motif-ecartement").fill("ab");
  await pj.getByTestId("ecarter-selection").click();
  await expect(pj.getByText(/motif d'écartement d'au moins 5 caractères/i)).toBeVisible();

  // 9) Avec un motif valide, l'écartement en masse passe
  await pj.getByTestId("motif-ecartement").fill("Faits non transposables au dossier");
  await pj.getByTestId("ecarter-selection").click();
  await expect(pj.getByText("Écartée", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });

  // 10) Aucune confirmation possible sur une faille écartée
  await expect(
    pj.getByRole("button", { name: "Confirmer" }).first(),
  ).toHaveCount(0);

  await pj.getByRole("button", { name: /Fermer les suggestions/ }).click();
  await ctx.close();
});
