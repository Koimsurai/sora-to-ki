/**
 * 初次設定的精靈（/admin/init）：設定碼 → 認領站長 → 語言 → 站台 → 頁面 → 完成。
 *
 * 後端的 /api/init/* 在這裡全部攔下來給假的回應：e2e 的後端設了 OWNER_EMAIL（見 stack.mjs），
 * 是「已經有站長的站」，而認領要真的 GitHub／Google 登入。後端那半邊（設定碼、錯太多次換碼、
 * 兩個人同時認領）在 backend/tests/init.rs。這支測的是介面那半邊：每一步接得起來、
 * 星圖跟著答案變、最後送出去的站台設定是對的。
 */

import { expect, test } from './fixtures';
import type { Page, Route } from '@playwright/test';

import { ADMIN_LANG_KEY, TOKEN_KEY } from './admin-session';

const CODE = '7F3K-Q9M2';

interface Mock {
  needed: boolean;
  signedIn: boolean;
  role: 'USER' | 'OWNER';
  saved: Record<string, unknown> | null;
}

async function mockBackend(page: Page, m: Mock) {
  const json = (route: Route, status: number, body?: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
  await page.route('**/api/init/status', (r) => json(r, 200, { needed: m.needed }));
  await page.route('**/api/init/check', (r) => {
    const { code } = r.request().postDataJSON() as { code: string };
    return code.replace('-', '').toUpperCase() === CODE.replace('-', '')
      ? json(r, 204)
      : json(r, 403, { code: 'bad_code', error: 'x' });
  });
  await page.route('**/api/init/claim', (r) => {
    m.needed = false;
    m.role = 'OWNER';
    return json(r, 204);
  });
  await page.route('**/api/auth/providers', (r) =>
    json(r, 200, { github: { clientId: 'gh-client', enabled: true }, google: { clientId: '', enabled: false } }),
  );
  await page.route('**/api/auth/me', (r) =>
    m.signedIn
      ? json(r, 200, { id: '7', role: m.role, displayName: '新站長', provider: 'github' })
      : json(r, 401, { error: 'Not authenticated' }),
  );
  await page.route('**/api/admin/site/config', (r) => {
    m.saved = r.request().postDataJSON() as Record<string, unknown>;
    return json(r, 200, { ...m.saved, url: 'http://localhost' });
  });
}

/** 精靈的介面語言釘在繁中（Playwright 的瀏覽器是英文，後台會跟著它） */
async function pinZh(page: Page, token?: string) {
  await page.goto('/blog');
  await page.evaluate(
    ([langKey, tokenKey, t]) => {
      window.localStorage.setItem(langKey, 'zh-TW');
      if (t) window.localStorage.setItem(tokenKey, t);
      else window.localStorage.removeItem(tokenKey);
    },
    [ADMIN_LANG_KEY, TOKEN_KEY, token ?? ''] as const,
  );
}

test.describe('初次設定', () => {
  test('沒有站長時，沒登入進後台會被帶去初次設定', async ({ page }) => {
    await mockBackend(page, { needed: true, signedIn: false, role: 'USER', saved: null });
    await pinZh(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/init$/);
    await expect(page.getByRole('heading', { name: '這台主機是你的嗎' })).toBeVisible();
  });

  test('設定碼 → 認領 → 語言 → 站台 → 頁面 → 完成', async ({ page }) => {
    const m: Mock = { needed: true, signedIn: false, role: 'USER', saved: null };
    await mockBackend(page, m);
    await pinZh(page);
    await page.goto('/admin/init');

    // 設定碼：錯的擋下來，對的進下一步
    const code = page.getByLabel('設定碼');
    await code.fill('AAAA-AAAA');
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByText('設定碼不對')).toBeVisible();
    await code.fill(CODE.toLowerCase());
    await page.getByRole('button', { name: '開始' }).click();

    // 認領：還沒登入，設好的 GitHub 給按鈕，沒設的 Google 給一步一步的設定方式
    await expect(page.getByRole('heading', { name: '認領站長' })).toBeVisible();
    await expect(page.getByRole('button', { name: '用 GitHub 登入' })).toBeVisible();
    await page.getByText('設定 Google 登入').click();
    await expect(page.getByText(/\/auth\/callback$/).first()).toBeVisible();

    // 登入回來（OAuth 那一趟換成直接寫 token；精靈靠 sessionStorage 接著走）
    m.signedIn = true;
    await page.evaluate((key) => window.localStorage.setItem(key, 'oauth-token'), TOKEN_KEY);
    await page.reload();
    await expect(page.getByText('新站長')).toBeVisible();
    await page.getByRole('button', { name: '認領，我就是站長' }).click();

    // 語言：預設改成英文、也開日文
    await expect(page.getByRole('heading', { name: '語言' })).toBeVisible();
    await page.getByRole('radio', { name: 'English' }).check();
    await page.getByRole('checkbox', { name: /日本語/ }).check();
    await page.getByRole('button', { name: '下一步' }).click();

    // 站台：站名空白擋下來；填了之後星圖底下出現站名
    await expect(page.getByRole('heading', { name: '站台' })).toBeVisible();
    const name = page.getByLabel('站名', { exact: true });
    await name.fill('');
    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByText('站名不能是空的')).toBeVisible();
    await name.fill('新的站');
    await expect(page.locator('.wz-name')).toHaveText('新的站');
    await page.getByRole('button', { name: '下一步' }).click();

    // 頁面：關掉作品，星圖上那條軌道收起來、留一條「關」的虛線
    await expect(page.getByRole('heading', { name: '頁面' })).toBeVisible();
    await page.getByRole('switch', { name: /作品/ }).click();
    await expect(page.getByRole('switch', { name: /作品/ })).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.wz-ghost')).toContainText('WORK');
    await page.getByRole('button', { name: '完成設定' }).click();

    // 完成：送出去的是剛才的答案，右邊換成真的首頁
    await expect(page.getByRole('heading', { name: '開站了' })).toBeVisible();
    expect(m.saved).toMatchObject({ name: '新的站', default_locale: 'en' });
    expect(m.saved?.locales).toEqual(expect.arrayContaining(['en', 'ja']));
    expect(m.saved?.disabled_pages).toEqual(expect.arrayContaining(['works']));
    await expect(page.locator('.wz-sky-live iframe')).toHaveAttribute('src', '/');
  });

  test('已經有站長了：不再打開', async ({ page }) => {
    await mockBackend(page, { needed: false, signedIn: false, role: 'USER', saved: null });
    await pinZh(page);
    await page.goto('/admin/init');
    await expect(page.getByRole('heading', { name: '這個站已經設定好了' })).toBeVisible();
  });
});
