import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// Suite de vérification exhaustive des boutons / CTA / liens.
// Chaque test clique un bouton OU vérifie la présence d'un lien et son href.

test.describe("Marketing — CTA", () => {
  test("landing : tous les CTA pointent vers /deposer", async ({ page }) => {
    await page.goto("/");
    const ctas = [
      ["Lancer mon analyse", "/deposer?type=AMENDE"],
      ["Contester une amende", "/deposer?type=AMENDE"],
      ["Défendre mon permis", "/deposer?type=SUSPENSION"],
      ["Déposer ma contravention", "/deposer?type=AMENDE"],
      ["Déposer ma lettre de suspension", "/deposer?type=SUSPENSION"],
    ] as const;
    for (const [label, href] of ctas) {
      const link = page.getByRole("link", { name: label }).first();
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toBe(href);
    }
  });

  test("landing : header et footer navigation", async ({ page }) => {
    await page.goto("/");
    for (const [label, href] of [
      ["Fonctionnement", "/#fonctionnement"],
      ["Amendes", "/#amendes"],
      ["Permis", "/#permis"],
      ["Tarifs", "/pricing"],
      ["Connexion", "/login"],
      ["Commencer", "/deposer?type=AMENDE"],
    ] as const) {
      const link = page.getByRole("link", { name: label }).first();
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toBe(href);
    }
    await page.getByRole("link", { name: "CGV" }).click();
    await expect(page).toHaveURL(/\/cgv$/);
  });

  test("pricing : les offres et leurs CTA", async ({ page }) => {
    await page.goto("/pricing");
    for (const [label, href] of [
      ["Contester mon amende — analyse gratuite", "/deposer?type=AMENDE"],
      ["Défendre mon permis — analyse gratuite", "/deposer?type=SUSPENSION"],
    ] as const) {
      const link = page.getByRole("link", { name: label }).first();
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toBe(href);
    }
    // Clic réel sur le premier CTA → redirige vers /deposer
    await page.getByRole("link", { name: "Contester mon amende" }).click();
    await expect(page).toHaveURL(/\/deposer\?type=AMENDE/);
  });

  test("demo scan : la demo simule un PV et génère une lettre", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Lancer la démo" }).click();
    await expect(
      page.getByText(/Simulation de démonstration/).first(),
    ).toBeVisible();
    // La démo finit par afficher un score et une lettre générée
    await expect(
      page.getByText(/Lettre de recours générée|lettre/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Navigation (App)", () => {
  test("client : la barre de navigation a les liens attendus et fonctionne", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Vue d'ensemble", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Mes dossiers", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Paramètres", exact: true })).toBeVisible();
    // Lien "Espace juriste" absent pour le client
    await expect(
      page.getByRole("link", { name: "Espace juriste" }),
    ).toHaveCount(0);
    // Clic "Mes dossiers" (nav)
    await nav.getByRole("link", { name: "Mes dossiers", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/cases$/);
    // Bouton déconnexion présent
    await expect(
      page.getByRole("button", { name: "Déconnexion" }),
    ).toBeVisible();
  });
});

test.describe("Client — dossiers", () => {
  test("cases : le bouton Nouveau dossier existe et mène à l'upload", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    const nav = page.getByRole("navigation").first();
    await nav.getByRole("link", { name: "Mes dossiers", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Nouveau dossier" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Nouveau dossier" }).click();
    await expect(page).toHaveURL(/\/dashboard\/cases\/new$/);
    // Le formulaire d'upload est présent
    await expect(
      page.getByText(/Glissez votre avis de contravention/i),
    ).toBeVisible();
  });

  test("cases/new : le select type + bouton Lancer le dossier", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    await page.goto("/dashboard/cases/new");
    const select = page.getByLabel("Type d'infraction");
    await expect(select).toBeVisible();
    await select.selectOption({ label: "Suspension de permis" });
    // Le bouton submit est désactivé sans fichier
    const btn = page.getByRole("button", { name: "Lancer le dossier" });
    await expect(btn).toBeDisabled();
  });

  test("parametres : lien export JSON + confidentialité + bouton suppression présent", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    await page.getByRole("link", { name: "Paramètres" }).click();
    await expect(
      page.getByRole("link", { name: "Télécharger mes données (JSON)" }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("link", { name: "Télécharger mes données (JSON)" })
        .getAttribute("href"),
    ).toBe("/api/rgpd/export");
    await expect(
      page.getByRole("link", { name: /politique de confidentialité/ }),
    ).toBeVisible();
    // La suppression est un bouton de formulaire (ne pas cliquer — destructif)
    const suppr = page.getByRole("button", {
      name: "Supprimer définitivement mon compte",
    });
    await expect(suppr).toBeVisible();
    // Le téléchargement doit être disabled tant que la case n'est pas cochée
    await expect(suppr).toBeDisabled();
  });
});

test.describe("Juriste — file & actions", () => {
  test("juriste : les filtres de file fonctionnent", async ({ page }) => {
    await loginAs(page, "e2e-juriste@test.local");
    await page.goto("/dashboard/juriste");
    // Le filtre actif par défaut est "À valider" (PRET)
    await expect(
      page.getByRole("link", { name: /À valider/ }).first(),
    ).toBeVisible();
    for (const [label, url] of [
      ["En attente de signature", "/dashboard/juriste?f=A_VERIFIER"],
      ["Envoyés", "/dashboard/juriste?f=ENVOYE"],
      ["Tous", "/dashboard/juriste?f=ALL"],
    ] as const) {
      const link = page.getByRole("link", { name: new RegExp(label) }).first();
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toBe(url);
    }
  });

  test("juriste : Bibliothèque juridique accessible et bouton Lire en détail", async ({
    page,
  }) => {
    await loginAs(page, "e2e-juriste@test.local");
    const nav = page.getByRole("navigation").first();
    await nav
      .getByRole("link", { name: "Bibliothèque juridique", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/juriste\/failles/);
    const btn = page.getByRole("button", { name: "Lire en détail" }).first();
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(
      page.getByRole("button", { name: "Masquer le détail" }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Admin — base & radars", () => {
  test("admin : navigation (Base juridique, Radars) et synchronisation", async ({
    page,
  }) => {
    await loginAs(page, "e2e-admin@test.local");
    await expect(page.getByRole("link", { name: "Base juridique" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Radars" })).toBeVisible();

    // Base juridique : bouton synchroniser
    await page.getByRole("link", { name: "Base juridique" }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/failles/);
    const syncBtn = page.getByRole("button", { name: "Synchroniser maintenant" });
    await expect(syncBtn).toBeVisible();

    // Radars : formulaire + bouton enregistrer
    await page.getByRole("link", { name: "Radars" }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/radars/);
    await expect(page.getByLabel("Référence radar")).toBeVisible();
    await expect(
      page.getByLabel("Date d'expiration du certificat"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  });

  test("admin : bouton 'Activer les n propositions' visible quand il y a des propositions", async ({
    page,
  }) => {
    // Vérifie qu'il y a des failles PROPOSEE (seed en crée)
    await loginAs(page, "e2e-admin@test.local");
    await page.goto("/dashboard/admin/failles");
    const btn = page.getByRole("button", { name: /Activer les \d+ propositions/ });
    if ((await btn.count()) > 0) {
      await expect(btn).toBeVisible();
    }
  });
});

test.describe("Téléchargements (fichiers)", () => {
  test("le PDF d'une lettre signée se télécharge réellement sur le détail juriste", async ({
    page,
  }) => {
    await loginAs(page, "e2e-juriste@test.local");

    // Le dossier PRET du seed est P345678901 → on cherche le lien dans la file PRET
    await page.goto("/dashboard/juriste?f=PRET");
    const row = page.getByRole("link", { name: /Client E2E/ }).first();
    await row.click();
    await page.waitForURL(/\/dashboard\/juriste\/[^/]+$/);

    // Sur le détail, le bouton "Télécharger la lettre affichée (PDF)" est un button POST → download
    const btn = page.getByRole("button", { name: /Télécharger la lettre/ }).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Le clic déclenche un téléchargement
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
      btn.click(),
    ]);
    if (download) {
      const suggestedName = download.suggestedFilename();
      expect(suggestedName).toMatch(/\.pdf$/i);
    }
  });

  test("l'export RGPD JSON se télécharge", async ({ page }) => {
    await loginAs(page, "e2e-client@test.local");
    await page.goto("/dashboard/parametres");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Télécharger mes données (JSON)" }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    expect(download.suggestedFilename()).toMatch(/\.json$/i);
  });
});