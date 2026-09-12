# koimsurai / sora-to-ki — 給 AI 助手的工作守則

## 工具選擇

這一節不是「請節省 token」這種空話，而是「哪件事該用哪個工具」。
會寫下來是因為實際踩過：某次 session 裡 Bash 佔了 22 萬 token（全對話的 30%），
而其中檔案編輯的部分本來就該用 `Edit`，繞道 Bash 還造成了三個 bug。

| 要做的事 | 用這個 | 不要用 |
|---|---|---|
| 搜尋程式碼、跨檔找字串 | `ctx_batch_execute`（一次多個指令 + `queries`，原始輸出留沙箱） | `Bash grep`（整份輸出進 context） |
| 分析單一檔案內容 | `ctx_execute_file`（跑程式、只印結論） | `Bash sed/head`（猜著看，還要自己讀） |
| 找符號定義／型別／引用 | `LSP`（`documentSymbol`、`findReferences`、`hover`） | `Bash grep`（字串比對有雜訊，型別會猜錯） |
| **改檔案** | **`Edit`**（精確匹配，匹配不到會報錯） | **Bash + 內嵌 python `s.replace()`** |
| 產生新檔 | `Write` | Bash heredoc |
| 執行指令（docker / git / cargo / curl / nginx） | `Bash` | — |
| 量 CWV / 效能 / 網路 / 記憶體 | `chrome-devtools` MCP | 手刻 CDP 腳本 |
| 需要隔離環境或自訂儀器的瀏覽器測試 | `playwright` MCP | — |

### 瀏覽器工具：兩個都留，分工不同

機器上只有 **Edge**（Chromium 核心），沒有 Chrome。兩個 MCP 都用 `/usr/bin/microsoft-edge`。

**`chrome-devtools` 用在標準問題**——`emulate`（CPU/網路節流、viewport、UA 一次搞定）、
`performance_start_trace`（直接吐 LCP/INP/CLS）、`performance_analyze_insight`、
`lighthouse_audit`、`list_network_requests`、12 個 heap snapshot 工具。
這些以前要手刻 CDP：光「節流 + 注入 PerformanceObserver + 算 session window + 歸因」
就是 80 行,現在是 3~4 個工具呼叫。

**`playwright` 只在一件事上不可取代**：**獨立 context**（`browser.newContext()`）。
chrome-devtools 只有 `new_page`、共用 profile。曾經因此誤判：量到「CLS 3/4 歸零」以為修好了，
用全新 context 重測才發現那是 **history 與快取造成的假象**，真實情況完全沒改善。要量
「首次造訪」就必須有乾淨環境。（`--isolated` 只在 server 生命週期層級隔離，不是每次測試。）

> 導覽前注入腳本不是差異點——`navigate_page` 有 `initScript` 參數，等同 `addInitScript`。

⚠️ **`performance_start_trace` 的 `reload: true` 有陷阱。** 它自己的重載**不帶捲動還原**，
量文章頁只會得到 0.03；要重現「捲在深處按 F5」必須 `reload: false` + `autoStop: false`，
自己 `evaluate_script` 捲好、`navigate_page(type: reload)`、再 `performance_stop_trace`。
用對之後它量到 0.4252，跟手刻 CDP 的數字一致。

⚠️ **它測得到、不一定解釋得了。** 同一筆 0.4252 它回「No potential root causes identified」——
CLSCulprits 認得的是字體、圖片無尺寸、動態插入這類標準模式，這一筆不在它的分類裡。
遇到它答不出來的，讀 **`LayoutShift.sources`**：每個來源都帶 `previousRect` / `currentRect`
與 `node`，直接回答「哪個元素、動了多少」，再配上逐幀的 docH / scrollY 就追得到源頭。
反過來它也抓到過我漏掉的：TASA Explorer 那支 latin webfont 造成 0.0337 位移。

⚠️ **`sources` 的 rect 是「視窗座標下的可見矩形」，不是版面高度。** 元素被裁切時
`height` 的差值會很大（實測看到 −763），但那不代表它的版面高度變了——照著追會追錯方向。
要判斷「誰長高了」得自己逐幀量 `getBoundingClientRect().height`。

⚠️ **2026-08-07 找到並修掉的成因（已修，記錄在此避免重蹈）：文章圖片沒有
`width`/`height` 屬性。** 外層 `.blog-image-wrapper` 是 `width: fit-content`，寬度取決於
圖片的固有尺寸——圖還沒載入時固有寬度是 **0**，`aspect-ratio` 反推的高度也是 0，
整個盒子塌掉；等圖載入才撐開，底下內容整片位移。thumbhash 佔位圖救不了，盒子早就塌了。

  · 冷啟動不算 CLS 是因為那些圖在畫面外；捲到深處重整時它們正好在視窗內才被計進去
    ——這就是「只有捲在深處按 F5 才出事」的機制。
  · 修法：上傳時把原始尺寸寫進網址片段（`#th=<hash>&w=<寬>&h=<高>`，見
    `handlers/upload.rs` 的 `compute_image_meta`），前端 `decodeSizeFromSrc` 解出來寫成
    `<img width height>`。既有文章由 `0018_backfill_image_size.sql` 回填。
  · **此前這裡寫的成因是「瀏覽器在 SSR HTML 還沒解析完就還原捲動位置」——那是錯的。**
    實測捲動還原在 t=114ms 就完成，位移發生在其後、由圖片塌陷造成。
    另一個錯過的方向是「shiki 高亮換入」（SSR 出 `shiki-fallback`）：實測只有
    −8/−7/−3 px 共 18px，不是主因。兩次都是量完才推翻的。

⚠️ **Lighthouse 測不出實地才有的問題。** 同一頁在無節流本機跑是 CLS 0，開了節流還是 0
（LCP 卻爆到 4.2s，證明節流有生效）——因為它永遠是冷啟動、無 history、單頁直接載入。
文章頁真正的 CLS 只在「重新整理且捲在深處」時出現，任何「載入一次量一次」的工具都抓不到。
實地歸因靠 `web_vitals` 表的 `target` / `shift_path` 兩欄（見 migration 0010/0011）。

⚠️ **查實地數據時記得排除 `/admin`。** 上報端從 2026-07-31 起就擋掉後台了
（`reportWebVitals.ts` 擋在 `send()`，理由見那裡的註解），但**在那之前的資料還在表裡**——
用 30 天窗口撈會把它們一起算進來。實測差距：CLS p75 含 admin 0.0458、排除後 0.0174。
查詢一律加 `path NOT LIKE '/admin%'`。

### 為什麼「改檔案一定要用 Edit」

用 shell + python 改檔繞過了 `Edit` 的保護，實際造成過：

- **heredoc 吃掉行尾兩個空白** → MDX 歌詞的硬換行全沒了，整段併成一行
- **`$remote_addr` 寫在雙引號 `echo` 裡** → bash 當成自己的變數展開，`set -u` 讓腳本中止
- **`replace(..., 1)` 打到錯的 struct** → 欄位加進 `TagBody` 而不是 `CategoryBody`（發生兩次）

`Edit` 要求精確匹配、不經過 shell 也不經過 python 的字串逸出，這三類錯都不會發生。
多處修改就多呼叫幾次 `Edit`，不要為了「一次改完」而繞道。

### 寫進 /etc 或系統設定的腳本

字面內容一律走**引號 heredoc**（`<<'EOF'`），它不做變數展開。
在雙引號 `echo` 裡寫 nginx／其他系統的 `$變數` 會被 bash 搶走。

## 專案結構

`src/components/` 依**功能領域**分組，不是依元件型別。分組是照實際的 import 圖切的：

| 資料夾 | 放什麼 |
|---|---|
| `layout/` | 站台外框：AppShell、Header／MobileNav、Footer、命令面板、右鍵選單 |
| `backdrop/` | 太空背景與轉場：SpaceBackdropShell 那條線底下的所有特效 |
| `home/` | 首頁：MainPage、Hero、HomeLately |
| `about/` | 關於／資訊頁：AboutPage 樹、以及四個共用 InfoPage 的頁面 |
| `blog/` | 文章與想法：Blog、BlogPost、Comments、Thinking |
| `mdx/` | MDX 渲染與所有 block 元件（新增 block 要同時改 `mdx-blocks-registry.ts`） |
| `gallery/` | 照片：PhotoGallery、PhotoViewer、EXIF、圖片檢視 |
| `media/` | 收藏庫：Watch、Music、Bookshelf、Activity |
| `account/` | 登入回呼、電子報退訂 |
| `common/` | 跨領域共用：KoimLoader、LinkCard、SignatureSVG |
| `ui/`、`animate-ui/` | shadcn 與 animate-ui 產生的檔案，**不要手動整理**（oxlint 與 knip 都有針對這兩個路徑的設定） |
| `admin/`、`monaco-editor/`、`mega-menu/` | 原本就分好的，維持原樣 |

CSS 跟同名元件放在一起。**跨資料夾的 import 一律走 `@/` alias**，同資料夾才用 `./`。
這樣下次再搬檔只會動到被搬的那幾個檔案，不會牽動一堆 `../../`。

`src/` 根層只留框架要求的東西（`router.tsx`、`routeTree.gen.ts`、`vite-env.d.ts`、
`index.css`、`App.css`），其餘各歸各位：

