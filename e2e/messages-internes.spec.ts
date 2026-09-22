import { expect, test, type Browser } from "@playwright/test";
import { analyserDossier, createDossier, loginAs } from "./helpers";

/** Crée + analyse un dossier client E2E et renvoie son id. */
async function creerDossierAnalysed(browser: Browser): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);
  await analyserDossier(page);
  await ctx.close();
  return dossierId;
}

test.describe("Fil d'équipe admin ↔ juriste (par dossier)", () => {
  test("l'admin écrit sur le dossier, le juriste répond dans le même fil, badge « Équipe »", async ({
    browser,
  }) => {
    test.slow();

    const dossierId = await creerDossierAnalysed(browser);

    // 1. L'admin ouvre le détail du dossier et écrit dans le fil d'équipe.
    const ctxAdmin = await browser.newContext();
    const apage = await ctxAdmin.newPage();
    await loginAs(apage, "e2e-admin@test.local");
    await apage.goto(`/dashboard/juriste/${dossierId}`);
    await expect(
      apage.getByRole("heading", { name: "Échanges internes (équipe)" }),
    ).toBeVisible();
    await apage
      .getByPlaceholder("Message à l'équipe…")
      .fill("Merci de vérifier ce dossier.");
    await apage.getByRole("button", { name: "Envoyer à l'équipe" }).click();
    await expect(
      apage.getByText("Message envoyé à l'équipe.", { exact: true }),
    ).toBeVisible();

    // 2. Le juriste voit le badge « Équipe » dans la file, ouvre le fil,
    //    lit le message et répond dans le même fil.
    const ctxJ = await browser.newContext();
    const jpage = await ctxJ.newPage();
    await loginAs(jpage, "e2e-juriste@test.local");
    await jpage.goto("/dashboard/juriste");
    // Workers parallèles partageant les comptes : la file peut se rendre avant
    // que le message ne soit visible — on re-polle la page jusqu'au badge.
    await expect
      .poll(
        async () => {
          await jpage.reload();
          return jpage.getByText(/Équipe : \d+ nouveau/).count();
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await jpage.goto(`/dashboard/juriste/${dossierId}`);
    await jpage.waitForURL(/\/dashboard\/juriste\/[^/]+$/);
    await expect(
      jpage.getByText("Merci de vérifier ce dossier."),
    ).toBeVisible();
    await jpage
      .getByPlaceholder("Message à l'équipe…")
      .fill("C'est noté, je m'en occupe.");
    await jpage.getByRole("button", { name: "Envoyer à l'équipe" }).click();
    await expect(
      jpage.getByText("Message envoyé à l'équipe.", { exact: true }),
    ).toBeVisible();
    await ctxJ.close();

    // 3. L'admin retrouve la réponse dans le même fil.
    await apage.reload();
    await expect(
      apage
        .getByRole("paragraph")
        .filter({ hasText: "C'est noté, je m'en occupe." })
        .first(),
    ).toBeVisible();
    await ctxAdmin.close();
  });

  test("un client ne voit jamais les échanges internes de son dossier", async ({
    browser,
  }) => {
    const dossierId = await creerDossierAnalysed(browser);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, "e2e-client@test.local");
    await page.goto(`/dashboard/cases/${dossierId}`);
    await expect(
      page.getByRole("heading", { name: "Échanges internes (équipe)" }),
    ).toHaveCount(0);
    await expect(page.getByPlaceholder("Message à l'équipe…")).toHaveCount(0);
    await expect(
      page.getByText("Coordination entre l'administration et les juristes"),
    ).toHaveCount(0);
    await ctx.close();
  });
});