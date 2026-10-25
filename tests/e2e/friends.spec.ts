/**
 * 朋友頁 `/friends` 的申請表單（右邊抽屜裡的「成為下一顆」）。
 *
 * 抽屜平常收著、內容是 inert（點不到、Tab 不進去），要先點把手「交換友鏈」拉出來。
 *
 * 這是整頁唯一的寫入，而且它沒有後端——送出只是把欄位組成一封 `mailto:`。
 * 也就是說**沒有任何伺服器端的東西會發現它壞掉**：必填沒擋住、網址格式沒擋住、
 * 送出後沒回饋，站上都只是「按了沒反應」。
 *
 * 表單是 noValidate＋自己的錯誤訊息（寫在欄位底下的 `.fr-error`），不是瀏覽器的提示泡泡，
 * 所以判準是「錯誤訊息出來、欄位標成 aria-invalid、沒有切到已送出」。
 *
 * ⚠ 底下不去驗那封 mailto 的內容。`window.location.href = mailto` 沒有對應的網路請求，
 *   從測試這一側觀測不到；硬要攔就得改寫 `window.location`，那是在測試裡改變被測對象的
 *   行為，比不測更糟。這裡守的是使用者看得到的那一半。
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const form = (page: Page) => page.locator('form.fr-form');
// 用欄位名那一行找，不用 getByLabel：欄位出錯時 label 裡多了一行錯誤訊息，可及名稱會變成
// 「網址 這一欄要填」，而 RSS 那欄的錯誤訊息（要是 http:// … 的網址）又含「網址」兩個字
const field = (page: Page, label: string) =>
  form(page)
    .locator('label.fr-input')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input');

/** 送出；SSR 的按鈕在 React 接上 onSubmit 之前就可點（理由見 blog-post.spec.ts 的 clickUntil），重試到有反應為止 */
async function submitUntil(page: Page, settled: () => Promise<void>) {
  await expect(async () => {
    await form(page).getByRole('button', { name: '送出申請' }).click();
    await settled();
  }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });
}

const handle = (page: Page) => page.getByRole('button', { name: '交換友鏈' });

/** 拉出抽屜；跟送出一樣，SSR 的把手在 React 接上之前點了沒反應，重試到展開為止 */
async function openDrawer(page: Page) {
  await expect(async () => {
    if ((await handle(page).getAttribute('aria-expanded')) !== 'true') await handle(page).click();
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });
}

/**
 * 等 React 接手：拉出抽屜、先送一次空表單，錯誤訊息出來了才算。
 * hydration 之前填進受控欄位的字，接手時可能被 state 蓋回空的，於是送出時還是空表單。
 */
async function hydrated(page: Page) {
  await openDrawer(page);
  await submitUntil(page, () => expect(form(page).locator('.fr-error').first()).toBeVisible({ timeout: 2_000 }));
}

test.describe('朋友申請', () => {
  test.use({ locale: 'zh-TW' });

  test('抽屜平常收著，點把手拉出來、Esc 收回去', async ({ page }) => {
    await page.goto('/friends');
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
    // 收著的時候表單點不到（inert），Tab 也不會跑進畫面外的抽屜
    await expect(page.locator('#fr-side-body')).toHaveAttribute('inert', '');
    await openDrawer(page);
    await expect(page.locator('#fr-side-body')).not.toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(handle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('空的表單送不出去：名字與網址是必填，RSS 不是', async ({ page }) => {
    await page.goto('/friends');
    await hydrated(page);

    await expect(field(page, '名字')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, '網址')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'RSS（選填）'), 'RSS 是選填').not.toHaveAttribute('aria-invalid', 'true');
    await expect(form(page).locator('.fr-sent'), '空表單不該送得出去').toHaveCount(0);
    // 擋下來時游標要跳到第一個有問題的欄位，不然讀者不知道要從哪裡改
    await expect(field(page, '名字')).toBeFocused();
  });

  test('網址欄位擋得住不是 http(s) 的值，RSS 有填也一樣', async ({ page }) => {
    await page.goto('/friends');
    await hydrated(page);
    await field(page, '名字').fill('測試的人');
    await field(page, '網址').fill('example.com');
    await field(page, 'RSS（選填）').fill('ftp://example.com/feed');
    await form(page).getByRole('button', { name: '送出申請' }).click();

    await expect(field(page, '網址')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'RSS（選填）')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, '名字'), '名字有填就不該標錯').not.toHaveAttribute('aria-invalid', 'true');
    await expect(form(page).locator('.fr-sent'), '格式不對還是送得出去').toHaveCount(0);

    // 改對之後那一欄的錯誤就消失（不用再按一次送出才知道改對了）
    await field(page, '網址').fill('https://example.com');
    await expect(field(page, '網址')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('填完送出會給回饋，而且留下自己寄信的退路', async ({ page }) => {
    await page.goto('/friends');
    await hydrated(page);
    await field(page, '名字').fill('測試的人');
    await field(page, '網址').fill('https://example.com');
    await field(page, '一句話').fill('路過來打個招呼');
    await form(page).getByRole('button', { name: '送出申請' }).click();

    await expect(form(page).locator('.fr-sent'), '送出之後要有回饋').toBeVisible();
    // 開不起來郵件程式的人（不少）得知道信要寄去哪，不然這個功能對他們等於沒有
    await expect(form(page).locator('.fr-sent'), '自動開信失敗時沒有給出信箱').toContainText('timo9378@gmail.com');
  });
});