| 資料夾 | 放什麼 |
|---|---|
| `data/` | API 查詢模組（react-query 的 queryOptions）與靜態資料 |
| `i18n/` | 語系切換、`localePage` 系列的路由包裝 |
| `seo/` | `seoMeta`（JSON-LD）、`pageSeo`（各頁 meta） |
| `lib/` | 純工具，不含 React |
| `lib/mdx/` | MDX 編譯鏈：`mdx-compile-core`（plugin 組態）、`shikiHighlight`、`blogContent` |
| `hooks/` | React hook |
| `store/` | jotai atom 與訂閱式狀態 |
| `contexts/`、`types/`、`schemas/`、`styles/`、`workers/` | 各一類，維持原樣 |

⚠️ 不要為了「檔案少」再開新目錄，也不要把單檔目錄併掉：`schemas/`（zod）、`styles/`（CSS）、
`workers/`（vite 的 worker 慣例）各自是明確的一類，單檔不代表是雜檔。真正該避免的是
`lib/` 那種「什麼都往裡丟」——它一度長到 24 個檔，混了 hook、MDX 編譯、純工具三類。

⚠️ **搬檔時 tsc 抓不到的兩類引用**（這次兩類都真的踩到了）：

1. `new URL('...', import.meta.url)` 裡的 worker 路徑——vite 靠靜態分析這個字面字串才認得出
   worker 進入點，所以它**必須是相對路徑**、不能換成 `@/`，而搬檔後要自己算對層數。
2. 腳本裡硬編的檔案路徑字串（例如 `scripts/mdx-block-names.ts` 用 regex 讀註冊表）。

改完結構後除了 tsc，一定要跑 `pnpm test` 與 `pnpm build`——上面兩類只有它們抓得到。

⚠️ 設定檔集中在 **`.config/`**（nextest、knip、lighthouserc、schemathesis、builder、biome）。
不要另開一個 `config/`——`.config/` 早就在了（cargo-nextest 指定的位置），兩個並存只是更亂。
每一個都要靠 CI 明確帶參數才讀得到，改路徑時 `.github/workflows/ci.yml` 要一起改：

```
pnpm exec knip --config .config/knip.json …
pnpm exec lhci autorun --config=.config/lighthouserc.cjs
uvx schemathesis --config-file .config/schemathesis.toml run …   # 頂層選項，在 run 之前
biome check --config-path=.config/biome.json .                   # 已包成 pnpm lint:css
```

`builder.config.js` 刻意不放 `scripts/builder/`——那裡有 `scripts/builder/**/*.js` 的 gitignore。

留在根目錄的是**搬了得不償失**的，不是搬不動的：`components.json`（shadcn 只有 `--cwd`
沒有 `--config`，搬了要把裡面每條路徑改成 `../…` 還得在旁邊放 tsconfig）、`vitest.config.ts`
與 `playwright.config.ts`（內部相對路徑相對設定檔目錄解析）。

## CSS

Tailwind 是 **v4**，設定在 `src/index.css` 的 `@theme` 裡，**沒有 tailwind.config.js
也沒有 postcss.config.js**（v4 自己處理 `@import` 與 vendor prefix，走 `@tailwindcss/vite`）。
要加自訂色／間距就寫進 `@theme`，不要試圖找設定檔。

⚠️ **不要再為了蓋過全域樣式而堆特異性或加 `!important`。** v4 用的是**原生 cascade
layer**：`index.css` 的 `@layer base`（含那條全站 `button { 紫底 }` 與 hover 光暈）
是分層的，而所有元件 CSS 是未分層的——**未分層恆勝過分層，跟特異性無關**。

這件事在 v3 時代不成立：當時 `@layer base` 只是 Tailwind 的指令、輸出的是普通 CSS，
所以那條 `button` 規則（特異性 0,1,1）真的會蓋掉元件的 `.foo-btn`（0,1,0）。於是
七個檔案各自寫了高特異性的繞過碼並留下註解解釋——**那些註解描述的是已經消失的問題**，
不要拿它們當範例照抄。真的遇到蓋不過去的情況，先確認你的規則有沒有被包進某個 layer。

### 間距、字級、行高、字距、圓角、模糊、陰影、堆疊層與過渡一律走 token，有一道檢查在擋

```bash
pnpm check:css-tokens      # CI 與 pre-commit 都跑
```

十把尺都定義在 `src/index.css` 的 `@theme`：

| | token | 範圍 |
|---|---|---|
| 間距 | `--space-px` … `--space-24` | 2px 格線到 24px，之後 4px／8px 步進 |
| 字級 | `--fs-10` … `--fs-56` | 16 格，10–14 是 1px 步進（91% 的用量在 10–18px） |
| 行高 | `--lh-100` … `--lh-185` | 9 格，0.1 格線；最後一格是 1.85（長文的閱讀節奏） |
| 字距 | `--ls-n4` … `--ls-30` | 11 格，數字是 em×100，`n` 開頭是負的 |
| 圓角 | `--r-2` … `--r-20` + `--r-full` + `--r-round` | 2px 格線到 20px；`--r-full` 是膠囊、`--r-round` 是 50% |
| 堆疊層 | `--z-float` … `--z-intro` | 11 格，1000 起跳每格 100；門檻是 1000 |
| 過渡時長 | `--dur-100` … `--dur-1000` | 9 格，密在 100–300ms |
| 緩動 | `--easing-standard` / `-out` / `-back` | 三條曲線；`ease` 那批關鍵字保持原樣 |
| 模糊 | `--blur-2` … `--blur-110` | 9 格，三個層級：2 劇透／4–28 玻璃／60–110 氛圍 |
| 陰影 | `--elev-0` … `--elev-6` | 7 格,**只管單層中性投影**；多層的不碰 |

`margin` / `padding` / `gap` / `font-size` / `line-height` / `letter-spacing` /
`border-radius` / `transition` 的時間與曲線不准再寫字面值；`z-index` 的門檻是 1000。
透明度另有一把 19 階的階梯（見下面）。

⚠️ **圓角的 token 叫 `--r-*` 不是 `--radius-*`**，跟 `--fs-*` 同一個理由，而且更嚴重：
`--radius-*` 是 Tailwind v4 生 `rounded-*` 的 namespace，**這個專案已經有 shadcn 的
`--radius` / `--radius-sm/md/lg` 掛在上面**（`index.css` 的 `@theme inline` 開頭），
佔用它會改變後台每一顆 `rounded-md` 按鈕。

⚠️ **「膠囊」原本有四種拼法**：`9999px`（20 次）、`999px`（16 次）、`50px`、`40px`，
外加 `1px` / `3px` / `5px` 這種「寫在細元素上、其實也是膠囊」的。判準是
**短邊 ≤ 2×半徑時瀏覽器會夾住**——量過每一個站點才併的（捲軸滑塊寬 5–6px 寫 3px、
`.hero-caret` 寬 2px 寫 1px、`.status-bar` 高 36–40px 寫 40px，`.status-bar` 連
360px 視窗都不換行），所以那 50 個元素是**零像素變化**，只有計算值從 `3px` 變成 `9999px`。
判斷這類「computed 變了但畫面沒變」要靠量元素尺寸，不要靠看基準 diff 的筆數。

⚠️ **`border-radius: 0` 與 `inherit` 刻意沒有 token**，寫 `var(--r-0)` 只會更難讀。
`30% 70%` 那種刻意捏形狀的百分比也不管，檢查只擋剛好 `50%`。

### 行高與字距

```
--lh-100 / 110 / 120 / 130 / 140 / 150 / 160 / 170 / 185      （數字是 ×100）
--ls-n4 / n2 / 1 / 2 / 4 / 6 / 8 / 12 / 18 / 24 / 30          （數字是 em×100，n 是負的）
```

⚠️ **行高最後一格是 1.85 而不是 1.9,那是刻意的。** `.post-content`、`.tk-text`、
`.about-paragraph` 三個長文表面本來就都寫 1.85——**三個一致代表那是設計過的閱讀節奏**，
不是隨手打的。尺保住它，所以那三處零變化。

⚠️ **字距只認 `em`，寫 `px` 直接判錯。** px 字距不會跟著字級縮放，同一個 `1.5px` 放在
10px 與 16px 的標籤上鬆緊完全不同——那才是收這批之前真正的問題（27 種值裡有 9 種是 px）。
導入時 26 處 px 全部換算成 em（除以同區塊的 `font-size`，全站字級已 token 化所以
`var(--fs-N)` 的 N 就是 px；兩處繼承來的用瀏覽器量）。

⚠️ **行高有三條豁免**，都是刻意的排版手法：`0`（`.vp` 影片容器殺掉行內間隙，同
`border-radius: 0` 的道理）、`0.8`（`.post-content.drop-cap-first` 的首字放大）、
`0.95`（`.expertise-hero-number` 的巨大數字）。

⚠️ **`line-height` 曾經被排除在 computed-style 之外，理由是「`normal` 取自字體度量」——
那條已經不成立了。** Tailwind v4 遷移時補的那批 `--text-*--line-height` 絕對值把全站的
`normal` 蓋光了，實測 7 個頁面 3326 個元素、`normal` 出現 **0 次**。2026-09-11 收回守門。
（另外 Chrome 對 `line-height: normal` 回傳的是字串 `"normal"` 不是 px，所以就算真有
`normal`，換字體也不會讓它變成不同的數字。）**過期的排除理由要回頭驗，不要當成永久事實。**

### z-index：`--z-*` 十一格，門檻是 1000

```
--z-float 1000 → --z-header 1100 → --z-progress 1200 → --z-trail 1300 →
--z-modal 1400 → --z-menu 1500 → --z-fullscreen 1600 → --z-palette 1700 →
--z-toast 1800 → --z-ctx-menu 1900 → --z-intro 2000
```

