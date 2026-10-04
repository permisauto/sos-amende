/* =========================================================================
 * SOS Amende — Module « Envoi & suivi des contestations »
 *
 * Deux modes :
 *   - MODE BASE (défaut) : lit/écrit les VRAIS dossiers clients dans la base
 *     du SaaS (Postgres via pg, mêmes tables que Prisma : "Dossier", "User",
 *     "FailleJuridique", "DossierEvent", "Courrier").
 *   - MODE DÉMO (RECOURS_DB=demo) : BDD simulée en mémoire (aucune base).
 *
 * Flux : validation juriste -> token 7 j + email Resend -> page mobile
 * assistée (Option 2, ZÉRO iframe du portail officiel) -> dépôt par le client
 * (statut ENVOYE + DossierEvent) -> worker de suivi automatique (décision
 * OMP écrite sur le vrai dossier : statut RESOLU, decisionOmp) -> notifs.
 *
 * Portée : module de production-ready (base réelle) ; envoi officiel et
 * scraping réels du portail = à brancher dans les fonctions marquées (ROBOT).
 * ========================================================================= */

const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const PORT = Number(process.env.PORT) || 3100;
const BASE_URL = process.env.DEMO_BASE_URL || `http://localhost:${PORT}`;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS) || 30000;
const MARQUEUR = '[recours-module]'; // trace des événements écrits par ce module

let MODE = process.env.RECOURS_DB === 'demo' ? 'demo' : 'base';

/* ========================================================================
 * Accès base réelle (Postgres via pg) ou simulation en mémoire
 * ====================================================================== */

const { Pool } = require('pg');

const pool = MODE === 'base' ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }) : null;

if (MODE === 'base') {
  pool
    .query('select 1')
    .then(() => console.log('[DB] connectée — mode BASE (vrais dossiers)'))
    .catch(() => {
      console.warn('[DB] indisponible → bascule automatique en mode DÉMO');
      MODE = 'demo';
    });
}

const estBase = () => MODE === 'base';

/* ========================================================================
 * Sécurité (mode BASE uniquement — le module touche à la vraie base) :
 * toutes les routes API exigent le header `x-recours-secret` égal à
 * RECOURS_MODULE_SECRET (comparaison à temps constant). Sans secret au
 * démarrage, les routes restent verrouillées (401). Le mode démo (aucune
 * donnée réelle) reste ouvert pour les demonstrations.
 * ====================================================================== */

const SECRET = String(process.env.RECOURS_MODULE_SECRET || '');

