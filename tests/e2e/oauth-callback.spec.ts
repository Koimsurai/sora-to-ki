/**
 * 登入回呼（/auth/callback）失敗時的那一頁：停在哪一步照實際情況寫，環畫到那一步。
 *
 * 登入中那段（開場停著不退場）在測試瀏覽器看不到：navigator.webdriver 時開場不演（lib/bootRing）。
 * 換授權碼那支一律攔下來，不會真的去換。
 */

import { expect, test } from './fixtures';

test('在授權頁按了取消：停在「授權」', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&state=google');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('登入沒有成功。');
  await expect(page.getByText('你在 Google 的授權頁按了取消')).toBeVisible();
  await expect(page.locator('.lf-meta')).toContainText('accounts.google.com');
  await expect(page.locator('.lf-meta')).toContainText('授權');
  await expect(page.getByRole('button', { name: '回 Google 再試一次' })).toBeVisible();
});

test('授權碼換不到身分：停在「確認身分」，只換一次', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auth/github/callback', (r) => {
    calls += 1;
    return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"bad code"}' });
  });
  await page.goto('/auth/callback?code=used-code&state=github');
  await expect(page.getByText('GitHub 授權了，但這裡沒能確認你的身分')).toBeVisible();
  await expect(page.locator('.lf-meta')).toContainText('確認身分');
  // 授權碼只能用一次：重新渲染不能再送一次
  expect(calls).toBe(1);
});