⚠️ **`check:css-tokens` 只擋 ≥1000 的字面 z-index，不是全部。** 1000 以下留給元件
內部的局部堆疊（`.mm-toolbar: 20`、`.floating-actions: 100`），那些數字只跟自己的
兄弟比，逼它們上尺是把局部問題硬講成全域問題。

⚠️ **最重要的一件事：這個站的 z-index 大部分沒有全域意義。** 全站內容都關在
`.main-content-container` 裡（`AppShell.tsx` 給它 `position: relative; z-index: 10`），
那本身就是一個堆疊脈絡。實測後果：`.cmdk-backdrop` 寫 `10000`，照樣被容器**外面**
的 `.back-to-top`（`1000`）蓋住；`.mobile-toggle` 的 `1002` 是關在 `header.site-header`
（`1000`）裡的局部值。**所以不要用數字大小去推跨脈絡的勝負**——任何 portal 到
`document.body` 的東西（lightbox、mermaid 全螢幕、連結預覽卡、收藏編輯器、交友 modal）
自動贏過整個容器，不管它寫幾。

⚠️ **覆蓋層一定要 portal 到 `document.body`。** 寫在頁面內容裡的話，多大的 z-index
都可能是假的——交友 modal 原本寫 `9999`，但它長在 `InfoPage` 的 `.post-body`
（`z-index: 1`）裡面，於是那個 9999 只是「在 post-body 裡排第一」，對外仍然只有 1。
症狀是遮罩明明是整個視窗大小，頂欄照樣浮在變暗的畫面上而且點得到。

⚠️ **診斷這類問題不要讀 CSS 猜，用瀏覽器問。** 兩個工具：
`document.elementFromPoint(x, y)` 回答「這個位置上最後畫的是誰」（那是瀏覽器自己
算出來的結果）；往上走找「第一個建立堆疊脈絡的祖先」回答「這個數字跟誰比」。
上面三個 bug 全是這樣抓到的，`grep z-index` 一個都看不出來。

### 過渡：`--dur-*` 九格、`--easing-*` 三條

```
--dur-100 / 150 / 200 / 250 / 300 / 400 / 500 / 700 / 1000     （值就是 ms）
--easing-standard  cubic-bezier(0.4, 0, 0.2, 1)      一般的進出
--easing-out       cubic-bezier(0.22, 1, 0.36, 1)    快速起步、緩緩停下
--easing-back      cubic-bezier(0.34, 1.56, 0.64, 1) 帶回彈
```

`ease` / `linear` / `ease-in-out` / `ease-out` 這些**關鍵字保持原樣**，它們是標準寫法，
包成 token 只是多一層。

⚠️ **時長只查 `transition*`，`animation*` 的時間刻意不上尺。** 兩者不是同一種東西：
站上的 animation 從 **50ms 的閃爍**到 **200 秒的星空漂移**都有，那是各自調出來的節奏
與週期，硬貼會把背景動畫變成災難。**緩動則兩邊都查**——曲線是設計決定，跟它是過渡
還是動畫無關。

⚠️ 兩個豁免，各有理由：`0.01ms` 是 `prefers-reduced-motion` 的關閉開關（那不是一個
時長）；`1.5s` 在 `.np-ambient-glow` 一處，離最近的一格 500ms，硬貼會走樣。

⚠️ **改過渡時長前先確認沒有 JS 計時器配著它。** 這次查過三個：`BlogPost` 的 1800ms
（toast）、`HomeLately` 的 160ms（hover 離開延遲，跟 CSS 無關）、`PostEditor` 的 350ms
（zen 模式切換後 dispatch resize 讓 monaco 重算）——後者所在的 admin/monaco CSS 只有
0.3s / 0.2s / 0.15s，全在尺上原值沒動，所以沒失步。`grep setTimeout` 就查得完。

⚠️ **`body::before` / `body::after`（全站顆粒與邊緣暗角）不在這把尺上。** 它們在
根脈絡、寫 49/50，所以實際上畫在**頂欄與所有 modal 之上**——跟它們原本的註解相反
（那條註解已改成寫實話）。兩層都是 `pointer-events: none` 的極淡覆蓋所以沒人注意到。
要改成「只蓋內容」得把它們搬進容器，那是視覺決定，不是排版 bug。

### 陰影：`--elev-*` 七格，**只管單層中性投影**

```
--elev-0  0 1px  4px  black-50    貼合：小控制項（進度條拖曳鈕）
--elev-1  0 2px  8px  black-30    貼著表面：小卡片、標籤
--elev-2  0 4px  16px black-40    微抬
--elev-3  0 8px  24px black-45    卡片 hover、浮動控制（最大群，14 處）
--elev-4  0 12px 32px black-50    下拉、面板
--elev-5  0 18px 48px black-50    大面板、popover
--elev-6  0 26px 72px black-55    modal
```

⚠️ **這把尺刻意不管多層陰影。** 全站 162 個非 none 的 `box-shadow` 裡 **104 個是多層的**
（玻璃高光 + 投影、品牌色光暈），那些是刻意的組合，硬收成一把尺只會把設計拆掉。
尺管的是另外那 48 個單層中性投影（`0 Ypx Bpx var(--black-NN)`）——它們卻有 **36 種**
不同的 `(y, blur, alpha)`，最明顯的是 `.modal-content` / `.download-popover` /
`.unsubscribe-card` / `.mm-fullscreen-container` / `.fe-modal` / `.tk-modal`
**六個都是 modal／popover 卻有五種不同的陰影**。

⚠️ **七格是算出來的不是拍的**：把候選尺跟 48 個站點對，比平均位移（y 與 blur 用相對
誤差、alpha 用絕對差）。這一組是 y 11% / blur 10% / alpha 0.043。`--elev-0` 那格是為了
`.vp-progress-knob`（12px 的拖曳鈕需要貼合陰影），少了它那一處會被迫放大一倍、
alpha 掉 0.20，是所有候選裡最差的一筆。

⚠️ **名字是 `--elev-*` 不是 `--shadow-*`**：後者是 Tailwind v4 的 namespace，而站上有
6 個 shadcn 的 `shadow-xs/sm/md/lg/xl/2xl` 正在用。

⚠️ **陰影有一半改在 hover／focus 上，靜態守門看不到。** 48 處裡只有 24 處會出現在
computed-style 的快照裡，其餘是 `:hover` / `:focus-visible` / 條件渲染的覆蓋層。
驗那一半要主動 hover（`.gallery-thumbnail-item` 還得先打開照片檢視器）。實測三個
位移最大的並排比對：肉眼分辨不出來——陰影都落在深色背景上，±0.15 的 alpha 與
±8px 的 blur 在那個對比下看不出差別。

### 模糊：`--blur-*` 九格，三個層級不要互相貼

```
--blur-2                              劇透遮罩（看得出下面有字，但讀不出來）
--blur-4 / 8 / 12 / 16 / 20 / 28      玻璃面板的 backdrop-filter
--blur-60 / 110                       大面積氛圍模糊（背景光暈、模糊掉的封面圖）
```

⚠️ **`-webkit-backdrop-filter` 必須跟沒前綴的同值**，不然 Safari 的模糊跟 Chrome 不一樣。
`check:css-tokens` 兩個都查——這是靜態檢查唯一抓得到這件事的地方（第一版 codemod 就是
漏了前綴版，66 處沒換到）。

⚠️ **`saturate()` 原本有三種擺法**（`saturate() blur()` / `blur() saturate()` / 只有 blur），
效果一樣但讀起來像三種東西。統一成 `blur() saturate()`。

⚠️ **改 blur 沒辦法用 computed-style 或截圖驗**，因為 `html.no-gpu` 在測試瀏覽器一定會掛、
把 `backdrop-filter` 全部壓成 `none`。要驗就在瀏覽器裡 `classList.remove('no-gpu')` 之後
再讀計算值——導入這把尺時就是這樣確認「所有 blur 半徑都落在尺上」的。

### 站點自己的品牌色：語意命名

`index.css` 的 `:root` 有 `--surface-0..3`（近黑背景，**依明度排，0 最深**：0 是頁面底、
1–3 是疊上去的面板與卡片）、`--ink`（主文字 `#e5e5f5`）、`--lavender` / `--lavender-soft`、
`--magenta` / `--magenta-deep`，**九個都配了 `-rgb`**（九個都有帶 alpha 的用法）。

跟下面那批 Tailwind 色票的差別：那批是「抄過來的」，可以用客觀的色票名；這批不在任何
公開色票上，只能靠語意命名。值都是原本在用的 hex，零視覺變化。

⚠️ `--surface-0..3` 那四個是 2026-09-08 把 56 個近黑併成 10 個之後，**真的有層次差別**
的那幾層，不要再往下併。

### 調色盤：Tailwind v3 色票名，值是原本在用的 hex

`index.css` 的 `:root` 有 `--zinc-100…900`、`--purple-300/500`、`--violet-300/400/500`、
`--amber-300/400`、`--red-300/400/500`、`--green-300/400/500`、`--pink-500`，各配一個
`-rgb` 三元組（帶 alpha 時寫 `rgba(var(--zinc-100-rgb), a)`）。

為什麼用色票名：全站有 23 個底色、315 次是**一字不差**的 Tailwind v3 色票
（`#d8b4fe` = purple-300 就用了 90 次），用它命名是客觀的，不用猜語意。

2026-09-12 補了 `--sky-300` / `--blue-500` / `--blue-600` / `--red-600` / `--purple-200`
五個（同樣是一字不差的 v3 色票）。**門檻是用了 3 次以上**——低於這個數，token 只是多
一層間接，還會把調色盤撐肥。唯一的例外是 `--sky-300`（只有 2 次）：它是為了讓
`markdown-alert-note` 跟另外四種 alert 一致，那一組本來就有 `important` 已經在用 token。

