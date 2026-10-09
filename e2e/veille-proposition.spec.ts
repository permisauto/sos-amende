import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginAs } from "./helpers";

/**
 * Lot L + M — veille juridique : extraction proposée (articles retenus + règle
 * dégagée + conditions, bornés aux verbatims) puis décision humaine après
 * **lecture côte à côté** (drawer : texte/dispositif à gauche, règle à droite).
 *
 * Publication grainée **en début de test** (même approche que `veille.spec.ts`)
 * : chaque tentative repart d'un état vierge, le retry reste déterministe.
 * L'extraction tourne en mock (`VERIF_IA_PROVIDER=mock` du webServer) : aucun
 * appel réseau.
 *
 * Scénario : le juriste lit dans le drawer (dispositif + conditions) mais ne
 * valide PAS et ne corrige PAS ; le rôle admin est pris après déconnexion
 * (`/login` redirige sinon vers le dashboard déjà ouvert) → l'admin ouvre le
 * drawer, **corrige la règle via le formulaire d'édition** (brouillon en base,
 * retour à la consultation) puis **valide depuis le drawer** → la publication
 * quitte « À lire » pour « Promues », la faille apparaît **ACTIVE** (template
 * encore à rédiger — chip rouge) dans la bibliothèque, avec la règle corrigée.
 */

const TITRE = "Annulation avis contravention — défaut de motivation E2E veille";
const TITRE_REFUS = "Refus synchronisé veille — écartement bibliothèque E2E";

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public"
  );
}

/**
 * Le contenu contient un article littéral (« article L. 121-1 ») : l'extraction
 * mock en repère un, et la citation stockée est une tranche verbatim du contenu
 * (exigée par le garde-fou anti-hallucination du parser). Le **dispositif**
 * (« DÉCIDE : ») est aussi présent : le drawer l'affiche par défaut (extraction
 * locale, sans IA).
 */
const CONTENU =
  "Le Tribunal administratif de Nice, statuant sur la contestation d'un avis de contravention dressé au titre de l'article L. 121-1 du code de la route pour excès de vitesse, a annulé la décision attaquée en raison d'un défaut de motivation de l'arrêté attaqué, la juridiction retenant que l'autorité n'avait pas établi la régularité du contrôle effectué par l'agent assermenté au moment des faits, ni la concordance des relevés produits avec l'appareil de contrôle utilisé." +
  "\n\nDÉCIDE :\nArticle 1er : La décision attaquée est annulée et l'avis de contravention contesté est refusé.";

async function grainerSource(id: string, titre: string): Promise<void> {
  const citation = CONTENU.slice(0, 220) + "…";
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    await c.query(
      `
      INSERT INTO "SourceJuridique" (
        id, "cle", "idDila", source, nature, titre, juridiction, "dateSource",
        reference, ecli, url, contenu, citations, "matchsCore", "matchsAppui",
        score, "brouillonRegle", statut, "createdAt"
      ) VALUES (
        $4, $4, 'JURI-' || $4, 'JADE',
        'ARRET', $1,
        'Cour administrative d''appel de Marseille', '2026-10-01',
        'E2E-VEILLE-1', 'ECLI:FR:CAA:2026:' || $4, NULL,
        $2, $3::jsonb, '["excès de vitesse"]'::jsonb, '["motivation"]'::jsonb,
        99, 'Brouillon E2E — à reprendre par le juriste.', 'NOUVEAU', now()
      )
      ON CONFLICT ("cle") DO UPDATE SET
        statut = 'NOUVEAU',
        proposition = NULL,
        "failleId" = NULL,
        "reviewedAt" = NULL,
        "reviewedBy" = NULL,
        score = 99,
        contenu = EXCLUDED.contenu,
        citations = EXCLUDED.citations,
        titre = EXCLUDED.titre
      `,
      [titre, CONTENU, JSON.stringify([citation]), id],
    );
  } finally {
    await c.end();
  }
}

/** Règle de la faille liée à la publication de ce test (assertion SQL déterministe). */
async function regleFailleLiee(): Promise<string | null> {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    const r = await c.query<{ regle: string | null }>(
      `SELECT f.regle FROM "SourceJuridique" s
         JOIN "FailleJuridique" f ON f.id = s."failleId"
        WHERE s.id = 'e2e-veille-proposition'`,
    );
    return r.rows[0]?.regle ?? null;
  } finally {
    await c.end();
  }
}

