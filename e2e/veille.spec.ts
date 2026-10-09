import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { loginAs } from "./helpers";

/**
 * Veille juridique (DILA) — parcours de qualification.
 *
 * Scénario complet, avec de vrais clics :
 *   1. le juriste lit une publication retenue par la veille, avec ses citations
 *      littérales et son brouillon de règle ;
 *   2. l'extraction (IA ou secours local) propose une faille PROPOSEE liée ;
 *   3. l'activation d'une proposition incomplète est REFUSÉE (garde-fou) ;
 *   4. après rédaction via l'édition, la validation admin passe.
 *
 * La promotion manuelle (« Proposer une faille à partir de cette
 * publication ») a été retirée : l'extraction est automatique (cron +
 * bouton lot) et la décision humaine se limite à valider ou écarter.
 *
 * La publication est insérée en SQL brut (même approche que `global-setup.cjs`)
 * plutôt que récupérée de DILA : la spec reste déterministe et ne dépend pas
 * du réseau. Clé unique par test (la suite est `fullyParallel`).
 */

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public"
  );
}

async function avecClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: databaseUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/**
 * Publication administrative plausible : marqueurs du domaine (`code de la
 * route`, `permis de conduire`) + termes procéduraux, et assez longue pour que
 * l'extraction de citations (>40 caractères) trouve des passages.
 */
const CONTENU = `Le permis de conduire du requérant a été suspendu à titre conservatoire
par l'agent verbalisateur, sur le fondement du code de la route, après un
contrôle faisant apparaître une alcoolémie de 0,68 g/l. Le délai de
contestation était de deux mois à compter de la notification.
Le vice de procédure soulevé par la voie du recours gracieux est écarté.`;

const CITATION = `Le permis de conduire du requérant a été suspendu à titre conservatoire par l'agent verbalisateur, sur le fondement du code de la route, après un contrôle faisant apparaître une alcoolémie de 0,68 g/l.`;

async function insererSource(cle: string, suffixe: string): Promise<void> {
  const titre = `CAA de Bordeaux, 2ème chambre, 15/09/2026, 24BX0099${suffixe}`;
  // Brouillon au format réel de `redigerBrouillonRegle` : métadonnées sourcées,
  // citation littérale, puis champ d'articulation volontairement vide et balisé.
  const brouillon = [
    "## Brouillon automatique — à reprendre par le juriste",
    "",
    `**Source** : CAA de BORDEAUX — ${titre}`,
    `**Lien source** : https://www.legifrance.gouv.fr/juri/id/CETATEXT000000000001`,
    "**Termes retenus** : code de la route, permis de conduire (score 18)",
    "",
    "**Passages retenus (citation littérale, non réécrit)**",
    `> ${CITATION}`,
    "",
    "**Règle dégagée — À RÉDIGER**",
    "[À compléter : articuler ici, à partir des passages ci-dessus, ce que la",
    "décision ou le texte impose. Ce champ est volontairement vide — la machine",
    "ne qualifie pas le texte, elle ne fait que le citer.]",
  ].join("\n");

  await avecClient(async (c) => {
    await c.query(`DELETE FROM "SourceJuridique" WHERE "cle" = $1`, [cle]);
    await c.query(
      `INSERT INTO "SourceJuridique"
        (id, "cle", "idDila", source, nature, titre, juridiction, "dateSource",
         reference, ecli, url, contenu, citations, "matchsCore", "matchsAppui",
         score, "brouillonRegle", statut, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, 'JADE', 'ARRET', $3, 'CAA de BORDEAUX',
         '2026-09-15', $4, $5,
         'https://www.legifrance.gouv.fr/juri/id/CETATEXT000000000001',
         $6, $7::jsonb, $8::jsonb, $9::jsonb, 18, $10, 'NOUVEAU', now())`,
      [
        cle,
        `CETATEXT0000000${suffixe}`,
        titre,
        `24BX0099${suffixe}`,
        `ECLI:FR:CEORD:2026:24BX0099${suffixe}.20260915`,
        CONTENU,
        JSON.stringify([CITATION]),
        JSON.stringify(["code de la route", "permis de conduire", "agent verbalisateur"]),
        JSON.stringify(["délai de contestation", "vice de procédure", "contestation"]),
        brouillon,
      ],
    );
  });
}

