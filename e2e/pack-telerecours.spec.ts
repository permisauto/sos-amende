import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loginAs, PV_PNG } from "./helpers";

async function signerLettre(page: import("@playwright/test").Page) {
  const caseReutiliser = page.getByRole("checkbox", {
    name: /Réutiliser ma signature enregistrée/,
  });
  if (await caseReutiliser.isVisible().catch(() => false)) {
    await caseReutiliser.uncheck();
  }
  const canvas = page.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 40, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 40, {
    steps: 8,
  });
  await page.mouse.move(box.x + box.width - 20, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Signer et générer le PDF" })
    .click();
}

const PACK_IDS = ["pack-requete", "pack-refere", "pack-bordereau"] as const;

/** Noms de fichiers normalisés (conventions Télérecours) — le href se termine
 * par le nom du fichier téléchargé. */
const PACK_FICHIERS: Record<(typeof PACK_IDS)[number], string> = {
  "pack-requete": "Requete_au_fond_REP.pdf",
  "pack-refere": "Requete_Refere_Suspension.pdf",
  "pack-bordereau": "Bordereau_Recapitulatif_des_Pieces.pdf",
};

/**
 * Les 3 PDF du pack sont bien liés (href /uploads/pdfs/pack/<id>/<nom>.pdf)
 * ET sont de vrais PDF. Pas de fetch HTTP : `next start` ne sert que les
 * fichiers `public/` présents au démarrage du serveur (les uploads du run
 * arrivent ensuite) — on relit donc les octets sur disque, chemin déduit du
 * href.
 */
async function verifierPack(p: import("@playwright/test").Page) {
  await expect(p.getByTestId("pack-telerecours")).toBeVisible();
  for (const id of PACK_IDS) {
    const href = await p.getByTestId(id).getAttribute("href");
    expect(href, `${id} : lien absent`).toMatch(
      new RegExp(`^/uploads/pdfs/pack/[a-z0-9]+/${PACK_FICHIERS[id]}$`),
    );
    const buf = await readFile(
      path.join(process.cwd(), "public", href as string),
    );
    expect(buf.subarray(0, 5).toString(), `${id} : PDF`).toBe("%PDF-");
  }
}

