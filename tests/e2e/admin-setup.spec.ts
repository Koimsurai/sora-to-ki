/**
 * 後台的設備頁：名字跟前台一致、部件旁邊有同一張圖紙、文章用挑的。
 *
 * 2026-10 之前分頁叫「貨艙 01」「第五站」、部件標的是圖紙內部的代號、相關文章要手填 id，
 * 站長得回前台對照才知道在改哪裡。這裡都不按儲存，不會動到 e2e 的資料庫。
 */

import { expect, test } from './fixtures';

import { gotoAdminUntil } from './admin-session';

test('設備：分頁是前台的名字，圖上的編號跟清單一致，隱藏的不佔號', async ({ page }) => {
  await gotoAdminUntil(page, '/admin/pages?tab=setup', (p) => p.locator('.pg-bays'));

  // 跟前台太空梭上的標籤一樣：四艙 01～04、衛星 00，寫的是各自的大標
  await expect(page.locator('.pg-bay').first()).toContainText('01');
  await expect(page.locator('.pg-bay').last()).toContainText('00');

  const circles = page.locator('.pg-sheet .pg-placer-b');
  const rows = page.locator('.pg-split .pg-row-part');
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);
  await expect(circles).toHaveCount(count);

  // 隱藏第一個：圖上少一個圈，後面的編號往前補
  await rows.first().locator('input[type="checkbox"]').check();
  await expect(circles).toHaveCount(count - 1);
  await expect(rows.nth(1).locator('.pg-part-no')).toHaveText('1');
  await rows.first().locator('input[type="checkbox"]').uncheck();

  // 點圖上的 2 號，游標跳到第二列的名稱
  await circles.filter({ hasText: /^2$/ }).click();
  await expect(rows.nth(1).locator('input').first()).toBeFocused();
});

test('設備：相關文章從清單裡挑，挑了顯示標題、可以拿掉', async ({ page }) => {
  await gotoAdminUntil(page, '/admin/pages?tab=setup', (p) => p.locator('.pg-bays'));

  const records = page.locator('.pg-posts').last();
  await records.getByRole('button', { name: '＋ 挑一篇文章' }).click();
  const first = page.locator('.adm-picker-item').first();
  const title = (await first.locator('.adm-picker-item-title').textContent()) ?? '';
  await first.click();

  const chip = records.locator('.adm-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText(title);
  await chip.getByRole('button', { name: `拿掉「${title}」` }).click();
  await expect(chip).toHaveCount(0);
});
