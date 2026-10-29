import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/microsoft-edge' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0' })).newPage();
const res = {};
for (const p of ['/about-site', '/en/about-site', '/ja/about-site', '/ko/about-site', '/zh-cn/about-site']) {
  await page.goto('https://koimsurai.com' + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const stars = page.locator('.cl-star');
  const n = await stars.count();
  res[p + '#stars'] = await page.evaluate(() => [...document.querySelectorAll('.cl-star')].map((b) => b.textContent).join('|'));
  await stars.nth(n - 1).click();
  await page.waitForTimeout(1200);
  res[p + '#head'] = await page.evaluate(() => document.querySelector('.cl-eyepiece, section[aria-labelledby="cl-eyepiece-title"]')?.querySelector('h2')?.outerHTML + document.querySelector('section[aria-labelledby="cl-eyepiece-title"] > p')?.outerHTML);
  const qs = page.locator('.cl-qa-list button');
  const qn = await qs.count();
  for (let i = 0; i < qn; i++) {
    await qs.nth(i).click();
    await page.waitForTimeout(600);
    res[`${p}#${i}`] = await page.evaluate(() => {
      const list = document.querySelector('.cl-qa-list')?.outerHTML ?? '';
      const ans = document.querySelector('.cl-qa-answer')?.innerHTML ?? '';
      return list.replace(/aria-selected="(true|false)"/g, '') + '||' + ans;
    });
  }
}
writeFileSync(out, JSON.stringify(res));
await browser.close();
