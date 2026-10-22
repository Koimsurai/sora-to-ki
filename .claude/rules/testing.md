---
paths:
  - "tests/**"
  - "playwright.config.ts"
  - "vitest.config.ts"
  - "vitest.setup.ts"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - ".config/stryker.config.json"
  - "scripts/e2e-coverage-report.mjs"
---

# 測試守則：e2e、樣式回歸、覆蓋率、變異測試

## 本機 `pnpm e2e` **不會 rebuild**，它跑的是上一次 `pnpm build` 的產物

`tests/e2e/stack.mjs` 起的是 `node .output/server/index.mjs`——已經建好的 nitro server。
它不呼叫 vite，所以**改完 `src/` 直接跑 e2e，測的還是舊的程式碼**，而且一切正常地綠。
拿 e2e 驗證「這條測試抓不抓得到某個變異」時尤其要注意：沒重建的話變異根本沒進到跑起來的程式，
全綠會讓人誤判那條測試是空的。

所以：**動過 `src/` 就先 `pnpm build` 再 `pnpm e2e`**。
只改 `tests/`（含 `seed.mjs`、`stack.mjs`）不用重建——那些是 runtime 讀的。
CI 沒有這個問題（workflow 裡 build 是獨立的前置 job）。

改完之後 stack 也要重起才會重新灌種子（`playwright.config.ts` 本機是 `reuseExistingServer: true`，
會沿用還開著的那個）。停 stack 用 `pkill -f "tests/e2e/[s]tack.mjs"`，**單獨一個指令**：
同一行裡若出現字面的 `stack.mjs`，pkill 會連執行它的 shell 一起殺掉。

**有些測試是有狀態的，同一個 stack 不能跑第二次 e2e。** `unsubscribe.spec.ts` 是
`mode: 'serial'`，第三條會**真的把種子裡的 `reader@example.com` 退訂掉**，第四條靠那個
狀態。所以在同一個 stack 上重跑 e2e，那條必定紅（頁面直接顯示「已退訂 ✓」而不是
「確認退訂」）。要重跑就先重起 stack。

**不要把 `pnpm e2e` 跟 `pnpm test` 併行跑。** 本機 Playwright 吃滿核心，再疊 vitest 會出現
無法重現的失敗（理由見 `playwright.config.ts` 的 workers 註解）。要平行做事就挑不搶 CPU 的
（tsc、oxlint、typos）。

## 樣式回歸有守門：`tests/e2e/computed-style.spec.ts`

跟著 `pnpm e2e` 一起跑（CI 不用另外設），比對公開頁面 **× 三個寬度**
（1280 / 768 / 390）加上後台頁面的計算後屬性。
改了樣式而它報紅是**正常的**：

```bash
UPDATE_STYLE_BASELINE=1 pnpm exec playwright test computed-style
```

更新後在 PR 說明「為什麼這些元素該變」。基準在 `tests/e2e/computed-style.baseline/`，
一頁一個檔（共用一個檔的話多 worker 會互相覆蓋，而且 diff 會糊成一團）。

**三個寬度是為了守住 media query 裡的宣告。** 只跑單一寬度的話，`@media` 區塊內的規則
（例如整個手機選單）完全沒被比對到。三個寬度是照站上實際用到的 12 個斷點挑的，每個斷點
至少被一個寬度踩到：`1280 → ≤1300`、`768 → ≤1100/1024/950/900/860`、
`390 → ≤768/720/640/600/560/480`。**1280 那組刻意不加檔名後綴**，既有基準檔名才不用全部改掉。
後台只跑桌機：後台幾乎沒有 media query。

**`/admin/comments` 與 `/admin/subscribers` 刻意不守**：別的 spec 會在同一輪裡新增／審核
留言、真的退訂種子讀者，同一個 DOM 路徑上的按鈕這次是「批准」下次是「垃圾」——那些差異
全是資料，不是樣式。

**報錯訊息每頁只列前 8 個元素。** 大改顏色這類「一次動上百個元素」的時候，要確認
沒有藏著非預期的屬性，就暫時把 spec 裡 `changed.slice(0, 8)` 拉大再跑一次、看完全部，
看完記得改回來。

**`setViewportSize` 要在 `goto` 之前。** 先導覽的話會先以預設寬度算一次版面，
元件裡看 `window.innerWidth` 的分支（MobileNav 的開合、圖庫欄數）會照舊寬度先跑一輪。

四件讓它能穩定的事，改動時不要拆掉：

1. **排除隨機裝飾背景**（`RandomComets` / `RandomShootingStars` / `RandomUFOs`）——
   它們產生的元素**數量本身是隨機的**，收進來首頁每跑必紅。
2. **等 DOM 穩定，不是等固定秒數**。Hero 有 JS 打字機（`useTypingEffect`，延遲 900ms
   開始、每字 80ms），而 **CSS 那條關動畫的規則停不掉 `setInterval`**，固定 sleep 會抓到
   打到一半的 DOM。
