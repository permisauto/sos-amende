/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

/**
 * Remise à zéro de l'état E2E avant la suite : recharge les crédits du client
 * de test (chaque run en consomme) sans réinitialiser la base (les dossiers
 * accumulés restent, ce que la file juriste tolère).
 * Fichier en .cjs : le client Prisma 7 généré est ESM-only (import.meta), ce
 * que le chargeur CJS de Playwright ne peut pas importer.
 */
module.exports = async function globalSetup() {
  const envPath = path.join(process.cwd(), ".env");
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return process.env[key];
    return m[1].trim().replace(/^"|"$/g, "");
  };

  const url = get("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL introuvable pour le globalSetup E2E.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      'UPDATE "User" SET credits = $1 WHERE email = $2',
      [50, "e2e-client@test.local"],
    );
    // Le test suspension.spec.ts vérifie le garde-fou « aucune faille
    // SUSPENSION validée → examen par un juriste » : on remet les 3
    // propositions SUSPENSION en PROPOSEE (les validations manuelles en
    // admin ne doivent pas casser ce test).
    await client.query(
      'UPDATE "FailleJuridique" SET statut = $1 WHERE id = ANY($2)',
      [
        "PROPOSEE",
        [
          "faille-suspension-sans-contradictoire",
          "faille-suspension-marge-erreur-ethylometre",
          "faille-suspension-notification-irreguliere",
        ],
      ],
    );
  } finally {
    await client.end();
  }
};