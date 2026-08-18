import { expect, test } from "@playwright/test";

test("un visiteur est redirigé vers /login sur /dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Connexion" }),
  ).toBeVisible();
});

test("un visiteur est redirigé vers /login sur /dashboard/juriste", async ({
  page,
}) => {
  await page.goto("/dashboard/juriste");
  await expect(page).toHaveURL(/\/login/);
});

test("un visiteur est redirigé vers /login sur /dashboard/cases", async ({
  page,
}) => {
  await page.goto("/dashboard/cases");
  await expect(page).toHaveURL(/\/login/);
});