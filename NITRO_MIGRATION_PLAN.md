# 前端 serve 層遷移計畫：serve.mjs → Nitro v3

> ✅ **已完成並上線（2026-07-17）**。Phase A–E 全數完成，serve.mjs 已刪除。
> 未完事項與刻意不做的決定見 ROADMAP.md「交接」章節。

> 狀態：**計畫待審**，未動工。給下個 session（或本 session 批准後）執行。
> 前置：`backend/STRANGLER.md`（後端史）、本檔。

## 0. 定性（先講清楚，避免誤解）

- **不是「Nitro v2 → v3 升級」**：`@tanstack/nitro-v2-vite-plugin` 是 package.json 裡的
  **死依賴**（全專案零 import）。你從沒真的用過 Nitro。
- **實際是**：把「自製 `serve.mjs`（custom Node server）」換成「Nitro v3 server」。
- **不是被迫**：官方明說 TanStack Start「designed to work with any hosting provider」、
  Nitro 是「agnostic layer」，custom server（serve.mjs）是**官方認可路線**。當初自製沒錯
  （P2 PoC 時 nitro v3 還 alpha）。現在遷是**划算**（白拿 ISR + 退休自維護 server），不是義務。
- **白拿的東西**：① self-host 有效的 ISR/SWR（Nitro `routeRules` node-server preset 是
  server 內建背景重生，不需 CDN）② serve.mjs ~200 行自維護碼退休 ③ 跟上官方主線
  （v2 shim 已被官方文件靜默淘汰，繼續留著升級摩擦會累積）。

## 1. 現況盤點

### serve.mjs 做的 5 件事（都要有去處）
| 功能 | 現況 | Nitro 對應 |
|---|---|---|
| 靜態檔服務（dist/client + prerender HTML） | 自寫 | Nitro 內建 |
| SSR fallback（未 prerender 路由） | import dist/server/server.js 的 fetch | Nitro 內建（tanstackStart plugin 產 server entry） |
| `/og-image/:id` 動態 OG（**前端 sharp**） | 自寫 + 前端裝 sharp | **廢除** → 改指後端 `/api/og/:id.png`（resvg，CJK 已驗完美）|
| `/sitemap.xml`（動態，打後端撈文章） | 自寫 | `server/routes/sitemap.xml.ts`（nitro server route）|
| `/robots.txt` | 常數字串 | `server/routes/robots.txt.ts` 或 public/ 靜態 |
| `/sw.js` 自毀（清舊 SPA SW） | 常數字串 | 見 PWA 章節（重建正確 SW）|

### 順手要清的尾巴（Nitro 遷移一起收）
- **OG 圖雙套**：前端 serve.mjs `/og-image`（sharp）+ 後端 Rust `/api/og`（resvg）。
  BlogPost.tsx 指前端那套。→ 前端切後端、**前端 sharp + fonts-noto-cjk 依賴移除**（省 ~18MB image）。
- **Dockerfile `BACKEND_URL=http://backend:3001`**：Express 死掉的舊值（compose 有覆蓋成
  backend-rs:3002 所以線上沒事，但預設值過時）→ 改 3002。
- **PWA 半殘**：site.webmanifest 只引用 favicon、Dockerfile 生的 pwa-192/512 沒被引用、
  __root 沒掛 manifest link、無 SW（vite-plugin-pwa 死依賴）。→ 見 PWA 章節。
- **prerender 內部 server host hack**（vite.config.start.ts 綁 127.0.0.1）：Nitro build 鏈
  可能不需要或方式不同 → 遷移時重驗（P2 那批 in-Docker ECONNREFUSED 坑要重測，最大未知數）。

## 2. 遷移步驟（分階段，每階段可驗）

### Phase A — 本機探坑（worktree，不碰線上）
1. `git worktree` 開隔離副本
2. `pnpm add nitro`（v3）、移死依賴 `@tanstack/nitro-v2-vite-plugin`
3. vite.config：`plugins: [tanstackStart({ prerender }), viteReact(), nitro()]`
   （prerender pages 清單搬進來；blogPages data-driven 保留）
4. `pnpm build` → 驗 `.output/` 產出、`node .output/server/index.mjs` 本機起得來
5. **重點驗 prerender 在 docker build 內能通**（P2 的 ECONNREFUSED 坑）——這關過了才值得繼續
6. curl 本機：靜態頁、SSR fallback、Accept-Language 導向（/）

### Phase A 實測結果（2026-07-16 完成，worktree `web-nitro` / 分支 `nitro-migration`）

**結論：Nitro v3 可行，ISR 已實測運作。而且只需要改兩件事**——官方最簡設定就是對的。

