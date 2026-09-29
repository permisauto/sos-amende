/* =========================================================================
 * Test d'intégration du module « Envoi & suivi » (server.js)
 *
 * MODE BASE (défaut, RECOURS_TEST_MODE=base) :
 *   - crée un VRAI dossier client en base (e2e-client, faille ACTIVE),
 *   - lance le serveur en mode base,
 *   - valide → page assistée (vraies données) → dépôt → suivi → décision OMP
 *     écrites sur le VRAI dossier (statut ENVOYE → RESOLU + DossierEvent),
 *   - nettoie le dossier de test en fin de course.
 *   Exige la base locale (DATABASE_URL du .env).
 *
 * MODE DÉMO (RECOURS_TEST_MODE=demo) : même flux sur la BDD en mémoire.
 *
 * Verdict vert/rouge, exit code 0/1. Usage : npm run test:recours
 * ========================================================================= */

const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const { Pool } = require('pg');

const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server.js');
const MODE = (process.env.RECOURS_TEST_MODE || 'base');

let passed = 0;
let failed = 0;

function ok(name, condition) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m\u2717\x1b[0m ${name}`);
  }
}

async function request(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (HTML) */ }
  return { status: res.status, headers: res.headers, text, json };
}

async function attendreServeur(url, timeoutMs = 10000) {
  const debut = Date.now();
  while (Date.now() - debut < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Serveur non démarré dans le délai imparti.');
}

/* ---- Préparation d'un VRAI dossier de test en base ---- */
let pool;

async function preparerDossierReel() {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = await pool.query(`SELECT id FROM "User" WHERE email='e2e-client@test.local'`);
  if (!client.rows[0]) throw new Error('e2e-client@test.local introuvable (npx prisma db seed)');
  const clientUserId = client.rows[0].id;

  const faille = await pool.query(
    `SELECT id FROM "FailleJuridique" WHERE statut='ACTIVE' AND "typeInfraction"='AMENDE' LIMIT 1`,
  );
  const failleId = faille.rows[0]?.id || null;

  const id = 'recours-test-' + Date.now();
  const idSuspension = id + '-SUSP';
  const ex = {
    nom: 'Jean Dupont',
    plaque: 'RT-456-PQ',
    num_pv: 'P999999999',
    date: '2026-08-20',
    heure: '09:30',
    montant: 135,
    radarId: 'R-9999-0001',
    lieu: 'RN7, commune de Fontainebleau',
  };

  await pool.query(
    `INSERT INTO "Dossier" (id, "userId", type, statut, "pvUrl", "pvTexte", "extractedData", "lettreGeneree", "failleJuridiqueId", prix, "createdAt", "updatedAt")
     VALUES ($1, $2, 'AMENDE', 'PRET', $3, $4, $5::json, $6, $7, 3900, now(), now())`,
    [id, clientUserId, '/uploads/pv/recours-test.png', 'AVIS DE CONTRAVENTION\nN° P999999999\nDate: 2026-08-20\nPlaque: RT-456-PQ',
     JSON.stringify(ex), 'LETTRE RÉELLE DE TEST — certification d\'étalonnage expiré.', failleId],
  );

  await pool.query(
    `INSERT INTO "Dossier" (id, "userId", type, statut, "pvUrl", "pvTexte", "extractedData", "lettreGeneree", prix, "createdAt", "updatedAt")
     VALUES ($1, $2, 'SUSPENSION', 'PRET', $3, $4, $5::json, $6, 5000, now(), now())`,
    [idSuspension, clientUserId, '/uploads/pv/recours-susp.png',
     'DÉCISION DE SUSPENSION\nN° REQUETE-2026-08812\nDate: 2026-09-01\nPlaque: RT-456-PQ',
     JSON.stringify({ nom: 'Jean Dupont', plaque: 'RT-456-PQ', num_pv: 'REQUETE-2026-08812', date: '2026-09-01' }),
     'LETTRE RÉELLE SUSPENSION — contestation de la décision.'],
  );

  return { id, idSuspension };
}

async function nettoyerDossierReel(id, idSuspension) {
  for (const did of [id, idSuspension]) {
    if (did) await pool.query(`DELETE FROM "Dossier" WHERE id=$1`, [did]);
  }
  console.log(`  (dossiers de test supprimés — base propre)`);
}

async function verifierDossierReel(id) {
  const r = await pool.query(
    `SELECT statut, "canalEnvoi", "decisionOmp" FROM "Dossier" WHERE id=$1`, [id],
  );
  const ev = await pool.query(
    `SELECT string_agg(detail, ' | ' ORDER BY "createdAt") AS details FROM "DossierEvent" WHERE "dossierId"=$1`, [id],
  );
  return { ...r.rows[0], details: ev.rows[0].details || '' };
}

/* ---- Corps du test ---- */

async function run() {
  let idReel = null;
  let serveurPid;
  const logs = [];

  try {
    if (MODE === 'base') {
      console.log('[TEST] Préparation de VRAIS dossiers client en base (AMENDE + SUSPENSION)...');
      idReel = await preparerDossierReel();
      console.log(`[TEST] Dossiers réels : ${idReel.id} (AMENDE) + ${idReel.idSuspension} (SUSPENSION)`);
    }

    console.log(`[TEST] Démarrage du serveur (port ${PORT}, mode ${MODE})...`);
    const serveur = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        PORT: String(PORT),
        RECOURS_DB: MODE,
        WORKER_INTERVAL_MS: String(60000),
        EMAIL_FROM: process.env.EMAIL_FROM || 'no-reply@example.fr',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serveurPid = serveur.pid;
    const buf = logs;
    serveur.stdout.on('data', (d) => logs.push(d.toString()));
    serveur.stderr.on('data', (d) => logs.push(d.toString()));

    await attendreServeur(`${BASE}/`);

    const dossierValidable = MODE === 'base' ? idReel.id : 'DOSSIER-ANTAI-001';
    const dossierTel = MODE === 'base' ? idReel.idSuspension : 'DOSSIER-TELERECOURS-001';
    const dossierAttendu = MODE === 'base' ? { numAvis: 'P999999999', plaque: 'RT-456-PQ' } : { numAvis: '4487123456', plaque: 'AB-123-CD' };

    console.log('[TEST] 1/7 — Validation juriste (dossier réel)');
    let r = await request('POST', '/api/recours/valider', { dossierId: dossierValidable, juriste: 'j.dubois@sosamende.fr' });
    ok('valider renvoie ok + finaliserUrl 7 j', r.status === 200 && r.json?.ok === true && /token=/.test(r.json?.finaliserUrl || '') && r.json?.lienValableJours === 7);
    const token = r.json?.finaliserUrl?.split('token=')[1];

    console.log('[TEST] 2/7 — Page finaliser (VRAIES données, portail de contestation)');
    r = await request('GET', `/recours/finaliser?token=${token}`);
    ok('page 200', r.status === 200);
    ok('ouvre usagers.antai.gouv.fr (contestation, pas amendes.gouv)', r.text.includes('usagers.antai.gouv.fr/demarches/saisienumero') && !/amendes\.gouv\.fr\/demarches/.test(r.text));
    ok(`numéro d'avis réel (${dossierAttendu.numAvis})`, r.text.includes(dossierAttendu.numAvis));
    ok(`plaque réelle (${dossierAttendu.plaque}) présente`, r.text.includes(dossierAttendu.plaque));
    ok('encart consignation radar (infraction radar)', r.text.includes('consignat'));

    console.log('[TEST] 3/7 — TELERECOURS (vrai dossier SUSPENSION) + garde-fous token');
    r = await request('POST', '/api/recours/valider', { dossierId: dossierTel });
    const tokenTel = r.json?.finaliserUrl?.split('token=')[1];
    r = await request('GET', `/recours/finaliser?token=${tokenTel}`);
    ok('page Télérecours (citoyens.telerecours.fr + FranceConnect)', r.status === 200 && r.text.includes('citoyens.telerecours.fr') && r.text.includes('FranceConnect'));
    ok('numéro REQUETE-2026-08812 présent', r.text.includes('REQUETE-2026-08812'));

    if (MODE === 'base') {
      r = await request('POST', '/api/recours/depose', { token: tokenTel });
      ok('dépôt SUSPENSION accepté', r.status === 200 && r.json?.ok === true);
      const baseSusp = await verifierDossierReel(idReel.idSuspension);
      ok('VRAI dossier SUSPENSION → statut ENVOYE + canalEnvoi TELERECOURS', baseSusp.statut === 'ENVOYE' && baseSusp.canalEnvoi === 'TELERECOURS');
      ok('DossierEvent écrit (marqueur recours-module)', baseSusp.details.includes('[recours-module]'));
    } else {
      ok('page Télérecours sans consignation (démo)', !r.text.includes('consignat'));
    }

    console.log(`[TEST] 4/7 — Dépôt client (${MODE}) + écriture base`);
    r = await request('POST', '/api/recours/depose', { token });
    ok('dépôt accepté → suivi activé', r.status === 200 && r.json?.ok === true && r.json?.suivi === 'RECU_PAR_LE_SERVICE');

    let base = null;
    if (MODE === 'base') {
      base = await verifierDossierReel(idReel.id);
      ok('VRAI dossier → statut ENVOYE + canalEnvoi ANTAI', base.statut === 'ENVOYE' && base.canalEnvoi === 'ANTAI');
      ok('DossierEvent écrit (marqueur recours-module)', base.details.includes('[recours-module]'));
    }

    console.log('[TEST] 5/7 — Lettres / pièces (base : vraie lettre)');
    r = await request('GET', `/api/recours/lettre/${dossierValidable}?type=lettre`);
    ok('type text/plain', r.headers.get('content-type')?.includes('text/plain'));
    if (MODE === 'base') {
      ok('LETTRE RÉELLE du dossier servie', r.text.includes('LETTRE RÉELLE DE TEST'));
    } else {
      ok('nom de fichier .txt', r.headers.get('content-disposition')?.includes('.txt'));
    }

    console.log('[TEST] 6/7 — Suivi automatique → décision OMP (écrite sur le dossier)');
    r = await request('GET', '/recours/finaliser?token=FAUX');
    ok('token invalide → 403', r.status === 403);
    r = await request('POST', '/api/recours/forcer', { dossierId: 'INCONNU' });
    ok('dossier inconnu → 404', r.status === 404);

    let decision = null;
    for (let i = 0; i < 3 && !decision; i++) {
      r = await request('POST', '/api/recours/forcer', { dossierId: dossierValidable });
      if (r.json?.decision && ['ACCEPTE', 'REJETE'].includes(r.json.decision)) decision = r.json;
    }
    ok('décision OMP atteinte (ACCEPTE|REJETE)', decision !== null && ['ACCEPTE', 'REJETE'].includes(decision.decision));

    if (MODE === 'base') {
      base = await verifierDossierReel(idReel.id);
      ok('VRAI dossier → statut RESOLU + decisionOmp écrits', base.statut === 'RESOLU' && ['ACCEPTE', 'REJETE'].includes(base.decisionOmp));
      ok('DossierEvent DECISION écrit', base.details.includes('Décision OMP'));
      console.log(`  Détail base : statut=${base.statut}, canal=${base.canalEnvoi}, decision=${base.decisionOmp}`);
      console.log(`  Événements : ${base.details}`);
    }

    console.log(`[TEST] 7/7 — État final (${MODE})`);
    r = await request('GET', '/api/recours/dossiers');
    const liste = r.json ?? [];
    for (const d of (Array.isArray(liste) ? liste : [])) {
      console.log(`  - ${d.id} :: ${d.statut}${d.decisionOmp ? ' :: ' + d.decisionOmp : ''}`);
    }
  } catch (err) {
    failed++;
    console.error('  \x1b[31m\u2717 [ERREUR] ' + err.message + '\x1b[0m');
  } finally {
    if (idReel) {
      try { await nettoyerDossierReel(idReel.id, idReel.idSuspension); } catch {}
    }
    if (pool) { try { await pool.end(); } catch {} }
    if (serveurPid) {
      try { process.kill(serveurPid); } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\n[RÉSULTAT (${MODE})] ${passed} tests OK, ${failed} en échec`);
  if (failed > 0) {
    console.log('[LOGS SERVEUR]');
    console.log(logs.slice(-30).join(''));
  }
  process.exit(failed === 0 ? 0 : 1);
}

run();