⚠️ **不要改成引用 Tailwind 自己的 `--color-purple-300`。** v4 的色票是 **oklch**，跟 v3 的
hex 不相等，換過去就不是零視覺變化；而且哪些 shade 有輸出取決於 utility 用到誰——
跟 `--text-3xl` 被 tree-shake 掉是同一個陷阱。

⚠️ **把 gradient 裡的字面色換成 `var()` 會讓 computed-style 報 `background-image` 變了，
但那不是視覺變化。** 導入調色盤那次後台 3 頁各紅 1 個元素，逐字比對兩個 build 的計算值
只差一個字元：`at 50% 0px`（main）vs `at 50% 0%`（新）。來源 CSS 兩邊都寫 `0%`——把它折成
`0px` 是 lightningcss 對**純字面值** gradient 做的 minify，換成 `var()` 之後 gradient 不再是
常數，minifier 就跳過它。位置 0 不管單位都是 0，直接更新基準即可。判斷方法：拿兩個 build
在同一個 stack 上跑同一支 probe，不要看 hash 猜。

⚠️ **字面值等於某個 token 的值就必須用 token**，`check:css-tokens` 的規則 4 在擋，
token 表是從 `index.css` 讀的，加新 token 不用改腳本。這條零誤判：值都相等了，
寫字面值只剩「不知道有 token」一種原因。

Happy Hues 那組 `--clr-*` 原本 11 個，7 個引用 0 次（掃過 387 個 ts/tsx/css/js 檔）
已退役。留下的 `--clr-headline` / `-paragraph` / `-button` / `-button-text` / `-tertiary`
還有人用。`--brand-light` 現在指向 `var(--violet-300)`——它就是那個色票，不再另抄一份 hex。

### 等寬字只有一套堆疊：`--mono-font`

```
--mono-font: "Fira Code", "JetBrains Mono", "SF Mono", ui-monospace, Consolas,
             var(--cjk-font), monospace;
```

⚠️ 在這之前同一個角色（程式碼、時間戳、commit SHA）有 **12 種不同的堆疊**散在 13 個
檔案裡。而且**不只是寫法不同**——站上**沒有 `@font-face` 也沒有從 CDN 載任何等寬字**，
所以 `"Courier New", monospace` 會真的渲染成 Courier New（幾乎人人都裝），而
`"Fira Code", …` 在沒裝的機器上往後 fallback。結果是 Activity 的時間戳用 Courier New、
程式碼區塊用系統等寬字，**同一個站兩種等寬字**。

⚠️ `var(--cjk-font)` 放在 `monospace` 之前是刻意的：那是 sans-serif 鏈，讓程式碼裡的
中文走比例字體——CJK 等寬字很少而且不好看。

### `opacity` 也走那把 19 階的階梯

⚠️ 這條**不是**「要用 token」，是「值要在階梯上」——`--white-NN` 那些是顏色，不能拿來
當 `opacity`。但兩者量的是同一件事（多透明），所以共用同一套詞彙。導入時 23 種值裡
**已經有 19 種落在階梯上**，只有 `0.85` / `0.75` / `0.18` / `0.12` 四個例外（17 次）。

⚠️ `opacity` **不在 computed-style 的 PROPS 裡**（動畫元素上逐幀不同），所以這一條
只有 `check:css-tokens` 在守，改它的時候不會有第二道保險。

### 外部服務的品牌色：命名但**不能併值**

`--svc-spotify` / `--svc-steam` / `--svc-youtube` / `--svc-instagram` / `--svc-bilibili`，
各配 `-rgb`。另外 `--diff-add` / `--diff-del` 是 GitHub 的 diff 綠紅，同時用在程式碼
diff 與數據趨勢的升降，所以用**角色**命名而不是 `--svc-github-*`。

⚠️ **這些的值不能動也不能貼到調色盤**——Spotify 的綠就是 Spotify 的綠，貼到
`--green-500` 就不是那個品牌了。收成 token 的理由不是收斂，是**同一個 hex 原本散在
2–3 個檔案裡重複**（Spotify 13 次、Steam 9 次）。

### 有四類顏色刻意留成字面值，不要「順手」收掉

清到最後剩 274 次，分類如下——**其中三類是刻意的**：

| | 次數 / 種類 | 為什麼留 |
|---|---|---|
| 不透明黑白 | 138 / 3 | `color: #fff` 是最慣用的寫法，包成 token 讀起來更遠 |
| 自成一套的主題／漸層集合 | 36 / 33 | 見下面 |
| 調色盤自己的定義行 | 19 / 19 | 那就是調色盤 |
| 元件內的區域色定義 | 3 / 3 | 只有一個元件在用的裝飾色 |
| **其餘字面值** | **78 / 64** | 全部用 ≤2 次，不值得 token |

⚠️ **「自成一套」是一個判準，用過三次了**：`.mm-theme-deep/-zinc/-tokyo/-nord/-light`
（五個結構一模一樣的 7 行圖表主題）、`Music.css` 的 `--feat-energy/-dance/-valence`
（三條一組的漸層）。**只把其中一兩個改成 `var()` 會讓它們跟兄弟讀起來不一樣**，而那些
區塊的價值就是「一眼看完整套配色」。`markdown-alert-*` 是反例：它**本來就不成套**
（`important` 早就在用 `var(--brand-light)`，另外四個是字面值），所以那一組收掉是修
不一致，不是破壞對稱。

⚠️ **判斷「能不能併」要算 Lab 色差，不要看 hex 長得像不像。** 兩個實例：
`#8b7cf6` vs `--violet-500` `#8b5cf6` 只差一個字元，**ΔE 22.3**；
`#dc3250` vs `--magenta` `#dc3278` 前四碼相同，**ΔE 23.2**。兩個都不能併，
各自給了名字（`--iris` / `--crimson`）。真正接近的是 `#e2e0ea` 對 `--ink`（ΔE 3.6），
那個併掉了。

### 透明度也有一把尺：19 階，白／黑／品牌紫共用

```
0.02 0.04 0.06 0.08 0.10 · 0.15 0.20 0.25 0.30 0.35 0.40 0.45 0.50 0.55 0.60 · 0.70 0.80 0.90 0.95
```

低端 0.02 步（髮絲線，0.02 與 0.04 在感知上差兩倍）、中段 0.05、高段 0.10。定義在
`index.css` 的 `--white-NN` / `--black-NN`（NN 就是 alpha×100）。規則：

- `rgba(255,255,255,a)` / `rgba(0,0,0,a)` **不准寫字面值**，用 `var(--white-NN)` / `var(--black-NN)`。
- 品牌紫維持 `rgba(var(--brand-rgb), a)` 的寫法，但 `a` 必須在階梯上。
- 其他底色的 rgba／hsla／`#rrggbbaa` 的 alpha 也必須在階梯上（底色本身的命名是另一批的事）。
- `check:css-tokens` 在擋，含 `--xxx: var(--white-NN)` 這種**定義行**（第一版 codemod 就是漏了
  三處定義行才發現：`--glass-bg` / `--glass-hover-bg` / `--post-card-bg` 引用了被拿掉的階）。

⚠️ 在這之前白色是 26 階 token **加** 29 個不在階梯上的字面 alpha ＝ 55 種透明度，品牌紫的
`a` 是 36 種自由填。重訂時是用加權分群算過再手設的：純擬合會從 0.05 才開始（低端絕對誤差
小，演算法不在乎，但那正是髮絲線最需要細步的地方）而且會吐出 `0.22`、`0.82` 這種把亂固化
的數字。手設 19 階貼上去平均位移 0.006、最大 0.05，最大位移全在 0.65–0.98 的高端。

⚠️ **驗這批的截圖比對有一個坑**：全頁 gradient 的 stop alpha 動 0.05，每個像素的通道差總和
就落在 13–20，工具門檻是 12 → 整頁 55–86% 全亮。**底色／alpha 這類改動，像素數字沒有判斷力**，
要把門檻拉到 >40 只看結構性變化，再對剩下的區塊逐一裁圖。另外首頁 Hero 有時會在揭露前被
抓到（DOM 連續三次不變在 900ms 的打字機延遲之前就能成立）——看到 Hero 整塊空白先重拍一次，
別急著當成回歸。

⚠️ **字級的 token 叫 `--fs-*` 不是 `--text-*`**，兩個理由都會咬人：
`--text-*` 是 Tailwind v4 生 utility 的 namespace（佔用它會改變 `text-sm` 產出什麼），
而且這個專案的 `--text-primary` / `-secondary` / `-tertiary` **已經是顏色**。

⚠️ **也不要直接 `var(--text-3xl)`。** v4 會 tree-shake 掉沒被 utility 用到的 theme
變數——實測建置產物裡只有 `xs/sm/base/lg/xl/2xl/6xl`，**3xl / 4xl / 5xl 根本不存在**，
引用它是未定義、字級直接退回繼承值，而且不會有任何錯誤訊息。

⚠️ 字級的 `em` 與 `clamp()` 刻意不檢查：`em` 是相對父層字級的（MdxContent 有一批
`0.55em` / `0.82em` / `1.05em` 就是要跟著父層走），`clamp()` 是流體字級。

