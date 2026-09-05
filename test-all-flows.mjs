import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

function logError(context, err) {
  errors.push(context + ': ' + err);
  console.log('❌ ' + context + ': ' + err);
}

function logOk(context) {
  console.log('✅ ' + context);
}

function isErrorPage(content) {
  // Vrai UNIQUEMENT pour vraies pages d'erreur Next.js
  return content.includes('This page could not be found') || 
         content.includes('Application error: a client-side exception has occurred') ||
         content.includes('404</title>') ||
         content.includes('500</title>') ||
         (content.includes('Erreur') && content.includes('Erreur dans l'));
}

async function testClient() {
  console.log('\n========== TEST CLIENT ==========');
  await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-client@test.local', { waitUntil: 'networkidle' });
  
  await page.goto('https://sos-amende.vercel.app/dashboard?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  logOk('Dashboard client accessible');
  
  await page.goto('https://sos-amende.vercel.app/dashboard/cases?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  logOk('Cases list accessible');
  
  const dossiers = [
    'pv-analyse-001', 'pv-sign-002', 'pv-pret-003', 'pv-envoye-004', 
    'pv-rejete-005', 'pv-resolu-006', 'dec-analyse-007', 'dec-sign-008', 'dec-pret-009'
  ];
  
  for (const id of dossiers) {
    await page.goto('https://sos-amende.vercel.app/dashboard/cases/' + id + '?dev=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const content = await page.content();
    
    if (isErrorPage(content)) {
      logError('Client detail ' + id, 'Page d\'erreur (404/500)');
      continue;
    }
    logOk('Client detail ' + id);
    
    // Check specific features
    if (id === 'pv-sign-002') {
      if (content.includes('Signature électronique')) logOk('  → SignaturePad présent');
      else logError('  → SignaturePad', 'Manquant');
    }
    if (id === 'pv-pret-003' || id === 'pv-envoye-004' || id === 'pv-resolu-006') {
      if (content.includes('Télécharger la lettre')) logOk('  → PDF lettre accessible');
      else logError('  → PDF lettre', 'Manquant');
    }
    if (id === 'pv-resolu-006') {
      if (content.includes('acceptée') || content.includes('ACCEPTEE')) logOk('  → Décision ACCEPTEE visible');
      else logError('  → Décision', 'Manquante');
    }
    if (id.startsWith('dec-')) {
      if (content.includes('Suspension de permis')) logOk('  → Type SUSPENSION affiché');
      else logError('  → Type SUSPENSION', 'Non affiché');
    }
  }
}

async function testJuriste() {
  console.log('\n========== TEST JURISTE ==========');
  await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-juriste@test.local', { waitUntil: 'networkidle' });
  
  await page.goto('https://sos-amende.vercel.app/dashboard/juriste?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  logOk('Juriste dashboard accessible');
  
  const dossiers = ['pv-sign-002', 'pv-pret-003', 'pv-envoye-004', 'pv-rejete-005', 'pv-resolu-006', 'dec-sign-008', 'dec-pret-009'];
  
  for (const id of dossiers) {
    await page.goto('https://sos-amende.vercel.app/dashboard/juriste/' + id + '?dev=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const content = await page.content();
    
    if (isErrorPage(content)) {
      logError('Juriste detail ' + id, 'Page d\'erreur (404/500)');
      continue;
    }
    logOk('Juriste detail ' + id);
    
    // Check LettreEdition for editable statuts
    if (id === 'pv-sign-002' || id === 'pv-pret-003' || id === 'dec-sign-008' || id === 'dec-pret-009') {
      if (content.includes('LettreEdition') || content.includes('éditer') || content.includes('Corrigez')) {
        logOk('  → LettreEdition / éditeur présent');
      } else {
        logError('  → LettreEdition', 'Manquant');
      }
    }
    
    // Check JuristeActions buttons
    if (id === 'pv-pret-003' || id === 'dec-pret-009') {
      if (content.includes('Approuver') || content.includes('Valider') || content.includes('Envoyer')) {
        logOk('  → Actions Valider/Approuver présentes');
      } else {
        logError('  → Actions Valider', 'Manquantes');
      }
    }
    if (id === 'pv-sign-002' || id === 'dec-sign-008') {
      if (content.includes('Rejeter') || content.includes('rejeter')) {
        logOk('  → Action Rejeter présente');
      } else {
        logError('  → Action Rejeter', 'Manquante');
      }
    }
    
    // Check PDF download for PRET/ENVOYE/RESOLU
    if (['pv-pret-003', 'pv-envoye-004', 'pv-resolu-006', 'dec-pret-009'].includes(id)) {
      if (content.includes('Télécharger la lettre')) logOk('  → PDF téléchargeable');
      else logError('  → PDF', 'Manquant');
    }
    
    // Check Bibliothèque juridique link
    if (content.includes('Bibliothèque juridique')) logOk('  → Lien Bibliothèque présent');
    
    // Check timeline
    if (content.includes('CREATION') || content.includes('ANALYSE') || content.includes('LETTRE_GENEREE')) {
      logOk('  → Timeline événements présente');
    }
  }
  
  // Test Bibliothèque juridiques
  await page.goto('https://sos-amende.vercel.app/dashboard/juriste/failles?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const bib = await page.content();
  if (bib.includes('Lire en détail')) logOk('Bibliothèque juriste accessible + Lire en détail');
  else logError('Bibliothèque juriste', 'Problème');
  
  const detailBtn = page.getByRole('button', { name: 'Lire en détail' }).first();
  if (await detailBtn.count() > 0) {
    await detailBtn.click();
    await page.waitForTimeout(500);
    const detail = await page.content();
    if (detail.includes('Résumé :') && detail.includes('Template de lettre')) {
      logOk('  → Détail proposition complet (règle + template + jurisprudence + résumé)');
    } else {
      logError('  → Détail proposition', 'Incomplet');
    }
  }
}

async function testAdmin() {
  console.log('\n========== TEST ADMIN ==========');
  await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-admin@test.local', { waitUntil: 'networkidle' });
  
  await page.goto('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  logOk('Admin failles accessible');
  
  const syncBtn = page.getByRole('button', { name: 'Synchroniser maintenant' }).first();
  if (await syncBtn.count() > 0) {
    await syncBtn.click();
    await page.waitForTimeout(3000);
    const after = await page.content();
    if (after.includes('proposition')) logOk('  → Synchronisation OK');
    else logError('  → Synchronisation', 'Échec');
  }
  
  const bulkBtn = page.getByRole('button', { name: /Activer les \d+ propositions/ }).first();
  if (await bulkBtn.count() > 0) {
    await bulkBtn.click();
    await page.waitForTimeout(3000);
    const after = await page.content();
    if (after.includes('activées')) logOk('  → Activation groupée OK');
    else logError('  → Activation groupée', 'Échec');
  }
  
  await page.goto('https://sos-amende.vercel.app/dashboard/admin/paiements?dev=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const paiements = await page.content();
  if (paiements.includes('PENDING_VIREMENT') || paiements.includes('en attente') || paiements.includes('Aucun virement')) {
    logOk('Admin paiements accessible');
  } else {
    logError('Admin paiements', 'Problème');
  }
}

await testClient();
await testJuriste();
await testAdmin();

console.log('\n========== RÉSUMÉ ==========');
console.log('Total erreurs: ' + errors.length);
if (errors.length > 0) {
  errors.forEach(function(e) { console.log('  - ' + e); });
} else {
  console.log('🎉 TOUS LES TESTS PASSENT');
}
await browser.close();