/**
 * 路由 loader 裡的 redirect。
 *
 * 會有這支是因為一個很難從症狀猜到原因的 bug：首頁「回聲」區塊的連結是 `/blog/<id>`，
 * 滑鼠一經過（`defaultPreload: 'intent'`）整個頁面就凍住——捲軸還在動、內容不動，
 * F5 與 F12 都沒反應。原因是 loader 寫了 `redirect({ href })`：client 預載追 redirect 時
 * 用 `buildLocation(options)` 重算目標，而 buildLocation 不認 `href`，算回來還是原本的
 * 網址，於是自己轉向自己。那個迴圈沒有上限、資料又都在快取裡，每一輪只是 microtask，
 * 主執行緒就這樣被餓死。
 *
 * 在這之前種子裡沒有任何一篇有 slug，canonical 就是 id 本身，所以那條 301 **從來沒被走過**。
 *
 * ⚠ 斷言用 Node 端的計時器，不能用頁面裡的：主執行緒卡死時頁面裡的 setTimeout 也不會觸發，
 * `page.evaluate` 只會一直等到整條測試逾時，看不出是「卡死」還是「很慢」。
 */

import { expect, test } from './fixtures';

/** 種子第 8 篇：唯一有 slug 的文章（見 seed.mjs）。 */
const ID = '8';
const SLUG = 'slugged-post';

type Router = {
  preloadRoute: (opts: object) => Promise<unknown>;
  navigate: (opts: object) => Promise<unknown>;
};

/** fn 超過 ms 還沒回來就當成主執行緒卡死。 */
async function withinMs<T>(ms: number, fn: () => Promise<T>): Promise<T | 'HUNG'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<'HUNG'>((resolve) => {
    timer = setTimeout(() => resolve('HUNG'), ms);
  });
  try {
    return await Promise.race([fn(), hung]);
  } finally {
    clearTimeout(timer);
  }
}

test.describe('loader redirect', () => {
  test('直接打開 /blog/<id> 會 301 到 slug', async ({ page }) => {
    await page.goto(`/blog/${ID}`);
    await expect(page).toHaveURL(new RegExp(`/blog/${SLUG}$`));
  });

  test('預載會 redirect 的路由不會卡死頁面', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__TSR_ROUTER__' in window);

    for (const target of [{ to: '/blog/$id', params: { id: ID } }, { to: '/journey' }]) {
      const result = await withinMs(10_000, () =>
        page.evaluate(async (opts) => {
          const router = (window as unknown as { __TSR_ROUTER__: Router }).__TSR_ROUTER__;
          await router.preloadRoute(opts);
          return 'done';
        }, target),
      );
      expect(result, `預載 ${target.to} 要能結束——回不來就是主執行緒被卡死了`).toBe('done');
    }

    // 預載結束之後頁面也得還有反應（卡死的話這一步同樣回不來）。
    expect(await withinMs(5_000, () => page.evaluate(() => 'alive'))).toBe('alive');
  });

  test('client 端導覽到 /blog/<id> 會落在 slug 網址', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => '__TSR_ROUTER__' in window);
    const result = await withinMs(15_000, () =>
      page.evaluate(async (id) => {
        const router = (window as unknown as { __TSR_ROUTER__: Router }).__TSR_ROUTER__;
        await router.navigate({ to: '/blog/$id', params: { id } });
        return 'done';
      }, ID),
    );
    expect(result).toBe('done');
    await expect(page).toHaveURL(new RegExp(`/blog/${SLUG}$`));
  });
});
