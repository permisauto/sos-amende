/**
 * Smoke test post-déploiement (production ou preview).
 *
 * Vérifie les endpoints critiques sans créer de données :
 *   - GET /            → 200, page d'accueil
 *   - GET /login       → 200, formulaire de connexion (label « Adresse e-mail »)
 *   - GET /pricing     → 200
 *   - GET /api/health  → statut JSON (lite sans secret, full avec CRON_SECRET)
 *
 * Usage :
 *   node scripts/smoke-test.mjs                       # URL locale 3200
 *   BASE_URL=https://recours-permis-pv.com node scripts/smoke-test.mjs
 *   CRON_SECRET=xxx BASE_URL=https://... node scripts/smoke-test.mjs   # health full
 *
 * Sortie non nulle si un check échoue (utilisable en CI ou après `vercel --prod`).
 */
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET ?? "";

let echecs = 0;

async function check(nom, url, options = {}) {
  const debut = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", ...options });
    const duree = Date.now() - debut;
    const ok = res.status >= 200 && res.status < 400;
    if (!ok) echecs++;
    console.log(
      `${ok ? "OK  " : "FAIL"} ${String(res.status).padEnd(3)} ${String(duree).padStart(5)}ms ${nom} (${url})`,
    );
    return res;
  } catch (err) {
    echecs++;
    console.log(`FAIL ---      0ms ${nom} (${url}) : ${err.message}`);
    return null;
  }
}

console.log(`[smoke-test] base=${baseUrl}\n`);

// 1. Pages publiques
const accueil = await check("Accueil", `${baseUrl}/`);
if (accueil) {
  const html = await accueil.text();
  if (!html.includes("SOS Amende") && !html.includes("amende")) {
    echecs++;
    console.log("FAIL contenu inattendu sur l'accueil");
  }
}

const login = await check("Connexion", `${baseUrl}/login`);
if (login) {
  const html = await login.text();
  if (!html.includes("Adresse e-mail") && !html.includes("Connexion")) {
    echecs++;
    console.log("FAIL formulaire de connexion absent");
  }
}

await check("Tarifs", `${baseUrl}/pricing`);

// 2. Health lite (public)
const healthLite = await check("Health (lite)", `${baseUrl}/api/health`);
if (healthLite) {
  try {
    const json = await healthLite.json();
    console.log(
      `     statut=${json.status ?? "?"} env=${json.environment ?? "?"} mode=${json.mode ?? "?"}`,
    );
  } catch {
    echecs++;
    console.log("FAIL réponse health non JSON");
  }
}

// 3. Health full (avec secret) : checks externes coûteux
if (cronSecret) {
  const healthFull = await check("Health (full)", `${baseUrl}/api/health`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  if (healthFull) {
    try {
      const json = await healthFull.json();
      const enEchec = (json.checks ?? []).filter((c) => c.status === "unhealthy");
      for (const c of enEchec) {
        console.log(`     unhealthy: ${c.name} — ${c.error ?? c.details?.message ?? ""}`);
      }
      console.log(
        `     statut=${json.status ?? "?"} checks=${(json.checks ?? []).length} unhealthy=${enEchec.length}`,
      );
      // Le statut global peut être degraded (ex. clé e-mail absente en preview) :
      // on ne fait échouer le smoke test que sur une erreur 5xx.
      if (healthFull.status >= 500) echecs++;
    } catch {
      echecs++;
      console.log("FAIL réponse health full non JSON");
    }
  }
} else {
  console.log("SKIP Health (full) : CRON_SECRET non fourni");
}

console.log(`\n[smoke-test] ${echecs === 0 ? "SUCCÈS" : `ÉCHEC (${echecs} problème(s))`}`);
process.exit(echecs === 0 ? 0 : 1);