⚠️ **這道不是潔癖。** 補它之前這個專案**兩把尺都沒有**：間距 87 種值／1594 次、
字級 57 種值／584 次，token 覆蓋都是 0。間距長出 `0.15rem` / `0.35rem` / `0.45rem` /
`0.55rem`——沒有人「決定」要用 5.6px，是打了 `0.35rem` 覺得差不多；字級更誇張，是有人
拿著 0.02rem 在肉眼微調（`0.7` / `0.72` / `0.74` / `0.76` / `0.78` / `0.8` / `0.82` /
`0.85` / `0.88` / `0.9` / `0.92` / `0.95rem` 全部同時存在）。收斂那 2040 處花了三支 PR。

CSS 的 git 歷史是**寫了 51,785 行、刪掉 30,103 行（58%）**，前一年一路淨增
+87%~+94%，直到一次 −95% 的大清理才拉回來。沒有這道檢查它會原封不動長回來。

真的需要新尺寸有兩條路，兩條都會在 review 裡被看見：加進 `index.css` 的尺（比較好），
或加進 `scripts/check-css-tokens.ts` 的 `GRANDFATHERED` 並寫明理由。那份名單是**存量
不是許可**，而且 2026-09-12 真的照這句話清乾淨了：**29 條 → 10 條、137 次 → 17 次**。

⚠️ **清的時候發現兩個標籤是騙人的**，記下來避免重蹈：

1. **「奇數小值還沒決定要不要收進尺」** —— 那不是理由，是待辦。`3px → 4px` 的
   **相對**誤差 33% 看起來很大，但**絕對**誤差只有 1px，而間距差 1px 看不出來。
   ⚠️ **判斷間距要用絕對差，判斷 alpha 要用相對差**——alpha 那把尺的低端刻意細步，
   正是因為 0.02 與 0.04 在感知上差兩倍。同一個「誤差」在兩把尺上意義相反。
2. **「版面尺寸硬貼會走樣」** —— 只對 `120px` 成立。`26/30/42/50/55px` 離最近一格
   只有 1–2px。而 `60/70/72/88/90/100/120px` 那九個**根本不是九個零散的豁免，
   是同一個待辦**——見下面的頁面外框。

現在名單裡只剩 10 條：9 個負值（沒有負的 token 形式）與 `.app-footer` 的 `8rem`
（刻意的 fade zone，跟 `--page-bottom` 是一組：頁面下留白 64 + 這裡 128 = 192px）。

### 頁面外框的上下留白：`--page-top` / `--page-bottom`

站台頂欄是 `position: fixed`、高 **60px**（≤480px 時 56px），所以每個頁面的最外層都得
自己留出那段高度。在這之前 **10 個頁面各自編了一個數字**：桌機 90 / 100 / 120px 三種、
窄視窗 60 / 70 / 100px 三種——而 `60px` 那個**等於淨空 0**，內容正好貼著頂欄底邊。

```
--page-top:    var(--space-24)  96px    桌機：頂欄 60 + 淨空 36
--page-bottom: var(--space-16)  64px
@media (max-width: 768px)
--page-top:    var(--space-20)  80px    頂欄 60（≤480 時 56）+ 淨空 20~24
--page-bottom: var(--space-12)  48px
```

⚠️ 值不是折衷出來的，是 **`.nf-page` 本來就在用的那組**（它的註解寫著「上方留 fixed
header 的位置」）。

⚠️ **下緣刻意縮小而不是取中間值。** `.app-footer` 自己有 `padding-top: 8rem`（128px）
的 fade zone，所以原本 `.tk-page` / `.w-page` / `.wl-page` 的 `padding-bottom: 120px`
疊上去是 **248px 的空白**；改成 64px 之後總和 192px。

⚠️ **斷點只有一個（768px）。** 各頁自己的 media query 保留，但**只管左右留白**——
上下交給這兩個 token，不要再在頁面層覆寫（原本有 480/600/640/720/768/1024 六種斷點
各自覆寫上下，那正是三種桌機值的來源）。

⚠️ **寫 CSS 的剖析腳本時，註解要換成等長空白，不要「跳過起點在註解裡的 match」。**
`/* critical: keep sticky working */` 這種含冒號的註解本身長得像一條宣告，而宣告的值
是 `[^;{}]+`——它會一路吃到下一個分號，**把註解後面那條真的宣告整條吞進去**；那個 match
因為起點在註解裡被跳過，而 `finditer` 不重疊，於是後面那條永遠沒被看到。
第一版 codemod 因此漏掉 `article-shell.css` 的 `padding-bottom: 4rem`。

### CSS 的 formatter 與 linter 是 Biome，不是 oxlint

```bash
pnpm lint:css      # 檢查（CI 跑的是這一條）
pnpm format:css    # 自動修格式
```

**Biome 在這個專案只管 CSS。** JS/TS 是 oxlint 的地盤——兩個 linter 管同一批檔案只會
產生互相矛盾的意見，而且 Biome 沒有等價的型別感知檢查，換過去是降級。設定裡
`javascript` 與 `json` 的 formatter 都明確關掉了。

⚠️ `.config/biome.json` 需要 `"root": false`：Biome 看到設定檔不在專案根就當它是
巢狀設定，少了這行會報 "Found a nested root configuration"。
另外 v4 的 `@plugin` / `@custom-variant` 要開 `css.parser.tailwindDirectives`，
否則會被當成語法錯誤。

⚠️ **CI 刻意不加 `--error-on-warnings`**：目前 `pnpm lint:css` 是 **27 個 warning，全部是
`noImportantStyles`**（`noDescendingSpecificity` 已清完，剩 5 處用 `biome-ignore` 標了理由）。
warning 會出現在 CI 輸出但不擋——跟 knip 當初的處理一樣，用 ignore 藏起來就沒有人會回來清。
**格式漂移不一樣，它是 error，會直接讓 CI 紅**（實測：故意塞一個沒排版的規則，
`Found 1 error` 且 exit≠0）。

`noDescendingSpecificity` **不是**在抓「覆蓋失效」——高特異性的規則不管寫在前面還是
後面都會贏，行為是對的。它守的是**可讀性**：覆蓋用的選擇器應該寫在被覆蓋者之後，
否則讀的人要同時在腦中跑「原始碼順序」與「特異性」兩套機制。實測 11 筆的兩邊確實
設到同一批屬性（例如 `.club-icon-wrap` 的 base 寫在 `.open` 狀態之後），但那是排版
問題不是 bug。要清的話是把 base 規則搬到狀態變體前面，純搬移、零行為變化。

### 剩下的 27 個 `!important` 都是查過的，不要再清一次

原本 190 個，清到 27。**剩下的每一個都有註解寫明理由**，看到 linter 報 warning 不要
直接拿掉——先讀那條規則上面的註解。分佈（以 biome 實際回報的位置為準）：

| 類別 | 數量 | 為什麼留 |
|---|---|---|
| `@media (prefers-reduced-motion)` | 8 | 要蓋過全站元件動畫；**測試瀏覽器不會觸發** |
| `html.no-gpu *` | 6 | 無 GPU 機器的降級；⚠ **測試瀏覽器一定會觸發**（見下面） |
| `html.fs-active` | 1 | 全螢幕影片的 GPU 爭用修正；不會被觸發 |
| shiki 背景、`.toc-bottom-link` 邊框 | 4 | 壓 shiki 自己的主題／全域 button 規則 |
| 後台表單邊框、monaco 捲軸與行號 | 6 | 壓 shadcn utility 與 monaco 注入的樣式 |
| `.galaxy-bubble`（手機版） | 2 | 壓元件用 inline style 算出來的泡泡大小 |

⚠️ **不要用 `grep -c '!important'` 數它**——那會數到 42，多出來的 15 筆是**註解裡在
討論** `!important` 的句子，不是宣告。要數就跑 `pnpm lint:css`，biome 認的是語法樹。
同一個坑也會發生在數色彩字面值上。

**壓 inline style 是最常見的正當理由**（shiki、monaco、galaxy-bubble 都是這類）——
inline style 只有 `!important` 蓋得過，這種情況不管 cascade layer 怎麼排都一樣。
判斷「這個 `!important` 是不是多餘」時，先看它要蓋的對象是不是 JS 寫進 `style=""` 的。

### ⚠️ 本機 `pnpm e2e` **不會 rebuild**，它跑的是上一次 `pnpm build` 的產物

`tests/e2e/stack.mjs` 起的是 `node .output/server/index.mjs`——已經建好的 nitro server。
它不呼叫 vite，所以**改完 `src/` 直接跑 e2e，測的還是舊的程式碼**，而且一切正常地綠。

踩過一次而且是最糟的踩法：為了確認新測試有沒有效，故意把 mermaid 的載入改成必定失敗，
跑 e2e 卻**全綠**——差點據此判定「這條測試是空的」而把它刪掉。實際上是變異根本沒進到
跑起來的那份程式。中間補一次 `pnpm build` 之後它立刻紅，而且只紅那一條。

所以：**動過 `src/` 就先 `pnpm build` 再 `pnpm e2e`**。
只改 `tests/`（含 `seed.mjs`、`stack.mjs`）不用重建——那些是 runtime 讀的。
CI 沒有這個問題（workflow 裡 build 是獨立的前置 job）。

改完之後 stack 也要重起才會重新灌種子：`pkill -f tests/e2e/stack.mjs`
（`playwright.config.ts` 本機是 `reuseExistingServer: true`，會沿用還開著的那個）。

⚠️ **有些測試是有狀態的，同一個 stack 不能跑第二次 e2e。** `unsubscribe.spec.ts` 是
`mode: 'serial'`，第三條會**真的把種子裡的 `reader@example.com` 退訂掉**，第四條靠那個
狀態。所以在同一個 stack 上重跑 e2e，那條必定紅（頁面直接顯示「已退訂 ✓」而不是
「確認退訂」）。要重跑就先重起 stack。