test("veille : extraction proposée puis validation admin", async ({ page }) => {
  // Suite complète en parallèle : extraction + édition + validation + détails
  // de la bibliothèque dépasseraient les 30 s par défaut.
  test.slow();
  await grainerSource("e2e-veille-proposition", TITRE);

  // --- Juriste : extraction possible, validation impossible ---------------
  await loginAs(page, "e2e-juriste@test.local");
  await page.goto("/dashboard/juriste/veille");

  const carte = page.locator("article", { hasText: TITRE }).first();
  await expect(carte).toBeVisible();
  const encart = carte.getByTestId("proposition-encart");
  await expect(encart).toContainText("non extraite");

  // L'extraction n'est plus un bouton unitaire : le juriste lance le lot
  // « Extraire les propositions » en haut de la file.
  await page.getByTestId("extraire-lot").click();
  await expect(encart).toContainText("Proposition extraite", {
    timeout: 15_000,
  });
  // Article littéral du contenu, repéré par l'extraction mock.
  await expect(encart).toContainText("article L. 121-1");
  await expect(encart).toContainText("Règle dégagée");
  // Auto-proposition : la fin de l'extraction crée une faille PROPOSEE liée.
  await expect(carte.getByTestId("faille-proposee")).toBeVisible({
    timeout: 15_000,
  });
  // Le juriste ne voit jamais le bouton de validation.
  await expect(carte.getByTestId("valider-proposition")).toHaveCount(0);
  await expect(carte).toContainText(
    "En attente de validation par un administrateur",
  );

  // --- Juriste : lecture côte à côté (drawer) ------------------------------
  await carte.getByTestId("lire-decision").click();
  const drawer = page.getByTestId("lecture-drawer");
  await expect(drawer).toBeVisible();
  // Dispositif extrait localement affiché par défaut (« DÉCIDE : » du seed).
  await expect(page.getByTestId("lecture-texte")).toContainText(
    "Article 1er : La décision attaquée est annulée",
  );
  // Bascule vers le texte intégral.
  await drawer.getByRole("button", { name: "Texte intégral" }).click();
  await expect(page.getByTestId("lecture-texte")).toContainText(
    "Tribunal administratif de Nice",
  );
  // Règle dégagée + conditions d'application à droite.
  await expect(page.getByTestId("lecture-regle")).toContainText(
    "Simulation (mock)",
  );
  await expect(page.getByTestId("lecture-conditions").locator("li")).toHaveCount(
    1,
  );
  // Le juriste lit mais ne valide jamais depuis le drawer (ni ne corrige).
  await expect(page.getByTestId("lecture-valider")).toHaveCount(0);
  await expect(page.getByTestId("lecture-modifier")).toHaveCount(0);
  await expect(drawer).toContainText(
    "En attente de validation par un administrateur",
  );
  await page.getByTestId("lecture-fermer").click();
  await expect(drawer).toHaveCount(0);

  // --- Admin : lecture puis validation **depuis le drawer** → ACTIVE -------
  // Changement de rôle : on se déconnecte d'abord, sinon `/login` redirige
  // vers le dashboard déjà ouvert et `loginAs` n'y trouve plus de formulaire.
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await page.waitForURL("/", { timeout: 5_000 });

  await loginAs(page, "e2e-admin@test.local");
  await page.goto("/dashboard/juriste/veille");

  const carteAdmin = page.locator("article", { hasText: TITRE }).first();
  await expect(carteAdmin).toBeVisible();
  await expect(carteAdmin.getByTestId("proposition-encart")).toContainText(
    "Proposition extraite (IA)",
  );
  await carteAdmin.getByTestId("lire-decision").click();
  const drawerAdmin = page.getByTestId("lecture-drawer");
  await expect(drawerAdmin).toBeVisible();
  await expect(page.getByTestId("lecture-texte")).toContainText("DÉCIDE :");
  await expect(page.getByTestId("lecture-conditions").locator("li")).toHaveCount(
    1,
  );

  // --- Correction par l'admin (lot O) : édition dans le drawer ------------
  // Lecture seule d'abord, puis « Modifier la proposition » : la règle est
  // corrigée, enregistrée (brouillon → écrit en base, pas de faille) et
  // relue depuis la base avant la validation finale.
  await page.getByTestId("lecture-modifier").click();
  await expect(page.getByTestId("lecture-form-correction")).toBeVisible();
  await page.getByTestId("lecture-regle-edit").fill(
    "La juridiction annule l'avis pour défaut de motivation — règle corrigée par l'admin E2E.",
  );
  await page.getByTestId("lecture-enregistrer").click();
  // Retour automatique à la consultation : la valeur affichée vient de la base.
  await expect(page.getByTestId("lecture-regle")).toContainText(
    "règle corrigée par l'admin E2E",
    { timeout: 15_000 },
  );

  await page.getByTestId("lecture-valider").click();

  // La publication est promue : elle quitte l'onglet « À lire ».
  await expect(page.locator("article", { hasText: TITRE })).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.goto("/dashboard/juriste/veille?s=PROMU");
  await expect(
    page.locator("article", { hasText: TITRE }).first(),
  ).toBeVisible();

  // La faille créée porte la règle **corrigée** (la validation utilise les
  // valeurs enregistrées, plus la proposition IA brute).
  expect(await regleFailleLiee()).toContain("règle corrigée par l'admin E2E");

  // La faille créée est **ACTIVE** (validation = faille active immédiate) mais
  // sans template : la bibliothèque affiche le chip « Template à rédiger » —
  // elle ne peut pas encore alimenter une lettre.
  await page.goto(
    "/dashboard/juriste/failles?q=" +
      encodeURIComponent("défaut de motivation E2E"),
  );
  await expect(page.getByText(TITRE).first()).toBeVisible();
  await expect(
    page.getByTestId("chip-template-manquant").first(),
  ).toBeVisible();
  // Faille née de la veille : chip « Proposition (veille) » (flip depuis le
  // drawer — la source liée est promue en même temps).
  await expect(page.getByTestId("chip-veille").first()).toBeVisible();
});

