import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * 剩下的公開互動：電子報訂閱、留言按讚，以及行動裝置的版面。
 *
 * 前兩者都是**公開的寫入 API**（`/api/newsletter/subscribe`、`/api/comments/:id/like`），
 * 任何讀者按得到，而且都沒有測試。行動裝置那組則是另一種缺口——整套 e2e
 * 到目前為止只跑過桌面 viewport，而這是個手機流量佔多數的部落格。
 */

// ── 電子報訂閱 ────────────────────────────────────────────────────────────

/**
 * 打開文末那一行（分享／訂閱／RSS）的訂閱視窗。
 *
 * 用字選而不是位置：那一行還有分享與 RSS，第一版用位置選到的是 RSS。
 */
async function openSubscribe(page: Page) {
  await expect(async () => {
    await page.locator('.ar-act button').filter({ hasText: '訂閱' }).click();
    await expect(page.locator('.subscribe-modal')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 }); // hydration 之前那一下會被吃掉，理由同 interactions.spec.ts
}

test.describe('電子報訂閱', () => {
  test('訂閱成功之後會顯示結果，而且狀態留得住', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto('/blog/1');
    await openSubscribe(page);

    const posted = page.waitForResponse(
      (r) => r.url().includes('/api/newsletter/subscribe') && r.request().method() === 'POST',
    );
    await page.locator('.subscribe-form input[name="email"]').fill(email);
    await page.locator('.subscribe-form button[type="submit"]').click();

    expect((await posted).status(), '訂閱 API 應該收下').toBeLessThan(400);
    await expect(page.locator('.subscribe-msg'), '要給使用者一個結果訊息').toBeVisible();

    // 訂閱狀態存在 localStorage（元件註解寫的 koim_newsletter_subscriber）——
    // 沒存住的話讀者每次進文章都會被再問一次，而他其實已經訂了。
    const stored = await page.evaluate(() => window.localStorage.getItem('koim_newsletter_subscriber'));
    expect(stored, '訂閱狀態要留在 localStorage').toContain(email);
  });

  /**
   * email 欄位是 `required` + `type="email"`——擋在原生驗證，不會送出。
   *
   * 跟留言表單那兩條同一個道理：擋下來的機制是瀏覽器不是 React，
   * 所以判準是「欄位 invalid 且沒有請求送出」。
   */
  test('email 格式不對就不會送出', async ({ page }) => {
    await page.goto('/blog/1');
    await openSubscribe(page);

    let posted = false;
    page.on('request', (r) => {
      if (r.url().includes('/api/newsletter/subscribe')) posted = true;
    });

    const input = page.locator('.subscribe-form input[name="email"]');
    await input.fill('這不是email');
    await page.locator('.subscribe-form button[type="submit"]').click();

    const valid = await input.evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(valid, '格式錯的 email 應該是 invalid').toBe(false);
    expect(posted, '被原生驗證擋下時不該打 API').toBe(false);
  });
});

// ── 留言按讚 ──────────────────────────────────────────────────────────────

