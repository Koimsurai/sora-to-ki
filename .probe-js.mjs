import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage();
const sizes = [];
p.on('response', async (r) => {
  const u = r.url();
  if (r.request().resourceType() === 'script') {
    try { sizes.push([(await r.body()).length, u.split('/').pop()]); } catch {}
  }
});
await p.goto(process.argv[2] ?? 'http://127.0.0.1:13996/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
sizes.sort((a, b) => b[0] - a[0]);
console.log('total', (sizes.reduce((s, [n]) => s + n, 0) / 1e6).toFixed(2), 'MB', sizes.length, 'files');
for (const [n, f] of sizes.slice(0, 12)) console.log((n / 1e3).toFixed(0).padStart(6), 'KB', f);
await b.close();