#### 唯一的根因：`^3.0.0-beta` 會鎖死在 9 個月前的舊版

`nitro@3.0.0` 發布於 2025-10-10；之後 nitro 改用日期式 beta 版號（latest = `3.0.260610-beta`，
2026-06-10）。semver 的 prerelease 比對規則讓 `^3.0.0-beta` **永遠匹配不到日期式 beta** → 靜靜卡在
3.0.0。舊版把 dev 的 vite ssr-renderer（`fetch(req,{viteEnv:'ssr'})`）打包進正式產物當 catch-all，
而 nitro 又覆寫 `globalThis.fetch` → 請求繞回自己 → **每個頁面路由無聲 hang（無回應、無錯誤、
不 timeout）**。升到 `3.0.260610-beta` 後全部正常，該 renderer 在產物中直接消失。

→ **版本釘死，不要用 `^`。**

#### 需要的兩項改動（就這樣，沒了）

```ts
// vite.config.start.ts —— 就是 TanStack hosting 文件的最簡形式
plugins: [tanstackStart({ prerender, pages }), viteReact(), nitro({ config: { routeRules } })]
```
```ts
// src/api.ts —— SSR 要打本機後端，不要繞出公網（會被自己的 CrowdSec 當攻擊擋掉 → ECONNRESET）
const SSR_API_BASE = process.env.BACKEND_URL || 'https://koimsurai.com';
export const apiUrl = (p: string) => (typeof window === 'undefined' ? `${SSR_API_BASE}${p}` : p);
```

#### ⚠️ 曾經誤判、已用消融測試推翻的三個「修法」（別再加回來）

這三個都是在**還沒發現 nitro 是舊版時**疊上去的，升級後逐一移除並實測 → 全部證明不需要：

| 誤加的東西 | 當時以為 | 消融實測結果 |
|---|---|---|
| `server.ts` + `environments.ssr.build.rollupOptions.input` | 沒它 nitro 拿不到 handler | 新版**不需要**，移除後 `/about` 200、ISR 正常 |
| `noExternals: ['@tanstack/start-server-core','h3-v2']` | nitro tracing 解不開 pnpm npm-alias（`h3-v2: npm:h3@…`）→ `ERR_MODULE_NOT_FOUND` | 新版**已修**，移除後零錯誤 |
| `routeRules['/api/**'] = { proxy: … }` | SSR 期元件打相對 `/api` 會打到 render server 自己 | **解決不存在的問題**：元件在 `useEffect` 裡 fetch（SSR 不執行），route loader 走 `apiUrl()` 絕對位址。移除後 `/blog/39` SSR 仍完整 baked 文章標題 + meta |

#### 架構真相（實測，非推測）

- **`/blog/$id`（文章頁）有 loader + `apiUrl()`** → SSR 真的 baked 內文：50KB HTML、標題/`<title>`/
  `meta description` 全在 → SEO 有效。
- **`/blog`（列表頁）是 `localePage('blog', Blog)`、無 loader**，內容靠 `useEffect` fetch →
  **SSR HTML 裡 0 筆文章資料**，只有殼（19KB）。這是既有行為（prerender 也救不了，useEffect
  在 prerender 同樣不跑），非本次遷移造成。要讓列表頁有 SEO 內容得補 loader。

#### 驗證方法的坑（吃過大虧）

SSR 輸出含 **null bytes**，`grep` 會當 binary file 處理並**靜靜輸出空字串（不是 0）**→ 大量假陰性，
一度誤判「頁面沒 render 出內容」。**查 SSR 內容一律 `grep -a`。** 另外別拿兩個可能為空的變數互比
（`[ "$A" = "$B" ]` 對兩個空字串成立 → 印出假的「✓ 通過」）。

### Phase B — 功能移植（worktree 內）
7. `server/routes/sitemap[.]xml.ts`：移植 serve.mjs 的 sitemap（打後端撈已發布文章）
8. `server/routes/robots.txt.ts`（或 public/robots.txt 靜態）
9. OG 切換：BlogPost.tsx `image={/og-image/${id}}` → `image={/api/og/${id}.png}`（後端 resvg）；
   刪 serve.mjs 的 ogImage、前端 Dockerfile 移 sharp + CJK 字型 + og/pwa icon 生成步驟
10. `/` 的 Accept-Language 導向（現在是 createServerFn？確認遷移後仍運作）

### Phase C — ISR/SWR（✅ 已實測驗證，2026-07-16）

**實測結果**：在 `web-nitro` 用 `/isr-demo`（loader 打後端 + render 時間戳）配 `swr: 20` 驗證，
SWR 四個階段全部觀察到：

