import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-admin@test.local', { waitUntil: 'networkidle' });
console.log('dev login done');
await page.goto('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1&f=PROPOSEE', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const btn = page.getByRole('button', { name: 'Valider (Active)' }).first();
console.log('btn count', await btn.count());
if (await btn.count() > 0) {
  await btn.click();
  await page.waitForTimeout(3000);
  // Reload page to see if state persisted
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const after = await page.content();
  console.log('after reload has Valider?', after.includes('Valider (Active)') ? 'still yes' : 'NO - GOOD');
  console.log('after has ACTIVE?', after.includes('Active') ? 'yes' : 'no');
  console.log('after has error?', after.includes('error') || after.includes('Erreur') ? 'error' : 'no error');
  // Find the faille row
  const idx = after.indexOf('Suspension sans contradictoire');
  if (idx >= 0) {
    console.log(after.slice(idx, idx + 500));
  }
}
await browser.close();