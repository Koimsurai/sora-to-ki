/**
 * 後台改了還沒存的東西不能靜靜不見：「頁面」切分頁草稿要留著，離開這一頁前要先問。
 *
 * 2026-10 之前切分頁就是整個編輯器換掉、草稿跟著丟，點側欄換頁也是直接走，沒有任何提示。
 * 這裡都不按儲存，不會動到 e2e 的資料庫。
 */

import { expect, test } from './fixtures';

import { gotoAdminUntil } from './admin-session';

test.describe('還沒存的改動', () => {
  test('頁面：切分頁草稿與語系都還在，點側欄換頁先問', async ({ page }) => {
    await gotoAdminUntil(page, '/admin/pages?tab=about', (p) => p.locator('.pg-editor input').first());
    const tab = (name: string) => page.locator('.adm-toolbar .adm-tab', { hasText: name });

    await page.locator('.pg-langs').getByRole('button', { name: 'English' }).click();
    const first = page.locator('.pg-editor input').first();
    const before = await first.inputValue();
    await first.fill(`${before}改`);
    await expect(tab('關於')).toHaveAttribute('data-dirty', 'true');

    await tab('作品').click();
    await expect(page.locator('.pg-langs [aria-pressed="true"]')).toHaveText('English');
    await tab('關於').click();
    await expect(first).toHaveValue(`${before}改`);

    const dialog = page.getByRole('alertdialog');
    await page.locator('.adm-side a[href="/admin/site"]').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '留下來' }).click();
    await expect(page).toHaveURL(/\/admin\/pages/);
    await expect(first).toHaveValue(`${before}改`);

    await page.locator('.adm-side a[href="/admin/site"]').click();
    await dialog.getByRole('button', { name: '不存，離開' }).click();
    await expect(page).toHaveURL(/\/admin\/site$/);
  });

  test('站台設定：改了天體沒存就換頁先問，改回原樣就不問', async ({ page }) => {
    await gotoAdminUntil(page, '/admin/site', (p) => p.getByRole('heading', { name: '站台設定' }));
    const dialog = page.getByRole('alertdialog');

    await page.locator('.sf-themes label[data-body="neptune"]').click();
    await expect(page.locator('.sf-theme-try')).toHaveAttribute('href', '/?theme=neptune');
    await page.locator('.adm-side a[href="/admin/pages"]').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '留下來' }).click();

    await page.locator('.sf-themes label[data-body="saturn"]').click();
    await page.locator('.adm-side a[href="/admin/pages"]').click();
    await expect(page).toHaveURL(/\/admin\/pages/);
    await expect(dialog).toBeHidden();
  });
});