```
t=0    首次 render:  22:27:24.142Z   ← 真 render，存入快取
t=2    TTL 內:       22:27:24.142Z   ← 同一份 = 快取命中，沒重 render
t=24   剛過 TTL:     22:27:24.142Z   ← 仍回舊的(stale) + 背景觸發重生
t=27   再打:         22:27:48.187Z   ← 換新時間戳 = 背景重生完成
```
回應帶 `cache-control: public, max-age=20, s-maxage=20` + `etag`。
streaming SSR 保留（不需 buffer response，實測拿掉 buffer ISR 照常運作）。
一般頁面 `/about` `/blog` `/music` `/portfolio` 全 200、10–40ms。

#### 11. 列表頁補 loader（本階段最關鍵的一項）✅

**沒有 loader 的頁面，ISR 只會快取到一個空殼。** `Blog` 元件在 `useEffect` 裡抓資料，而
useEffect 不在 server 執行 → `loading` 初始為 `true` → SSR 只吐 `<KoimLoader/>` 骨架屏，
HTML 裡 0 筆文章（SEO 看不到、ISR 也只快取到殼）。**prerender 也救不了**，它同樣不跑 useEffect。

作法：`src/blogList.ts` 抽共用 loader（走 `apiUrl()` → SSR 打本機後端）；`/blog/` 與
`/$locale/blog/` 各帶自己的 locale（列表 API 吃 `lang`，不帶會讓 `/en/blog` 出中文）；
`Blog.tsx` 用 `useLoaderData({ strict: false })`（官方給共用元件的用法）把 loader 資料當初始值，
`loading` 初始為 `initialPosts.length === 0`，首次不重打、切換排序仍由元件 refetch。

實測：`/blog` 19,541 → **74,242 bytes**、含文章標題、8 條 `/blog/<id>` 連結；
`/en/blog` 43,083 bytes、含英文標題、0 筆中文。

> 其餘 useEffect 取資料的頁（thinking / music / bookshelf …）SSR 仍是空殼。要 SEO 內容
> 得比照補 loader —— 不屬本階段，列入待辦。

#### 12. routeRules：白名單而非 `'/**'` 全站包 ✅

原計畫寫 `'/**': { swr: 3600 }`。**改用白名單**，理由：全站包是 fail-open —— 日後新增任何
讀 cookie/header 或 render 使用者資料的頁，都會被預設公開快取且沒人會察覺。白名單是新頁
預設不快取，最壞只是少個快取。（由 `UI_PAGES` 資料驅動生成，加新頁只要加名字。）

刻意不快取（實測 cache-control 確認為空）：
- **`/`** —— `createServerFn` 讀 cookie/Accept-Language 做 302 導向。**快取它 = 把首位訪客的
  語言判斷發給所有人。**
- `/admin/**`、`/auth/**`、`/unsubscribe`

可安全快取的前提：登入態只在 client 的 localStorage（`AuthContext` 在 useEffect 才讀）→
SSR 一律 render 未登入外殼，HTML 對所有訪客相同。

TTL：文章頁 3600、列表頁 300、其餘內容頁 3600。

#### 13. On-demand revalidation ✅（原列「可選增強」，已完成）

- 前端：`server/routes/_revalidate.ts`（POST + `x-revalidate-secret`）。
  - 需 `serverDir: './server'`——**nitro 的 `server/routes/` 預設不被掃描**（原本 404）。
  - **auto-import 不生效**，要顯式 `import { … } from 'nitro/h3' / 'nitro/storage'`。
  - 路徑不放 `/api/*`：正式環境 nginx 把 `/api/` 全導後端，前端收不到。
  - 清「全部」route-rules 快取而非精準單頁：key 形如
    `nitro:route-rules:blog:**:**:blog39.<不透明hash>.json`，hash 從外部算不出來，
    靠 slug 前綴比對會綁死 nitro 內部格式。全清代價僅幾次背景重生（每頁約 70ms）。
- 後端：`backend/src/revalidate.rs`，掛成 axum middleware（**不是**在各 handler 內呼叫——
  posts 寫入散在 posts.rs / admin.rs / opencc.rs 共 14 處，逐一掛必漏且漏了不報錯）。
  - ⚠️ **`/api/posts/:id/view` 等高頻端點必須排除**：`/view` 每次有人看文章就會打，
    若也觸發清快取 = 每次瀏覽清空全站 ISR，ISR 直接失效並不斷重生。已用單元測試釘住。
