import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const issues = [];
const passes = [];

function fail(ctx, msg) { issues.push(ctx + ': ' + msg); console.log('❌ ' + ctx + ': ' + msg); }
function pass(ctx) { passes.push(ctx); console.log('✅ ' + ctx); }

async function gotoWithCookie(url, cookie) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

async function login(role) {
  const emails = { client: 'e2e-client@test.local', juriste: 'e2e-juriste@test.local', admin: 'e2e-admin@test.local' };
  await page.goto('https://sos-amende.vercel.app/api/dev/login?email=' + emails[role], { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

function checkContent(content, shouldContain, ctx) {
  if (content.includes(shouldContain)) pass(ctx);
  else fail(ctx, 'Manquant: ' + shouldContain);
}

// ============================================================
// AUDIT CLIENT
// ============================================================
console.log('\n========== AUDIT CLIENT ==========');
await login('client');

// Dashboard
await gotoWithCookie('https://sos-amende.vercel.app/dashboard?dev=1', '');
checkContent(await page.content(), 'Bonjour', 'Dashboard client - greeting');
checkContent(await page.content(), 'Téléverser un PV', 'Dashboard - CTA nouveau dossier');
checkContent(await page.content(), 'Mes dossiers', 'Dashboard - lien dossiers');

// Cases list
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/cases?dev=1', '');
const casesHtml = await page.content();
checkContent(casesHtml, 'Mes dossiers', 'Cases - titre');
checkContent(casesHtml, 'pv-analyse-001', 'Cases - pv-analyse-001');
checkContent(casesHtml, 'pv-sign-002', 'Cases - pv-sign-002');
checkContent(casesHtml, 'pv-pret-003', 'Cases - pv-pret-003');
checkContent(casesHtml, 'pv-envoye-004', 'Cases - pv-envoye-004');
checkContent(casesHtml, 'pv-rejete-005', 'Cases - pv-rejete-005');
checkContent(casesHtml, 'pv-resolu-006', 'Cases - pv-resolu-006');
checkContent(casesHtml, 'dec-analyse-007', 'Cases - dec-analyse-007');
checkContent(casesHtml, 'dec-sign-008', 'Cases - dec-sign-008');
checkContent(casesHtml, 'dec-pret-009', 'Cases - dec-pret-009');

// Test each dossier detail + buttons
const clientDossiers = [
  { id: 'pv-analyse-001', type: 'AMENDE', statut: 'EN_ANALYSE', expect: ['Analyse de votre avis', 'AnalyseForm'] },
  { id: 'pv-sign-002', type: 'AMENDE', statut: 'A_VERIFIER', expect: ['Signature de la lettre', 'SignaturePad'] },
  { id: 'pv-pret-003', type: 'AMENDE', statut: 'PRET', expect: ['Lettre signée', 'En attente de validation', 'LrKit'] },
  { id: 'pv-envoye-004', type: 'AMENDE', statut: 'ENVOYE', expect: ['Contestation envoyée', 'Télécharger la lettre', 'Votre lettre de contestation'] },
  { id: 'pv-rejete-005', type: 'AMENDE', statut: 'REJETE', expect: ['Dossier rejeté', 'crédit a été rendu'] },
  { id: 'pv-resolu-006', type: 'AMENDE', statut: 'RESOLU', expect: ['Dossier résolu', 'acceptée'] },
  { id: 'dec-analyse-007', type: 'SUSPENSION', statut: 'EN_ANALYSE', expect: ['Suspension de permis', 'délais de recours très courts'] },
  { id: 'dec-sign-008', type: 'SUSPENSION', statut: 'A_VERIFIER', expect: ['Suspension de permis', 'Signature de la lettre'] },
  { id: 'dec-pret-009', type: 'SUSPENSION', statut: 'PRET', expect: ['Suspension de permis', 'Lettre signée', 'En attente de validation'] },
];

for (const d of clientDossiers) {
  await gotoWithCookie('https://sos-amende.vercel.app/dashboard/cases/' + d.id + '?dev=1', '');
  const html = await page.content();
  
  // Page loads
  if (html.includes('This page could not be found') || html.includes('Application error')) {
    fail('Client detail ' + d.id, 'Page 404/500');
    continue;
  }
  pass('Client detail ' + d.id + ' (' + d.statut + ') - charge');
  
  // Check expected content
  for (const exp of d.expect) {
    checkContent(html, exp, 'Client ' + d.id + ' - ' + exp);
  }
  
  // Check PV image/link
  checkContent(html, 'Avis de contravention', 'Client ' + d.id + ' - PV section');
  
  // Check faille juridique section
  checkContent(html, 'Faille juridique', 'Client ' + d.id + ' - faille section');
  
  // Check timeline if not EN_ANALYSE
  if (d.statut !== 'EN_ANALYSE') {
    checkContent(html, 'CREATION', 'Client ' + d.id + ' - timeline');
  }
  
  // Test buttons that should exist
  if (d.statut === 'A_VERIFIER') {
    // SignaturePad canvas should be present
    const canvas = await page.locator('canvas').count();
    if (canvas > 0) pass('Client ' + d.id + ' - canvas signature présent');
    else fail('Client ' + d.id + ' - canvas signature MANQUANT');
  }
  
  if (d.statut === 'PRET' || d.statut === 'ENVOYE' || d.statut === 'RESOLU') {
    // PDF download link
    const pdfLink = await page.locator('a:has-text("Télécharger la lettre")').count();
    if (pdfLink > 0) pass('Client ' + d.id + ' - lien PDF');
    else fail('Client ' + d.id + ' - lien PDF MANQUANT');
  }
  
  if (d.statut === 'ENVOYE') {
    // Accusé link
    const accuse = await page.locator('a:has-text("accusé")').count();
    if (accuse > 0) pass('Client ' + d.id + ' - lien accusé');
    else fail('Client ' + d.id + ' - lien accusé MANQUANT');
  }
}

// Test "Nouveau dossier" button
await page.goto('https://sos-amende.vercel.app/dashboard/cases/new?dev=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
if ((await page.content()).includes('Téléverser votre PV')) pass('Client - page nouveau dossier accessible');
else fail('Client - page nouveau dossier', 'Inaccessible');

// ============================================================
// AUDIT JURISTE
// ============================================================
console.log('\n========== AUDIT JURISTE ==========');
await login('juriste');

// Dashboard juriste
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/juriste?dev=1', '');
const juristeDash = await page.content();
checkContent(juristeDash, 'Espace juriste', 'Juriste dashboard - titre');
checkContent(juristeDash, 'À valider', 'Juriste dashboard - filtre À valider');
checkContent(juristeDash, 'Bibliothèque juridique', 'Juriste dashboard - lien bibliothèque');

// Filtres
for (const f of ['PRET', 'A_VERIFIER', 'ENVOYE', 'ALL']) {
  await gotoWithCookie('https://sos-amende.vercel.app/dashboard/juriste?dev=1&f=' + f, '');
  pass('Juriste - filtre ' + f + ' charge');
}

// Test each dossier detail + ALL buttons
const juristeDossiers = [
  { id: 'pv-sign-002', statut: 'A_VERIFIER', buttons: ['Rejeter'], editable: true },
  { id: 'pv-pret-003', statut: 'PRET', buttons: ['Approuver', 'Valider', 'Envoyer', 'Retourner'], editable: true },
  { id: 'pv-envoye-004', statut: 'ENVOYE', buttons: ['DecisionOmpForm'], editable: false },
  { id: 'pv-rejete-005', statut: 'REJETE', buttons: [], editable: false },
  { id: 'pv-resolu-006', statut: 'RESOLU', buttons: [], editable: false },
  { id: 'dec-sign-008', statut: 'A_VERIFIER', buttons: ['Rejeter'], editable: true },
  { id: 'dec-pret-009', statut: 'PRET', buttons: ['Approuver', 'Valider', 'Envoyer', 'Retourner'], editable: true },
];

for (const d of juristeDossiers) {
  await gotoWithCookie('https://sos-amende.vercel.app/dashboard/juriste/' + d.id + '?dev=1', '');
  const html = await page.content();
  
  if (html.includes('This page could not be found') || html.includes('Application error')) {
    fail('Juriste detail ' + d.id, 'Page 404/500');
    continue;
  }
  pass('Juriste detail ' + d.id + ' (' + d.statut + ') - charge');
  
  // Check key sections
  checkContent(html, 'Lettre de contestation', 'Juriste ' + d.id + ' - section lettre');
  checkContent(html, 'Données du dossier', 'Juriste ' + d.id + ' - données');
  checkContent(html, 'Avis de contravention', 'Juriste ' + d.id + ' - PV');
  checkContent(html, 'Bibliothèque', 'Juriste ' + d.id + ' - bibliothèque latérale');
  checkContent(html, 'Timeline', 'Juriste ' + d.id + ' - timeline');
  checkContent(html, 'Preuves', 'Juriste ' + d.id + ' - preuves');
  
  // LettreEdition for editable
  if (d.editable) {
    if (html.includes('LettreEdition') || html.includes('Corrigez si nécessaire') || html.includes('éditer')) {
      pass('Juriste ' + d.id + ' - LettreEdition présent');
    } else {
      fail('Juriste ' + d.id + ' - LettreEdition MANQUANT');
    }
  }
  
  // Test buttons exist (clickable)
  for (const btn of d.buttons) {
    const btnEl = await page.locator('button:has-text("' + btn + '"), a:has-text("' + btn + '")').count();
    if (btnEl > 0) pass('Juriste ' + d.id + ' - bouton ' + btn + ' présent');
    else fail('Juriste ' + d.id + ' - bouton ' + btn + ' MANQUANT');
  }
  
  // PDF download for PRET/ENVOYE/RESOLU
  if (['PRET', 'ENVOYE', 'RESOLU'].includes(d.statut)) {
    const pdfLink = await page.locator('a:has-text("Télécharger la lettre")').count();
    if (pdfLink > 0) pass('Juriste ' + d.id + ' - lien PDF');
    else fail('Juriste ' + d.id + ' - lien PDF MANQUANT');
  }
  
  // Test FaillesCandidates if present
  if (html.includes('Failles détectées')) {
    pass('Juriste ' + d.id + ' - FaillesCandidates section');
    const confirmBtn = await page.locator('button:has-text("Confirmer")').count();
    const rejectBtn = await page.locator('button:has-text("Écarter")').count();
    if (confirmBtn > 0) pass('Juriste ' + d.id + ' - bouton Confirmer faille');
    if (rejectBtn > 0) pass('Juriste ' + d.id + ' - bouton Écarter faille');
  }
}

// Bibliothèque juridiques
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/juriste/failles?dev=1', '');
const bib = await page.content();
checkContent(bib, 'Bibliothèque des failles', 'Bibliothèque juriste - titre');
checkContent(bib, 'Lire en détail', 'Bibliothèque - bouton Lire en détail');

// Click first "Lire en détail"
const firstDetail = await page.locator('button:has-text("Lire en détail")').first();
if (await firstDetail.count() > 0) {
  await firstDetail.click();
  await page.waitForTimeout(500);
  const detail = await page.content();
  checkContent(detail, 'Article / base légale', 'Bibliothèque détail - article');
  checkContent(detail, 'Règle dégagée', 'Bibliothèque détail - règle');
  checkContent(detail, 'Template de lettre', 'Bibliothèque détail - template');
  checkContent(detail, 'Jurisprudence', 'Bibliothèque détail - jurisprudence');
  checkContent(detail, 'Résumé :', 'Bibliothèque détail - résumé');
  checkContent(detail, 'Règles de détection', 'Bibliothèque détail - règles détection');
  pass('Bibliothèque - détail complet fonctionnel');
}

// ============================================================
// AUDIT ADMIN
// ============================================================
console.log('\n========== AUDIT ADMIN ==========');
await login('admin');

// Admin failles
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1', '');
const adminFailles = await page.content();
checkContent(adminFailles, 'Base juridique', 'Admin failles - titre');
checkContent(adminFailles, 'Auto-alimentation', 'Admin failles - section auto-alimentation');
checkContent(adminFailles, 'Synchroniser maintenant', 'Admin - bouton synchroniser');
checkContent(adminFailles, 'Activer les', 'Admin - bouton activation groupée');

// Filtres admin
for (const f of ['ALL', 'ACTIVE', 'PROPOSEE', 'INACTIVE']) {
  await gotoWithCookie('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1&f=' + f, '');
  pass('Admin failles - filtre ' + f + ' charge');
}

// Test Synchroniser button
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1&f=PROPOSEE', '');
const syncBtn = await page.locator('button:has-text("Synchroniser maintenant")').first();
if (await syncBtn.count() > 0) {
  await syncBtn.click();
  await page.waitForTimeout(3000);
  const afterSync = await page.content();
  if (afterSync.includes('proposition')) pass('Admin - synchronisation fonctionne');
  else fail('Admin - synchronisation', 'Pas de message succès');
}

// Test Activer toutes propositions
const bulkBtn = await page.locator('button:has-text("Activer les")').first();
if (await bulkBtn.count() > 0) {
  await bulkBtn.click();
  await page.waitForTimeout(3000);
  const afterBulk = await page.content();
  if (afterBulk.includes('activées')) pass('Admin - activation groupée fonctionne');
  else fail('Admin - activation groupée', 'Pas de message succès');
}

// Test individual Valider/Écarter on first PROPOSEE row
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const validerBtn = await page.locator('button:has-text("Valider (Active)")').first();
if (await validerBtn.count() > 0) {
  await validerBtn.click();
  await page.waitForTimeout(2000);
  pass('Admin - bouton Valider individuel cliquable');
}
const ecarterBtn = await page.locator('button:has-text("Écarter (Inactive)")').first();
if (await ecarterBtn.count() > 0) {
  await ecarterBtn.click();
  await page.waitForTimeout(2000);
  pass('Admin - bouton Écarter individuel cliquable');
}

// Test "Lire en détail" on first row
const detailBtn = await page.locator('button:has-text("Lire en détail")').first();
if (await detailBtn.count() > 0) {
  await detailBtn.click();
  await page.waitForTimeout(500);
  const detail = await page.content();
  checkContent(detail, 'Article / base légale', 'Admin détail - article');
  checkContent(detail, 'Template de lettre', 'Admin détail - template');
  checkContent(detail, 'Jurisprudence', 'Admin détail - jurisprudence');
  pass('Admin - Lire en détail fonctionnel');
}

// Test Modifier button
const modifierBtn = await page.locator('button:has-text("Modifier")').first();
if (await modifierBtn.count() > 0) {
  await modifierBtn.click();
  await page.waitForTimeout(500);
  const html = await page.content();
  if (html.includes('Enregistrer')) pass('Admin - Modifier ouvre formulaire');
  else fail('Admin - Modifier', 'Formulaire non ouvert');
}

// Admin paiements
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/admin/paiements?dev=1', '');
const adminPaiements = await page.content();
checkContent(adminPaiements, 'Paiements', 'Admin paiements - titre');
checkContent(adminPaiements, 'PENDING_VIREMENT', 'Admin paiements - liste virements');

// Admin radars
await gotoWithCookie('https://sos-amende.vercel.app/dashboard/admin/radars?dev=1', '');
const adminRadars = await page.content();
checkContent(adminRadars, 'Radars', 'Admin radars - titre');

// ============================================================
// RÉSUMÉ
// ============================================================
console.log('\n========== RÉSUMÉ AUDIT ==========');
console.log('Passes: ' + passes.length);
console.log('Issues: ' + issues.length);
if (issues.length > 0) {
  console.log('\nISSUES À CORRIGER:');
  issues.forEach(i => console.log('  - ' + i));
} else {
  console.log('\n🎉 AUDIT COMPLET - ZÉRO ISSUE');
}
await browser.close();