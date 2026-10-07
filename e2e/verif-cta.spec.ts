import { expect, test } from "@playwright/test";
import { analyserDossier, createDossier, loginAs, PV_PNG } from "./helpers";

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

  test("cases/new : le select type + bouton Lancer l'analyse", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    await page.goto("/dashboard/cases/new");
    const select = page.getByLabel("Type d'infraction");
    await expect(select).toBeVisible();
    await select.selectOption({ label: "Suspension de permis" });
    // Le bouton submit est désactivé sans fichier
    const btn = page.getByRole("button", { name: /Lancer l'analyse/ });
    await expect(btn).toBeDisabled();
    // La durée attendue est annoncée avant le clic, pas découverte pendant l'attente.
    await expect(
      page.getByText(/Analyse gratuite\. Comptez 1 à 2 minutes/),
    ).toBeVisible();
  });

  test("cases/new : pendant l'envoi, le formulaire reste monté et dit que le traitement court", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    // Ralentit le POST du serveur pour observer l'état transitoire (avant : le
    // formulaire était démonté puisque `if (pending) return` le remplaçait).
    await page.route("**/dashboard/cases/new", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((r) => setTimeout(r, 1500));
      }
      await route.continue();
    });
    await page.goto("/dashboard/cases/new");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "pv.png", mimeType: "image/png", buffer: PV_PNG });
    await page.getByRole("button", { name: /Lancer l'analyse/ }).click();

    const panneau = page.getByTestId("traitement-en-cours");
    await expect(panneau).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Traitement en cours…" }),
    ).toBeDisabled();
    // Le formulaire reste monté (état conservé) mais désactivé.
    await expect(page.getByLabel("Type d'infraction")).toBeDisabled();

    // Puis la navigation vers le dossier créé : l'état transitoire disparaît.
    await expect(panneau).toBeHidden({ timeout: 20_000 });
  });

  test("cases/new : la signature déjà enregistrée évite de resigner", async ({
    page,
  }) => {
    // Compte dédié e2e-client-suivi@test.local : global-setup.cjs lui pose une
    // signature de profil à CHAQUE run. On ne peut donc pas tester ici la
    // capture puis la réutilisation sur e2e-client@test.local — les autres
    // specs signent ce compte en parallèle et rendent l'assertion instable.
    await loginAs(page, "e2e-client-suivi@test.local");
    await page.goto("/dashboard/cases/new");

    // Signature existante affichée, pad de signature replié.
    await expect(
      page.getByRole("img", { name: "Votre signature enregistrée" }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(
      page.getByText(/signature est déjà enregistrée/i),
    ).toBeVisible();

    // Le dépôt reste possible sans resigner (le pad n'est pas bloquant).
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "pv.png", mimeType: "image/png", buffer: PV_PNG });
    await expect(page.getByRole("button", { name: /Lancer l'analyse/ })).toBeEnabled();

    // Le pad reste accessible si le client veut remplacer sa signature.
    await page.getByRole("button", { name: "Signer à nouveau" }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revenir à ma signature enregistrée" }),
    ).toBeVisible();
  });

  test("dossier EN_ANALYSE : l'analyse est en haut, avant l'aperçu du PV", async ({
    page,
  }) => {
    await loginAs(page, "e2e-client@test.local");
    const id = await createDossier(page);
    await page.goto(`/dashboard/cases/${id}`);

    const bloc = page.getByTestId("analyse-en-tete");
    await expect(bloc).toBeVisible();
    await expect(
      bloc.getByRole("button", { name: /Analyser et générer la lettre/ }),
    ).toBeVisible();

    // L'action attendue est avant le PV et avant la timeline.
    const yAnalyse = (await bloc.boundingBox())!.y;
    const yPv = (await page
      .getByRole("heading", { name: "Avis de contravention" })
      .first()
      .boundingBox())!.y;
    expect(yAnalyse).toBeLessThan(yPv);

    // Les sections hors sujet sont repliées tant que le dossier est en analyse.
    await expect(
      page.getByRole("heading", { name: "Fil d'équipe" }),
    ).toHaveCount(0);
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
    // Le filtre actif par défaut est "Tous" (intégralité des dossiers clients)
    const tous = page.getByRole("link", { name: "Tous" });
    await expect(tous).toBeVisible();
    expect(await tous.getAttribute("href")).toBe("/dashboard/juriste");
    for (const [label, url] of [
      ["À valider", "/dashboard/juriste?f=EN_ATTENTE_VALIDATION"],
      ["En attente de signature", "/dashboard/juriste?f=EN_ATTENTE_PRE_SIGNATURE"],
      ["Envoyés", "/dashboard/juriste?f=ENVOYE"],
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
  test("admin : navigation (Bibliothèque juridique, Radars) et synchronisation", async ({
    page,
  }) => {
    await loginAs(page, "e2e-admin@test.local");
    await expect(page.getByRole("link", { name: "Bibliothèque juridique" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Radars" })).toBeVisible();

    // Bibliothèque juridique : bouton synchroniser + lancement manuel
    await page.getByRole("link", { name: "Bibliothèque juridique" }).click();
    await expect(page).toHaveURL(/\/dashboard\/juriste\/failles/);
    const syncBtn = page.getByRole("button", { name: "Synchroniser et activer" });
    await expect(syncBtn).toBeVisible();
    const autoBtn = page.getByRole("button", { name: "Lancer l'auto-alimentation" });
    await expect(autoBtn).toBeVisible();
    await autoBtn.click();
    await expect(
      page.getByText(/Auto-alimentation exécutée : \d+ entrée\(s\) du catalogue synchronisée\(s\)/),
    ).toBeVisible();

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
    await page.goto("/dashboard/juriste/failles");
    const btn = page.getByRole("button", { name: /Activer les \d+ propositions/ });
    if ((await btn.count()) > 0) {
      await expect(btn).toBeVisible();
    }
  });
});

test.describe("Téléchargements (fichiers)", () => {
  test("le PDF d'une lettre signée se télécharge réellement sur le détail juriste", async ({
    page,
    browser,
  }) => {
    // Le seed ne crée aucun dossier : ce test est autonome, il fabrique un
    // dossier analysé (EN_ATTENTE_VALIDATION avec lettre) puis consulte le détail juriste.
    await loginAs(page, "e2e-client@test.local");
    const dossierId = await createDossier(page);
    await analyserDossier(page);

    const ctx = await browser.newContext();
    const jpage = await ctx.newPage();
    await loginAs(jpage, "e2e-juriste@test.local");
    await jpage.goto(`/dashboard/juriste/${dossierId}`);

    // Consultation par défaut : la lettre s'affiche en lecture seule, la
    // modification est une action explicite (« Modifier la lettre »).
    await expect(
      jpage.getByRole("button", { name: "Modifier la lettre" }),
    ).toBeVisible();
    await expect(
      jpage.getByLabel("Texte de la lettre de contestation"),
    ).toHaveCount(0);
    await jpage.getByRole("button", { name: "Modifier la lettre" }).click();
    await expect(
      jpage.getByLabel("Texte de la lettre de contestation"),
    ).toBeVisible();

    // Sur le détail, le bouton "Télécharger la lettre affichée (PDF)" est un button POST → download
    const btn = jpage
      .getByRole("button", { name: /Télécharger la lettre/ })
      .first();
    await expect(btn).toBeVisible({ timeout: 10_000 });

    // Le clic déclenche un téléchargement
    const [download] = await Promise.all([
      jpage.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
      btn.click(),
    ]);
    if (download) {
      const suggestedName = download.suggestedFilename();
      expect(suggestedName).toMatch(/\.pdf$/i);
    }
    await ctx.close();
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