- compose：`FRONTEND_REVALIDATE_URL=http://frontend:13579/_revalidate` +
  兩邊共用 `REVALIDATE_SECRET=${REVALIDATE_SECRET:-}`（密鑰放未提交的 `web/.env`）。
  **未設 = 功能靜默關閉**（Rust 擋空字串提早返回、前端端點回 404）。
  → 上線前要在 `web/.env` 加 `REVALIDATE_SECRET=<隨機字串>`，否則發文仍要等 TTL。

驗證：4 個 Rust 測試 +「TTL 內時間戳鎖死 → 呼叫 revalidate → TTL 還剩 14s 就換新」的歸因測試；
並用**突變測試**確認測試會抓 bug（拿掉通知 → 整合測試逾時失敗；讓 `/view` 觸發 → 單元測試失敗）。

### Phase B 實測結果（✅ 完成，2026-07-17）

**7/8. sitemap.xml + robots.txt → `server/routes/*.ts`**
- 需 `serverDir: './server'`；auto-import 不生效 → 顯式 `import { … } from 'nitro/h3'`。
- ⚠️ **`public/` 靜態檔會蓋過 server route，且完全無聲**。`public/sitemap.xml` 是一份
  **2026-02-11、0 篇文章的死清單**（serve.mjs 時代被動態 handler 攔在前面，只當後端掛掉時的
  fallback，所以沒人發現）。不刪的話一上線 Google 就吃到它。已 `git rm` 兩個死檔。
- 現況：sitemap 16 筆 URL（8 靜態 + 8 文章）、`lastmod` 為當日；後端不通時降級成只有靜態頁（不 500）。

**9. OG 圖 → 後端 `/api/og/:id.png`（路徑要帶 `.png`，不帶 404）**
- ⚠️ **發現既有重大缺陷：og:* 從來沒進過 SSR HTML**。`SEOHead` 走 react-helmet-async，
  hydrate 後才掛標籤，而 FB/Twitter/LINE/Discord 爬蟲不執行 JS → **社群分享預覽一直是壞的**。
  文章頁更慘：SSR 走的是 `<ClientOnly>` 的 fallback `BlogPostPage`（根本沒掛 SEOHead），
  真正有 SEOHead 的 `BlogPost` 是 client-only 元件。**遷移前的正式站實測也一樣沒有**。
- 修法：新增 `src/seoMeta.ts`，og/twitter/article:* 全部改由路由 `head()` 出（唯一會 SSR 的地方）。
  另修 `article:published_time` 格式：DB 存的是 SQLite `datetime('now')`（UTC、非 ISO 8601），
  要轉成 `…T…Z` 爬蟲才解析得了。
- 其餘 21 個用 SEOHead 的頁面有同樣問題 → **待辦**（本次未處理）。
- sharp 生的 4 張圖（og-default-v2 / pwa-192 / pwa-512 / pwa-maskable-512）改為**預先生成進 repo**：
  來源 SVG 固定、產物永不變，沒理由每次 docker build 重跑並為此裝 sharp + 18MB CJK 字型。
  順手修好 maskable icon（原本與一般 icon 位元組相同、沒有安全區，Android 遮罩會裁掉 logo）。

**10. `/` 的 Accept-Language 導向**：實測 `Accept-Language: ja` → **302 → /ja** ✓

**未動**：`/blog` 以外的 useEffect 取資料頁（thinking/music/bookshelf…）SSR 仍是空殼。

### Phase D 實測結果（✅ 完成，2026-07-17）

決定併入本次（快取邊界要跟 ISR 一起設計）。**不用 vite-plugin-pwa**，自寫 40 行 `public/sw.js`。

- manifest 補齊 4 個 icon；`__root` 補上 `<link rel="manifest">` / apple-touch-icon / theme-color
  ——**過去從沒掛過 manifest**，瀏覽器根本看不到它，站台不可安裝。
- SW 只做兩件事：`/assets/*`（內容雜湊 → 永遠安全）cache-first、斷網導覽回 offline。
  **絕不快取 HTML** —— HTML 全交給 Nitro 的 ISR，否則兩套快取打架、發文後怎麼重整都是舊頁。
- ⚠️ **離線頁不能用 TanStack 路由**（實測踩過）：那產出的是完整 SPA 文件，SW 把它回給 `/blog`
  之後 client 會 hydrate → router 依網址重跑該路由 loader → 斷網下變成 "Failed to fetch"，
  離線頁被自己的 router 蓋掉。改為純靜態 `public/offline.html`（零 JS 框架）。