test.describe('留言按讚', () => {
  // 會改共用的讚數，跟 emoji 反應同樣的理由要序列執行
  test.describe.configure({ mode: 'serial' });

  /** 留言底下的「收到」（按讚）鈕；回覆鈕沒有 aria-pressed */
  const likeBtn = (page: Page) => page.locator('.sl-actions button[aria-pressed]').first();
  /** 讚數：0 的時候不顯示數字 */
  const countOf = async (page: Page) => {
    const n = likeBtn(page).locator('span');
    return (await n.count()) === 0 ? 0 : Number((await n.innerText()).trim());
  };

  /**
   * 按讚 +1，而且**同一個人不能連按**。
   *
   * `useCommentLikes` 的 like 開頭就 `if (liked.includes(id)) return`。
   * 少了那道守衛的話一個人可以把數字灌到任意高——而讚數是公開顯示的。
   */
  test('按一次 +1，而且不能重複按', async ({ page }) => {
    await page.goto('/blog/1');

    const like = likeBtn(page);
    await expect(like, '種子資料裡應該有已審核的留言').toBeVisible({ timeout: 15_000 });
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    const before = await countOf(page);

    // 已經按過的就不會再送 POST：hydration 之前那一下會被吃掉，重試到真的送出去為止
    await expect(async () => {
      const posted = page.waitForResponse((r) => r.url().includes('/like') && r.request().method() === 'POST', {
        timeout: 2_000,
      });
      await like.click();
      await posted;
    }).toPass({ timeout: 20_000 });

    await expect.poll(() => countOf(page), { message: '按讚應該 +1' }).toBe(before + 1);
    await expect(like, '按過之後要標成按過的').toHaveAttribute('aria-pressed', 'true');

    let again = false;
    page.on('request', (r) => {
      if (r.url().includes('/like') && r.method() === 'POST') again = true;
    });
    await like.click();
    await expect.poll(() => countOf(page)).toBe(before + 1);
    expect(again, '按過的再按一次不該再送').toBe(false);
  });

  /** 重新整理之後仍然記得按過（存在 localStorage）。 */
  test('重新整理之後還記得按過', async ({ page }) => {
    await page.goto('/blog/1');
    await expect(likeBtn(page)).toBeVisible({ timeout: 15_000 });

    if ((await likeBtn(page).getAttribute('aria-pressed')) !== 'true') {
      await expect(async () => {
        const posted = page.waitForResponse((r) => r.url().includes('/like') && r.request().method() === 'POST', {
          timeout: 2_000,
        });
        await likeBtn(page).click();
        await posted;
      }).toPass({ timeout: 20_000 });
    }

    await page.reload();
    await expect(likeBtn(page), '重載後仍該記得按過').toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  });
});

// ── 碎念按讚 ──────────────────────────────────────────────────────────────

/**
 * 碎念按過的讚存在 localStorage，/thinking 又是 SSR 的。以前在 useState 初始化裡讀，
 * server 繪的是「沒按過」，hydrate 時 React 不補正 className——按過的讚重整後不亮。
 */
test('碎念按過的讚，重新整理之後還亮著', async ({ page }) => {
  await page.goto('/thinking');
  const like = page.locator('.mo-post').first().getByRole('button', { name: '讚', exact: true });
  await expect(like, '種子資料裡應該有碎念').toBeVisible({ timeout: 15_000 });

  if ((await like.getAttribute('aria-pressed')) !== 'true') {
    const posted = page.waitForResponse((r) => r.url().includes('/react') && r.request().method() === 'POST');
    await like.click();
    await posted;
  }
  await expect(like).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(
    page.locator('.mo-post').first().getByRole('button', { name: '讚', exact: true }),
    '重整後仍該記得按過',
  ).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
});

// ── 行動裝置 ──────────────────────────────────────────────────────────────

/**
 * 手機 viewport 下不該有水平捲動。
 *
 * 這是 RWD 破版最典型、也最容易被忽略的症狀：某個元素寬度寫死、或某段程式碼／
 * 表格沒有 `overflow-x`，就會把整頁撐寬。桌面看不出來，手機上是「畫面可以左右拖」，
 * 而整套 e2e 到目前為止只跑過桌面 viewport。
 *
 * 判準用 `documentElement` 而不是 body：撐寬的元素常常在 body 之外的層。
 * 留 1px 容差——subpixel 捨入會讓數字差個零點幾。
 */
test.describe('行動裝置版面', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 15 的邏輯解析度

  for (const path of ['/', '/blog', '/blog/1', '/thinking', '/watch', '/portfolio']) {
    test(`${path} 在手機寬度下不會橫向溢出`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main').first()).toContainText(/\S/, { timeout: 15_000 });

      const { scrollWidth, clientWidth, widest } = await page.evaluate(() => {
        const de = document.documentElement;
        // 順便找出最寬的那個元素，紅的時候才知道要去改誰
        let widest = '';
        let max = 0;
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > max && r.right > de.clientWidth + 1) {
            max = r.width;
            widest = `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} (${Math.round(r.width)}px, right=${Math.round(r.right)})`;
          }
        }
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, widest };
      });

      expect(
        scrollWidth,
        `${path} 在 ${clientWidth}px 寬底下可以橫向捲動到 ${scrollWidth}px${widest ? `；最寬的是 ${widest}` : ''}`,
      ).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