⚠️ **不要把 `pnpm e2e` 跟 `pnpm test` 併行跑。** 本機 `workers` 是預設值（吃滿核心）而
CI 刻意壓到 2——`playwright.config.ts` 那段註解量過 `workers=4` 會 3/8 輪崩潰。再疊一個
vitest 上去比那個最壞情況更糟。實際踩過：併行那次冒出一條無法重現的失敗，乾淨環境重跑
209 passed。要平行做事就挑不搶 CPU 的（tsc/oxlint/typos 那種）。

### 樣式回歸有守門：`tests/e2e/computed-style.spec.ts`

跟著 `pnpm e2e` 一起跑（CI 不用另外設），比對 11 個公開頁面 **× 三個寬度**
（1280 / 768 / 390）加上 3 個後台頁面，共 39 組快照、41 個計算後屬性。
改了樣式而它報紅是**正常的**：

```bash
UPDATE_STYLE_BASELINE=1 pnpm exec playwright test computed-style
```

更新後在 PR 說明「為什麼這些元素該變」。基準在 `tests/e2e/computed-style.baseline/`，
一頁一個檔（共用一個檔的話多 worker 會互相覆蓋，而且 diff 會糊成一團）。

⚠️ **三個寬度不是保險，是補一個真的盲區。** 在 2026-09-11 之前這支只跑
1280×720（`playwright.config.ts` 的 `devices['Desktop Chrome']`）而且從不改視窗大小
——也就是**所有 media query 裡的宣告一條都沒被守到**：全站 11388 條宣告裡有
**617 條在 86 個 `@media` 區塊內**。最極端的是 `MobileNav.css` 的 **110 條**，
而整個手機選單在 1280px 是隱藏的。

三個寬度是照站上實際用到的 12 個斷點挑的，每個斷點至少被一個寬度踩到：
`1280 → ≤1300`、`768 → ≤1100/1024/950/900/860`、`390 → ≤768/720/640/600/560/480`。
**1280 那組刻意不加檔名後綴**，既有基準檔名才不用全部改掉。
後台只跑桌機：617 條裡只有 1 條在 `admin/`。

⚠️ **`setViewportSize` 要在 `goto` 之前。** 先導覽的話會先以預設寬度算一次版面，
元件裡看 `window.innerWidth` 的分支（MobileNav 的開合、圖庫欄數）會照舊寬度先跑一輪。

⚠️ 三件讓它能穩定的事，改動時不要拆掉：

1. **排除隨機裝飾背景**（`RandomComets` / `RandomShootingStars` / `RandomUFOs`）——
   它們產生的元素**數量本身是隨機的**，收進來首頁每跑必紅（實測 700 個）。
2. **等 DOM 穩定，不是等固定秒數**。Hero 有 JS 打字機（`useTypingEffect`，延遲 900ms
   開始、每字 80ms），而 **CSS 那條關動畫的規則停不掉 `setInterval`**。
   固定 sleep 500ms 會抓到打到一半的 DOM，間歇性報 34~688 個假變化。
3. **不收這幾個屬性**，每一條都是實際害它在 CI 紅過的：

   | 排除 | 原因 |
   |---|---|
   | `transform` `opacity` | 動畫元素上逐幀不同（framer-motion 用 rAF 寫 inline style，CSS 關不掉） |
   | `filter` `backdrop-filter` | 被 `html.no-gpu` 壓成 `none`，而那個 class 在測試瀏覽器一定會掛 |
   | `width` `height` | `auto` 的解析值取決於文字寬度 |
   | `margin-left` `margin-right` | 同上（`margin: auto` 置中時解出的是「剩餘空間」） |

   後兩類的共通點是**依賴字體度量**，而 CI runner 沒有這台機器上的 CJK 字體
   （MiSans / Noto Sans TC / PingFang TC…），fallback 不同 → 文字寬度不同 → 數字就不同。
   實測 `/setup` 的 `.setup-category-subtitle` 本機 `margin-left` 是 687.906px、CI 不是。

   ⚠️ 要加新屬性之前先測它會不會被字體影響：把全站 `font-family` 換成另一個**比例**
   字體（不要用 monospace——瀏覽器對等寬字有不同的預設字級，會讓 `font-size` 跟著全變，
   em 推導的 padding 也跟著動，測出一堆假陽性）再比一次，只有 `font-family` 該變。

   ⚠️ **然後還要做一次變異測試——「加進去、基準綠」不等於「抓得到東西」。**
   2026-09-10 加 `transition-duration` / `-timing-function` / `animation-duration` 時，
   基準更新完全綠、連跑三次確定性也沒問題，但它們其實**永遠抓不到任何變化**：
   採樣前注入的那條 `transition:none!important; animation:none!important` 是**簡寫**，
   會把 duration 與 timing-function 一起重設，於是 4243 個元素全是同一個 `0s` / `ease`。
   改成 `transition-property:none` / `animation-name:none` 才對——一樣停得住
   （實測首頁仍在跑動畫的元素 0 個），但只動 property/name 那一格，duration 保持作者
   寫的值（首頁相異值從 1 種回到 25 種，跟完全不關動畫時一致）。
   驗證方式是往 `index.css` 塞一條會動到該屬性的規則、**`pnpm build` 之後**再跑
   （不重建的話變異根本沒進到跑起來的程式，見上面 e2e 那節）。

4. **只比對兩邊都存在的 DOM 路徑。** 只出現在一邊的代表結構不同，而 **CSS 改不動 DOM**
   ——那種差異一定來自資料或時序（種子資料的時間戳是相對的，首頁「最近更新」的項目數
   會隨跑的時間變）。忽略它們不會漏掉真回歸：樣式回歸必然是「同一個元素、值變了」。

### 要清 `!important` 的話，這套方法才測得準

⚠️ **像素比對測不準。** 實測噪音底線：`/blog/43` **7810 px**（mermaid 渲染時序）、
`/history` 228 px，而 `/music` 的專輯圖來自 Spotify CDN 根本固定不了。真正的 CSS 變化
會被這些淹掉。改用 **`getComputedStyle` 比對**：它是 cascade 的最終結果，跟圖片載到
第幾張無關。噪音只剩動畫屬性（`transform`/`opacity`）與被 `html.no-gpu` 壓掉的
`filter`/`backdrop-filter`，過濾掉就是確定性的。

⚠️ **`prefers-reduced-motion` 與 `html.fs-active` 在測試環境不會套用**，所以那兩類
「量到 0 差異」不代表安全，要靠讀規則判斷。

⚠️ **但 `html.no-gpu` 會套用，而且是反過來的問題。** 無頭 Chromium 就是軟體渲染，
`SpaceBackdropShell` 的 `isSoftwareRenderer()` 一律為真 → 那個 class 一定掛上去
（實測 12 條路由 × 3 次全部 no-gpu=Y）。後果是 `html.no-gpu *` 把**每一個元素**的
`backdrop-filter` 壓成 `none !important`，光暈類的 `filter` 也一樣。所以：

- 量 `backdrop-filter` / `filter` 時要先 `document.documentElement.classList.remove('no-gpu')`，
  否則量到的是降級後的畫面，不是使用者看到的。
- **這兩個屬性也因此不能收進 `computed-style` 的 PROPS**：基準會把「這台 runner
  沒有 GPU」寫死進去，而且那個 class 是 lazy + ClientOnly **非同步**掛的，
  快照拍到掛上前還是掛上後不保證。詳見那支 spec 裡 PROPS 上面的說明。

⚠️ **`:hover` / `:focus` 也要主動觸發。** 靜態截圖與靜態 computed style 都碰不到。
做法是從 CSS 反推「哪些選擇器 × 哪些狀態」帶著 `!important`，再逐一 hover/focus。
切狀態前要先關掉 transition，否則抓到的是過渡中的中間值。

⚠️ **base 用了 `!important`，狀態變體就必須跟著用。** 只補一半的下場是 base 反過來
蓋掉 `:hover`/`:focus`——滑過去完全不變色，而靜態截圖看不出來。實際踩過。

⚠️ **後台要驗就起 e2e stack**（`node tests/e2e/stack.mjs`），照
`tests/e2e/admin-session.ts` 自己簽一個 OWNER token 塞 localStorage，
不需要碰正式環境的任何密鑰。但注意**每次重啟 stack 會重灌種子**，
`/admin/subscribers` 的表格欄寬會跟著變（`table-layout: auto` 依內容分配）——
那不是 CSS 回歸。噪音對照要「重啟 stack 之後再比一次」才有意義。

## CI 門檻（跟這些指令一字不差，不要自己改寫）

前端：

```bash
pnpm exec tsc --noEmit
pnpm --filter @koimsurai/mcp-server typecheck
pnpm typecheck:server
pnpm typecheck:scripts
pnpm exec oxlint --type-aware --tsconfig=tsconfig.json src --max-warnings 0
pnpm exec oxlint scripts server packages --max-warnings 0
pnpm lint:css      # biome，只管 CSS
pnpm check:format  # oxfmt，只管 JS/TS
pnpm test          # vitest
pnpm build         # vite + nitro
```

⚠️ **`oxfmt` 排的不是只有 js/ts——它也會排 css / json / md**，所以 `.oxfmtrc.json`
把這三類都列進 `ignorePatterns`。每一條都是實際撞到才加的，不要以為是保守而拿掉：

