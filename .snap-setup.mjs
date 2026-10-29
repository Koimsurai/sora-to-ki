import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/microsoft-edge', headless: false, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0' })).newPage();
const res = {};
// 只比內容，不比畫布擺的位置（style 裡的座標每次量都會差一點）
const clean = (s) => s.replace(/ style="[^"]*"/g, '').replace(/ data-[a-z-]+="[^"]*"/g, '');
for (const p of ['/setup', '/en/setup']) {
  await page.goto('https://koimsurai.com' + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  res[p + '#tags'] = await page.evaluate(() => [...document.querySelectorAll('.su-tag')].map((b) => b.outerHTML).join('\n'));
  for (let i = 0; i < 5; i++) {
    await page.locator('.su-tag').nth(i).click({ force: true });
    await page.waitForTimeout(5500);
    res[`${p}#${i}`] = await page.evaluate(() => document.querySelector('.su-panel')?.innerHTML ?? '');
    await page.keyboard.press('Escape');
    const home = page.getByRole('button', { name: /回到整架|Back to the bay|整架|ベイ|전체/ }).first();
    await home.click({ force: true }).catch(() => {});
    await page.waitForTimeout(3500);
  }
}
for (const k of Object.keys(res)) res[k] = clean(res[k]);
writeFileSync(out, JSON.stringify(res));
await browser.close();
