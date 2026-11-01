/**
 * 後台的站台設定（/admin/site）：身分、語系、頁面開關一起存；換預設語系存之前要再確認一次。
 *
 * 存的那一支（PUT /api/admin/site/config）在這裡攔下來：真的存下去會改到整個 e2e 站台的站名與語系，
 * 後面每一支測試都會跟著變。後端那半邊（欄位驗證、存了之後 RSS 跟著換）在 backend/tests/site_config.rs。
 */

import { expect, test } from './fixtures';

import { gotoAdminUntil } from './admin-session';

test.describe('站台設定', () => {
  test('改站名、關一頁，存出去的是改過的那份', async ({ page }) => {
    let saved: Record<string, unknown> | null = null;
    await page.route('**/api/admin/site/config', async (r) => {
      saved = r.request().postDataJSON() as Record<string, unknown>;
      const res = await r.fetch({
        method: 'GET',
        url: r.request().url().replace('/admin/site/config', '/site/config'),
      });
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...(await res.json()), ...saved }),
      });
    });
    await gotoAdminUntil(page, '/admin/site', (p) => p.getByRole('heading', { name: '站台設定' }));

    const save = page.getByRole('button', { name: '儲存', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('站名', { exact: true }).fill('');
    await save.click();
    await expect(page.getByText('站名不能是空的')).toBeVisible();
    expect(saved).toBeNull();

    await page.getByLabel('站名', { exact: true }).fill('改過的站');
    await page.getByRole('switch', { name: /朋友/ }).click();
    await expect(page.locator('.sfs-sky .wz-sky')).toBeVisible();
    await save.click();
    await expect(page.getByText('站台設定存好了')).toBeVisible();
    expect(saved).toMatchObject({ name: '改過的站' });
    expect((saved as unknown as { disabled_pages: string[] }).disabled_pages).toContain('friends');
  });

  test('換預設語系要再確認一次，取消就不存', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/admin/site/config', (r) => {
      calls += 1;
      return r.fulfill({ status: 500, body: '{}' });
    });
    await gotoAdminUntil(page, '/admin/site', (p) => p.getByRole('heading', { name: '站台設定' }));

    await page.getByRole('radio', { name: 'English' }).check();
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('換掉預設語系？');
    await expect(dialog).toContainText('/en/');
    await dialog.getByRole('button', { name: '先不要' }).click();
    await expect(dialog).toBeHidden();
    expect(calls).toBe(0);
  });

  test('通知：填 webhook、關掉友鏈申請，另外存；送測試帶的是框裡的網址', async ({ page }) => {
    let saved: Record<string, unknown> | null = null;
    let tested: Record<string, unknown> | null = null;
    // 兩支都攔下來：真的存下去或真的送出去，會讓後面的留言測試去打一個不存在的網址
    await page.route('**/api/admin/notify', async (r) => {
      if (r.request().method() !== 'PUT') return r.continue();
      saved = r.request().postDataJSON() as Record<string, unknown>;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ settings: saved, mail_ready: false }),
      });
    });
    await page.route('**/api/admin/notify/test', async (r) => {
      tested = r.request().postDataJSON() as Record<string, unknown>;
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await gotoAdminUntil(page, '/admin/site', (p) => p.getByRole('heading', { name: '通知' }));

    const save = page.getByRole('button', { name: '儲存通知設定' });
    await expect(save).toBeDisabled();
    await page.getByLabel(/Webhook 網址/).fill('https://discord.com/api/webhooks/1/abc');
    await page.getByRole('checkbox', { name: '友鏈申請' }).uncheck();
    await page.getByRole('button', { name: '送一則測試' }).click();
    await expect(page.getByText('送到了')).toBeVisible();
    expect(tested).toEqual({ webhook_url: 'https://discord.com/api/webhooks/1/abc' });

    await save.click();
    await expect(page.getByText('通知設定存好了')).toBeVisible();
    expect(saved).toEqual({
      webhook_url: 'https://discord.com/api/webhooks/1/abc',
      on_comment: true,
      on_friend: false,
    });
    // 站台設定那一份沒有被動到
    await expect(page.getByRole('button', { name: '儲存', exact: true })).toBeDisabled();
  });
});