| 排除 | 拿掉會怎樣 |
|---|---|
| `**/*.css` | 那是 biome 的地盤，而兩邊 quoteStyle 相反（biome 雙引號、oxfmt 單引號）→ `pnpm lint:css` 一次冒出 32 個 error |
| `**/*.json` | 會重排 `tests/e2e/computed-style.baseline/` 那 15 個機器產生的基準檔 |
| `**/*.md` | 會用字元數把中文表格撐開對齊，CJK 寬度對不上，純雜訊 |

⚠️ **pre-commit 裡 oxfmt 要排在 oxlint 之後。** 它會把單行的 `if (x) { a; return; }`
展開成多行，而 `// eslint-disable-next-line` 只蓋下一行——展開之後違規就跑到抑制範圍
外了。導入那次一次撞到 6 處，`tsc` 與 `build` 全綠，只有 `--max-warnings 0` 抓得到。

⚠️ 導入 oxfmt 的那筆 218 檔格式化在 `.git-blame-ignore-revs` 裡。本機要生效得設一次
`git config blame.ignoreRevsFile .git-blame-ignore-revs`（GitHub 會自動讀）。

⚠️ **`vite` 釘死在 8.0.16，不要升。** 8.2.2 會讓 Excalidraw 的字型 subsetting 那條
路徑進到 bundle，而它用 `eval` —— 全站 CSP 沒有 `'unsafe-eval'`，於是瀏覽器擋掉、
console 冒出 `Skipped glyph subsetting EvalError`。抓到它的是
`tests/e2e/mdx-blocks.spec.ts` 的「這些資源被 CSP 擋掉了」那條斷言；
`tsc` / `oxlint` / `build` 全部都是綠的，**只有 e2e 看得到**。
真要升就得先確認 Excalidraw 那條路徑不再需要 `eval`，或改成不載字型 subsetting。

⚠️ **`oxlint` 也釘在 lockfile 的 1.75.0。** 1.80 預設開了一組 React Compiler 診斷
（`react(purity)` / `react(refs)` / `react(immutability)` /
`react(preserve-manual-memoization)` / `react(incompatible-library)`），一次冒出 25 個
warning，而 CI 是 `--max-warnings 0`。這個專案**沒有在跑 React Compiler**
（`babel-plugin-react-compiler` 在 devDependencies 但沒接進任何 build），所以那組診斷
談的是一個不存在的最佳化器。要升 oxlint 就得先在 `.oxlintrc.json` 明確關掉它們。

### 這幾個相依刻意釘死，Dependabot 開 PR 也不要合

`package.json` 裡沒有 `^` 的那些不是手滑，是驗證過會壞。每一條都附了「要升的前提」，
條件成立之前不用重試——下面的結論都是實測出來的，不是看 changelog 猜的。

⚠️ **這些同時也寫進 `.github/dependabot.yml` 的 `ignore`**，所以**不會再有 PR 提醒你**。
解除條件成立與否要**人主動去看**（例如 `monaco-vim` 出新版時順手試一次 `monaco-editor`）。
選擇忽略而不是每週關掉幾個 PR，是因為固定收到「確認過不能合」的通知，久了就沒有人
會認真看任何一個——但代價就是這裡沒有人來讀的話，它會一直卡著。

| 套件 | 釘在 | 升上去會怎樣 | 解除條件 |
|---|---|---|---|
| `vite` | 8.0.16 | Excalidraw 字型 subsetting 用 `eval`，撞 CSP | 該路徑不再需要 `eval` |
| `oxlint` | 1.75.0（lockfile） | 25 個 React Compiler 診斷撞 `--max-warnings 0` | `.oxlintrc.json` 先關掉那五條 |
| `react-icons` | 5.5.0 | 5.7 移除 `SiOpenai`、`SiCss3` 改名 → tsc 紅 | 先決定 `/about` 的 GPT 用什麼圖示 |
| `monaco-editor` | 0.55.1 | 0.56 的 `exports` 收窄，`monaco-vim` 0.4.4 被擋 | `monaco-vim` 跟上，或換掉它 |
| `@tanstack/react-router` `@tanstack/react-start` `@tanstack/react-query` | 各自現值 | 傳遞相依 `router-core` / `start-plugin-core` 跟著浮，SSR 的 query 串流壞掉（20 條 smoke 全紅） | 整組一起升並確認串流相容 |
| `@radix-ui/react-select` `-separator` `-slot` `-switch` | 各自現值 | **單獨升每一個都過，四個一起升就壞**：21 個共用 primitive 跟著浮，後台編輯器打字掉字 | 找出是哪個 primitive |

⚠️ **Radix 那條是這裡最值得記的一個形狀**：逐一驗證全綠、組合起來才壞。而且唯一抓得到
它的是 `tests/e2e/post-editor.spec.ts` 的「語系分頁」那一條——47 條 smoke、`tsc`、
`build` 全部沉默。升相依時「一個一個測都過」不構成「一起升沒問題」。

### 覆蓋率有三個數字，量的是不同的東西

| Codecov flag | 量什麼 | 目前 |
|---|---|---|
| `frontend` | **單元測試**（vitest）走過多少 `src/` | ~41% |
| `e2e` | **206 條 Playwright** 走過多少 `src/` | ~77% |
| `backend` | cargo-llvm-cov | ~93% |

⚠ **`frontend` 那個數字低不代表「幾乎沒測」。** 它的分母有**八成是 React 元件**
（5468/6970 行），而元件的渲染路徑本來就是 e2e 在守。要提升它得寫 jsdom 測試去複製
e2e 已經在做的事，投報率很差。純邏輯的部分目前是 `src/lib/` 59%、`src/data/` 64%、
`src/seo/` 69%——挑檔案時看「壞了會不會有人發現」比看百分比有用。

e2e 的覆蓋率是 `tests/e2e/fixtures.ts` 收 V8 coverage、`scripts/e2e-coverage-report.mjs`
轉成 lcov 的。⚠ **多份 dump 的合併一定要用 `@bcoe/v8-coverage` 的 `mergeScriptCovs`，
不要自己寫**——同一個函式在不同 dump 裡的 range 數量會不一樣（V8 只為「count 與父層
不同」的區塊開 range），自己寫的版本曾經把 105664 筆帶著命中的資料靜靜丟掉，
整體數字被壓低 21.5 個百分點（Comments.tsx 顯示 7%、實際 82%）。細節見那支腳本的檔頭。

**所有 spec 都要從 `./fixtures` import `test`／`expect`，不要直接 import
`@playwright/test`**（型別可以）——直接 import 的那支就不會被計入。
沒設 `E2E_COVERAGE_DIR` 時 fixture 完全不做事，本機跑 e2e 不會多付成本。

⚠ **Stryker 的沙箱會吃掉整顆硬碟，如果沒設 `ignorePatterns`。** 它把整個專案複製到
`.stryker-tmp/sandbox-XXXX`，而**預設排除清單只有 node_modules / .git / reports，它不讀
`.gitignore`**——所以 `target/`（Rust 建置產物）會被整包複製。實測一次跑完留下 **115 GB**，
其中 114 GB 是 target。設定裡已經列好排除清單，**新增大型產物目錄時要同步加進去**。
另外 `cleanTempDir: "always"`：預設只在成功時清，而中止（逾時、Ctrl-C、設定錯誤）留下的
那幾個沙箱正是最大的。cargo-mutants 沒有這個問題（`mutants.out` 只有 log 與 diff，不到 10 MB）。

⚠ 變異測試會讓 `target/` 快速膨脹（每個變異都是一次不同的編譯，cargo 不會回收舊產物）。
`target/debug/incremental` 與 `target/llvm-cov-target` 是純快取，刪掉只是下次重建慢一點。

⚠ 變異測試（`pnpm mutate`，Stryker）只跑 `src/lib/`，**不接 CI**，定位同
`.cargo/mutants.toml`：拿來找洞的工具，不是門檻。覆蓋率不等於測試有效——
第一次跑就在剛寫完的測試裡找到 42 個沒被殺掉的變異，全是邊界值。

後端（`cd backend`）：

```bash
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo llvm-cov nextest --locked --fail-under-regions 78   # 門檻以 ci.yml 為準
# specta：改過會進 API 的 struct 就要重跑 export_types 並提交，否則 drift gate 會擋
```

### clippy 的規則在 **根目錄 `Cargo.toml` 的 `[workspace.lints.clippy]`**

不是預設的那五組。開的是 `pedantic` 整組 + 六條個別挑進來的 nursery
（`or_fun_call`、`significant_drop_in_scrutinee`、`significant_drop_tightening`、
`redundant_clone`、`missing_const_for_fn`、`use_self`）。`backend/Cargo.toml` 用
`[lints] workspace = true` 繼承——**新增 crate 時要記得寫這一行，忘了不會有錯誤訊息，
那個 crate 就是完全沒有 lint**。

⚠️ **nursery 整組不要開**：`option_if_let_else`（56 個）這類公認會讓程式更難讀的都在
裡面。**`clippy::cargo` 也不要開**：246 個全是 `cargo_common_metadata` /
`multiple_crate_versions`，對私有 binary 沒有意義。**`restriction` 更不能整組開**
（連「不准用 `else`」都在裡面），只個別挑：`todo` / `unimplemented` / `dbg_macro` /
`print_stdout` / `print_stderr` 是 deny，因為現存數量本來就是 0，等於純畫一條線。

### `unwrap_used` 寫在 crate root，不在 `[workspace.lints]`

