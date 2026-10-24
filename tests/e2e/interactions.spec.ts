import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * 使用者真的會**做**的事。
 *
 * 在這個檔之前，整個 e2e 套件裡 `click(` / `fill(` / `press(` 出現次數是 **0**——
 * 每一條測試都是「goto 一個網址、讀文字」。也就是說站上每個按鈕、每張表單、
 * 以及點連結的 client-side 導覽（跟直接 SSR 載入是完全不同的程式碼路徑）
 * 全都沒有端對端保護。render 得出來不等於按得動。
 *
 * 這裡只收**公開面**的互動（後台另計）：留言、emoji 反應、站內導覽。
 */

/**
 * 打開留言表單：面板是焦點進到表單才展開的（點一下文字框）。
 *
 * 用 `toPass` 包住「點擊 + 確認欄位出現」而不是點一次就往下走：SSR 的頁面在 hydration
 * 完成前，文字框已經在 DOM 裡、Playwright 判定它可點，但 React 還沒掛上 focusin——
 * 那一下會被吃掉，接著 `fill` 就一路等到 30s 逾時。CI 上實際發生過（本機沒事，
 * 因為本機快）。重試整段是唯一能區分「還沒 hydrate」與「真的壞了」的方式。
 */
async function openForm(page: Page) {
  await expect(async () => {
    await page.locator('textarea[name="content"]').click();
    await expect(page.locator('form.cf')).toHaveClass(/is-open/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** 留言表單：打開並填好欄位（含算式驗證碼）。 */
async function fillAnonymousComment(page: Page, author: string, content: string, correctCaptcha = true) {
  await openForm(page);

  await page.locator('input[name="author"]').fill(author);
  await page.locator('textarea[name="content"]').fill(content);

  // 驗證碼是畫在 DOM 裡的算式（`{a} + {b} = ?`）——刻意從畫面讀而不是繞過它，
  // 這樣「哪天改成別種驗證方式」這條測試會誠實地紅掉而不是假綠。
  const question = (await page.locator('.cf-captcha span').innerText()).trim();
  const [a, b] = question.match(/\d+/g)!.map(Number);
  await page.locator('input[name="captcha"]').fill(String(correctCaptcha ? a + b : a + b + 1));
}

/** 記下有沒有打出留言的 POST */
function watchPosts(page: Page) {
  const seen = { posted: false };
  page.on('request', (r) => {
    if (r.url().includes('/comments') && r.method() === 'POST') seen.posted = true;
  });
  return seen;
}

// ── 留言 ──────────────────────────────────────────────────────────────────

test.describe('留言', () => {
  test('匿名留言送得出去，而且因為要審核所以不會馬上出現在列表上', async ({ page }) => {
    const content = `e2e 測試留言 ${Date.now()}`;
    await page.goto('/blog/1');

    const posted = page.waitForResponse((r) => r.url().includes('/comments') && r.request().method() === 'POST');
    await fillAnonymousComment(page, 'e2e 訪客', content);
    await page.locator('button.cf-submit').click();

    const resp = await posted;
    expect(resp.status(), '留言 API 應該收下').toBeLessThan(400);
    await expect(page.locator('.cf-note'), '應該告訴讀者送出了、要等審核').toContainText('審核');
    await expect(page.locator('textarea[name="content"]'), '送出後文字框要清空').toHaveValue('');

    // 待審核 → 公開列表上看不到。這條守的是「新留言不會直接見客」這個審核前提；
    // 壞掉的話任何人都能讓任意內容立刻出現在文章底下。
    await expect(page.locator('.ac')).not.toContainText(content);
  });

  /**
   * 表單是 noValidate＋自己的錯誤訊息（不是瀏覽器的提示泡泡）：擋下來時錯誤寫在
   * 送出鈕下方的 `.cf-note`，而且**一個請求都不送**——擋在前端才不會浪費一次寫入。
   */
  test('驗證碼答錯就不送出', async ({ page }) => {
    await page.goto('/blog/1');
    const seen = watchPosts(page);

    await fillAnonymousComment(page, 'e2e 訪客', `不該送出 ${Date.now()}`, false);
    await page.locator('button.cf-submit').click();

    await expect(page.locator('.cf-note em')).toBeVisible();
    await expect(page.locator('input[name="captcha"]')).toHaveAttribute('aria-invalid', 'true');
    expect(seen.posted).toBe(false);
  });

  test('內容空白：擋下來、標出是哪一欄，不會打 API', async ({ page }) => {
    await page.goto('/blog/1');
    const seen = watchPosts(page);

    await openForm(page);
    await page.locator('input[name="author"]').fill('e2e 訪客');
    await page.locator('button.cf-submit').click();

    await expect(page.locator('.cf-note em')).toBeVisible();
    await expect(page.locator('textarea[name="content"]')).toHaveAttribute('aria-invalid', 'true');
    expect(seen.posted, '空內容不該送出').toBe(false);
  });

  test('沒填名字：擋下來、標出是哪一欄，不會打 API', async ({ page }) => {
    await page.goto('/blog/1');
    const seen = watchPosts(page);

    await openForm(page);
    await page.locator('textarea[name="content"]').fill(`有內容沒名字 ${Date.now()}`);
    await page.locator('button.cf-submit').click();

    await expect(page.locator('.cf-note em')).toBeVisible();
    await expect(page.locator('input[name="author"]')).toHaveAttribute('aria-invalid', 'true');
    expect(seen.posted).toBe(false);
  });
});

// ── 回應（文末的星座）────────────────────────────────────────────────────

test.describe('回應', () => {
  // 這幾條會改到共用的計數器，所以**序列執行**：平行跑的話兩個 worker 對同一篇文章
  // 加減，斷言的 ±1 就不成立了。這不是測試寫得脆弱，是共用狀態的本質。
  //
  // ⚠ `configure` 必須寫在 describe **裡面**。放在檔案頂層會套用到整個檔案，
  // 於是任何一條失敗就會讓後面全部不執行（第一版就是這樣，5 條 did not run）。
  test.describe.configure({ mode: 'serial' });

  /** 第一團「喜歡」收的 emoji（按下去送的是第一個），見 ReactionSky 的 GROUPS */
  const LIKE = ['❤️', '😂', '🎉'];
  const likeBtn = (page: Page) => page.locator('.rs-row button').first();
  const countOf = async (page: Page) => Number((await likeBtn(page).locator('em').innerText()).trim());

  /**
   * 等畫面上的數字**跟伺服器一致**再開始操作。
   *
   * 反應數是非同步載入的，還沒回來時畫面顯示 0，一點下去伺服器卻回真實的數字。
   * 用「等一下下」去繞開只是把 race 藏起來——這裡改成拿 API 當真值來源同步，
   * 順便多驗一件事：UI 顯示的數字本來就該等於伺服器的數字（一團是那幾個 emoji 的總和）。
   */
  async function settledCount(page: Page) {
    const r = await page.request.get('/api/posts/1/reactions');
    const body = (await r.json()) as { reactions?: { emoji: string; count: number }[] };
    const expected = (body.reactions ?? []).filter((x) => LIKE.includes(x.emoji)).reduce((n, x) => n + x.count, 0);
    await expect.poll(() => countOf(page), { message: '畫面上的數字應該跟 API 一致' }).toBe(expected);
    return expected;
  }

  test('點一下會 +1 並標記成自己的，再點一下收回', async ({ page }) => {
    await page.goto('/blog/1');

    const btn = likeBtn(page);
    await expect(btn).toBeVisible();
    await expect(btn, '一開始不該是已選狀態').toHaveAttribute('aria-pressed', 'false');
    const before = await settledCount(page);

    const posted = page.waitForResponse((r) => r.url().includes('/reactions') && r.request().method() === 'POST');
    await btn.click();
    await posted;

    await expect(btn, '點過之後要標記成自己的（aria-pressed 是給輔助技術看的）').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => countOf(page), { message: '計數應該 +1' }).toBe(before + 1);

    // 再點一下收回
    const posted2 = page.waitForResponse((r) => r.url().includes('/reactions') && r.request().method() === 'POST');
    await btn.click();
    await posted2;
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => countOf(page), { message: '收回之後應該回到原本的數字' }).toBe(before);
  });

  test('重新整理之後，自己按過的回應還記得', async ({ page }) => {
    await page.goto('/blog/1');
    await expect(likeBtn(page)).toBeVisible();

    // ⚠ 這一行不能省。SSR 出來的按鈕在 React 接上 handler **之前**就可以點了，
    // 點下去只是沒有任何反應——`waitForResponse` 於是空等到逾時（CI 上 flaky 過）。
    // `settledCount` 輪詢到「畫面數字 == API 數字」，而那個數字是 client 抓回來的，
    // 等於間接確認 hydration 完成。
    await settledCount(page);

    const posted = page.waitForResponse((r) => r.url().includes('/reactions') && r.request().method() === 'POST');
    await likeBtn(page).click();
    await posted;

    await page.reload();
    await expect(likeBtn(page), '重載後仍該記得是自己按的（存在 localStorage）').toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 收回，把共用計數器還原，不要留給下一條測試
    await settledCount(page);
    const undo = page.waitForResponse((r) => r.url().includes('/reactions') && r.request().method() === 'POST');
    await likeBtn(page).click();
    await undo;
  });
});

// ── 站內導覽 ──────────────────────────────────────────────────────────────

test.describe('站內導覽', () => {
  test('從文章列表點進文章，走的是 client-side 導覽而不是整頁重載', async ({ page }) => {
    await page.goto('/blog');

    // 在 window 上做記號：整頁重載會把它清掉，SPA 導覽不會。
    // 這是唯一能從外部區分兩者的方法——兩種情況下網址與畫面都一樣。
    await page.evaluate(() => {
      (window as unknown as { __e2eMarker?: number }).__e2eMarker = 42;
    });

    const link = page.locator('main a[href^="/blog/"]').first();
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/blog\/[^/]+$/);
    await expect(page.locator('main').first()).not.toBeEmpty();

    const marker = await page.evaluate(() => (window as unknown as { __e2eMarker?: number }).__e2eMarker);
    expect(marker, '記號不見了 → 發生了整頁重載，SPA 導覽壞掉').toBe(42);
  });

  test('上一頁回得到列表', async ({ page }) => {
    await page.goto('/blog');
    const link = page.locator('main a[href^="/blog/"]').first();
    await link.click();
    await expect(page).toHaveURL(/\/blog\/[^/]+$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/blog\/?$/);
    await expect(page.locator('main').first()).toContainText(/\S/);
  });
});
