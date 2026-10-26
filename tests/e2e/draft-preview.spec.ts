/**
 * 草稿的前台預覽（/preview/post）與摘要對應（excerpt_links）。
 *
 * 兩件事都是「後台改、前台看」：編輯器把還沒存的內容交給預覽分頁（localStorage＋BroadcastChannel），
 * 預覽分頁用讀者看到的那一頁（BlogPost）畫。壞掉的樣子是預覽停在舊內容、或連結沒出現——
 * 編輯器那邊不會有任何錯誤，所以要從預覽分頁那一側看。
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

import { gotoAdminUntil } from './admin-session';
import { E2E_POST_PREFIX } from './seed.mjs';

const titleInput = (p: Page) => p.getByLabel('標題', { exact: true });
const viewLines = (p: Page) => p.locator('.monaco-editor .view-lines').first();

async function gotoEditor(page: Page) {
  await gotoAdminUntil(page, '/admin/posts/create', (p) => p.locator('.monaco-editor').first());
  await expect(titleInput(page)).toBeVisible();
}

/** 在「編輯對應」視窗裡反白摘要的一段字（跟用滑鼠拖選一樣：選好之後放開滑鼠），再點一章 */
async function linkPhrase(page: Page, phrase: string, chapter: string) {
  const box = page.locator('.pe-board-text');
  await expect(box).toBeVisible();
  await box.evaluate((el, text) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.nodeValue?.indexOf(text) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + text.length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error(`摘要裡找不到「${text}」`);
  }, phrase);
  await expect(page.locator('.pe-board-status')).toContainText('要連到哪一章');
  await page.locator('.pe-board-chapters button', { hasText: chapter }).click();
}

test.describe('草稿的前台預覽', () => {
  test('用文章頁畫還沒存的草稿；編輯器一改，預覽不必重新整理就跟著變', async ({ page, context }) => {
    await gotoEditor(page);
    const title = `${E2E_POST_PREFIX}preview-${Date.now()}`;
    await titleInput(page).fill(title);
    await viewLines(page).click();
    await page.keyboard.type('## 第一章\n\n內文第一段。\n\n## 第二章\n\n第二段。\n');
    await page.getByPlaceholder(/文章摘要/).fill('先說結論。再講細節。');

    const opened = context.waitForEvent('page');
    await page.getByRole('button', { name: /在前台預覽/ }).click();
    const preview = await opened;
    await expect(preview.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
    await expect(preview.getByRole('heading', { name: '第二章' })).toBeVisible();
    await expect(preview.getByText(/草稿預覽/)).toBeVisible();

    await titleInput(page).fill(`${title}-改過`);
    await expect(preview.getByRole('heading', { level: 1, name: `${title}-改過` })).toBeVisible({ timeout: 15_000 });

    // 摘要對應：在側欄把「再講細節。」連到第二章，預覽的摘要那句變成連到那一章的連結
    await page.getByRole('button', { name: '編輯對應' }).click();
    await linkPhrase(page, '再講細節', '第二章');
    await page.keyboard.press('Escape');
    const link = preview.locator('.ar-sum a.ar-link', { hasText: '再講細節' });
    await expect(link).toBeVisible({ timeout: 15_000 });
  });

  test('讀者打開預覽頁是不存在：就算瀏覽器裡留著一份草稿也不畫', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'koimsurai:post-preview',
        JSON.stringify({
          id: null,
          slug: null,
          format: 'markdown',
          category: null,
          tags: [],
          series_name: null,
          series_order: null,
          layout_type: 'record',
          allow_comments: true,
          status: 'draft',
          source_language: 'zh-TW',
          created_at: null,
          updated_at: null,
          view_count: 0,
          author: null,
          texts: { 'zh-TW': { title: '不該被看到的草稿', content: '內文', excerpt: '' } },
          excerpt_links: {},
        }),
      );
    });
    await page.goto('/preview/post');
    await expect(page.locator('.nf-page')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('不該被看到的草稿')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('摘要對應的存檔', () => {
  test('連過的句子存得進去，重新打開編輯器還在', async ({ page }) => {
    await gotoEditor(page);
    const title = `${E2E_POST_PREFIX}links-${Date.now()}`;
    await titleInput(page).fill(title);
    await viewLines(page).click();
    await page.keyboard.type('## 開頭\n\n第一段。\n\n### 細節\n\n第二段。\n');
    await page.getByPlaceholder(/文章摘要/).fill('這篇講開頭。也講細節。');

    await page.getByRole('button', { name: '編輯對應' }).click();
    await linkPhrase(page, '講細節', '細節');
    // 反白跟已經連的那段重疊：說得出原因，不會連
    await page.locator('.pe-board-text').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('.pe-board-status')).toContainText('重疊');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '儲存草稿' }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/edit\/\d+/, { timeout: 15_000 });

    await page.reload();
    await expect(titleInput(page)).toHaveValue(title, { timeout: 15_000 });
    await expect(page.locator('.pe-links-list li', { hasText: '講細節' })).toContainText('01.1');
  });
});
