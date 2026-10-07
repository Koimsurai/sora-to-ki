/**
 * Sketch 區塊在「先開過後台編輯器」之後還能畫出來。
 *
 * 後台的 Monaco 是從 /monaco/vs 以 AMD 方式載入的，會在 window 掛一個帶 `amd` 的 `define`；
 * 這是單頁應用，它在之後的頁面也還在。Excalidraw / mermaid-to-excalidraw 底下有幾個 UMD 套件
 * 的判斷順序是「先看 AMD、才看 CommonJS」——於是它們改去呼叫那個 define，匯出落空，AMD 載入器
 * 在第二次匿名呼叫時丟出 `Can only have one anonymous define call per script file`，
 * 區塊顯示「Sketch 轉換失敗」。修法在 vite.config.start.ts 的 `define: { define: 'undefined' }`。
 *
 * ⚠ 這條要用**有虛線箭頭與箭頭標籤的圖**（crowdsec 那篇原封不動）。種子裡那張 `A --> B`
 *   的簡單圖走不到那幾個 UMD 套件，修之前也是綠的——實際踩過。
 *
 * 乾淨的瀏覽器直接開文章完全正常，所以其他 spec 一直是綠的：這個 bug 只在站長身上發生。
 */

import { expect, test } from './fixtures';
import { gotoAdminUntil, signIn } from './admin-session';

const CHART =
  'graph TD; A[網際網路 讀者與掃描器] --> B[家用固網 路由器轉發 80/443]; B --> C[nftables CrowdSec bouncer]; C --> D[nginx 反向代理 TLS 終結]; D --> E[十幾個服務容器]; F[CrowdSec 引擎] -.讀 access log.-> D; F -.下封鎖決策.-> C';

test('Monaco 載入之後，Sketch 區塊照樣畫得出來、沒有任何 UMD 去碰 AMD 載入器', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __anonDefine: number; __csp: string[] };
    w.__anonDefine = 0;
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`),
    );
    // Monaco 掛上 define 的那一刻包一層，數匿名呼叫（第一個參數不是模組名稱的那種）
    let real: unknown;
    Object.defineProperty(window, 'define', {
      configurable: true,
      get: () => real,
      set: (fn: ((...a: unknown[]) => unknown) & { amd?: unknown }) => {
        real = Object.assign(
          (...args: unknown[]) => {
            if (typeof args[0] !== 'string') w.__anonDefine++;
            return fn(...args);
          },
          { amd: fn.amd },
        );
      },
    });
  });

  await signIn(page);
  await gotoAdminUntil(page, '/admin/posts/edit/7', (p) => p.locator('.monaco-editor').first());
  const amdLoaded = await page.evaluate(() => typeof (window as unknown as { define?: unknown }).define === 'function');
  expect(amdLoaded, '前提：Monaco 的 AMD 載入器要在場，否則這條什麼都沒測到').toBe(true);

  // 把內容換成 crowdsec 那張圖，讓編輯器的即時預覽在 AMD 載入器在場的狀態下渲染它
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`<Sketch title="t" chart="${CHART}" />\n`);
  for (const name of [/分割|Split/, /預覽|Preview/]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count()) {
      await b.click();
      break;
    }
  }

  // 等它畫出 SVG（成功）或丟出錯誤框（失敗），兩者先到者為準
  const done = page.locator('.mdx-sketch svg, :text("Sketch 轉換失敗")').first();
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Sketch 轉換失敗')).toHaveCount(0);

  const r = await page.evaluate(() => {
    const w = window as unknown as { __anonDefine: number; __csp: string[] };
    return { anon: w.__anonDefine, csp: w.__csp };
  });
  expect(r.anon, '打包進來的 UMD 不該呼叫頁面上的 AMD define').toBe(0);
  // 順便釘住：後台編輯器不該再冒 CSP 報告（zod 的 eval 試探，見 src/schemas/post.ts）
  expect(r.csp, '後台編輯器的 CSP 違規').toEqual([]);
});
