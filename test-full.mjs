import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-client@test.local', { waitUntil: 'networkidle' });
console.log('CLIENT login done');
await page.goto('https://sos-amende.vercel.app/dashboard/cases?dev=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const content = await page.content();
console.log('=== CLIENT CASES PAGE ===');
console.log('has pv-analyse-001?', content.includes('pv-analyse-001'));
console.log('has pv-sign-002?', content.includes('pv-sign-002'));
console.log('has pv-pret-003?', content.includes('pv-pret-003'));
console.log('has pv-envoye-004?', content.includes('pv-envoye-004'));
console.log('has pv-rejete-005?', content.includes('pv-rejete-005'));
console.log('has pv-resolu-006?', content.includes('pv-resolu-006'));
console.log('has dec-analyse-007?', content.includes('dec-analyse-007'));
console.log('has dec-sign-008?', content.includes('dec-sign-008'));
console.log('has dec-pret-009?', content.includes('dec-pret-009'));
console.log('has EN_ANALYSE?', content.includes('En analyse'));
console.log('has A_VERIFIER?', content.includes('À vérifier'));
console.log('has PRET?', content.includes('Prêt'));
console.log('has ENVOYE?', content.includes('Envoyé'));
console.log('has REJETE?', content.includes('Rejeté'));
console.log('has RESOLU?', content.includes('Résolu'));
console.log('has SUSPENSION?', content.includes('Suspension de permis'));

// Test client detail page
await page.goto('https://sos-amende.vercel.app/dashboard/cases/pv-sign-002?dev=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const detailContent = await page.content();
console.log('\n=== CLIENT DETAIL pv-sign-002 ===');
console.log('has lettreGeneree?', detailContent.includes('Erreur plaque'));
console.log('has PV text?', detailContent.includes('Rue de Rivoli'));
console.log('has signature pad?', detailContent.includes('Signature électronique'));

// Test juriste
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-juriste@test.local', { waitUntil: 'networkidle' });
console.log('\nJURISTE login done');
await page.goto('https://sos-amende.vercel.app/dashboard/juriste?dev=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const juristeContent = await page.content();
console.log('\n=== JURISTE PAGE ===');
console.log('has pv-sign-002?', juristeContent.includes('pv-sign-002'));
console.log('has pv-pret-003?', juristeContent.includes('pv-pret-003'));
console.log('has dec-sign-008?', juristeContent.includes('dec-sign-008'));
console.log('has dec-pret-009?', juristeContent.includes('dec-pret-009'));
console.log('has À valider (2)?', juristeContent.includes('À valider') && juristeContent.includes('(2)'));

// Test juriste detail
await page.goto('https://sos-amende.vercel.app/dashboard/juriste/pv-pret-003?dev=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const juristeDetail = await page.content();
console.log('\n=== JURISTE DETAIL pv-pret-003 ===');
console.log('has lettre?', juristeDetail.includes('Travaux et signalisation'));
console.log('has LettreEdition?', juristeDetail.includes('LettreEdition') || juristeDetail.includes('éditer'));
console.log('has PV?', juristeDetail.includes('CD-456-EF'));

await browser.close();