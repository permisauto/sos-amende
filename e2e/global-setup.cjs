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
  // Supabase pour les E2E (prod) — le .env local pointe sur localhost vide
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  module.exports = async function globalSetup() {
  const envPath = path.join(process.cwd(), ".env");
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return process.env[key];
    return m[1].trim().replace(/^"|"$/g, "");
  };

  let url = get("DATABASE_URL");
  if (!url || url.includes("localhost") || url.includes("johndoe")) {
    url =
      "postgresql://johndoe:gTLwM3AhRdZmQk7nSiUpJE2q@localhost:5432/mydb?schema=public";
  }
  if (!url) {
    throw new Error("DATABASE_URL introuvable pour le globalSetup E2E.");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // Garde-fou « mot de passe obligatoire » (création après le magic-link) :
    // les comptes E2E reçoivent un hash par défaut pour que les specs qui se
    // connectent par magic-link ne soient pas redirigées vers la page de
    // création de mot de passe. (merci de le maintenir identique au seed)
    const e2ePwd =
      "scrypt$32768$8$1$f05734780417c278f0efd0dddd8cbcbd$2a6d4e183029e4b0cc51f69aa1810bb55ad06874af2055cbf1730f6e612a45bf9c1800d930a8a128d0edca11a2b26cf8ade73b4752390ceb7b88a0871c2f8212";
    // Compte dédié au suivi de décision (e2e/suivi-decision.spec.ts) : créé
    // (sur les bases fraîches) puis rechargé — isolé du client principal pour
    // que sa signature de profil (Cas A) n'interfère pas avec les autres specs.
    const sigPath = path.join(
      process.cwd(),
      "public",
      "uploads",
      "sigs",
      "e2e-suivi-signature.png",
    );
    fs.mkdirSync(path.dirname(sigPath), { recursive: true });
    // Fichier PNG minimal valide (1×1) : suffisant pour que la lettre soit
    // « signée » via la signature du profil sans repasser par le canvas.
    fs.writeFileSync(
      sigPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await client.query(
      `
      INSERT INTO "User" (id, email, name, role, credits, "emailVerified", "passwordHash", "signatureUrl", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Client Suivi E2E', 'CLIENT', $2, now(), $3, $4, now())
      ON CONFLICT (email) DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "signatureUrl" = EXCLUDED."signatureUrl",
        credits = EXCLUDED.credits
      `,
      ["e2e-client-suivi@test.local", 50, e2ePwd, "/uploads/sigs/e2e-suivi-signature.png"],
    );
    await client.query(
      'UPDATE "User" SET credits = $1 WHERE email = $2',
      [50, "e2e-client@test.local"],
    );
    await client.query(
      'UPDATE "User" SET "passwordHash" = $1 WHERE email IN ($2,$3,$4)',
      [e2ePwd, "e2e-client@test.local", "e2e-juriste@test.local", "e2e-admin@test.local"],
    );
    // Remise à zéro de la signature du client : une fois signé, P2 réutilise la
    // signature enregistrée (le canvas disparaît au profit de la case
    // « réutiliser ») — chaque suite doit repartir d'un état déterministe.
    await client.query(
      'UPDATE "User" SET "signatureUrl" = NULL WHERE email = $1',
      ["e2e-client@test.local"],
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