/** Faille PROPOSEE liée à la publication (mimite l'auto-proposition de l'extraction). */
async function creerFailleProposee(
  cle: string,
  suffixe: string,
): Promise<string> {
  const titre = `CAA de Bordeaux, 2ème chambre, 15/09/2026, 24BX0099${suffixe}`;
  const id = `e2e-veille-faille-${suffixe}`;
  await avecClient(async (c) => {
    await c.query(
      `INSERT INTO "FailleJuridique"
        (id, "typeInfraction", "titreFaille", "articleLoi", "regle",
         "templateLettre", source, jurisprudence, "reglesDetection", statut,
         "createdAt", "updatedAt")
       VALUES ($1, 'SUSPENSION', $2, 'C. route, art. L. 224-16', NULL,
               '', 'E2E veille', '[]'::jsonb, '[]'::jsonb, 'PROPOSEE', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [id, titre],
    );
    await c.query(
      `UPDATE "SourceJuridique" SET "failleId" = $2 WHERE "cle" = $1`,
      [cle, id],
    );
  });
  return id;
}

async function nettoyer(cle: string): Promise<void> {
  await avecClient(async (c) => {
    await c.query(
      `DELETE FROM "FailleJuridique"
        WHERE id IN (SELECT "failleId" FROM "SourceJuridique" WHERE "cle" = $1)`,
      [cle],
    );
    await c.query(`DELETE FROM "SourceJuridique" WHERE "cle" = $1`, [cle]);
  });
}

/** Carte de la publication de ce test dans la file « À lire ». */
function carte(page: import("@playwright/test").Page, suffixe: string) {
  return page
    .locator("article")
    .filter({ hasText: `CAA de Bordeaux, 2ème chambre, 15/09/2026, 24BX0099${suffixe}` });
}

/**
 * Ligne de faille dans la bibliothèque. On la cible via son titre (h3) :
 * un simple `div.rounded-2xl` matcherait le conteneur de TOUTE la liste.
 */
function ligneFaille(page: import("@playwright/test").Page, suffixe: string) {
  return page
    .locator("div.rounded-2xl")
    .filter({
      has: page.getByRole("heading", {
        name: `CAA de Bordeaux, 2ème chambre, 15/09/2026, 24BX0099${suffixe}`,
        exact: true,
      }),
    });
}

test("veille : garde d'auth (un client n'accède pas à la veille)", async ({ page }) => {
  await loginAs(page, "e2e-client@test.local");
  await page.goto("/dashboard/juriste/veille");
  await expect(page).not.toHaveURL(/\/dashboard\/juriste\/veille/);
});

test("veille : publication retenue, citations littérales et brouillon", async ({ page }) => {
  test.slow();
  const cle = "E2E-VEILLE-JADE-PROMO-0001";
  await insererSource(cle, "01");
  try {
    await loginAs(page, "e2e-admin@test.local");
    await page.goto("/dashboard/juriste/veille");

    await expect(
      page.getByRole("heading", { name: "Veille juridique", level: 1 }),
    ).toBeVisible();
    // Mention explicite : la veille n'est pas un avis juridique.
    await expect(
      page.getByText("Gardez-vous de l'avis juridique", { exact: false }),
    ).toBeVisible();

    const c = carte(page, "01");
    await expect(c).toHaveCount(1);
    // Source primaire : toujours un lien vers le texte officiel.
    await expect(c.getByRole("link", { name: "Source primaire" })).toHaveAttribute(
      "href",
      /legifrance\.gouv\.fr/,
    );
    // Les passages cités sont littéraux, et le brouillon est vide côté
    // articulation (garde-fou anti-hallucination). La même phrase apparaît
    // légitimement deux fois (liste des citations + brouillon) : on scope sur
    // la liste des passages, pas sur le brouillon.
    await c.getByRole("button", { name: "Voir le brouillon de règle" }).click();
    await expect(
      c.locator("li").filter({ hasText: /permis de conduire du requ/ }),
    ).toHaveCount(1);
    await expect(c.getByText("[À compléter", { exact: false })).toBeVisible();
    // Le brouillon annonce qu'il est automatique et à reprendre.
    await expect(
      c.getByText("Brouillon généré par extraction", { exact: false }),
    ).toBeVisible();

    // Pas de bouton de promotion manuelle (feature retirée) : l'extraction est
    // automatique, la décision humaine se limite à valider/écarter.
    await expect(
      c.getByRole("button", { name: "Proposer une faille à partir de cette publication" }),
    ).toHaveCount(0);
  } finally {
    await nettoyer(cle);
  }
});

test("veille : l'activation est refusée tant que la proposition est incomplète", async ({ page }) => {
  test.slow();
  const cle = "E2E-VEILLE-JADE-GARDE-0002";
  await insererSource(cle, "02");
  // La faille PROPOSEE est créée directement (comme le ferait
  // l'auto-proposition de l'extraction) : le parcours de rédaction admin
  // reste identique, seule la promotion manuelle a été retirée.
  await creerFailleProposee(cle, "02");
  try {
    await loginAs(page, "e2e-admin@test.local");

    // Bibliothèque juridique : la proposition y attend validation.
    await page.goto("/dashboard/juriste/failles?f=PROPOSEE");
    const ligne = ligneFaille(page, "02");
    await expect(ligne.getByText("Proposition (auto-alimentation)")).toBeVisible();

    // Tentative d'activation sans rédaction → refus explicite.
    await ligne.getByRole("button", { name: "Valider (Active)" }).click();
    await expect(
      ligne.getByText(/Règle dégagée et template de lettre absents/i),
    ).toBeVisible();
    // Le statut n'a pas bougé.
    await expect(ligne.getByText("Proposition (auto-alimentation)")).toBeVisible();
    expect(
      await avecClient(async (c) => {
        const r = await c.query<{ statut: string }>(
          `SELECT f.statut FROM "SourceJuridique" s
            JOIN "FailleJuridique" f ON f.id = s."failleId"
           WHERE s."cle" = $1`,
          [cle],
        );
        return r.rows[0]?.statut ?? "?";
      }),
    ).toBe("PROPOSEE");

    // Rédaction puis validation : là, ça passe.
    await ligne.getByRole("button", { name: "Modifier" }).click();
    await ligne
      .locator('textarea[name="regle"]')
      .fill(
        "La suspension conservatoire doit être notifiée au conducteur, qui dispose d'un délai de contestation de deux mois.",
      );
    await ligne
      .locator('textarea[name="templateLettre"]')
      .fill(
        "Je soussigné {nom}, conteste la suspension de mon permis de conduire, imposée sans respect du délai de contestation de deux mois.",
      );
    await ligne.getByRole("button", { name: "Enregistrer" }).click();
    await expect(ligne.getByText("Faille mise à jour.").first()).toBeVisible();
    // La règle rédigée est bien celle qu'on a saisie.
    await expect(
      ligne.getByText(/doit être notifiée au conducteur/i).first(),
    ).toBeVisible();

    await ligne.getByRole("button", { name: "Valider (Active)" }).click();
    await expect
      .poll(
        async () =>
          avecClient(async (c) => {
            const r = await c.query<{ statut: string }>(
              `SELECT f.statut FROM "SourceJuridique" s
                JOIN "FailleJuridique" f ON f.id = s."failleId"
               WHERE s."cle" = $1`,
              [cle],
            );
            return r.rows[0]?.statut ?? "?";
          }),
        { timeout: 15_000 },
      )
      .toBe("ACTIVE");

    // Une fois active, la faille quitte le filtre « Propositions » : on la
    // retrouve dans la liste des actives (et plus dans celle-ci).
    await page.goto("/dashboard/juriste/failles?f=PROPOSEE");
    await expect(ligneFaille(page, "02")).toHaveCount(0);
    await page.goto("/dashboard/juriste/failles?f=ACTIVE");
    const active = ligneFaille(page, "02");
    await expect(active.getByText("Active", { exact: true }).first()).toBeVisible();
  } finally {
    await nettoyer(cle);
  }
});

/**
 * Le digest hebdomadaire est protégé par CRON_SECRET.
 */
test("veille : le digest est refusé sans secret", async ({ request }) => {
  const r = await request.get("/api/cron/digest-veille", { failOnStatusCode: false });
  expect(r.status()).toBe(401);
});
