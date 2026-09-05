import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Test ADMIN - synchronisation + bulk activation
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-admin@test.local', { waitUntil: 'networkidle' });
console.log('ADMIN login done');
await page.goto('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1&f=PROPOSEE', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const adminContent = await page.content();
console.log('\n=== ADMIN PROPOSITIONS PAGE ===');
console.log('has Synchroniser?', adminContent.includes('Synchroniser maintenant'));
console.log('has Activer les X propositions?', adminContent.includes('Activer les'));
console.log('has PROPOSEE rows?', adminContent.includes('Proposition'));

// Click synchroniser
const syncBtn = page.getByRole('button', { name: 'Synchroniser maintenant' }).first();
if (await syncBtn.count() > 0) {
  await syncBtn.click();
  await page.waitForTimeout(3000);
  const afterSync = await page.content();
  console.log('after sync has error?', afterSync.includes('error') || afterSync.includes('Erreur') ? 'YES' : 'NO');
  console.log('after sync has success?', afterSync.includes('proposition') ? 'YES' : 'NO');
}

// Test bulk activation
const bulkBtn = page.getByRole('button', { name: /Activer les \d+ propositions/ }).first();
if (await bulkBtn.count() > 0) {
  console.log('Bulk button found, clicking...');
  await bulkBtn.click();
  await page.waitForTimeout(3000);
  const afterBulk = await page.content();
  console.log('after bulk has error?', afterBulk.includes('error') || afterBulk.includes('Erreur') ? 'YES' : 'NO');
  console.log('after bulk has success?', afterBulk.includes('activées') ? 'YES' : 'NO');
  // Reload to check persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const afterReload = await page.content();
  console.log('after reload still PROPOSEE?', afterReload.includes('Proposition') ? 'YES (still pending)' : 'NO (activated)');
  console.log('after reload ACTIVE?', afterReload.includes('Active') ? 'YES' : 'NO');
}

// Test JURISTE - proposal detail view
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-juriste@test.local', { waitUntil: 'networkidle' });
console.log('\nJURISTE login done');
await page.goto('https://sos-amende.vercel.app/dashboard/juriste/failles?dev=1&f=PROPOSEE', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const juristeContent = await page.content();
console.log('\n=== JURISTE PROPOSITIONS PAGE ===');
console.log('has Lire en détail buttons?', juristeContent.includes('Lire en détail'));
console.log('has PROPOSEE rows?', juristeContent.includes('Proposition à valider'));

// Click Lire en détail on first proposal
const detailBtn = page.getByRole('button', { name: 'Lire en détail' }).first();
if (await detailBtn.count() > 0) {
  await detailBtn.click();
  await page.waitForTimeout(1000);
  const detailContent = await page.content();
  console.log('detail has Article?', detailContent.includes('Article / base légale'));
  console.log('detail has Règle?', detailContent.includes('Règle dégagée'));
  console.log('detail has Template?', detailContent.includes('Template de lettre'));
  console.log('detail has Jurisprudence?', detailContent.includes('Jurisprudence'));
  console.log('detail has Résumé?', detailContent.includes('Résumé :'));
  console.log('detail has Règles détection?', detailContent.includes('Règles de détection'));
}

await browser.close();