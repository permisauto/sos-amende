import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Messages internes admin ↔ juriste", () => {
  test("l'admin écrit à un juriste, le juriste répond et reçoit le badge non-lu", async ({
    page,
    browser,
  }) => {
    test.slow();

    // 1. L'admin ouvre la messagerie et écrit au juriste.
    await loginAs(page, "e2e-admin@test.local");
    await page.goto("/dashboard/messages");
    await expect(
      page.getByRole("heading", { name: "Messages" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Juriste E2E/ })).toBeVisible();

    await page.getByRole("link", { name: /Juriste E2E/ }).click();
    await expect(page.getByText("Discussion avec Juriste E2E")).toBeVisible();
    await page.getByPlaceholder("Écrire à Juriste E2E…").fill(
      "Bonjour, merci de vérifier le dossier en attente.",
    );
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(
      page.getByText("Message envoyé.", { exact: true }),
    ).toBeVisible();

    // 2. Le juriste se connecte : badge non-lu dans la nav, fil visible.
    const ctx = await browser.newContext();
    const jpage = await ctx.newPage();
    await loginAs(jpage, "e2e-juriste@test.local");
    const badge = jpage.getByRole("link", { name: /Messages/ });
    await expect(badge).toBeVisible();
    // Un badge « non lu » est affiché à côté du lien Messages.
    await expect(
      jpage.locator("a[href='/dashboard/messages']").getByText(/^\d+$/),
    ).toBeVisible();

    await jpage.goto("/dashboard/messages");
    await jpage
      .getByRole("link", { name: /Admin E2E/ })
      .first()
      .click();
    await expect(
      jpage.getByText("Bonjour, merci de vérifier le dossier en attente."),
    ).toBeVisible();

    // 3. Le juriste répond : l'échange est bidirectionnel.
    await jpage
      .getByPlaceholder("Écrire à Admin E2E…")
      .fill("C'est noté, je m'en occupe.");
    await jpage.getByRole("button", { name: "Envoyer" }).click();
    await expect(
      jpage.getByText("Message envoyé.", { exact: true }),
    ).toBeVisible();
    await ctx.close();

    // 4. L'admin retrouve la réponse dans le même fil.
    await page.reload();
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: "C'est noté, je m'en occupe." })
        .first(),
    ).toBeVisible();
  });

  test("un client ne peut pas écrire dans la messagerie interne", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    await page.goto("/dashboard/messages");
    await expect(page).not.toHaveURL(/\/dashboard\/messages/);
    await expect(page.getByRole("link", { name: "Messages" })).toHaveCount(0);
  });
});