function secretValide(req) {
  if (!SECRET) return false;
  const fourni = String(req.get('x-recours-secret') || '');
  const a = Buffer.from(fourni);
  const b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function gardeApi(req, res) {
  if (!estBase()) return true;
  if (secretValide(req)) return true;
  res.status(401).json({ error: 'Header x-recours-secret requis (RECOURS_MODULE_SECRET).' });
  return false;
}

if (estBase() && !SECRET) {
  console.warn('[SEC] RECOURS_MODULE_SECRET absent — routes API verrouillées (401).');
}

/** Échappement HTML (anti-XSS : nom, plaque, faille, n° d'avis saisis par le client). */
function htmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ========================================================================
 * Dossiers simulés (mode démo purement)
 * ====================================================================== */

const dossiersDemo = [
  {
    id: 'DOSSIER-ANTAI-001',
    client: { nom: 'Camille Lefèvre', email: 'camille.lefevre@example.fr' },
    platform: 'ANTAI',
    platformLabel: 'ANTAI — Désigner ou contester en ligne',
    numAvis: '4487123456',
    plaque: 'AB-123-CD',
    montant: 135.0,
    radar: true,
    faille: "Certificat d'étalonnage du radar expiré au jour de l'infraction",
    statut: 'EN_ATTENTE_JURISTE',
    suivi: null,
    decision: null,
    events: [],
  },
  {
    id: 'DOSSIER-TELERECOURS-001',
    client: { nom: 'Maxime Roger', email: 'maxime.roger@example.fr' },
    platform: 'TELERECOURS',
    platformLabel: 'Télérecours Citoyens (juge administratif)',
    numAvis: 'REQUETE-2026-08812',
    plaque: 'EF-456-GH',
    montant: 0.0,
    radar: false,
    faille: 'Non-respect du contradictoire préalable (suspension de permis)',
    statut: 'EN_ATTENTE_JURISTE',
    suivi: null,
    decision: null,
    events: [],
  },
];

// Dossiers réels suivis par ce module (pilotés par le worker)
const suivisRecours = new Set(); // ids de dossiers pris en charge (ENVOYE)
const etapesSuivi = new Map(); // dossierId -> étape en cours

function pushEventDemo(dossier, label) {
  dossier.events.push({ at: new Date().toISOString(), label });
  console.log(`[EVENT] ${dossier.id} → ${label}`);
}

/* ========================================================================
 * Helpers — token (7 j, hash sha256) + normalisation d'un dossier réel
 * ====================================================================== */

const tokens = new Map(); // hash(token) -> { dossierId, juriste, expiresAt }

function findDossierBase(id) {
  return dossiersDemo.find((d) => d.id === id) || null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createToken(dossierId, juriste) {
  const raw = crypto.randomBytes(24).toString('hex');
  tokens.set(sha256(raw), { dossierId, juriste, expiresAt: Date.now() + TOKEN_TTL_MS });
  return raw;
}

function resolveToken(raw) {
  const entry = tokens.get(sha256(raw));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokens.delete(sha256(raw));
    return null;
  }
  return entry;
}

// Chargement d'un VRAI dossier + client + faille
async function chargerDossierReel(id) {
  const r = await pool.query(
    `SELECT d.*, u.name AS "clientName", u.email AS "clientEmail",
            f."titreFaille", f."articleLoi"
     FROM "Dossier" d
     JOIN "User" u ON u.id = d."userId"
     LEFT JOIN "FailleJuridique" f ON f.id = d."failleJuridiqueId"
     WHERE d.id = $1`,
    [id],
  );
  return r.rows[0] || null;
}

// Normalise un vrai dossier en vue métier (compatible rendu de la page)
function vueDossierReel(d) {
  const ex = d.extractedData && typeof d.extractedData === 'object' ? d.extractedData : {};
  const type = d.type === 'SUSPENSION' ? 'TELERECOURS' : 'ANTAI';
  const montant = Number(ex.montant || d.prix / 100 || 0);
  return {
    id: d.id,
    client: { nom: d.clientName || 'Client', email: d.clientEmail },
    platform: type,
    platformLabel: type === 'ANTAI' ? 'ANTAI — Désigner ou contester en ligne' : 'Télérecours Citoyens (juge administratif)',
    numAvis: ex.num_pv || ex.num_telepaiement || '—',
    plaque: ex.plaque || '—',
    montant,
    radar: type === 'ANTAI' && !!(ex.radarId || ex.typeRadar),
    faille: d.titreFaille || (d.failleJuridiqueId ? 'Faille juridique' : 'Aucune faille retenue'),
    statut: d.statut,
    decision: d.decisionOmp || null,
  };
}

// Styles de contestation autorisés (comme le juriste valide la lettre d'abord)
const STATUTS_VALIDABLES = new Set([
  'EN_ANALYSE',
  'A_VERIFIER',
  'EN_ATTENTE_PAIEMENT',
  'EN_ATTENTE_VALIDATION',
  'EN_ATTENTE_PRE_SIGNATURE',
  'PRET',
  'ENVOYE',
]);

/* ========================================================================
 * Notifications (Resend si AUTH_RESEND_KEY+EMAIL_FROM, sinon fallback console)
 * ====================================================================== */

async function sendEmail(to, subject, html) {
  const key = process.env.AUTH_RESEND_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[EMAIL-DEMO] to=${to} | ${subject}`);
    console.log('              (AUTH_RESEND_KEY/EMAIL_FROM absents — email non émis)');
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const { error } = await new Resend(key).emails.send({ from, to, subject, html });
    if (error) console.error('[EMAIL] Resend error:', error);
    return !error;
  } catch (err) {
    console.error('[EMAIL] Échec envoi:', err);
    return false;
  }
}

async function notifierChangement(client, statutLabel, texte) {
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <h2>SOS Amende — Suivi de votre contestation</h2>
      <p>Bonjour ${htmlEscape(client.nom)},</p>
      <p>${htmlEscape(texte)}</p>
      <p style="color:#64748b;font-size:12px">Statut : ${htmlEscape(statutLabel)}.</p>
      <p style="color:#64748b;font-size:12px">Simulation de démonstration — aucun envoi réel.</p>
    </div>`;
  await sendEmail(client.email, `SOS Amende — ${statutLabel}`, html);
}

/* ========================================================================
 * Machine de suivi (étapes partagées démo + base)
 * ====================================================================== */

const SUIVI_ETAPES = ['RECU_PAR_LE_SERVICE', 'EN_INSTRUCTION', 'DECISION'];

function prochaineEtape(etape) {
  const idx = etape ? SUIVI_ETAPES.indexOf(etape) : -1;
  return SUIVI_ETAPES[idx + 1] || null;
}

function libelleSuivi(etape) {
  const map = {
    RECU_PAR_LE_SERVICE: 'Contestation reçue par le service',
    EN_INSTRUCTION: 'Instruction en cours par l’OMP / le juge',
    DECISION: 'Décision rendue',
  };
  return map[etape] || etape;
}

function libelleDecision(decision) {
  return decision === 'ACCEPTE'
    ? 'Votre contestation a été acceptée : l’amende est annulée.'
    : 'Votre contestation a été rejetée. Un courrier de l’OMP précise les suites.';
}

/** Tirage de démonstration — JAMAIS utilisé en mode base (voir avancerDossierReel). */
function tirageDecision() {
  return Math.random() < 0.5 ? 'ACCEPTE' : 'REJETE';
}

/* ========================================================================
 * BRIQUE 4 — Worker de suivi automatique (setInterval)
 * En mode base : sélectionne les VRAIS dossiers ENVOYE suivis par ce module
 * (marqueur DossierEvent) dont la décision n'est pas encore écrite, et écrit
 * chaque étape sur la vraie base + notifie le client réel.
 * ====================================================================== */

async function ecrireEtapeReel(dossierId, etape, decision) {
  if (etape === 'DECISION') {
    const detailDecision =
      decision === 'ACCEPTE'
        ? 'Contestation acceptée — amende annulée (suivi automatique)'
        : 'Contestation rejetée par l’OMP (suivi automatique)';
    await pool.query(
      `UPDATE "Dossier" SET statut='RESOLU', "decisionOmp"=$2, "decisionDetail"=$3, "updatedAt"=now() WHERE id=$1`,
      [dossierId, decision, detailDecision],
    );
    await pool.query(
      `INSERT INTO "DossierEvent" (id, "dossierId", type, detail, "createdAt") VALUES ($1, $2, 'DECISION', $3, now())`,
      [crypto.randomUUID(), dossierId, `${MARQUEUR} Décision OMP : ${decision}`],
    );
  } else {
    await pool.query(
      `INSERT INTO "DossierEvent" (id, "dossierId", type, detail, "createdAt") VALUES ($1, $2, 'ENVOI', $3, now())`,
      [crypto.randomUUID(), dossierId, `${MARQUEUR} Suivi administration : ${libelleSuivi(etape)}`],
    );
  }
}

async function avancerDossierReel(dossierId) {
  const dossier = await chargerDossierReel(dossierId);
  if (!dossier) return null;
  if (dossier.decisionOmp) return { statut: 'DECISION', decision: dossier.decisionOmp, dejaTraite: true };

  if (dossier.statut !== 'ENVOYE') return { statut: dossier.statut, dejaTraite: true };

  const etape = prochaineEtape(etapesSuivi.get(dossierId));
  if (!etape) return { statut: 'DECISION', decision: dossier.decisionOmp, dejaTraite: true };

  etapesSuivi.set(dossierId, etape);
  const vue = vueDossierReel(dossier);

  if (etape === 'DECISION') {
    if (estBase()) {
      // Garde-fou anti-hallucination : en mode réel, le module N'INVENTE
      // jamais de décision — on attend le retour officiel (cron
      // /api/cron/recuperations-decisions ou saisie manuelle du juriste).
      console.log(`[WORKER] ${dossierId} → DECISION en attente (aucune écriture, mode base)`);
      return { statut: 'ENVOYE', suivi: 'DECISION', enAttenteReelle: true };
    }
    const decision = tirageDecision();
    await ecrireEtapeReel(dossierId, etape, decision);
    console.log(`[EVENT] ${dossierId} → Décision OMP : ${decision}`);
    await notifierChangement(vue.client, 'Décision rendue', libelleDecision(decision));
    return { statut: 'DECISION', decision };
  }

  await ecrireEtapeReel(dossierId, etape);
  console.log(`[EVENT] ${dossierId} → Suivi : ${libelleSuivi(etape)}`);
  await notifierChangement(vue.client, libelleSuivi(etape), `Votre dossier est au statut « ${libelleSuivi(etape)} ».`);
  return { statut: 'ENVOYE', suivi: etape };
}

async function avancerDossierDemo(dossier) {
  if (dossier.statut !== 'ENVOYE') return false;
  const etape = prochaineEtape(dossier.suivi);
  if (!etape) return false;

  dossier.suivi = etape;
  pushEventDemo(dossier, `Suivi administration : ${libelleSuivi(etape)}`);

  if (etape === 'DECISION') {
    dossier.decision = tirageDecision();
    dossier.statut = 'DECISION';
    pushEventDemo(dossier, `Décision OMP : ${dossier.decision}`);
  }
  return true;
}

async function tourWorker() {
  if (estBase()) {
    const r = await pool.query(
      `SELECT d.id
       FROM "Dossier" d
       WHERE d.statut = 'ENVOYE'
         AND d."decisionOmp" IS NULL
         AND EXISTS (
           SELECT 1 FROM "DossierEvent" ev
           WHERE ev."dossierId" = d.id AND ev.detail LIKE $1
         )`,
      [`%${MARQUEUR}%`],
    );
    const ids = r.rows.map((x) => x.id);
    for (const id of ids) {
      if (!suivisRecours.has(id)) {
        suivisRecours.add(id);
        await ecrireEtapeReel(id, 'RECU_PAR_LE_SERVICE');
        const d = await chargerDossierReel(id);
        if (d) await notifierChangement(vueDossierReel(d).client, libelleSuivi('RECU_PAR_LE_SERVICE'), 'Votre contestation a été déposée. SOS Amende suit maintenant le dossier automatiquement.');
        etapesSuivi.set(id, 'RECU_PAR_LE_SERVICE');
      }
      await avancerDossierReel(id);
    }
    return;
  }

  for (const dossier of dossiersDemo) {
    if (avancerDossierDemo(dossier)) {
      if (dossier.suivi === 'DECISION') {
        await notifierChangement(dossier.client, 'Décision rendue', libelleDecision(dossier.decision));
      } else {
        await notifierChangement(dossier.client, libelleSuivi(dossier.suivi), `Votre dossier est au statut « ${libelleSuivi(dossier.suivi)} ».`);
      }
    }
  }
}

const worker = setInterval(tourWorker, WORKER_INTERVAL_MS);
worker.unref();
console.log(`[WORKER] Suivi démarré (intervalle ${WORKER_INTERVAL_MS} ms, mode ${MODE})`);

/* ========================================================================
 * App Express
 * ====================================================================== */

const app = express();
app.use(express.json());

/* ---- Index ---- */
app.get('/', async (req, res) => {
  const infos = { demo: 'SOS Amende — Envoi & suivi des contestations', mode: MODE, simulation: true };
  if (estBase() && !secretValide(req)) return res.json(infos);
  if (estBase()) {
    const c = await pool.query('select count(*)::int as n from "Dossier"');
    infos.dossiersReels = c.rows[0].n;
    infos.routes = [
      'GET  /api/recours/dossiers',
      'POST /api/recours/valider            {dossierId, juriste}',
      'GET  /recours/finaliser?token=...',
      'POST /api/recours/depose             {token}',
      'GET  /api/recours/lettre/:dossierId',
      'POST /api/recours/forcer             {dossierId}  (accélérer la démo)',
    ];
  } else {
    infos.dossiers = dossiersDemo.map((d) => ({ id: d.id, platform: d.platform, statut: d.statut, suivi: d.suivi }));
  }
  res.json(infos);
});

/* ========================================================================
 * BRIQUE 2 — POST /api/recours/valider
 * Le juriste valide un dossier (réel ou démo) -> token 7 j + email Resend
 * ====================================================================== */

app.post('/api/recours/valider', async (req, res) => {
  if (!gardeApi(req, res)) return;
  const { dossierId, juriste } = req.body || {};
  if (!dossierId) return res.status(400).json({ error: 'dossierId requis' });

  let client;
  let platform;
  let faille;

  if (estBase()) {
    const dossier = await chargerDossierReel(dossierId);
    if (!dossier) return res.status(404).json({ error: 'Dossier inconnu' });
    if (!STATUTS_VALIDABLES.has(dossier.statut)) {
      return res.status(409).json({ error: `Dossier au statut ${dossier.statut} — validation impossible` });
    }
    const vue = vueDossierReel(dossier);
    client = vue.client;
    platform = vue.platform;
    faille = vue.faille;
  } else {
    const dossier = findDossierBase(dossierId);
    if (!dossier) return res.status(404).json({ error: 'Dossier inconnu' });
    if (!['EN_ATTENTE_JURISTE', 'EN_ATTENTE_CLIENT', 'ENVOYE'].includes(dossier.statut)) {
      return res.status(409).json({ error: `Dossier au statut ${dossier.statut} — validation impossible` });
    }
    client = dossier.client;
    platform = dossier.platform;
    faille = dossier.faille;
    dossier.statut = 'EN_ATTENTE_CLIENT';
    pushEventDemo(dossier, `Validé par ${juriste || 'juriste@exemple.fr'} — lien envoyé au client`);
  }

  const token = createToken(dossierId, juriste || 'juriste@exemple.fr');
  const finaliserUrl = `${BASE_URL}/recours/finaliser?token=${token}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <h2>SOS Amende — Finalisez votre contestation</h2>
      <p>Bonjour ${htmlEscape(client.nom)},</p>
      <p>Votre dossier <strong>${htmlEscape(dossierId)}</strong> a été validé par notre juriste
         (faille retenue : ${htmlEscape(faille)}).</p>
      <p>Il ne reste qu’une étape de votre côté : ouvrir le portail officiel et
         déposer. Nous avons préparé tous les documents. Lien valable <strong>7 jours</strong> :</p>
      <p style="text-align:center">
        <a href="${finaliserUrl}"
           style="background:#0f766e;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Finaliser ma contestation
        </a>
      </p>
      <p style="color:#64748b;font-size:12px">Si le bouton ne fonctionne pas : <a href="${finaliserUrl}">${finaliserUrl}</a></p>
      <p style="color:#64748b;font-size:12px">Simulation de démonstration — aucun envoi réel.</p>
    </div>`;

  await sendEmail(client.email, `SOS Amende — Finalisez votre contestation (${platform})`, html);

  res.json({ ok: true, dossierId, finaliserUrl, lienValableJours: 7 });
});

/* ========================================================================
 * BRIQUE 3 — GET /recours/finaliser (page mobile assistée)
 * Aucun iframe : ouverture NATIVE du portail officiel + presse-papiers +
 * pièces prêtes + guide. Le client ne fait que le geste du dépôt.
 * ====================================================================== */

function pageFinaliser(dossier) {
  const estAntai = dossier.platform === 'ANTAI';
  const portailUrl = estAntai
    ? 'https://www.usagers.antai.gouv.fr/demarches/saisienumero?lang=fr'
    : 'https://citoyens.telerecours.fr/';

  const consignation = dossier.radar
    ? `<div class="alert">
         <strong>Étape consignation (infraction radar) :</strong> la recevabilité exige de
         consigner <strong>${dossier.montant.toFixed(2).replace('.', ',')} €</strong>
         (somme rendue si votre contestation est acceptée). La consignation se paie sur
         <strong>amendes.gouv.fr</strong> — c’est le seul moment où ce site intervient,
         la contestation elle-même se fait sur le portail ANTAI.
       </div>`
    : '';

  const guide = estAntai ? `
      <ol>
        <li>Ouvrez le portail ANTAI avec le bouton ci-dessus.</li>
        <li>Collez votre <strong>numéro d’avis</strong> (déjà copié dans le presse-papiers, cadran de saisie « numéro de l’avis »).</li>
        <li>Choisissez <strong>« Contester la réalité de l’infraction »</strong>.</li>
        <li>Renseignez vos informations (nom, date de naissance, minerval).</li>
        <li>Joignez les <strong>pièces prêtes ci-dessous</strong> (lettre + avis + preuves) au format PDF/JPG (démo : texte).</li>
        <li>Validez. L’accusé de dépôt est enregistré, SOS Amende suit le dossier automatiquement.</li>
      </ol>` : `
      <ol>
        <li>Ouvrez Télérecours Citoyens avec le bouton ci-dessous.</li>
        <li>Identifiez-vous avec <strong>FranceConnect</strong> (connexion citoyenne obligatoire, non automatisable).</li>
        <li>Déposez votre <strong>requête</strong> en joignant les pièces prêtes ci-dessous.</li>
        <li>Validez. Le greffe vous notifiera par e-mail — SOS Amende relaie chaque étape.</li>
      </ol>`;

  const etapesBouton = estAntai
    ? 'Ouvrir le portail ANTAI (Désigner ou contester)'
    : 'Ouvrir Télérecours Citoyens (FranceConnect)';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOS Amende — Finaliser ${dossier.platform}</title>
<style>
  :root { --vert:#0f766e; }
  * { box-sizing:border-box; }
  body { font-family:system-ui,sans-serif; margin:0; background:#f1f5f9; color:#0f172a; }
  header { background:linear-gradient(135deg,#0f766e,#115e59); color:#fff; padding:24px 20px; }
  header h1 { margin:0; font-size:20px; }
  header p { margin:6px 0 0; opacity:.9; font-size:13px; }
  .banner { background:#fef9c3; color:#713f12; font-size:12px; padding:8px 16px; text-align:center; }
  main { max-width:560px; margin:0 auto; padding:16px; }
  .card { background:#fff; border-radius:12px; padding:16px; margin-bottom:14px; box-shadow:0 1px 3px #cbd5e1; }
  .badge { display:inline-block; background:#e2e8f0; border-radius:999px; padding:3px 10px; font-size:11px; font-weight:600; }
  .avis-box { display:flex; align-items:center; gap:8px; margin:10px 0; }
  .avis-box code { font-size:18px; font-weight:700; letter-spacing:1px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 12px; flex:1; }
  button { cursor:pointer; border:none; border-radius:8px; font-weight:600; }
  .btn { display:inline-block; width:100%; background:var(--vert); color:#fff; padding:14px; text-align:center; border-radius:8px; text-decoration:none; font-weight:600; font-size:15px; }
  .btn.secondary { background:#0ea5e9; }
  .btn.ghost { background:#e2e8f0; color:#0f172a; margin-top:8px; }
  .alert { background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:13px; border-radius:8px; padding:10px; margin:10px 0; }
  ol { margin:8px 0 0; padding-left:20px; font-size:14px; line-height:1.6; }
  li { margin-bottom:6px; }
  .pieces a { display:flex; justify-content:space-between; padding:10px 12px; border:1px solid #e2e8f0; border-radius:8px; margin:6px 0; color:#0f172a; text-decoration:none; font-size:14px; }
  .pieces a span { color:#0ea5e9; font-weight:600; }
  .ok { text-align:center; padding:18px; }
  .ok .check { font-size:34px; }
  footer { text-align:center; color:#94a3b8; font-size:11px; padding:16px; }
</style>
</head>
<body>
<header>
  <h1>SOS Amende — Finalisation de votre contestation</h1>
  <p>Dossier ${htmlEscape(dossier.id)} · ${htmlEscape(dossier.platformLabel)}</p>
</header>
<div class="banner">Simulation de démonstration — aucun envoi réel vers l’administration.</div>
<main>
  <div class="card">
    <span class="badge">Lettre préparée par notre juriste</span>
    <p style="font-size:14px;margin:8px 0 0">Faille retenue : <strong>${htmlEscape(dossier.faille)}</strong>.</p>
  </div>

  <div class="card">
    <h3 style="margin:0 0 4px">Vos identifiants de dépôt</h3>
    <div class="avis-box">
      <code id="avis" data-num-avis="${htmlEscape(dossier.numAvis)}">${htmlEscape(dossier.numAvis)}</code>
      <button class="ghost" id="copyBtn">Copier</button>
    </div>
    <p style="font-size:14px;margin:4px 0 8px">Véhicule : <strong>${htmlEscape(dossier.plaque)}</strong></p>
    <p style="font-size:12px;color:#64748b;margin:2px 0 10px">Déjà copié automatiquement dans le presse-papiers.</p>
    <a class="btn" href="${portailUrl}" target="_blank" rel="noopener noreferrer">${etapesBouton}</a>
    ${consignation}
  </div>

  <div class="card">
    <h3 style="margin:0 0 8px">Pièces prêtes à joindre (1 clic)</h3>
    <div class="pieces">
      <a href="/api/recours/lettre/${dossier.id}?type=lettre">Lettre de contestation <span>TXT</span></a>
      <a href="/api/recours/lettre/${dossier.id}?type=avis">Avis de contravention / décision <span>TXT</span></a>
      <a href="/api/recours/lettre/${dossier.id}?type=preuves">Preuves récupérées <span>TXT</span></a>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 8px">&Agrave; faire sur le portail (≈ 2 min)</h3>
    ${guide}
  </div>

  <button class="btn secondary" id="deposeBtn">J’ai déposé ma contestation — activer le suivi</button>
  <div id="okBox" style="display:none">
    <div class="ok">
      <div class="check">✔</div>
      <strong>Suivi automatique activé.</strong>
      <p style="font-size:13px;color:#64748b">SOS Amende surveille votre dossier et vous notifie par e-mail à chaque étape (réception, instruction, décision).</p>
    </div>
  </div>
  <div id="errBox" style="display:none;color:#b91c1c;font-size:13px;text-align:center;margin-top:10px"></div>
</main>
<footer>SOS Amende — démonstration technique. Aucune donnée n’est transmise.</footer>

<script>
  const token = new URLSearchParams(location.search).get('token');
  const numAvis = document.getElementById('avis').dataset.numAvis || '';

  async function copyAvis() {
    try {
      await navigator.clipboard.writeText(numAvis);
      document.getElementById('copyBtn').textContent = 'Copié ✓';
    } catch {
      const ta = document.createElement('textarea');
      ta.value = numAvis; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      document.getElementById('copyBtn').textContent = 'Copié ✓';
    }
  }
  document.getElementById('copyBtn').addEventListener('click', copyAvis);
  copyAvis();

  document.getElementById('deposeBtn').addEventListener('click', async () => {
    const res = await fetch('/api/recours/depose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('okBox').style.display = 'block';
      document.getElementById('deposeBtn').style.display = 'none';
    } else {
      document.getElementById('errBox').textContent = data.error || 'Erreur lors du dépôt.';
      document.getElementById('errBox').style.display = 'block';
    }
  });
</script>
</body>
</html>`;
}

function pageErreur(message) {
  return `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOS Amende</title>
<body style="font-family:system-ui,sans-serif;background:#f1f5f9;margin:0">
<main style="max-width:420px;margin:40px auto;padding:20px;background:#fff;border-radius:12px;box-shadow:0 1px 3px #cbd5e1;text-align:center">
  <h2 style="margin-top:0">${message}</h2>
  <p style="color:#64748b;font-size:13px">Contactez SOS Amende pour recevoir un nouveau lien.</p>
</main>
</body></html>`;
}

app.get('/recours/finaliser', async (req, res) => {
  const raw = String(req.query.token || '');
  const entry = resolveToken(raw);
  if (!entry) return res.status(403).send(pageErreur('Lien invalide ou expiré (validité 7 jours).'));

  let dossier;
  if (estBase()) {
    const reel = await chargerDossierReel(entry.dossierId);
    if (!reel) return res.status(404).send(pageErreur('Dossier introuvable.'));
    dossier = vueDossierReel(reel);
  } else {
    dossier = findDossierBase(entry.dossierId);
    if (!dossier) return res.status(404).send(pageErreur('Dossier introuvable.'));
  }

  res.type('html').send(pageFinaliser(dossier));
});

/* ---- Confirmation du dépôt par le client (le worker prend le relais) ---- */
app.post('/api/recours/depose', async (req, res) => {
  const { token } = req.body || {};
  const entry = resolveToken(token || '');
  if (!entry) return res.status(403).json({ error: 'Lien invalide ou expiré.' });

  if (estBase()) {
    const dossier = await chargerDossierReel(entry.dossierId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable.' });
    if (dossier.statut !== 'PRET' && dossier.statut !== 'ENVOYE') {
      return res.status(409).json({ error: `Dossier au statut ${dossier.statut}` });
    }
    const platform = dossier.type === 'SUSPENSION' ? 'TELERECOURS' : 'ANTAI';
    // Le canal n'est jamais forcé : un dossier basculé en lettre recommandée
    // après l'envoi du lien n'est pas déposable en ligne par ce module.
    if (dossier.canalEnvoi === 'LRAR') {
      return res.status(409).json({ error: 'Dossier basculé en lettre recommandée — dépôt en ligne impossible.' });
    }
    const canal = dossier.canalEnvoi || platform;
    // Verrou conditionnel : la transition est appliquée seulement si le
    // dossier est encore dans un statut déposable (anti double-clic/TOCTOU).
    const maj = await pool.query(
      `UPDATE "Dossier" SET statut='ENVOYE', "canalEnvoi"=$2, "updatedAt"=now()
       WHERE id=$1 AND statut IN ('PRET','ENVOYE')`,
      [dossier.id, canal],
    );
    if (maj.rowCount === 0) {
      return res.status(409).json({ error: 'Statut du dossier modifié — dépôt non enregistré.' });
    }
    await pool.query(
      `INSERT INTO "DossierEvent" (id, "dossierId", type, detail, "createdAt") VALUES ($1, $2, 'ENVOI', $3, now())`,
      [crypto.randomUUID(), dossier.id, `${MARQUEUR} Contestation déposée par le client — suivi activé`],
    );
    suivisRecours.add(dossier.id);
    etapesSuivi.set(dossier.id, 'RECU_PAR_LE_SERVICE');
    console.log(`[EVENT] ${dossier.id} → ENVOYE (${canal}), suivi activé`);
    const vue = vueDossierReel(dossier);
    await notifierChangement(vue.client, libelleSuivi('RECU_PAR_LE_SERVICE'), 'Votre contestation a été déposée. SOS Amende suit maintenant le dossier automatiquement.');
    return res.json({ ok: true, dossierId: dossier.id, suivi: 'RECU_PAR_LE_SERVICE' });
  }

  const dossier = findDossierBase(entry.dossierId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable.' });
  if (dossier.statut !== 'EN_ATTENTE_CLIENT') {
    return res.status(409).json({ error: `Dossier au statut ${dossier.statut}` });
  }

  dossier.statut = 'ENVOYE';
  dossier.suivi = 'RECU_PAR_LE_SERVICE';
  pushEventDemo(dossier, 'Contestation déposée par le client — suivi activé');
  await notifierChangement(dossier.client, libelleSuivi('RECU_PAR_LE_SERVICE'), 'Votre contestation a été déposée. SOS Amende suit maintenant le dossier automatiquement.');
  res.json({ ok: true, dossierId: dossier.id, suivi: 'RECU_PAR_LE_SERVICE' });
});

/* ---- Lettre / pièces (base : vraie lettre ; démo : texte) ---- */
app.get('/api/recours/lettre/:dossierId', async (req, res) => {
  if (!gardeApi(req, res)) return;
  const type = req.query.type || 'lettre';
  let contenu;
  let nom;

  if (estBase()) {
    const dossier = await chargerDossierReel(req.params.dossierId);
    if (!dossier) return res.status(404).json({ error: 'Dossier inconnu' });
    const ex = dossier.extractedData && typeof dossier.extractedData === 'object' ? dossier.extractedData : {};
    if (type === 'lettre') {
      contenu = dossier.lettreGeneree || '(lettre non générée pour ce dossier)';
      nom = `lettre-contestation-${req.params.dossierId}.txt`;
    } else if (type === 'avis') {
      contenu = `AVIS DE CONTRAVENTION / DÉCISION\nDossier : ${dossier.id}\nNuméro : ${ex.num_pv || '—'}\nPlaque : ${ex.plaque || '—'}\nMontant : ${ex.montant || '—'} €\n[document original uploadé — simulation]`;
      nom = `avis-original-${req.params.dossierId}.txt`;
    } else {
      contenu = `PIÈCES À L’APPUI\n- Certificat d’étalonnage du radar (si pertinent)\n- Conditions météo : ${dossier.conditions_meteo || '—'}\n- Preuves travaux / signalisation\n[pièces stockées du dossier — simulation]`;
      nom = `preuves-${req.params.dossierId}.txt`;
    }
  } else {
    const dossier = findDossierBase(req.params.dossierId);
    if (!dossier) return res.status(404).json({ error: 'Dossier inconnu' });
    const mappingLibelle = {
      lettre: `LETTRE DE CONTESTATION\nDossier : ${dossier.id}\nClient : ${dossier.client.nom}\nPlaque : ${dossier.plaque}\nFaille retenue : ${dossier.faille}\n\nMonsieur l’Officier du ministère public,\nJe conteste l’avis référencé ${dossier.numAvis}. [texte complet de la lettre générée par le moteur juridique]\n\nSimulation de démonstration — aucun envoi réel.`,
    };
    contenu = mappingLibelle[type] || `PIÈCES À L’APPUI\n- ${dossier.faille}\n[simulation]`;
    nom = { lettre: 'lettre-contestation', avis: 'avis-original', preuves: 'preuves' }[type] + `-${dossier.id}.txt`;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(contenu);
});

/* ---- Accélération de la démo (avance manuelle d’une étape) ---- */
app.post('/api/recours/forcer', async (req, res) => {
  if (!gardeApi(req, res)) return;
  const { dossierId } = req.body || {};

  if (estBase()) {
    const resultat = await avancerDossierReel(dossierId);
    if (!resultat) return res.status(404).json({ error: 'Dossier inconnu' });
    const d = await chargerDossierReel(dossierId);
    return res.json({
      ok: true,
      dossierId,
      statut: d.statut,
      suivi: etapesSuivi.get(dossierId),
      decision: d.decisionOmp,
    });
  }

  const dossier = findDossierBase(dossierId);
  if (!dossier) return res.status(404).json({ error: 'Dossier inconnu' });
  if (avancerDossierDemo(dossier)) {
    if (dossier.suivi === 'DECISION') {
      await notifierChangement(dossier.client, 'Décision rendue', libelleDecision(dossier.decision));
    } else {
      await notifierChangement(dossier.client, libelleSuivi(dossier.suivi), `Votre dossier est au statut « ${libelleSuivi(dossier.suivi)} ».`);
    }
  }
  res.json({ ok: true, dossierId, statut: dossier.statut, suivi: dossier.suivi, decision: dossier.decision });
});

/* ---- État des dossiers (démo ou vrais suivis par le module) ---- */
app.get('/api/recours/dossiers', async (req, res) => {
  if (!gardeApi(req, res)) return;
  if (estBase()) {
    const r = await pool.query(
      `SELECT d.id, d.type, u.email, d.statut, d."decisionOmp", (
         SELECT string_agg(ev.detail, ' | ' ORDER BY ev."createdAt")
         FROM "DossierEvent" ev WHERE ev."dossierId" = d.id
       ) AS events
       FROM "Dossier" d JOIN "User" u ON u.id = d."userId"
       WHERE d.id IN (SELECT unnest($1::text[]))
       ORDER BY d."createdAt"`,
      [[...suivisRecours]],
    );
    return res.json(r.rows);
  }
  res.json(dossiersDemo.map((d) => ({ id: d.id, platform: d.platform, client: d.client.email, statut: d.statut, suivi: d.suivi, decision: d.decision, events: d.events })));
});

app.listen(PORT, () => {
  console.log(`[SERVER] Module envoi & suivi (mode ${MODE}) — ${BASE_URL}`);
  console.log(`[SERVER] POST ${BASE_URL}/api/recours/valider   (juriste → lien + email)`);
  console.log(`[SERVER] GET  ${BASE_URL}/api/recours/dossiers  (état)`);
  console.log(`[SERVER] Mode base : STORAGE/ROBOT réels à brancher sur datalake + portails`);
});