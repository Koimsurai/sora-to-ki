/**
 * 書櫃頁 `/bookshelf`：星圖、書目清單、搜尋與狀態篩選、詳情抽屜。
 *
 * 篩選是**在瀏覽器端**推導的（後端只回一份完整書單），整段邏輯在 `Bookshelf.tsx` 的 useMemo 裡，
 * 後端測試一條都涵蓋不到。壞掉的樣子是「篩了但沒變」或「篩到空的」——都不會噴錯。
 *
 * 星圖的版面（系列連線、星團、不重疊）是純函式，在 `src/lib/bookConstellation.test.ts` 測；
 * 這裡只測「星星跟著篩選變暗、點得開」這種要真的跑起來才知道的事。
 *
 * ⚠ 種子刻意放了四本（見 seed.mjs）：三種 reading_status、有評分與沒評分、
 *   ASCII 與中文標題各有。書少於這個數量時下面的斷言會「綠得沒有意義」。
 */

import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const rows = (page: Page) => page.locator('.bs-row');
const stars = (page: Page) => page.locator('.bc-star');
const litStars = (page: Page) => page.locator('.bc-star:not([data-dim])');
const rowTitles = async (page: Page): Promise<string[]> =>
  (await page.locator('.bs-row-title').allInnerTexts()).map((s) => s.trim());

async function open(page: Page): Promise<number> {
  await page.goto('/bookshelf');
  await expect(rows(page).first(), '種子有四本書').toBeVisible({ timeout: 15_000 });
  const total = await rows(page).count();
  expect(total, '書少於三本的話底下的篩選測試就沒有鑑別力了').toBeGreaterThanOrEqual(3);
  await expect(stars(page), '每本書都要是一顆星').toHaveCount(total);
  return total;
}

test.describe('書櫃', () => {
  test('關鍵字搜尋標題與作者；不符合的星變暗但不消失；清除鈕還原', async ({ page }) => {
    const total = await open(page);
    const search = page.getByRole('searchbox');

    await search.fill('Zero');
    await expect.poll(() => rows(page).count(), { timeout: 10_000 }).toBe(1);
    expect((await rowTitles(page))[0]).toContain('Zero to One');
    // 天空不能因為篩選而重排：星星數量不變，只有符合的那顆是亮的
    await expect(stars(page)).toHaveCount(total);
    await expect(litStars(page)).toHaveCount(1);

    // 作者也要吃得到——只比對標題的話，「想找某個作者寫的書」這個用法整個失效
    await search.fill('村上');
    await expect.poll(() => rows(page).count(), { message: '搜尋沒有涵蓋作者欄', timeout: 10_000 }).toBe(1);
    expect((await rowTitles(page))[0]).toContain('海邊的卡夫卡');

    // 找不到的時候要講話，不是給一片空白
    await search.fill('這本書不存在zzz');
    await expect(page.locator('.bs-empty'), '搜不到要有空狀態文案').toBeVisible({ timeout: 10_000 });
    await expect(litStars(page)).toHaveCount(0);

    await page.locator('.bs-search-clear').click();
    await expect(search).toHaveValue('');
    await expect.poll(() => rows(page).count(), { timeout: 10_000 }).toBe(total);
    await expect(litStars(page)).toHaveCount(total);
  });

  test('狀態篩選只留下該狀態的書，按「全部」會全部回來', async ({ page }) => {
    const total = await open(page);
    const chip = (name: string) => page.locator('.bs-chip', { hasText: name });

    await chip('閱讀中').click();
    await expect(chip('閱讀中')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => rows(page).count(), { message: '狀態篩選沒有生效', timeout: 10_000 }).toBeLessThan(total);

    // 留下來的每一列都得真的是「在讀」——只數數量的話，篩選條件寫錯欄位也會過
    const groups = await page.locator('.bs-list-group').evaluateAll((els) => els.map((e) => e.dataset.status));
    expect(groups, '篩「閱讀中」卻混進別的狀態').toEqual(['reading']);
    const lit = await litStars(page).evaluateAll((els) => els.map((e) => e.dataset.status));
    expect(lit.length).toBeGreaterThan(0);
    for (const s of lit) expect(s, '亮著的星不是「閱讀中」').toBe('reading');

    await chip('全部').click();
    await expect.poll(() => rows(page).count(), { timeout: 10_000 }).toBe(total);
  });

  test('書目依「閱讀中 → 已讀 → 想讀」分組', async ({ page }) => {
    await open(page);
    const groups = await page.locator('.bs-list-group').evaluateAll((els) => els.map((e) => e.dataset.status));
    // 種子三種狀態都有，所以三組都要在、而且是這個順序（正在讀的最有個人味，放最前）
    expect(groups).toEqual(['reading', 'read', 'to-read']);
  });

  test('點星星開得了詳情；Esc 關掉後焦點回到那顆星', async ({ page }) => {
    await open(page);
    const star = stars(page).first();
    const name = (await star.getAttribute('aria-label'))?.split('（')[0] ?? '';
    expect(name).not.toBe('');

    const drawer = page.getByRole('dialog');
    // 同 blog-post.spec.ts：SSR 出來的按鈕在 React 接上 onClick 之前就可點，
    // 那一下點擊會安靜地什麼都不做，所以要重試——但先問「是不是已經開了」。
    await expect(async () => {
      if (!(await drawer.isVisible())) await star.click();
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });
    await expect(drawer, '開的要是剛剛點的那一本').toContainText(name);

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0, { timeout: 10_000 });
    await expect(star, '關掉之後焦點要還給原本那顆星').toBeFocused();
  });

  test('點書目那一列也開得了詳情，關閉鈕關得掉', async ({ page }) => {
    await open(page);
    const row = rows(page).first();
    const name = (await row.locator('.bs-row-title').innerText()).trim();
    const drawer = page.getByRole('dialog');
    await expect(async () => {
      if (!(await drawer.isVisible())) await row.click();
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });
    await expect(drawer).toContainText(name);

    await page.locator('.bd-close').click();
    await expect(drawer).toHaveCount(0, { timeout: 10_000 });
  });
});
