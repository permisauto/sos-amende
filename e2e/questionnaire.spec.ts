import { expect, test } from "@playwright/test";
import { createDossier, loginAs } from "./helpers";

test("questionnaire ciblé AMENDE : groupes selon le document, réponses lues par le juriste", async ({
  page,
  browser,
}) => {
  test.slow();

  await loginAs(page, "e2e-client@test.local");
  const dossierId = await createDossier(page);

  // Scan courant (PV vitesse) : le groupe Stationnement n'a pas à s'afficher.
  await expect(
    page.getByText("Questions sur votre situation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Contexte (questionnaire ciblé)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("J'ai déjà payé cette amende")).toBeVisible();
  await expect(
    page.getByLabel("Un autre conducteur était au volant"),
  ).toBeVisible();
  await expect(
    page.getByText("Stationnement", { exact: true }),
  ).toHaveCount(0);

  // Encart non bloquant sous la case qui appelle une pièce.
  await expect(
    page.getByText(
      "Cette réponse appelle un document : Relevé de paiement",
      { exact: false },
    ),
  ).toBeVisible();

  // Réponse cochée → soumission (human-in-the-loop conservé).
  await page.getByLabel("Nom", { exact: true }).fill("DUPONT");
  await page.getByLabel("Plaque", { exact: true }).fill("AB-123-CD");
  await page.getByLabel("Numéro de PV", { exact: true }).fill("998877665");
  await page.getByLabel("Date du PV", { exact: true }).fill("2026-07-01");
  await page.getByLabel("J'ai déjà payé cette amende").check();
  await page
    .getByRole("button", { name: "Analyser et générer la lettre" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lettre en cours de validation" }),
  ).toBeVisible();

  // Rappel côté client : bandeau sur la fiche + section « Pièces à joindre »
  // du tableau de bord (relance douce, jamais bloquante).
  await expect(
    page.getByText("Pièce à joindre : Relevé de paiement", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Joindre maintenant" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByText("Pièces à joindre", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Manquant : Relevé de paiement", { exact: false }).first(),
  ).toBeVisible();

  // Le juriste retrouve la réponse déclarée (libellés du registre partagé).
  const ctx = await browser.newContext();
  const juriste = await ctx.newPage();
  await loginAs(juriste, "e2e-juriste@test.local");
  await juriste.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    juriste.getByText("Contexte (questionnaire)", { exact: true }),
  ).toBeVisible();
  await expect(
    juriste.getByText("J'ai déjà payé cette amende", { exact: true }),
  ).toBeVisible();

  // Bloc juriste « Pièces manquantes » + demande de complément en un clic
  // (messagerie du dossier + e-mail au client).
  await expect(
    juriste.getByRole("heading", { name: "Pièces manquantes" }),
  ).toBeVisible();
  await juriste.getByRole("button", { name: "Demander au client" }).click();
  const demande = juriste.getByLabel("Demande de pièce au client");
  await expect(demande).toBeVisible();
  await expect(demande).toHaveValue(/Relevé de paiement/);
  await juriste.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(juriste.getByText(/Demande envoyée/)).toBeVisible();

  await ctx.close();
});
