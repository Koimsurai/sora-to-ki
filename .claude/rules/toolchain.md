---
paths:
  - "package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - "vite.config.ts"
  - "vite.config.start.ts"
  - ".github/dependabot.yml"
  - ".github/workflows/**"
  - "Dockerfile"
  - "scripts/sync-nitro-asset-manifest.mjs"
---

# 工具鏈與相依套件守則

## 工具鏈是 Vite+（`vp`）

vite / vitest / oxlint / oxfmt 都由 `vite-plus` 一個相依提供（`pnpm-workspace.yaml` 的
`catalog`，`vite` 被別名成 `@voidzero-dev/vite-plus-core`），**`node_modules/.bin` 裡沒有
`vite`、`oxlint`、`oxfmt`**——直接跑那些指令會找不到，一律走 `pnpm exec vp …`。
`vp lint` 的輸出開頭那句 `note: You are running vp lint as a Vite+ built-in command` 是雜訊。

設定分三個檔，**不要合併**：

| 檔案 | 管什麼 |
|---|---|
| `vite.config.ts` | **只有** lint 與 fmt |
| `vite.config.start.ts` | 建置與 dev（TanStack Start + Nitro） |
| `vitest.config.ts` | 單元測試 |

**`vp migrate` 會整批丟掉它不認識的 plugin 命名空間底下的規則**，含 overrides 裡的；jsPlugins
的註冊還在，所以 lint 照樣 exit 0。遷移或升級後一律放一個必然違規的探針檔（例如 `bg-[#333]`），
確認每一類規則（含 `shadcn/*`）都真的會報。它也會自己加上全域的 `typeAware` / `typeCheck`——
不要留：型別感知由 CI 指令的 `--type-aware` 決定，`typeCheck` 等於再跑一次 tsc。

**scripts / server / packages 也是型別感知。** tsgolint 會替每個檔案找最近的 tsconfig；
只有 `.mjs` 拿不到型別，所以只對 JS 檔關掉 8 條依賴型別的規則（`vite.config.ts` 的 overrides），
TS 檔全開。
**`a || b` 被 `prefer-nullish-coalescing` 報、但 `||` 是刻意的（空字串也要退回預設）時**，
寫成 `(a ?? '') || b`——跟 `src/lib/postPath.ts` 同一個寫法，不要為此放寬規則。

**`oxfmt` 排的不是只有 js/ts——它也會排 css / json / md**，所以 `vite.config.ts` 的
`fmt.ignorePatterns` 把這三類都列進去，不要拿掉：

| 排除 | 拿掉會怎樣 |
|---|---|
| `**/*.css` | 那是 biome 的地盤，而兩邊 quoteStyle 相反（biome 雙引號、oxfmt 單引號）→ `pnpm lint:css` 大量報錯 |
| `**/*.json` | 會重排 `tests/e2e/computed-style.baseline/` 裡機器產生的基準檔 |
| `**/*.md` | 會用字元數把中文表格撐開對齊，CJK 寬度對不上，純雜訊 |

**pre-commit 裡 oxfmt 要排在 oxlint 之後。** 它會把單行的 `if (x) { a; return; }`
展開成多行，而 `// eslint-disable-next-line` 只蓋下一行——展開之後違規就跑到抑制範圍外了，
`tsc` 與 `build` 都抓不到，只有 `--max-warnings 0` 抓得到。

oxfmt 的全庫格式化 commit 列在 `.git-blame-ignore-revs`。本機要生效得設一次
`git config blame.ignoreRevsFile .git-blame-ignore-revs`（GitHub 會自動讀）。

## 建置設定裡不能拿掉的兩段

**`vite.config.start.ts` 的 `codeSplitting` 群組。** 沒有它，rolldown 會把 Excalidraw 預先切好的
幾個小 chunk 併進它 1.1 MB 的主程式，而字型 subsetting 的 Web Worker 正好依賴它們——worker
只好 import 整包主程式、在 Worker 環境載入失敗，Excalidraw 退回主執行緒做 subsetting，那段 wasm
膠水碼用 `new Function`，撞上 CSP 沒有的 `'unsafe-eval'`（console：`Skipped glyph subsetting EvalError`）。
抓得到它的只有 `tests/e2e/mdx-blocks.spec.ts` 的「這些資源被 CSP 擋掉了」那條斷言。看 worker
有沒有被弄壞：建置後 `head -c 300 .output/public/assets/subset-worker.chunk-*.js`，開頭不該 import `prod-*.js`。

