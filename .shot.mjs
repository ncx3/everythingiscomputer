import { chromium } from 'playwright';

const OUT = '/tmp/claude-1000/-home-ncx3-Genocyber/28eeb087-64a8-4a91-aa31-dfa82206e083/scratchpad';

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[${r.status()}] ${r.url()}`); });

await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#loading', { state: 'detached', timeout: 120000 });

async function settle() {
  await page.waitForFunction(() => window.GENO?.settled?.() === true, null, { timeout: 90000, polling: 250 });
  await page.waitForTimeout(800);
}
async function frame(name) {
  await page.evaluate((n) => document.querySelector(`#hud [data-state="${n}"]`).click(), name);
  await settle();
}

await settle();

const calib = await page.evaluate(() => window.GENO.calibrate());
console.log('CALIBRATION:', JSON.stringify(calib));
await settle();

if (calib?.pixels) {
  // Radius is measured against the aperture; the UI keeps ~30% of it clear so
  // the frame's corners never touch the curve.
  const shape = await page.evaluate((c) => {
    window.GENO.inset({ l: c.l, r: c.r, t: c.t, b: c.b });
    const m = c.radius * 0.3;
    return window.GENO.shape(c.radius, m, m * 1.52);
  }, calib);
  console.log('APPLIED SHAPE:', JSON.stringify(shape));
  await settle();
}

await frame('cover');
await page.screenshot({ path: `${OUT}/v3-landing.png` });

await frame('docked');
await page.screenshot({ path: `${OUT}/v3-docked.png` });

await page.evaluate(() => document.querySelector('#hud [data-toggle="dom"]').click());
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/v3-docked-dom.png` });

console.log('STATE:', JSON.stringify(await page.evaluate(() => window.GENO.state())));
console.log('--- console ---');
console.log(logs.length ? logs.join('\n') : '(clean)');

await browser.close();
