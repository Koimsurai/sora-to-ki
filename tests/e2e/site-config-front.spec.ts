/**
 * 站台設定在前台的樣子：讀者自己換天體、站長不開放時只顯示不給按、關掉的頁面從選單消失。
 *
 * 站台設定是 SSR 時伺服器直接跟後端拿的（lib/api 的 BACKEND_URL），page.route 攔不到那一趟；
 * 真的改 e2e 站台的設定又會讓同時在跑的其他測試跟著變。所以這裡走「開著的分頁跟上新設定」那條路：
 * 只攔瀏覽器端的 /api/site/config，把時間撥過 staleTime 再假裝切回分頁，讓 react-query 自己重抓。
 * 讀者上次選的天體在站長不開放時不算數，那是 head 裡的腳本管的，在 lib/theme.test.ts。
 */

import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ locale: 'zh-TW' });

/** 之後瀏覽器端拿到的站台設定，蓋上 patch 那幾欄 */
async function overrideConfig(page: Page, patch: Record<string, unknown>) {
  await page.route('**/api/site/config', async (r) => {
    const res = await r.fetch();
    await r.fulfill({ json: { ...(await res.json()), ...patch } });
  });
}

/** 讓開著的分頁重抓站台設定：時間撥過 staleTime（五分鐘），再發一次切回分頁的事件 */
async function refetchConfig(page: Page) {
  const refetched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/site/config');
  await page.evaluate(() => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + 10 * 60_000;
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await refetched;
}

const nav = (page: Page) => page.locator('.snav-links');

test.describe('前台跟著站台設定', () => {
  test('讀者從頂欄換天體，重新整理還是那顆', async ({ page }) => {
    await page.goto('/blog');
    const sky = page.getByRole('button', { name: /^天體/ });
    await expect(async () => {
      await sky.click();
      await expect(sky).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await page
      .locator('.snav-page-sky')
      .getByRole('button', { name: /黑洞/ })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blackhole', { timeout: 10_000 });
    await expect(sky).toHaveAccessibleName(/黑洞/);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blackhole');
  });

  test('站長不開放讀者換：天體只顯示，不是按鈕', async ({ page }) => {
    await overrideConfig(page, { theme_switch: false });
    await page.goto('/blog');
    await expect(page.getByRole('button', { name: /^天體/ })).toBeVisible();

    await refetchConfig(page);
    await expect(page.getByRole('button', { name: /^天體/ })).toHaveCount(0);
    await expect(page.locator('.snav-sky.is-fixed')).toBeVisible();
  });

  test('站長關掉的頁面，頂欄跟指令面板都找不到', async ({ page }) => {
    await overrideConfig(page, { disabled_pages: ['works'] });
    await page.goto('/blog');
    await expect(nav(page).getByRole('link', { name: '作品' })).toBeVisible();

    await refetchConfig(page);
    await expect(nav(page).getByRole('link', { name: '作品' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: '手記' })).toBeVisible();

    await expect(async () => {
      if (!(await page.locator('.cmdk-backdrop').isVisible())) await page.keyboard.press('Control+k');
      await expect(page.locator('.cmdk-backdrop')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByPlaceholder('輸入頁面、文章、分類或標籤…').fill('作品');
    await expect(page.locator('.cmdk-backdrop').getByRole('option', { name: /^作品/ })).toHaveCount(0);
  });
});
