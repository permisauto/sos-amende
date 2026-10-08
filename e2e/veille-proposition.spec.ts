import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginAs } from "./helpers";

/**
 * Lot L — veille juridique : extraction proposée (articles retenus + règle
 * dégagée, bornés aux verbatims) puis décision humaine.
 *
 * Publication grainée **en début de test** (même approche que `veille.spec.ts`)
 * : chaque tentative repart d'un état vierge, le retry reste déterministe.
 * L'extraction tourne en mock (`VERIF_IA_PROVIDER=mock` du webServer) : aucun
 * appel réseau.
 *
 * Scénario : le juriste voit et lance l'extraction mais ne valide PAS ; le
 * rôle admin est pris après déconnexion (`/login` redirige sinon vers le
 * dashboard déjà ouvert) → validation → la publication quitte « À lire » pour
 * « Promues » et la faille apparaît en PROPOSEE dans la bibliothèque.
 */

const TITRE = "Annulation avis contravention — défaut de motivation E2E veille";

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public"
  );
}

/**
 * Le contenu contient un article littéral (« article L. 121-1 ») : l'extraction
 * mock en repère un, et la citation stockée est une tranche verbatim du contenu
 * (exigée par le garde-fou anti-hallucination du parser).
 */
const CONTENU =
  "Le Tribunal administratif de Nice, statuant sur la contestation d'un avis de contravention dressé au titre de l'article L. 121-1 du code de la route pour excès de vitesse, a annulé la décision attaquée en raison d'un défaut de motivation de l'arrêté attaqué, la juridiction retenant que l'autorité n'avait pas établi la régularité du contrôle effectué par l'agent assermenté au moment des faits, ni la concordance des relevés produits avec l'appareil de contrôle utilisé.";

async function grainerSource(): Promise<void> {
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
        'e2e-veille-proposition', 'e2e-veille-proposition', 'JURI-E2E-1', 'JADE',
        'ARRET', $1,
        'Cour administrative d''appel de Marseille', '2026-10-01',
        'E2E-VEILLE-1', 'ECLI:FR:CAA:2026:E2EVEILLE', NULL,
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
      [TITRE, CONTENU, JSON.stringify([citation])],
    );
  } finally {
    await c.end();
  }
}

test("veille : extraction proposée puis validation admin", async ({ page }) => {
  await grainerSource();

  // --- Juriste : extraction possible, validation impossible ---------------
  await loginAs(page, "e2e-juriste@test.local");
  await page.goto("/dashboard/juriste/veille");

  const carte = page.locator("article", { hasText: TITRE }).first();
  await expect(carte).toBeVisible();
  const encart = carte.getByTestId("proposition-encart");
  await expect(encart).toContainText("non extraite");

  await carte.getByTestId("extraire-proposition").click();
  await expect(encart).toContainText("Proposition extraite (IA)", {
    timeout: 15_000,
  });
  // Article littéral du contenu, repéré par l'extraction mock.
  await expect(encart).toContainText("article L. 121-1");
  await expect(encart).toContainText("Règle dégagée");
  // Le juriste ne voit jamais le bouton de validation.
  await expect(carte.getByTestId("valider-proposition")).toHaveCount(0);
  await expect(carte).toContainText(
    "En attente de validation par un administrateur",
  );

  // --- Admin : validation → PROPOSEE, sortie de « À lire » ----------------
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
  await carteAdmin.getByTestId("valider-proposition").click();

  // La publication est promue : elle quitte l'onglet « À lire ».
  await expect(page.locator("article", { hasText: TITRE })).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.goto("/dashboard/juriste/veille?s=PROMU");
  await expect(
    page.locator("article", { hasText: TITRE }).first(),
  ).toBeVisible();

  // La faille créée est en PROPOSEE (jamais ACTIVE) dans la bibliothèque —
  // l'admin y voit le badge « Proposition (auto-alimentation) ».
  await page.goto(
    "/dashboard/juriste/failles?q=" +
      encodeURIComponent("défaut de motivation E2E"),
  );
  await expect(
    page.getByText("Proposition (auto-alimentation)").first(),
  ).toBeVisible();
  await expect(page.getByText(TITRE).first()).toBeVisible();
});
