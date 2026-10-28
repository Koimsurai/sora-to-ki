import { expect, test } from './fixtures';

import { gotoAdmin, signIn, signOut } from './admin-session';

/**
 * 後台。在這個檔之前，e2e 對後台只驗過一件事：**未登入進不去**。
 * 登入之後的每一個操作——發標籤、審留言——一次都沒被走過，而那是站長每天在用的介面。
 *
 * session 的架設（自簽 OWNER token、為什麼不用 addInitScript、gotoAdmin 為什麼要重試）
 * 抽到 `./admin-session`，post-editor.spec.ts 共用同一份。
 */

test.describe('後台', () => {
  // 序列執行。兩個理由：
  //   1. 這些測試會改**共用狀態**（建/刪標籤、把留言改成已批准）。平行跑的話
  //      「送出的留言讀者還看不到」這種斷言會被另一條測試的批准動作破壞。
  //   2. 後台是 lazy + ClientOnly 的重元件；跟 axe 掃描、CLS trace 那些同時搶
  //      伺服器時載入會明顯變慢（單獨平行量是 600~975ms，混在完整套件裡會超過 20s）。
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  test('帶著 OWNER 的 session 進得了後台', async ({ page }) => {
    await signIn(page);
    await gotoAdmin(page, '/admin/tags', '標籤');
    // 沒有被踢回首頁
    await expect(page).toHaveURL(/\/admin\/tags$/);
  });

  /**
   * 標籤 CRUD 走真正的介面：新增 → 出現在列表 → 刪除 → 消失。
   *
   * 後端的 CRUD 另有 `backend/tests/admin.rs` 的往返測試，這裡要驗的是
   * 「按鈕真的接到那些 API、而且列表會跟著更新」——後端全對但前端沒 invalidate
   * 快取的話，站長會看到自己剛建的標籤沒出現，然後再建一次。
   */
  test('標籤：新增之後出現在列表，刪除之後消失', async ({ page }) => {
    const name = `e2e-tag-${Date.now()}`;
    await signIn(page);
    await gotoAdmin(page, '/admin/tags', '標籤');

    await page.getByRole('button', { name: '新增標籤' }).click();
    await page.getByLabel('標籤名稱').fill(name);
    await page.getByRole('button', { name: '建立' }).click();

    const row = page.locator('tr', { hasText: name });
    await expect(row, '新增之後列表要立刻看得到（快取沒 invalidate 就會看不到）').toBeVisible({
      timeout: 10_000,
    });

    // 刪除（列上的按鈕平常是 opacity-0、hover 才顯示，click 會自己先 hover）
    await row.getByRole('button', { name: '刪除' }).click();
    await page.getByRole('button', { name: '刪除', exact: true }).last().click();
    await expect(row, '刪除之後應該從列表上消失').toBeHidden({ timeout: 10_000 });
  });

  /**
   * **留言審核的完整往返**——這一條是整個 e2e 套件裡跨最多層的。
   *
   *   公開頁匿名送出 → 因為待審核所以讀者看不到
   *   → 後台看得到那則待審核
   *   → 站長按「批准」
   *   → 讀者現在看得到
   *
   * 中間任何一環壞掉都會變成「留言石沉大海」或「未審核的內容直接見客」，
   * 而兩者都不會有任何錯誤訊息。單獨測前端或單獨測後端都涵蓋不到這條線。
   */
  test('留言審核往返：送出 → 後台批准 → 讀者看得到', async ({ page }) => {
    const content = `e2e 審核往返 ${Date.now()}`;

    // ── 1. 讀者送出留言
    await page.goto('/blog/1');
    // 面板是焦點進到表單才展開的；hydration 之前那一下會被吃掉，所以重試整段（同 interactions.spec.ts）
    await expect(async () => {
      await page.locator('textarea[name="content"]').click();
      await expect(page.locator('form.cf')).toHaveClass(/is-open/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.locator('input[name="author"]').fill('e2e 讀者');
    await page.locator('textarea[name="content"]').fill(content);
    const q = (await page.locator('.cf-captcha span').innerText()).trim();
    const [a, b] = q.match(/\d+/g)!.map(Number);
    await page.locator('input[name="captcha"]').fill(String(a + b));

    const posted = page.waitForResponse((r) => r.url().includes('/comments') && r.request().method() === 'POST');
    await page.locator('button.cf-submit').click();
    expect((await posted).status()).toBeLessThan(400);
    await expect(page.locator('.cf-note')).toContainText('審核');

    // ── 2. 還沒審核 → 讀者看不到
    await page.reload();
    await expect(page.locator('.ac')).not.toContainText(content);

    // ── 3. 站長登入後台，看得到那則待審核
    await signIn(page);
    await gotoAdmin(page, '/admin/comments', /留言/);
    // 審核頁是「左邊清單、右邊選中那一則」：先在清單裡點它，右邊才是它的全文與動作
    const item = page.getByRole('listitem').filter({ hasText: content });
    await expect(item, '後台應該看得到剛送出的留言').toBeVisible({ timeout: 15_000 });
    await item.getByRole('button').click();
    const detail = page.getByRole('region', { name: '這則留言' });
    await expect(detail).toContainText(content);

    // ── 4. 批准
    await detail.getByRole('button', { name: /批准/ }).click();

    // ── 5. 登出，以讀者的身分再看一次
    await signOut(page);
    await page.goto('/blog/1');
    await expect(page.locator('.ac'), '批准之後讀者就該看得到——看不到的話留言等於石沉大海').toContainText(content, {
      timeout: 15_000,
    });
  });

  /**
   * **友鏈的往返**：朋友頁送來的申請出現在「待看」、站長收下之後移到「朋友」，
   * 而且讀者那一側的 /api/friends 馬上就有它（名單每次讀 DB，不等快取過期）。
   * 申請直接打 API：表單本身由 friends.spec.ts 守。
   */
  test('友鏈往返：申請 → 待看裡看得到 → 收下 → 朋友頁的名單上有它', async ({ page }) => {
    const name = `e2e 鄰居 ${Date.now()}`;
    const url = `https://e2e-friend-${Date.now()}.example`;
    await page.goto('/');
    const status = await page.evaluate(
      async (b) =>
        (
          await fetch('/api/friends/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b),
          })
        ).status,
      { name, url, description: '寫程式也寫日常', email: 'me@e2e.example', message: '想交換友鏈' },
    );
    expect(status, '申請要送得進去').toBe(201);

    await signIn(page);
    await gotoAdmin(page, '/admin/friends', '友鏈');
    const item = page.getByRole('button', { name: new RegExp(name) });
    await expect(item, '待看裡要看得到剛送來的申請').toBeVisible({ timeout: 15_000 });
    await item.click();
    const detail = page.getByRole('region', { name: '這份申請' });
    await expect(detail).toContainText('想交換友鏈');
    await expect(detail).toContainText('還沒檢查');

    await detail.getByRole('button', { name: '收下', exact: true }).click();
    await expect(item, '收下之後離開待看').toBeHidden({ timeout: 10_000 });
    await page.getByRole('button', { name: /^朋友/ }).click();
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible();

    const listed = await page.evaluate(async (n) => {
      const r = await fetch('/api/friends');
      const b = (await r.json()) as { name: string }[];
      return b.some((f) => f.name === n);
    }, name);
    expect(listed, '收下之後朋友頁的名單上要馬上有它').toBe(true);
  });

  /**
   * 流量：e2e 沒有 Plausible 的 key，後端回 configured: false → 畫面要教人怎麼設。
   * 接上之後的報表用攔截的假資料驗：摘要、跟上一段比、柱狀圖、每篇文章、來源與進站頁、
   * 搜尋字詞、收起來的排行（國碼翻成國名）都畫得出來。
   * （後端把 Plausible 的回應整理成這個形狀，那段在 backend/tests/analytics.rs 測。）
   */
  test('流量：沒設 key 時說怎麼設；有資料時畫得出報表', async ({ page }) => {
    await signIn(page);
    await gotoAdmin(page, '/admin/analytics', '流量');
    await expect(page.getByText('PLAUSIBLE_API_KEY', { exact: false })).toBeVisible();

    const totals = {
      visitors: 1234,
      visits: 1500,
      pageviews: 4321,
      bounce_rate: 61.4,
      visit_duration: 125,
      views_per_visit: 2.9,
    };
    await page.route('**/api/admin/analytics?*', (route) =>
      route.fulfill({
        json: {
          configured: true,
          period: '7d',
          start: '2026-10-20',
          end: '2026-10-26',
          realtime: 2,
          totals,
          previous: { ...totals, visitors: 617, bounce_rate: 70 },
          series: [
            { date: '2026-10-24', visitors: 0, pageviews: 0 },
            { date: '2026-10-25', visitors: 40, pageviews: 90 },
            { date: '2026-10-26', visitors: 20, pageviews: 30 },
          ],
          posts: [
            {
              id: 1,
              slug: 'hello',
              title: '第一篇測試文章',
              visitors: 80,
              scroll_depth: 72.4,
              time_on_page: 95,
              read_minutes: 6,
              hearts: 3,
              comments: 1,
            },
          ],
          entries: [{ source: 'Direct / None', visitors: 50, entries: [{ name: '/blog/hello', visitors: 30 }] }],
          search: {
            configured: true,
            error: null,
            queries: [{ query: 'koimsurai', clicks: 4, impressions: 120, ctr: 0.033, position: 3.2 }],
          },
          pages: [{ name: '/blog/hello', visitors: 80 }],
          sources: [{ name: 'Direct / None', visitors: 1000 }],
          countries: [{ name: 'TW', visitors: 70 }],
          devices: [{ name: 'Mobile', visitors: 30 }],
          dashboard_url: 'https://plausible.example/koimsurai.com',
        },
      }),
    );
    await page.getByRole('button', { name: '7 天' }).click();
    await expect(page.getByText('此刻 2 人在站上')).toBeVisible();
    await expect(page.locator('.adm-an-summary')).toContainText('是上一段的 2 倍');
    await expect(page.locator('.adm-an-summary'), '八成以上是直接來的').toContainText('8 成是直接造訪');
    await expect(page.getByLabel('總數').getByText('1,234', { exact: true })).toBeVisible();
    await expect(page.getByLabel('總數')).toContainText('2分05秒');
    await expect(page.getByLabel('總數'), '跳出率越低越好').toContainText('上一段 70%，變好');
    await expect(page.locator('.adm-an-col'), '一天一根柱子').toHaveCount(3);

    const posts = page.getByRole('region', { name: '每篇文章' });
    await expect(posts.getByRole('row', { name: /第一篇測試文章/ })).toContainText('72%');
    await expect(posts.getByRole('row', { name: /第一篇測試文章/ })).toContainText('1 分 35 秒');
    const sources = page.getByRole('region', { name: '從哪裡來，先看了什麼' });
    await expect(sources, '進站頁的網址換成文章標題').toContainText('《第一篇測試文章》');
    await expect(page.getByRole('region', { name: '在 Google 搜了什麼' })).toContainText('koimsurai');
    await expect(page.getByRole('region', { name: '收到的愛心與反應' })).toContainText('只有總數');

    await page.getByText('熱門頁面、國家與裝置').click();
    await expect(page.getByRole('region', { name: '熱門頁面' })).toContainText('/blog/hello');
    await expect(page.getByRole('region', { name: '國家' })).toContainText('台灣');
    await expect(page.getByRole('region', { name: '裝置' })).toContainText('手機');
  });

  /**
   * 照片：後台關掉「前台顯示」之後，公開的照片清單就沒有那張；打開又回來。
   * 這是後台唯一能讓一張照片從前台消失的地方，壞掉的話站長以為藏起來了、讀者照樣看得到。
   */
  test('照片：關掉前台顯示，公開清單就沒有那張；打開又回來', async ({ page }) => {
    const publicIds = () =>
      page.evaluate(async () => {
        const r = await fetch('/api/gallery/photos');
        const b = (await r.json()) as { photos: { id: string }[] };
        return b.photos.map((p) => p.id);
      });

    await signIn(page);
    await gotoAdmin(page, '/admin/photos', '照片');
    const side = page.getByRole('complementary', { name: '這張照片' });
    const title = await side.getByRole('img').getAttribute('alt');
    const before = await publicIds();

    const toggle = side.getByRole('checkbox', { name: /前台顯示/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(page.getByText('藏起來了').first()).toBeVisible({ timeout: 10_000 });
    await expect.poll(publicIds, { message: `〈${title}〉藏起來之後還在公開清單上` }).toHaveLength(before.length - 1);

    await side.getByRole('checkbox', { name: /前台顯示/ }).check();
    await expect.poll(publicIds, { message: '打開之後要回來' }).toEqual(before);
  });

  /**
   * 收藏：同步進來的觀看紀錄，後台設成不公開之後前台的 API 就不給；改回公開又回來。
   * 站長看到按鈕變了，卻不知道前台是不是真的拿掉了——這條驗的是後面那一半。
   */
  test('收藏：一部設成不公開，公開清單就沒有它；改回公開又回來', async ({ page }) => {
    const publicFilms = () =>
      page.evaluate(async () => {
        const r = await fetch('/api/films/recent');
        const b = (await r.json()) as { films: { title: string }[] };
        return b.films.map((f) => f.title);
      });

    await signIn(page);
    await gotoAdmin(page, '/admin/collection', '收藏');
    const before = await publicFilms();
    const title = before[0];
    expect(title, '前提：種子裡要有電影').toBeTruthy();

    const row = page.getByRole('listitem').filter({ hasText: title });
    await row.getByRole('button', { name: `${title} 在前台顯示` }).click();
    await expect(row.getByRole('button', { name: `${title} 在前台顯示` })).toHaveAttribute('aria-pressed', 'false', {
      timeout: 10_000,
    });
    await expect.poll(publicFilms, { message: '設成不公開之後還在公開清單上' }).not.toContain(title);

    await row.getByRole('button', { name: `${title} 在前台顯示` }).click();
    await expect.poll(publicFilms, { message: '改回公開要回來' }).toContain(title);
  });

  /**
   * 碎念：從右邊「最近的紀錄」挑一部電影，不寫字直接發——前台拿到的是「看了」加上那部片，
   * 右邊那一列變成「已寫」。最後刪掉，不留在種子資料裡（列表與首頁的 e2e 也讀碎念）。
   */
  test('碎念：從紀錄帶入一部片、不寫字也發得出去，前台拿到動詞與作品', async ({ page }) => {
    await signIn(page);
    await gotoAdmin(page, '/admin/thoughts', '碎念');

    const records = page.getByRole('complementary', { name: '最近的紀錄' });
    await page.getByRole('button', { name: '看了', exact: true }).click();
    const write = records.getByRole('button', { name: /^寫〈/ }).first();
    await expect(write, '前提：種子裡要有觀看紀錄').toBeVisible({ timeout: 15_000 });
    const title = /^寫〈(.+)〉$/.exec((await write.getAttribute('aria-label')) ?? '')?.[1] ?? '';
    await write.click();

    const preview = page.getByRole('region', { name: '前台會長這樣' });
    await expect(preview).toContainText('看了');
    await expect(preview).toContainText(title);

    const posted = page.waitForResponse(
      (r) => r.url().includes('/api/admin/thoughts') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^發送/ }).click();
    const id = ((await (await posted).json()) as { id: number }).id;

    const thought = await page.evaluate(async (i) => {
      const r = await fetch(`/api/thoughts/${i}`);
      return ((await r.json()) as { thought: { content: string; verb: string; ref: { title: string; key: string } } })
        .thought;
    }, id);
    expect(thought.content).toBe('');
    expect(thought.verb).toBe('watched');
    expect(thought.ref.title).toBe(title);
    await expect(records.getByRole('button', { name: `寫〈${title}〉` }).first()).toHaveText('已寫');

    await page.getByRole('button', { name: `刪掉〈${title}〉` }).click();
    await page.getByRole('button', { name: '刪掉', exact: true }).click();
    await expect(page.getByRole('button', { name: `刪掉〈${title}〉` })).toBeHidden({ timeout: 10_000 });
  });

  /**
   * token 被清掉 → 立刻被請出去。
   *
   * 既有的「未登入進不了後台」測的是「一開始就沒有 token」。這條測的是
   * **session 中途失效**（過期／登出／被撤銷）——後台是 SPA，不會自己重新載入，
   * 守衛只在 `RequireAdmin` 的 effect 裡跑，所以這條路徑是分開的。
   */
  test('session 失效之後會被請出後台', async ({ page }) => {
    await signIn(page);
    await gotoAdmin(page, '/admin/tags', '標籤');

    await signOut(page);
    await page.reload();

    await expect(page, '沒有 session 就不該留在 /admin').toHaveURL(/^https?:\/\/[^/]+\/(en|ja|ko|zh-cn)?\/?$/, {
      timeout: 15_000,
    });
  });
});