test("pack Télérecours 3F : activation catalogue → dépôt arrêté → validation TELERECOURS → pack 3 PDF côté client et juriste", async ({
  page,
  browser,
}) => {
  test.slow();

  // 1) Admin : ouvrir la bibliothèque déclenche `synchroniserCatalogue`, qui
  //    synchronise le catalogue ET injecte les 4 failles pack validées
  //    (PROPOSEE → ACTIVE — `FAILLES_PACK_ACTIVES`, cloisonnées docType) : le
  //    moteur n'utilise que des failles ACTIVE (garde-fou). Plus de clic sur
  //    « Synchroniser et activer » : il activerait aussi les 10 failles
  //    suspension sans garde docType et casserait suspension.spec.ts (course
  //    entre specs).
  const ctxAdmin = await browser.newContext();
  const pa = await ctxAdmin.newPage();
  await loginAs(pa, "e2e-admin@test.local");
  await pa.goto("/dashboard/juriste/failles?f=ACTIVE");
  await expect(
    pa.getByText(/délai de 72 heures suivant le contrôle/),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    pa.getByText(/décision d'invalidation ne récapitulant pas les précédents retraits/),
  ).toBeVisible();
  await ctxAdmin.close();

  // 2) Client : dépôt d'un arrêté préfectoral de suspension (SUSPENSION) —
  //    le nom de fichier « arrete-… » fait choisir au provider mock le texte
  //    d'arrêté 3F (voir extrairePv / mockOcr).
  await loginAs(page, "e2e-client@test.local");
  await page.goto("/dashboard/cases/new");
  await page.getByLabel("Type d'infraction").selectOption("SUSPENSION");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "arrete-suspension.png",
      mimeType: "image/png",
      buffer: PV_PNG,
    });
  await page.getByRole("button", { name: /Lancer l'analyse/ }).click();
  await page.waitForURL(/\/dashboard\/cases\/(?!new$)[^/]+$/);
  const dossierId = page.url().split("/").pop() as string;

  // 3) Formulaire : document classé 3F par le OCR + pré-remplissage (human-
  //    in-the-loop : l'humain relit et confirme avant toute génération).
  await expect(
    page.getByText("Document classé : suspension préfectorale (3F)"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Plaque (si mentionnée)", { exact: true }),
  ).toHaveValue("AB-123-CD");
  await expect(page.getByLabel("Motif", { exact: true })).toHaveValue(
    "excès de vitesse",
  );

  await page.getByLabel("Nom", { exact: true }).fill("DUPONT");
  await page
    .getByLabel("Plaque (si mentionnée)", { exact: true })
    .fill("AB-123-CD");
  await page
    .getByLabel("Numéro de décision", { exact: true })
    .fill("DEC-2026-0421");
  await page
    .getByLabel("Date de la décision", { exact: true })
    .fill("2026-07-01");
  await page
    .getByRole("button", { name: "Analyser et générer la lettre" })
    .click();
  // Lettre générée depuis la faille pack (modèle validé) → examen juriste.
  await expect(
    page.getByText(/Examen par un juriste en cours|Lettre en cours de validation/),
  ).toBeVisible();
  await expect(
    page.getByText("Suspension de permis : délais de recours très courts", {
      exact: true,
    }),
  ).toBeVisible();

  // 4) Juriste : la candidature pack (délai de 72 h dépassé) est proposée,
  //    puis validation en canal Télérecours (portail officiel du type).
  const ctxJuriste = await browser.newContext();
  const pj = await ctxJuriste.newPage();
  await loginAs(pj, "e2e-juriste@test.local");
  await pj.goto(`/dashboard/juriste/${dossierId}`);
  await expect(
    pj.getByText("Suspension de permis : délais de recours très courts", {
      exact: true,
    }),
  ).toBeVisible();
  await pj.getByRole("button", { name: "Suggestions IA" }).click();
  await expect(
    pj.getByText(/hors délai de 72 heures suivant le contrôle/).first(),
  ).toBeVisible();
  await pj.getByRole("button", { name: /Fermer les suggestions/ }).click();

  await pj
    .getByLabel("Canal d'envoi de la contestation")
    .selectOption("TELERECOURS");
  // Canaux restreints au type (suspension → Télérecours ou LRAR, jamais ANTAI)
  await expect(
    pj
      .getByLabel("Canal d'envoi de la contestation")
      .locator('option[value="ANTAI"]'),
  ).toHaveCount(0);
  await pj.getByRole("button", { name: "Valider la lettre" }).click();
  // `validerDossier` revalide puis redirige (?valide=ok) : sous charge
  // parallèle (4 workers), action serveur + rechargement RSC dépassent 5 s.
  await expect(
    pj.getByText("Validation par le juriste", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await ctxJuriste.close();

  // 5) Client : signe si la lettre n'est pas déjà signée (Cas A), puis voit
  //    le pack de dépôt (requête + référé L. 521-2 + bordereau).
  await page.goto(`/dashboard/cases/${dossierId}`);
  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible().catch(() => false)) {
    await signerLettre(page);
  }
  await expect(
    page.getByRole("heading", {
      name: "Contestation validée — à déposer sur le portail officiel",
    }),
  ).toBeVisible();
  await verifierPack(page);

  // 6) Juriste : mêmes 3 PDF téléchargeables depuis la fiche dossier.
  const ctxJuriste2 = await browser.newContext();
  const pj2 = await ctxJuriste2.newPage();
  await loginAs(pj2, "e2e-juriste@test.local");
  await pj2.goto(`/dashboard/juriste/${dossierId}`);
  await verifierPack(pj2);
  await ctxJuriste2.close();
});