**那個群組只能抓葉節點**（沒有 import 的 chunk）。抓到有相依的 chunk 時，群組會連同相依一起拉進來，
共用套件被吸進 Excalidraw 的 chunk，每一頁的 script 量倍增——e2e 全綠，只有 Lighthouse 的
resource-summary 預算抓得到。

**`vite.config.start.ts` 的 `define: { define: 'undefined' }`。** 後台的 Monaco 用 AMD 載入，會在
window 留一個帶 `amd` 的 `define`；切到前台之後，Excalidraw / mermaid-to-excalidraw 底下幾個
「先看 AMD 才看 CommonJS」的 UMD 套件就去呼叫它，Sketch 區塊顯示
`Can only have one anonymous define call per script file`。**只在「先開過後台」的分頁發生**，乾淨的
瀏覽器看不到。守它的是 `sketch-after-admin.spec.ts`，而且那條**必須用有虛線箭頭與標籤的圖**，
`A --> B` 那種簡單圖走不到那幾個套件。SketchBlock 會接住例外改顯示錯誤框，所以這類錯誤**不會進 GlitchTip**。

**`vite.config.ts` 的 lint 區塊裡關掉的那五條 `react/*` 不要打開。** 那是 oxlint 預設開的 React
Compiler 診斷（`purity` / `refs` / `immutability` / `preserve-manual-memoization` /
`incompatible-library`），而這個專案**沒有在跑 React Compiler**（`babel-plugin-react-compiler`
在 devDependencies 但沒接進任何 build），那組診斷談的是一個不存在的最佳化器。

## 這幾個相依刻意釘死，Dependabot 開 PR 也不要合

`package.json` 裡沒有 `^` 的那些不是手滑，是驗證過會壞。每一條都附了「要升的前提」，
條件成立之前不用重試。

**這些同時也寫進 `.github/dependabot.yml` 的 `ignore`**，所以不會有 PR 提醒。解除條件成立與否
要**人主動去看**（例如 `monaco-vim` 出新版時順手試一次 `monaco-editor`）。

| 套件 | 釘在 | 升上去會怎樣 | 解除條件 |
|---|---|---|---|
| `react-icons` | 5.5.0 | 5.7 移除 `SiOpenai`、`SiCss3` 改名 → tsc 紅 | 先決定 `/about` 的 GPT 用什麼圖示 |
| `monaco-editor` | 0.55.1 | 0.56 的 `exports` 收窄，`monaco-vim` 0.4.4 被擋 | `monaco-vim` 跟上，或換掉它 |
| `@tanstack/react-router` `@tanstack/react-start` `@tanstack/react-query` `@tanstack/react-router-ssr-query` | 各自現值 | 傳遞相依 `router-core` / `start-plugin-core` 跟著浮，SSR 的 query 串流壞掉 | 整組一起升，並照下面的檢查走完 |
| `@radix-ui/react-select` `-separator` `-slot` `-switch` | 各自現值 | **單獨升每一個都過，四個一起升就壞**：共用 primitive 跟著浮，後台編輯器打字掉字 | 找出是哪個 primitive |

**升 TanStack 那組（或任何會動到 nitro / rolldown 產出的相依）時：**
- 跑**完整** e2e，不要只看 smoke。升級可能改變 CSS 排進 `<head>` 的順序：兩個檔各寫一條同特異性的
  同名規則時，勝負會跟著換，只有 computed-style 抓得到。
- **部署前先在旁邊的 port 跑一次 image**：e2e 與 CI 都不走 Dockerfile。server 產物的 minifier 可能把
  整千的數字寫成 `19e3`，而 `scripts/sync-nitro-asset-manifest.mjs`（Dockerfile 在 sentry inject 之後跑）
  的正規式只認 `\d+`，漏修的那支 size 會讓 nitro 切斷回應、整站白畫面。檢查方式：
  `docker compose build frontend` → `docker run -p 127.0.0.1:14557:13579 -e BACKEND_URL=https://koimsurai.com web-frontend:latest`
  → 比對每支 `/assets/*` 的 `curl` 大小與檔案大小。

**Radix 那條的形狀最值得記**：逐一驗證全綠、組合起來才壞，而且唯一抓得到它的是
`tests/e2e/post-editor.spec.ts` 的「語系分頁」那一條。升相依時「一個一個測都過」不構成「一起升沒問題」。