/** État croisé faille/source pour le scénario de refus synchronisé. */
async function etatRefus(): Promise<{ faille: string | null; source: string }> {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    const r = await c.query<{ faille: string | null; source: string }>(
      `SELECT f.statut AS faille, s.statut AS source
         FROM "SourceJuridique" s
         LEFT JOIN "FailleJuridique" f ON f.id = s."failleId"
        WHERE s.id = 'e2e-veille-refus'`,
    );
    return {
      faille: r.rows[0]?.faille ?? null,
      source: r.rows[0]?.source ?? "?",
    };
  } finally {
    await c.end();
  }
}

test("veille : le refus depuis la bibliothèque écarte la faille et sa source", async ({ page }) => {
  test.slow();
  await grainerSource("e2e-veille-refus", TITRE_REFUS);

  // --- Juriste : extraction → auto-proposition PROPOSEE liée --------------
  await loginAs(page, "e2e-juriste@test.local");
  await page.goto("/dashboard/juriste/veille");
  const carte = page.locator("article", { hasText: TITRE_REFUS }).first();
  await expect(carte).toBeVisible();
  await page.getByTestId("extraire-lot").click();
  await expect(carte.getByTestId("faille-proposee")).toBeVisible({
    timeout: 15_000,
  });
  expect(await etatRefus()).toEqual({ faille: "PROPOSEE", source: "NOUVEAU" });

  // --- Admin : « Écarter (Inactive) » depuis la bibliothèque --------------
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await page.waitForURL("/", { timeout: 5_000 });
  await loginAs(page, "e2e-admin@test.local");

  await page.goto(
    "/dashboard/juriste/failles?f=PROPOSEE&q=" +
      encodeURIComponent(TITRE_REFUS),
  );
  const boutonEcarter = page.getByRole("button", {
    name: "Écarter (Inactive)",
  });
  await expect(boutonEcarter.first()).toBeVisible();
  await expect(page.getByTestId("chip-veille").first()).toBeVisible();
  await boutonEcarter.first().click();

  // Les deux tables basculent ensemble (invariant « la source suit la faille »).
  await expect
    .poll(async () => etatRefus(), { timeout: 15_000 })
    .toEqual({ faille: "INACTIVE", source: "ECARTE" });
});