- 瀏覽器實測（Playwright）：SW `activated`、manifest 4 icons、`誤快取HTML: []`；
  **停掉容器後導覽 `/blog` → 顯示離線頁**（無導覽列殘影、無 Failed to fetch）；恢復後正常。

### Phase E 實測結果（✅ 完成，2026-07-17）

**Dockerfile 重寫：image 3.35GB → 413MB（8×）**，stage 2 只要 node + `.output`。
拿掉的東西都經實測確認不需要：
- `pnpm install --prod` + `node-linker=hoisted` hack → nitro 的 `.output` 是自足 bundle
  （`.output/server/node_modules` 為空；單獨複製到空目錄即可啟動並回 200）。
- sharp + fonts-noto-cjk → OG 改後端、4 張圖預生。
- prerender 相關（host 綁 127.0.0.1 的 hack、build 期打 koimsurai.com 撈文章）→ 改走 ISR。
- `.dockerignore` 補 `.output` / `.nitro`（否則 host 的 stale 產物會被 COPY 進 builder）。

已刪：`serve.mjs`、`sharp`、`vite-plugin-pwa`、`@tanstack/nitro-v2-vite-plugin`；
`package.json` 的 `preview` 改指 `.output/server/index.mjs`。

**容器實測**（接 compose 網路打真後端 backend-rs:3002）：`/blog`（74KB、8 條文章連結）、
`/blog/39`、`/about`、`/en/blog`、`/sitemap.xml`、`/robots.txt` 全 200；`/` + `Accept-Language: ja` → 302 `/ja`。

> 測試容器直接打會有 `/api/* 404`：那是**沒有 nginx 的產物**，不是問題。
> 已核對 `/etc/nginx/sites-available/koimsurai`：`location /api/ → 127.0.0.1:3002`、
> `location / → 13588`、`/rss → 3002`。這也是拿掉 `/api` proxy routeRule 安全的依據。

**仍待做（下次）**：15. merge worktree → 正式部署（含 `web/.env` 加 `REVALIDATE_SECRET`）。

## 3. PWA 重建方案（採納使用者指引）

**現況**：PWA 幾乎等於沒有（半殘）。所以這是**趁機重建乾淨的**，不是遷移現有的。
**核心原則**：傳統 `vite-plugin-pwa`（generateSW）會 precache `index.html`，與 Nitro 的
SSR/ISR 動態 HTML **衝突**（且對 Vite 8 Environment API 適配不佳）→ **不用它**。

1. **Manifest + icons**：`public/` 純靜態。補全 site.webmanifest 的 icons（引用已生成的
   pwa-192/512/maskable，現在只引 favicon）；`__root.tsx` 掛 `<link rel="manifest">` +
   apple-touch-icon。
2. **Service Worker（InjectManifest 模式）**：自寫輕量 `public/sw.js`（或 Workbox 獨立編譯）——
   **只 precache 靜態資產（JS/CSS/字型/圖），絕不碰動態路由（ISR/SSR HTML）**，讓 Nitro
   route rules 全權管 HTML 快取。
3. **離線降級**：SW 在斷網且無快取時 → 回固定 `/offline` 頁；`/offline` 在 Nitro 設純 prerender。
4. **SW 註冊**：__root 加註冊 script（取代 serve.mjs 現在的 /sw.js 自毀邏輯——舊 SPA SW 早已
   清完，自毀碼可退休）。

**決策點**：PWA 重建要 (a) 併進本次遷移，還是 (b) 遷移只求「維持現在半殘/等價」、PWA 另開任務？
→ 建議 (a)，因為 SW 與 ISR 快取邊界要一起設計才乾淨；分開做等於設計兩次。

## 4. 風險

| 風險 | 緩解 |
|---|---|
| **prerender 在 docker build 內失敗**（P2 ECONNREFUSED 坑重踩）——最大未知數 | Phase A 第 5 步先驗，過不了就停損（不值得為 ISR 打掉 build 鏈）|
| Nitro v3 仍 beta，API 可能動 | 自己的站可吃 beta；worktree 探坑先確認當前版本能通 |
| SSR bundle transitive 依賴解析（P2 的 node-linker=hoisted 坑）| Nitro 打包方式不同，可能自解或要重設，Phase A 驗 |
| Accept-Language 導向 / createServerFn 遷移後行為變 | Phase B curl 對拍現況 |

## 5. Rollback
worktree 未 merge 前，線上完全不動。已部署後：`git revert` + rebuild frontend（serve.mjs 回歸）。
docker image tag 保留上一版。

## 6. 工作量估計
Phase A（探坑）：半天，**這關決定值不值得做**。A 過了 B–E 約 1–2 個 session。
PWA（D）：+半天。
