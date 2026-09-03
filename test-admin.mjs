import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://sos-amende.vercel.app/api/dev/login?email=e2e-admin@test.local', { waitUntil: 'networkidle' });
console.log('dev login done, cookies', await page.context().cookies().then(c=>c.map(x=>x.name+":"+x.value).join(', ')));
await page.goto('https://sos-amende.vercel.app/dashboard/admin/failles?dev=1&f=PROPOSEE', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const content = await page.content();
console.log('has Valider?', content.includes('Valider (Active)') ? 'yes' : 'no');
console.log('has PROPOSEE?', content.includes('PROPOSEE') ? 'yes' : 'no');
const btn = page.getByRole('button', { name: 'Valider (Active)' }).first();
console.log('btn count', await btn.count());
if (await btn.count() > 0) {
  await btn.click();
  await page.waitForTimeout(3000);
  const after = await page.content();
  console.log('after click has Valider?', after.includes('Valider (Active)') ? 'still yes' : 'no');
  console.log('after has error?', after.includes('error') ? 'error' : 'no error');
  console.log(after.slice(after.indexOf('Valider')-200, after.indexOf('Valider')+200));
}
await browser.close();
