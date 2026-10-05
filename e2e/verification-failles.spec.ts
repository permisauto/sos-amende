import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

test("vérification des failles : relance par règles, analyse IA simulée et préservation des décisions du juriste", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Client : dépôt + analyse → A_VERIFIER (lettres proposées au juriste)
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);

  // 2) Juriste : ouvre le dossier
  const ctx = await browser.newContext();
  const pj = await ctx.newPage();
  await loginAs(pj, "e2e-juriste@test.local");
  await pj.goto(`/dashboard/juriste/${dossierId}`);

  // Bloc « Vérification des failles » — option IA disponible (provider mock)
  await expect(
    pj.getByRole("heading", { name: "Vérification des failles" }),
  ).toBeVisible();
  const caseIa = pj.getByRole("checkbox", { name: /Analyse approfondie/ });
  await expect(caseIa).toBeVisible();
  await expect(caseIa).toBeChecked();

  // 3) Décision du juriste sur une candidature existante : elle doit survivre
  //    à la vérification (aucun deleteMany, aucune régression de statut).
  await pj.getByRole("button", { name: "Suggestions IA" }).click();
  const boutonConfirmer = pj.getByRole("button", { name: "Confirmer" }).first();
  let confirmationTestee = false;
  if (await boutonConfirmer.isVisible().catch(() => false)) {
    await boutonConfirmer.click();
    await expect(pj.getByText("Confirmée", { exact: true }).first()).toBeVisible();
    confirmationTestee = true;
  }
  await pj.getByRole("button", { name: /Fermer les suggestions/ }).click();

  // 4) Relance de la vérification (remarques facultatives, IA cochée)
  await pj.getByLabel("Remarques (optionnel)").fill("Vérification E2E du cas d'espèce.");
  await pj.getByRole("button", { name: "Vérifier les failles" }).click();
  await expect(pj.getByText(/Vérification effectuée/)).toBeVisible({ timeout: 15_000 });

  // 5) Timeline : l'événement de traçabilité est horodaté sur le dossier
  await expect(pj.getByText("Vérification poussée relancée")).toBeVisible();

  // 6) Drawer : horodatage de la dernière vérification + suggestions IA
  //    simulées tracées « Simulation (mock) » (jamais un avis juridique réel)
  //    et décisions du juriste préservées.
  await pj.getByRole("button", { name: "Suggestions IA" }).click();
  await expect(
    pj.getByText(/Dernière vérification des failles/),
  ).toBeVisible();
  await expect(pj.getByText(/Simulation \(mock\)/).first()).toBeVisible();
  if (confirmationTestee) {
    await expect(pj.getByText("Confirmée", { exact: true }).first()).toBeVisible();
  }
  await pj.getByRole("button", { name: /Fermer les suggestions/ }).click();

  await ctx.close();
});
