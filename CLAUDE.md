# koimsurai / sora-to-ki — 給 AI 助手的工作守則

依領域拆出的守則放在 `.claude/rules/`，讀寫對應檔案時才會載入：

| 檔案 | 管什麼 | 碰到這些檔案時載入 |
|---|---|---|
| `css.md` | 設計 token、調色盤、z-index、`!important`、`@shadcn/lint` | `src/**/*.css`、`src/**/*.tsx` |
| `testing.md` | e2e（不會 rebuild）、computed-style 基準、覆蓋率、變異測試 | `tests/**`、測試設定、`*.test.ts(x)` |
| `toolchain.md` | Vite+（`vp`）、釘死的相依套件、升級前的檢查 | `package.json`、`vite.config*.ts`、Dockerfile、workflow |
| `backend.md` | clippy、`unwrap_used`、鎖、nextest、cargo-mutants | `backend/**`、`Cargo.toml`、`clippy.toml` |

## 工具選擇

哪件事該用哪個工具。工具輸出會整份進 context，用錯工具最直接的代價是 context 被原始輸出佔滿。

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
`lighthouse_audit`、`list_network_requests`、heap snapshot 系列。

**`playwright` 只在一件事上不可取代**：**獨立 context**（`browser.newContext()`）。
chrome-devtools 只有 `new_page`、共用 profile，history 與快取會讓數字看起來比實際好。要量
「首次造訪」就必須有乾淨環境。（`--isolated` 只在 server 生命週期層級隔離，不是每次測試。）

> 導覽前注入腳本不是差異點——`navigate_page` 有 `initScript` 參數，等同 `addInitScript`。

**`performance_start_trace` 的 `reload: true` 有陷阱。** 它自己的重載**不帶捲動還原**，
量文章頁的數字會偏低；要重現「捲在深處按 F5」必須 `reload: false` + `autoStop: false`，
自己 `evaluate_script` 捲好、`navigate_page(type: reload)`、再 `performance_stop_trace`。

**它測得到、不一定解釋得了。** CLSCulprits 只認得字體、圖片無尺寸、動態插入這類標準模式，
其他情況會回「No potential root causes identified」。這時讀 **`LayoutShift.sources`**：每個來源
都帶 `previousRect` / `currentRect` 與 `node`，直接回答「哪個元素、動了多少」，再配上逐幀的
docH / scrollY 就追得到源頭。

**`sources` 的 rect 是「視窗座標下的可見矩形」，不是版面高度。** 元素被裁切時
`height` 的差值會很大，但那不代表它的版面高度變了——照著追會追錯方向。
要判斷「誰長高了」得自己逐幀量 `getBoundingClientRect().height`。

**文章圖片必須帶 `width`/`height`。** `.blog-image-wrapper` 是 `width: fit-content`，圖還沒載入時
寬高都是 0，載入後撐開會造成整片位移（只在「捲在深處按 F5」時被計入 CLS）。尺寸在上傳時寫進
網址片段 `#th=<hash>&w=<寬>&h=<高>`（`handlers/upload.rs` 的 `compute_image_meta`），前端用
`decodeSizeFromSrc` 解出來。新增圖片相關路徑時要保住這條鏈。

**Lighthouse 測不出實地才有的問題。** 它永遠是冷啟動、無 history、單頁直接載入，
而文章頁真正的 CLS 只在「重新整理且捲在深處」時出現，任何「載入一次量一次」的工具都抓不到。
實地歸因靠 `web_vitals` 表的 `target` / `shift_path` 兩欄（見 migration 0010/0011）。

**查實地數據時一律加 `path NOT LIKE '/admin%'`。** 上報端現在擋掉後台（`reportWebVitals.ts`
的 `send()`），但表裡還有更早的後台資料，不排除的話 CLS p75 會被明顯拉高。

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
| `layout/` | 站台外框：AppShell、SiteNav（頂欄＋懸停選單 NavMenus）、TransitionLayer（換頁轉場與開場）、命令面板、右鍵選單、404 |
| `backdrop/` | 星空背景：SpaceBackdropShell 那條線底下（StarfieldGpu、CSS 星空、星雲） |
| `home/` | 首頁：MainPage、HomeOrbit（土星與近況） |
| `about/` | 關於與資訊頁：關於（AboutFall）、作品、設備、朋友、留言、航行日誌、此站點（Colophon）；各頁的畫布在同名的 `*Sky.ts` |
| `blog/` | 手記、文章與碎念：Notes、BlogPost（＋OrbitToc、ArticleFrame）、Thinking；留言共用件（CommentForm、SignalLog）也在這裡 |
| `mdx/` | MDX 渲染與所有 block 元件（新增 block 要同時改 `mdx-blocks-registry.ts`） |
| `gallery/` | 照片：Photos（地面站）、PhotoViewer、EXIF、圖片檢視 |
| `media/` | 收藏：Collection（在看、在讀、在聽）、FavoritesEditor |
| `account/` | 登入回呼、電子報退訂 |
| `common/` | 跨領域共用：KoimLoader、LinkCard、SignatureSVG |
| `ui/`、`animate-ui/` | shadcn 與 animate-ui 產生的檔案，**不要手動整理**（oxlint 與 knip 都有針對這兩個路徑的設定） |
| `admin/`、`monaco-editor/` | 原本就分好的，維持原樣 |

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
| `lib/mdx/` | MDX 編譯鏈：`mdx-compile-core`（plugin 組態）、`codeHighlight`（程式碼高亮）、`blogContent` |
| `hooks/` | React hook |
| `store/` | jotai atom 與訂閱式狀態 |
| `contexts/`、`types/`、`schemas/`、`styles/`、`workers/` | 各一類，維持原樣 |

