import { expect, test } from "@playwright/test";
import { loginAs, PV_PNG } from "./helpers";

test("mise en relation avocat : demande client → affectation juriste → contact client", async ({
  page,
  browser,
}) => {
  test.slow();

  // Le client crée un dossier et demande une mise en relation avocat
  await loginAs(page, "e2e-client@test.local");
  await page.goto("/dashboard/cases/new");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "pv.png", mimeType: "image/png", buffer: PV_PNG });
  await page.getByRole("button", { name: "Lancer le dossier" }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  const dossierId = page.url().split("/").pop() as string;

  await page.getByRole("heading", { name: "Besoin d'un avocat ?" }).scrollIntoViewIfNeeded();
  await page
    .getByPlaceholder("Contexte de votre demande (facultatif)…")
    .fill("Rétention de permis, je souhaite être accompagné.");
  await page
    .getByRole("button", { name: "Demander une mise en relation" })
    .click();
  await expect(
    page.getByText("Votre demande est en cours de traitement par un juriste."),
  ).toBeVisible();

  // Le juriste affecte un avocat partenaire
  const ctx = await browser.newContext();
  const juriste = await ctx.newPage();
  await loginAs(juriste, "e2e-juriste@test.local");
  await juriste.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    juriste.getByRole("heading", { name: "Mise en relation avocat" }),
  ).toBeVisible();
  await juriste
    .getByText("Demande du client", { exact: false })
    .first()
    .waitFor();
  await juriste
    .getByPlaceholder("Nom de l'avocat")
    .fill("Maître Isabelle Martin");
  await juriste.getByPlaceholder("Ex. Paris").fill("Lyon");
  await juriste
    .getByPlaceholder("cabinet@exemple.fr")
    .fill("contact@martin-avocats.fr");
  await juriste
    .getByRole("button", { name: "Affecter l'avocat" })
    .click();
  await expect(
    juriste.getByText("Maître Isabelle Martin", { exact: true }),
  ).toBeVisible();

  // Le client voit les coordonnées de l'avocat
  await page.reload();
  await expect(
    page.getByText("Maître Isabelle Martin", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Barreau : Lyon", { exact: true })).toBeVisible();
  await expect(
    page.getByText("contact@martin-avocats.fr", { exact: true }),
  ).toBeVisible();

  await ctx.close();
});