3. **不收這幾個屬性**：

   | 排除 | 原因 |
   |---|---|
   | `transform` `opacity` | 動畫元素上逐幀不同（framer-motion 用 rAF 寫 inline style，CSS 關不掉） |
   | `filter` `backdrop-filter` | 被 `html.no-gpu` 壓成 `none`，而那個 class 在測試瀏覽器一定會掛 |
   | `width` `height` | `auto` 的解析值取決於文字寬度 |
   | `margin-left` `margin-right` | 同上（`margin: auto` 置中時解出的是「剩餘空間」） |

   後兩類的共通點是**依賴字體度量**，而 CI runner 沒有這台機器上的 CJK 字體
   （MiSans / Noto Sans TC / PingFang TC…），fallback 不同 → 文字寬度不同 → 數字就不同。

   要加新屬性之前先測它會不會被字體影響：把全站 `font-family` 換成另一個**比例**
   字體（不要用 monospace——瀏覽器對等寬字有不同的預設字級，會讓 `font-size` 跟著全變，
   em 推導的 padding 也跟著動，測出一堆假陽性）再比一次，只有 `font-family` 該變。

   **然後還要做一次變異測試——「加進去、基準綠」不等於「抓得到東西」。** 例：採樣前注入的
   關動畫規則必須寫 `transition-property:none` / `animation-name:none`，不能寫
   `transition:none` / `animation:none` 簡寫——簡寫會把 duration 與 timing-function 一起重設，
   那兩個屬性就永遠是 `0s` / `ease`、抓不到任何變化。驗證方式是往 `index.css` 塞一條會動到
   該屬性的規則、**`pnpm build` 之後**再跑。

4. **只比對兩邊都存在的 DOM 路徑。** 只出現在一邊的代表結構不同，而 **CSS 改不動 DOM**
   ——那種差異一定來自資料或時序（種子資料的時間戳是相對的，首頁「最近更新」的項目數
   會隨跑的時間變）。忽略它們不會漏掉真回歸：樣式回歸必然是「同一個元素、值變了」。

## 覆蓋率有三個數字，量的是不同的東西

| Codecov flag | 量什麼 | 目前 |
|---|---|---|
| `frontend` | **單元測試**（vitest）走過多少 `src/` | ~41% |
| `e2e` | **Playwright e2e** 走過多少 `src/` | ~77% |
| `backend` | cargo-llvm-cov | ~93% |

**`frontend` 那個數字低不代表「幾乎沒測」。** 它的分母大多是 React 元件，而元件的渲染路徑
本來就是 e2e 在守；要提升它得寫 jsdom 測試去複製 e2e 已經在做的事，投報率很差。
挑檔案時看「壞了會不會有人發現」比看百分比有用。

e2e 的覆蓋率是 `tests/e2e/fixtures.ts` 收 V8 coverage、`scripts/e2e-coverage-report.mjs`
轉成 lcov 的。**多份 dump 的合併一定要用 `@bcoe/v8-coverage` 的 `mergeScriptCovs`，
不要自己寫**——同一個函式在不同 dump 裡的 range 數量會不一樣（V8 只為「count 與父層
不同」的區塊開 range），手寫的合併會靜靜丟掉帶命中的資料，把數字壓低一大截。
細節見那支腳本的檔頭。

**所有 spec 都要從 `./fixtures` import `test`／`expect`，不要直接 import
`@playwright/test`**（型別可以）——直接 import 的那支就不會被計入。
沒設 `E2E_COVERAGE_DIR` 時 fixture 完全不做事，本機跑 e2e 不會多付成本。

## 變異測試（Stryker）

`pnpm mutate` 只跑 `src/lib/`，**不接 CI**，定位同 `.cargo/mutants.toml`：拿來找洞的工具，
不是門檻。覆蓋率不等於測試有效——它擅長找出邊界值沒被斷言的測試。

**Stryker 的沙箱會吃掉整顆硬碟，如果沒設 `ignorePatterns`。** 它把整個專案複製到
`.stryker-tmp/sandbox-XXXX`，而**預設排除清單只有 node_modules / .git / reports，它不讀
`.gitignore`**——所以 `target/`（Rust 建置產物，上百 GB）會被整包複製。設定裡已經列好排除清單，
**新增大型產物目錄時要同步加進去**。另外 `cleanTempDir: "always"`：預設只在成功時清，而中止
（逾時、Ctrl-C、設定錯誤）留下的那幾個沙箱正是最大的。

變異測試會讓 `target/` 快速膨脹（每個變異都是一次不同的編譯，cargo 不會回收舊產物）。
`target/debug/incremental` 與 `target/llvm-cov-target` 是純快取，刪掉只是下次重建慢一點。
