/**
 * 照片頁 `/photos`（地面站）。
 *
 * smoke 與 a11y 只驗得到「render 得出來」，這裡走使用者真正會做的事：點開來看大圖、
 * 在檢視器裡左右翻、關掉。
 *
 * 資料來自 `backend/tests/fixtures/gallery_manifest.json`（4 張，形狀取自線上 manifest），
 * 由 stack.mjs 用 `GALLERY_MANIFEST_PATH` 指過去。圖檔本身指向 `/nas-images/...`，
 * 在 e2e 環境不存在——這是刻意的：**圖片載不出來時版面與互動都還要能用**，
 * 底下的斷言全部避開「圖真的畫出來」，只驗結構與行為。
 */

import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const gallery = (page: Page) => page.locator('.ph');
const cards = (page: Page) => page.locator('.ph-frame');

/** 等相簿載完——載入中是另一顆 DOM（spinner），直接數卡片會數到 0 就往下跑。 */
async function waitForGallery(page: Page): Promise<void> {
  await expect(gallery(page)).toBeVisible({ timeout: 15_000 });
  await expect(cards(page).first(), 'fixture 有 4 張照片，一張都沒 render 代表 manifest 沒讀到').toBeVisible({
    timeout: 15_000,
  });
}

test.describe('相簿', () => {
  test('點照片開得了檢視器，Esc 與關閉鈕都關得掉', async ({ page }) => {
    await page.goto('/photos');
    await waitForGallery(page);

    const viewer = page.locator('.photo-viewer-overlay');
    // ⚠ 會重試的點擊一定要先問「是不是已經開了」——理由與做法見 blog-post.spec.ts
    //   的 clickUntil 註解（重試一個有副作用的點擊會製造新的失敗模式）。
    await expect(async () => {
      if (!(await viewer.isVisible())) await cards(page).first().click();
      await expect(viewer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });

    await expect(page.locator('.photo-title'), '檢視器上方要標出這是哪一張').toContainText(/\S/);

    await page.keyboard.press('Escape');
    await expect(viewer, 'Esc 關不掉的話讀者只能重新整理').toHaveCount(0, { timeout: 10_000 });

    // 滑鼠那條路也要在。這裡不用再包重試：上面開關過一次就代表已經 hydrate。
    await cards(page).first().click();
    await expect(viewer).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '關閉檢視器' }).click();
    await expect(viewer).toHaveCount(0, { timeout: 10_000 });
  });

  test('檢視器裡切得到下一張與上一張', async ({ page }) => {
    await page.goto('/photos');
    await waitForGallery(page);

    const viewer = page.locator('.photo-viewer-overlay');
    await expect(async () => {
      if (!(await viewer.isVisible())) await cards(page).first().click();
      await expect(viewer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1500] });

    // 標題是「照片 <拍攝日>」（拿不到 EXIF 日期才退回檔名），四張 fixture 的日期不同，
    // 所以標題可以當「現在是第幾張」的觀測點。
    const title = page.locator('.photo-title');
    const first = (await title.innerText()).trim();

    await page.getByRole('button', { name: '下一張照片' }).click();
    await expect
      .poll(async () => (await title.innerText()).trim(), {
        message: '按了下一張但標題沒變——swiper 的 navigation 可能沒接上',
        timeout: 10_000,
      })
      .not.toBe(first);

    await page.getByRole('button', { name: '上一張照片' }).click();
    await expect
      .poll(async () => (await title.innerText()).trim(), { message: '上一張走不回來', timeout: 10_000 })
      .toBe(first);
  });
});