`src/lib.rs`、`src/main.rs`、`src/bin/export_types.rs` 各有一行 `#![deny(clippy::unwrap_used)]`。
**不要「順手」把它搬進 `Cargo.toml`**——那是 package 層級的，會連 `tests/` 一起管。

而 `clippy.toml` 的 `allow-unwrap-in-tests` 救不了那些：它認的是 `#[cfg(test)]` 與
`#[test]`，`tests/common/mod.rs` 那種**非 `#[test]` 的 setup helper** 兩者都不是
（實測搬進 `[lints]` 會剩 20 個擋在 5 個測試檔裡）。寫在 crate root 才精確涵蓋正式碼。

`expect_used` 刻意**不開**：`.unwrap()` 是「沒想過會不會失敗」，`.expect(m)` 是「我斷言
它不會失敗，理由是 m」——後者留著當有文件的逃生口。正式碼原有的 10 個 unwrap 全是
`LazyLock` 裡的 `Regex::new(字面值)`，已換成帶訊息的 expect。

⚠️ `clippy.toml`（repo 根目錄）放的是 lint 的**設定值**，開關在 `Cargo.toml`。兩個檔案
要一起看。裡面有兩區：五個 `allow-*-in-tests`（`unwrap_used` 能開起來的前提——CI 是
`-D warnings`，**warn 在合流那一刻等同 deny**，所以「只設 warn 讓測試能用」行不通），
以及 `disallowed-types`。

### 鎖的選擇是編譯期規則，不是約定

`clippy.toml` 的 `disallowed-types` 擋掉 `std::sync::Mutex` / `RwLock`。**同步鎖一律
`parking_lot`，要跨 `await` 持有才用 `tokio::sync`**（後者不擋）。

現況：`parking_lot::Mutex` 11 處、`tokio::sync::Mutex` 18 處、`std::sync` 0 處、
`.lock().unwrap()` 0 次。`state.rs` 開頭那句「短臨界區、不跨 await 持有」的不變條件現在
有東西守著了——在這之前它只是一行註解。

（`disallowed_types` 屬於 `style` 組、已含在 `all` 裡，所以只要寫設定值、不用另外開 lint。）

⚠️ 那九條 `allow` 每一條都標了導入當下的數量與理由，**要拿掉之前先讀理由**。最大宗是
`doc_markdown`（468 個），它要求中文註解裡的 Express / SQLite 這些字加反引號。

⚠️ **clippy 不是永遠對的，這四類照著改會壞**（都留了 `#[allow]` + `reason`）：

| 位置 | clippy 說 | 為什麼不能照做 |
|---|---|---|
| `books.rs` `serialize_rating` | `&Option<f64>` → `Option<&f64>` | 簽名是 serde `serialize_with` 的契約，改了編不過 |
| `tests/schema.rs` 的 `r##` 字面值 | 減一層 hash | 內容本身含 `"#`，減了字串提早結束（實測 unclosed delimiter） |
| `spotify_callback` 的 `HashMap` | 加 `S: BuildHasher` 泛型 | axum handler 帶泛型就推不出 `Handler` impl，註冊不進 router |
| 幾何／演算法內部的 cast | 用 `try_from` | 值域是**證得出來**的（`civil_from_days`、只縮不放的 `fit_inside`、已 `clamp` 的百分比） |

⚠️ 2026-07-11 遷移時那次 audit（`backend/STRANGLER.md`「統一 audit」）是**人工**照 20 條
反模式表掃的，規則沒被固化，所以此後新寫的程式有將近一年沒有把關——2026-08-30 補設定時
一次冒出 534 個。**設定檔比一次性的 audit 重要**。

⚠️ **跑測試一律用 `cargo nextest run --no-fail-fast`。`cargo test` 在這個專案是壞的，
不要拿它的結果下任何判斷。**

差別不是輸出好不好看：nextest 是**一個測試一個行程**，`cargo test` 是同一個行程平行跑
執行緒。而這裡有十幾個測試檔直接寫 process 全域的 `std::env::set_var`（gallery 的輸出
目錄、bahamut 的 cookie、mailer/oauth/watch/simkl 的金鑰…），外加 `QUOTE_CACHE`、
`STARS_CACHE`、`GALLERY_SYNC_LOCK` 這些全域 static。同行程平行跑就是互相蓋。

症狀是**隨機幾條紅、每次紅的還不一樣**，看起來完全像「測試本身會抖」。我為此誤判過
三次，還向使用者回報了三組不存在的「既有失敗」。實際上 nextest 下是 580/580，連跑
三次全綠。

`--no-fail-fast` 也不是可選的：少了它，nextest 第一個失敗就中止，`580 tests run` 會變成
`470/580`、每次的數字還不同——那個變動本身又會被誤讀成不穩定。

沒有任何地方需要 `cargo test`：CI 走 `cargo llvm-cov nextest`，cargo-mutants 也已經在
`.cargo/mutants.toml` 設了 `test_tool = "nextest"`（那份設定裡就記著同一個坑）。

⚠️ **還有兩道在 repo 根目錄跑、很容易漏掉的門檻**（Backend job 裡排在 fmt 之前）：

```bash
cd .. && typos          # 錯字；白名單在 .typos.toml
cd .. && cargo shear    # 未使用的 Rust 相依
```

`typos` 會掃**變數名**，不是只掃註解與字串。實際擋過：把 `NaiveDate` 的區域變數取了個
兩字母縮寫名，它判定那是某個英文字漏字母 → Backend job 直接紅，而 fmt/clippy/測試全綠。
命名時避開看起來像英文字缺字母的兩字母縮寫，寫完整的字。

⚠️ 它掃**整個 repo**，`.md` 也在內——包含用來說明這件事的文件本身。所以這裡刻意不把
那些會被判定成錯字的字面寫出來；要寫就得進 `.typos.toml` 白名單，而那個白名單只放
真正被誤報的字，不該為了寫說明而放寬。**一定要 `cd` 到 repo 根目錄跑**，在 `backend/`
底下跑會漏掉根目錄的 `.md` 與 workflow 檔（這個錯我犯過一次）。

⚠️ **`cargo audit` 要在 repo 根目錄跑，不是 `backend/`。** `Cargo.lock` 在 workspace root
（根目錄的 `Cargo.toml` 是 `[workspace] members = ["backend"]`），在 `backend/` 下跑會得到
`error: not found: Couldn't load Cargo.lock`。

```bash
cd .. && cargo audit    # 目前剩 1 個 allowed warning（paste unmaintained），exit 0
```

**覆蓋率不等於測試有效。** `cargo mutants --file <單檔>` 約 4 分鐘，判準是「錯了會不會安靜
地錯」——實例：`handlers/vitals.rs` 覆蓋率 98.67%，變異分數卻只有 43%，抓出「驗證鏈的 `&&`
全部可換成 `||` 而測試照樣綠」與「p75 的 offset 算式可任意改動」兩個洞。設定與使用時機寫在
`.cargo/mutants.toml`。**不要全 repo 跑**（三個半小時，且結果會被沒打算測的整合層稀釋）。

⚠️ **這個專案用 oxlint，不是 eslint。** 跑 `pnpm exec eslint` 會失敗（沒有 eslint config），
而且曾經有人（AI）一整個 session 都在跑錯的 linter 卻以為自己在驗證。

⚠️ **`--max-warnings 0`。** 存量警告已經清空，不要讓它回頭長回來。
`pnpm lint` 這個 script 沒帶門檻，別拿它當 CI 的代理指標。

`scripts/hooks/pre-commit` 會依暫存檔類型條件觸發上面最常爆的那幾項（ts/tsx → tsc + oxlint；
`backend/*.rs` → clippy）。commit 前不必自己重跑一遍。

## 部署

```bash
docker compose up -d --build            # 前後端都重建
docker compose up -d --build frontend   # 只動前端時
```

使用者已授權助手直接執行部署，不需要每次徵詢。

⚠️ **`VITE_RELEASE` 沒帶的話 SDK 不會帶版本標記**（功能仍正常，只是 GlitchTip 上的
issue 歸不到某次部署）。要帶就 `VITE_RELEASE=$(git rev-parse --short HEAD) docker compose …`。

source map 是**在 build 裡**處理掉的（見 Dockerfile）：烙 debug id → 上傳到 GlitchTip →
從映像刪掉 `.map`。三件事都綁在建置裡，所以不存在「忘記傳」或「順序錯」的問題。
token 走 BuildKit secret（`.env.sourcemaps.token`，未提交）。

⚠️ **GlitchTip 掛著時 build 會失敗**，這是刻意的：靜靜跳過上傳等於錯誤追蹤白裝，
而那不會有人發現。真的要在它掛掉時部署，把 `.env.sourcemaps.token` 清空即可（會改走
「跳過」分支）。

⚠️ vite 的 `sourcemap: 'hidden'` **只拿掉 sourceMappingURL 註解，不會阻止 .map 被供應**。
實測過 `/assets/*.js.map` 直接 200。所以 Dockerfile 那步 `find ... -delete` 是必要的，
不是清潔癖。

⚠️ 資產檔名帶 content hash，重新部署後舊 hash 會 404。目前 CDN 沒有快取 HTML 所以無妨；
**若哪天讓 CDN 快取 HTML，部署後必須清 CDN 快取**（等新容器 healthy 之後才清）。

## 內容管理

部落格 CMS 一律透過 `koimsurai_*` MCP 工具操作，不要直接 curl admin API。
送出 MDX 前先跑 `koimsurai_validate_mdx` —— MDX 編譯失敗在前台是**靜默退回 markdown**
（讀者看到裸標籤），而 create/update 仍然回 success，不驗就沒人知道寫壞了。
