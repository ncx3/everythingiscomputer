import { chromium } from 'playwright';
const OUT = '/tmp/claude-1000/-home-ncx3-Genocyber/28eeb087-64a8-4a91-aa31-dfa82206e083/scratchpad';
const browser = await chromium.launch({ channel: 'chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', m => { if (!m.text().includes('[vite]')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('response', r => { if (r.status() >= 400) logs.push(`[${r.status()}] ${r.url()}`); });
await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#loading', { state: 'detached', timeout: 120000 });
const settle = async () => { await page.waitForFunction(() => window.GENO?.settled?.()===true, null, {timeout:90000,polling:250}); await page.waitForTimeout(600); };
await settle();
const c = await page.evaluate(() => window.GENO.calibrate()); await settle();
await page.evaluate(c => { window.GENO.inset({l:c.l,r:c.r,t:c.t,b:c.b}); const m=c.radius*0.3; window.GENO.shape(c.radius,m,m*1.52); }, c);
await settle();
for (const [code,tag] of [['ML-3032','fz'],['TT-0702','my'],['VL-2620','lc']]) {
  await page.evaluate(x => window.GENO.open(x), code);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/e-${tag}.png` });
}
console.log('--- console ---'); console.log(logs.length ? logs.join('\n') : '(clean)');
await browser.close();