不要為了「檔案少」再開新目錄，也不要把單檔目錄併掉：`schemas/`（zod）、`styles/`（CSS）、
`workers/`（vite 的 worker 慣例）各自是明確的一類，單檔不代表是雜檔。真正該避免的是
讓 `lib/` 變成「什麼都往裡丟」：hook 放 `hooks/`、MDX 編譯放 `lib/mdx/`，`lib/` 只放純工具。

**搬檔時 tsc 抓不到的兩類引用**：

1. `new URL('...', import.meta.url)` 裡的 worker 路徑——vite 靠靜態分析這個字面字串才認得出
   worker 進入點，所以它**必須是相對路徑**、不能換成 `@/`，而搬檔後要自己算對層數。
2. 腳本裡硬編的檔案路徑字串（例如 `scripts/mdx-block-names.ts` 用 regex 讀註冊表）。

改完結構後除了 tsc，一定要跑 `pnpm test` 與 `pnpm build`——上面兩類只有它們抓得到。

設定檔集中在 **`.config/`**（nextest、knip、lighthouserc、schemathesis、builder、biome）。
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

## CI 門檻（跟這些指令一字不差，不要自己改寫）

前端：

```bash
pnpm exec tsc --noEmit
pnpm --filter @koimsurai/mcp-server typecheck
pnpm typecheck:server
pnpm typecheck:scripts
pnpm exec vp lint --type-aware --tsconfig=tsconfig.json src --max-warnings 0
pnpm exec vp lint --type-aware scripts server packages --max-warnings 0
pnpm lint:css      # biome，只管 CSS
pnpm check:format  # vp fmt（oxfmt），只管 JS/TS
pnpm test          # vp test（vitest 5）
pnpm build         # vp build（vite + nitro）
```

後端（`cd backend`）：

```bash
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo llvm-cov nextest --locked --fail-under-regions 82   # 門檻以 ci.yml 為準
# specta：改過會進 API 的 struct 就要重跑 export_types 並提交，否則 drift gate 會擋
```

**還有兩道在 repo 根目錄跑、很容易漏掉的門檻**（Backend job 裡排在 fmt 之前）：

```bash
cd .. && typos          # 錯字；白名單在 .typos.toml
cd .. && cargo shear    # 未使用的 Rust 相依
```

`typos` 會掃**變數名**，不是只掃註解與字串：看起來像英文字缺字母的兩字母縮寫會被判成錯字，
命名時寫完整的字。它也掃**整個 repo 的 `.md`**（含這份文件），所以文件裡不寫出會被誤判的字面；
`.typos.toml` 白名單只放真正被誤報的字。**一定要 `cd` 到 repo 根目錄跑**，在 `backend/`
底下跑會漏掉根目錄的 `.md` 與 workflow 檔。

**`cargo audit` 要在 repo 根目錄跑，不是 `backend/`。** `Cargo.lock` 在 workspace root
（根目錄的 `Cargo.toml` 是 `[workspace] members = ["backend"]`），在 `backend/` 下跑會得到
`error: not found: Couldn't load Cargo.lock`。

```bash
cd .. && cargo audit    # 目前剩 1 個 allowed warning（paste unmaintained），exit 0
```

**這個專案用 oxlint，不是 eslint。** 跑 `pnpm exec eslint` 會失敗（沒有 eslint config）；
驗證時用上面的 `vp lint` 指令。

**`--max-warnings 0`。** 存量警告已經清空，不要讓它回頭長回來。
`pnpm lint` 這個 script 沒帶門檻，別拿它當 CI 的代理指標。

`scripts/hooks/pre-commit` 會依暫存檔類型條件觸發上面最常爆的那幾項（ts/tsx → tsc + oxlint；
`backend/*.rs` → clippy）。commit 前不必自己重跑一遍。

## Commit 與 PR

`git log --oneline` 要一眼看得完一個 commit 做了什麼。main 上已經有標題長到近千字的 commit，
那些不追改（改了就是改寫歷史），但之後一律照這幾條：

- **標題（第一行）72 字元以內，只說做了什麼。** 為什麼、怎麼查到的、影響範圍，空一行之後寫在內文。
  一個標題要用頓號串三件事，多半表示該拆成三個 commit。
- **不加 AI 署名。** 不寫 `Co-Authored-By: Claude…`、`Claude-Session:` 連結、
  「Generated with Claude Code」這類行——commit 訊息與 PR 說明都一樣。這條優先於工具預設的署名提示。
- **PR 標題同樣 72 字元以內。** squash 合併時 commit 標題就用 PR 標題加 `(#編號)`，
  不要把 PR 說明整段塞進標題；說明可以放進 commit 內文。

## 部署

```bash
docker compose up -d --build            # 前後端都重建
docker compose up -d --build frontend   # 只動前端時
```

使用者已授權助手直接執行部署，不需要每次徵詢。

**`docker-compose.yml` 是給自架者的通用版**，koimsurai.com 自己的東西（主機上的資料夾、
observability 網路、GlitchTip 的 source map secret、舊站 archive、站台身分與作品清單）全在
**未提交的 `docker-compose.override.yml`**，compose 會自動疊上去。改部署設定先想清楚是
「每個自架者都要」還是「只有這台」：後者寫進 override，不要寫回通用版。
改完用 `docker compose config` 看疊完的結果。

**`VITE_RELEASE` 沒帶的話 SDK 不會帶版本標記**（功能仍正常，只是 GlitchTip 上的
issue 歸不到某次部署）。要帶就 `VITE_RELEASE=$(git rev-parse --short HEAD) docker compose …`。

source map 是**在 build 裡**處理掉的（見 Dockerfile）：烙 debug id → 上傳到 GlitchTip →
從映像刪掉 `.map`。三件事都綁在建置裡，所以不存在「忘記傳」或「順序錯」的問題。
token 走 BuildKit secret（`.env.sourcemaps.token`，未提交）。

### 查 GlitchTip 上的錯誤

`.env.sourcemaps.token` **只能上傳、不能讀**（API 回 403）。GlitchTip 自架在這台機器上，
直接對它的 postgres 做唯讀查詢最快：

```bash
docker exec glitchtip-postgres sh -c 'psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres} -Atc "
  select i.id, x.count, x.last_seen, i.title from issue_events_issue i
  join issue_events_issueindex x on x.issue_id = i.id
  where i.project_id = 2 and not i.is_deleted order by x.last_seen desc limit 20"'
```

project_id：1 backend、2 frontend。事件內容在 `issue_events_issueevent.data`（jsonb），CSP 報告在
`data->'csp'`（`document_uri`、`effective_directive`、`blocked_uri`）。

**CSP 報告幾乎不帶來源資訊**（沒有 UA、行號、片段），要分辨是不是自己的程式碼，得用
`securitypolicyviolation` 事件在 Chromium / Firefox / WebKit 實際開那幾頁重現。後台的 zod 4 JIT
試探已用 `z.config({ jitless: true })` 關掉（`src/schemas/post.ts`）；前台重現不了的 `blocked_uri: eval`
與 `at.alicdn.com` 字型（站上沒用 iconfont）通常是訪客的擴充套件。

**GlitchTip 掛著時 build 會失敗**，這是刻意的：靜靜跳過上傳等於錯誤追蹤白裝，
而那不會有人發現。真的要在它掛掉時部署，把 `.env.sourcemaps.token` 清空即可（會改走
「跳過」分支）。

vite 的 `sourcemap: 'hidden'` **只拿掉 sourceMappingURL 註解，不會阻止 .map 被供應**，
所以 Dockerfile 那步 `find ... -delete` 是必要的。

資產檔名帶 content hash，重新部署後舊 hash 會 404。目前 CDN 沒有快取 HTML 所以無妨；
**若哪天讓 CDN 快取 HTML，部署後必須清 CDN 快取**（等新容器 healthy 之後才清）。

## 內容管理

部落格 CMS 一律透過 `koimsurai_*` MCP 工具操作，不要直接 curl admin API。
送出 MDX 前先跑 `koimsurai_validate_mdx` —— MDX 編譯失敗在前台是**靜默退回 markdown**
（讀者看到裸標籤），而 create/update 仍然回 success，不驗就沒人知道寫壞了。
