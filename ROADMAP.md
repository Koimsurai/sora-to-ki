# sora-to-ki 剩餘工作 Roadmap

> 2026-07-15 盤點。大遷移（P1 全TS / P2 SSG / P3 Rust / Express 退役）已完成。
> 本檔＝剩餘工作總覽，含 Nitro/specta 兩份既有計畫 + 生產強化清單的**誠實分級**。
> 原則：對**個人站**分級，不照搬企業級 checklist。標 ❌ 的是刻意不做（附理由）。

## 已在做 / 已規劃（獨立計畫）
- **Nitro v3 遷移**：✅ **已完成並上線（2026-07-17）**。詳見 `NITRO_MIGRATION_PLAN.md`。
- **specta 型別遷移**：✅ **完成（2026-07-19）**。所有 typed-able 讀取端點 typed 化 + 生成型別，
  前端「當 typed data 讀」的手寫 interface → 零。剩下刻意不 typed 的透傳/動態端點（watch
  favorites/heartbeat/now、github/wakatime/steam proxy、gallery manifest、quote/daily、寫入
  mutation 回應）保留手寫型別（後端回動態 `Value`、serde_json feature 沒開）。詳 `backend/SPECTA_PLAN.md`。
- **B7 TanStack Query 全面導入**：✅ **完成（2026-07-19）**。見下方 B7。
- **collection 收藏站退役**：✅ **完成（2026-07-19）**。後端 handler+路由 + 前端 CollectionManager+nav
  全刪，/api/collection/* 現 404（`collection_items` 空表保留）。
- **Bun 化**：延後至 Rust 版 stable（見 vault 決策；現在青黃不接期）。

---

## 交接：Nitro 遷移收尾後的未完事項（2026-07-17）

遷移本身已完成上線（serve.mjs 退役、ISR + on-demand revalidation 運作中、image 3.35GB → 759MB）。
過程順手修掉三個**無聲失效**的既有缺陷：全站 `<title>` 重複且無 description、og 標籤從沒進過
SSR（社群預覽一直是壞的）、`public/sitemap.xml` 是 2026-02-11 的 0 篇文章死清單。

### 仍未做（有意識的決定，不是遺漏）

| 項目 | 狀態與理由 |
|---|---|
| **`/watch/library` 補 loader** | **決定不做**。全量 1,174 筆（anime 997 + film 96 + tv 81）、JSON 279KB；照 `/watch` 的 ~360 bytes/筆推估，SSR 會產出 ~420KB HTML + 279KB 水合資料 ≈ 700KB。這是有分頁/排序的瀏覽 UI，SEO 增益相對 `/watch`（已 SSR 最近 200 筆）很邊際。title/og 已有。 |
| **`/activity` 補 loader** | **決定不做**。抓的是 Steam/health 即時儀表板，baked 進 HTML 只會是過期快照，SEO 無價值。 |
| **`/music` 的 now-playing** | **刻意排除在 loader 外**。30 秒輪詢的即時狀態，配 ISR 1h TTL 會讓爬蟲與首屏永遠看到錯的「正在播放」。其餘（recently-played/top-genres/top-tracks）已 SSR。 |
| **ISR 快取在記憶體** | 未掛 fs driver。**每次部署／重啟快取歸零**，之後首批請求要冷 render（實測 40–190ms）。流量不大時無感；要跨重啟存活需掛 unstorage fs driver + volume。 |
| ~~**後台 CollectionManager + 後端 `/api/collection`**~~ | ✅ **2026-07-19 全退役**（使用者拍板「刪」）。後端 handler/路由/mod + 前端 CollectionManager/route/nav 全移，/api/collection/* + /api/sync/collection 現 404。`collection_items` 空表保留（drop 是另支破壞性 migration）。 |
| **`nitro-migration` 分支** | 已 merge 進 main，分支保留當歷史紀錄；worktree 已移除。 |
| **GitHub dependabot 警告** | push 時 GitHub 回了安全警告連結，沒看過。 |

### 已知的既有缺陷（未修）

- ~~**其餘頁面的 `<SEOHead>` 仍是 helmet**~~ ✅ **2026-07-18 全面退休**：所有 16 個 `<SEOHead>`
  用法清除、`SEOHead.tsx` 與 `HelmetProvider` 刪除、`react-helmet-async` 依賴移除。
  所有頁面的 title/description/og 一律走 `head()` 進 SSR；文章頁的 BlogPosting JSON-LD 也搬進
  `head().scripts`（首次進 SSR）。順手補了兩個原本沒 SSR meta 的頁：首頁（原本 head() 只出 links、
  SSR 零 og/description）、404。
- ~~**`friends`/`messages`/`history`/`about-site` 沒進 `pageSeo` 表**~~ ✅ **2026-07-18**：四頁補進
  `PAGE_SEO`（用 `info.*.title` / `info.*.subtitle`，五語系齊全）。
- **`/watch/library`、`/activity` 等頁 SSR 仍是空殼**（見上，刻意）。
- **`no-unnecessary-type-assertion` eslint error ×4**（Music/Thinking/ThinkingDetail/Watch）：
  跟 Blog.tsx 同一個 `(useLoaderData({strict:false}) as {...})` 慣例。**但不是每個都能移除**——
  strict:false 回傳跨路由 union，斷言在 narrow 到本頁 loader 形狀。Blog（`posts` 別頁沒有）已安全移除；
  Bookshelf（`stats` 會跟 Watch 的 `WatchStats` 混）驗出斷言**必要**、加了 eslint-disable 註解。
  剩下 4 個要各自 probe（移除後跑 tsc，若別頁 loader 有同名欄位就是必要的、不能移）。
- **未做：`WebSite`/`Organization` JSON-LD（root head）** —— TanStack SEO 文件建議在 `__root` 出
  站台級結構化資料，正好對應 `[[project_koimsurai_seo_brand]]`（Koimsurai 被辨識成 Katsurai）的解法。
  這次只搬了文章級 BlogPosting，站台級留待品牌 SEO 那批一起做。

### 驗證方法的坑（吃過大虧，寫給下一個 session）

- **SSR 輸出含 null byte** → `grep` 當 binary 處理、**靜靜輸出空字串（不是 0）** → 大量假陰性。
  查 SSR 內容一律 `grep -a`。
- **`grep -c` 在單行 JSON 上只會回 0/1**（它數的是「符合的行數」），別拿來當筆數。
- **管線會吃掉 exit code**：`cmd | head` 的 `$?` 是 `head` 的。`pnpm exec tsc … | head` 會讓失敗看起來像成功。
- 別拿兩個可能為空的變數互比（`[ "$A" = "$B" ]` 對兩個空字串成立 → 印出假的「✓ 通過」）。

---

## 生產強化清單（分級）

### 🟢 A — 真缺口 + 高價值低成本（優先做）

> **⏸ A1 延後（2026-07-19 使用者決定）**：安全 header 批次**等整體架構定案後再做**（CSP 耦合到站上載入的資源，架構還會變 → 現在做要重盤）。
> - **HSTS：已批准**（憑證 Certbot 自動續簽、不會掉 → 無鎖人風險）。做時 max-age 可直接給長、includeSubDomains 要先確認子網域全 HTTPS。
> - **CSP：要評估**，到時 `Content-Security-Policy-Report-Only` 先跑觀察再 enforce。
> - 4 個零風險 header（nosniff/X-Frame/Referrer-Policy/Permissions-Policy）隨 A1 批次一起上。

**A1. nginx security headers**（最該做，你是自架資安控，一次 config）
現況：只有 cache-control + SSL。缺 HSTS / CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy。
做法：koimsurai nginx 加一組 `add_header`（server block 層）。CSP 要對現有 inline script（intro gate）+ 外部資源盤一輪，先 report-only 再 enforce。
成本：半天（CSP 最花時間）。**價值：高**（你這種站沒 HSTS 是硬傷）。

**A2. i18n ja/ko 補完**
現況：History.tsx 等組件 ja/ko 翻譯不完整（zh-TW/en 完整）。
做法：盤所有 i18n key，補 ja/ko；或決定「ja/ko 缺的 fallback en」的策略。內容工作，可 AI 輔助。
成本：看內容量。**價值：中高**（你支援 5 語，殘缺比不支援更糟）。

### 🟡 B — 真缺口 + 中價值（值得做，不急）

**B1. CI（GitHub Actions）+ E2E**——注意是 CI 不是 CD
現況：web repo 無 workflow（anigamer 有）。
做法（分層，跑的頻率不同）：
- **每 push（快、必過）**：`tsc --noEmit` + `eslint` + `cargo test`（backend+anigamer）+ `cargo clippy` + build 驗證。
- **E2E（全覆蓋，Playwright）**：主要**本地一鍵跑**（改動後回歸）；若上 CI 則 PR/nightly（docker compose 起 stack + fixture DB），不放每 push（慢/flaky）。
- **deploy 維持手動**（self-host + 自主權，不做自動 CD）。
E2E 選型：**Playwright**（見下註）。成本：半天 CI + 持續補 E2E。價值：中。

> **E2E 選型（2026 查證）**：**Playwright 仍是預設最佳**（State of JS 2025 滿意度 91% vs Cypress 72%、免費並行、self-host CI 友善、8-core 跑 15-30 並發）。你**已有投資**（.mcp.json Edge 設定 + P2 用過 + 本 session 用 Playwright MCP 做過 koimsurai 煙測）。2026 的進步不是換框架，是 **Playwright + MCP（AI 輔助寫 locator，省 ~25% 寫測時間）——你已經在用**。新競品（Autonoma/Stagehand）偏 SaaS，不合自主權。**繼續 Playwright，不換。**

**B2. 測試分兩層（vitest 純邏輯 + Playwright E2E 全覆蓋）**
現況：後端有測試（og + anigamer 32），前端零。
- **vitest**：純邏輯（i18n locale 解析 / LocaleLink query·hash / captcha loose-eq / 日期）。不測 UI 渲染。
- **Playwright E2E 全覆蓋**（使用者定調，修正原「只 smoke」）：理由＝**AI 改重要 CSS 可能不去測其他頁**（AI 高頻改動的回歸保護網）。全頁覆蓋、**本地一鍵跑**取代手動點。已有 .mcp.json + 本 session 用過。
- **cargo test 後端擴充**（現在僅 og，補關鍵 handler）。
成本：持續累積。價值：中高（AI 改動保護）。

**B3. 內文圖片 WebP + 響應式**（Next.js `<Image>` 等價）
現況：gallery 已 webp+thumbhash；懶加載 ImageLightbox 已有 `loading="lazy"`。缺的是**內文上傳圖**的自動 webp + srcset 多尺寸。
做法：`/admin/upload`（Rust）已在做 thumbhash，順手產 webp + 2-3 個尺寸；或 build 時 vite 插件處理。
成本：中。價值：中（LCP/流量，但你圖不多）。

**B4. 前端 Core Web Vitals 埋點**（GlitchTip 收不到的那塊）
釐清使用者困惑：Google 的 **`web-vitals` npm 套件是「測量 lib」不是「服務」**——它是 Core Web Vitals 的官方實作（業界標準、不可避免），用它**≠ 把數據給 Google**。
做法：`web-vitals` lib（client 測量 LCP/CLS/INP）→ 送**自己的 Rust endpoint** → 存 SQLite → 自己看。**測量用 Google 的 lib、收集儲存在自己家，不碰 GA4。**
分工：GlitchTip = error + 後端 perf；web-vitals lib = 前端 Core Web Vitals。兩塊都自主。
成本：小。價值：中（有數據才知道 SSG/ISR 真快不快）。

**B5. 字型子集化 🔸 降級（查證後，大半不需要）**
現況查證：**CJK 全靠系統 fallback**（`--cjk-font` per-locale：MiSans/Source Han/Noto/PingFang…系統字型），只有拉丁 TASA variable 自託管。
→ **webfont-dl 對你沒用**（你沒用 Google Fonts CDN，它沒東西可下載）；**CJK 不用分片**（沒自託管，cn-font-split/vite-plugin-font 用不到）。你的字型架構**已經對了**。
剩下：拉丁 TASA 子集化+preload（variable font 本來一檔，價值有限）。**小事，有空再說。**
（CJK 若哪天要自託管，正解=`vite-plugin-font`（cn-font-split，Rust 寫的）。）

**B6. API 文件 utoipa + Scalar**（你自己說「一起補」，P4 原決策）
做法：backend struct 加 `utoipa::ToSchema`（跟 specta::Type 並存），出 Scalar UI。**跟 specta 遷移同批做**（同樣是給 struct 加 derive）。
成本：中。價值：中（個人站無外部 API 消費者，但自己 debug + 未來有用）。

**B7. TanStack Query 導入 — ✅ 完成（2026-07-19）**
全公開/內容/admin 面的 page-data 讀取都改 useQuery（吃 specta 生成型別）：首波 7 頁 + widget 群
+ WatchLibrary/CommandPalette/Unsubscribe + BlogPost（消 loader×元件雙抓、淘汰 articleCache）+
LinkCard + 12 個 admin 管理頁（用 mint OWNER token Playwright 實測）。SSR 走 loader ensureQueryData
→ dehydrate → hydrate 模式，正式域每頁 `grep -a` 驗 SSR 內容還在。剩下純 useEffect+fetch 的只有合理
不遷的：AuthContext(session)、monaco(編輯器內部)、ImageLightbox(自帶快取 lib util)。下為原評估存查：

**（原評估 2026-07-18）— 一半好處 Router loader 已內建**
現況：前端**沒有** react-query（git 全歷史零命中，從沒裝過；`useQuery` 0 次）。資料抓取＝
Router loader（SSR 首屏）+ 元件內 raw `fetch`/`useEffect`（~30 個元件）+ 手寫 loading state（18 個）
+ setInterval 輪詢（資料相關 5 個：Activity/Music/Bookshelf/Watch/History）。

**關鍵拆分**（context7 查證 Router loader 快取）——想要的好處不是都要 Query：
- **返回瞬讀 + 保留捲動 + staleTime 省流量 → Router loader 已內建**。loader 有 `staleTime`/`gcTime`、
  跨導覽以 pathname+params 快取、`staleReloadMode:'background'`（stale 先 render、背景重抓）、scroll
  restoration。現在 `staleTime:0`；把常靜態頁（blog 列表/bookshelf…）設 `staleTime:5–10min` 即得。
  **設定改動，非重構。** ⚠️ 但元件自己的 useEffect 重抓 + setInterval 不受 loader 快取管，要真省流量
  得一併處理那部分（＝Query 或手動拆）。
- **切分頁回來背景更新（window focus refetch）→ Router 不內建**：~10 行 `focus → router.invalidate()`
  或 Query 的 `refetchOnWindowFocus`。且「作者改字讀者無感更新」伺服器端已有一半＝`revalidate.rs`
  發文清 ISR。
- **消 18 個 loading 樣板 + 5 個輪詢 → 只有 Query 給**（不可替代的 DX 贏）。

規模與風險：~30 個 `useState+useEffect+fetch` 改寫成 `useQuery`。**必須**走 loader 灌 queryClient →
dehydrate → hydrate 的 SSR 模式，**接錯 → SSR HTML 空掉（SEO 回歸）且瀏覽器看起來正常**（隱形回歸，
正是本輪吃過三次的失敗模式）→ 每頁 `grep -a` 驗 SSR 還有內容。

**排程（兩步）**：
1. **（低成本，可先做）** loader `staleTime` 調校 → 拿到返回瞬讀 + 導覽層省流量。
2. **（B 級，跟 specta 綁）** 全面 Query 導入 → 拿到 window-focus 更新 + 消樣板。與 specta 同批，
   因兩者都碰那 ~30 個 fetch 點；specta 先給 typed 回應 → Query hook 直接 typed，不必動兩遍。
成本：步驟 1 小、步驟 2 中大。價值：中（DX + 部分 UX；核心 SSR/SEO 已由 loader 達成）。

### 🔴 C — 個人站 cargo-cult（建議不做，附理由）

**C1. Sentry / LogRocket ❌ → 但 GlitchTip ✅（2026-07-15 修正）**
原否決 Sentry 理由＝第三方 SaaS 違自主權。使用者指正：**GlitchTip = self-host 版 Sentry**（Sentry SDK 相容、只 4 容器 vs Sentry 40+、1GB RAM 可跑），**破解自主權顧慮**。
→ 改為 **B 級可做**：GlitchTip 自架收 **error + 後端 transaction perf**。
**兩全方案（2026-07-15）**：用 Sentry 官方 **`sentry` Rust crate**（使用者喜歡的 DX）+ DSN 指向自架 GlitchTip（Sentry 協定相容）＝喜歡的 crate + 4 容器輕量，不忍 Sentry 40+。error 一定收、performance transaction 要實測。
⚠️ 但 GlitchTip 的 perf 是**後端 transaction 級，不含前端 Core Web Vitals（LCP/CLS/INP）**——那塊見 B4。
Sentry SaaS / LogRocket 仍 ❌（GlitchTip 已覆蓋且自主）。

**Uptrace ❌（2026-07-15 評估）**：OTel-native full observability（traces+metrics+logs，ClickHouse+Postgres）。錯配——① 你要 error+web-vitals，它是 distributed tracing（強在你沒有的微服務/billions spans）② 無前端 RUM/web-vitals ③ ClickHouse 比 GlitchTip 重（你嫌肥的顧慮更嚴重）。吸引點=OTel + Rust tracing crate 整合正統，但那條路本質要付 ClickHouse 成本，個人單體站不划算。同 Redis 判斷：能力遠超 problem 規模。留給未來真多服務。

**C2. CSRF 保護 ❌**
理由：你的 auth 是 **JWT Bearer token**（`Authorization` header），不是 cookie session。CSRF 攻擊利用「瀏覽器自動帶 cookie」，Bearer token 要 JS 主動加 header、跨站拿不到 → **Bearer 架構對 CSRF 天然免疫**。加 CSRF token 是對著不存在的攻擊面防禦。清單裡的 cargo-cult，**不做**。

**C3. helmet.js ❌**
理由：那是 Express 中介層，功能＝設 security headers。你的等價＝A1（nginx 層做，更該在那做）+ Rust 已有 CORS/nosniff。**不需要 helmet。**

**C4. husky + lint-staged + commitlint（整套）🔸 降級**
理由：團隊協作工具（強制多人遵守）。你單人 + 已遵守 Conventional Commits + 手動跑 tsc/eslint 勤。整套 CP 值低。
可選極簡版：一個 `.git/hooks/pre-commit` 跑 `tsc --noEmit && eslint`（擋自己手滑），**不裝 husky/commitlint 生態**。

**C5. 自動 changelog ❌**
理由：你沒有 versioned release（個人站持續部署）。changelog 是給「有 release cycle + 使用者」的專案。你的「history」頁 + git log 已足夠。**不做。**

**C6. 應用層 rate limiting 🔸**
理由：**CrowdSec 機器層已 active**（入侵/掃描防護）。應用層 rate limit（如登入嘗試）可補一個薄的（Rust 端對 /auth/login 計數），但不是急件——你流量小 + CrowdSec 兜著。低優先。

---

## 建議施工順序

1. ~~**A1 security headers**~~ **⏸ 延後**（2026-07-19 使用者決定：等架構定案；HSTS 已批准、CSP 待評估）
2. ~~**Nitro 遷移**（Phase A→E，含 OG/PWA/ISR 收尾）~~ ✅ 2026-07-17 完成上線
3. **specta ✅ 完成（2026-07-19）／ utoipa（B6）未動**
   - ✅ specta 全 typed-able 端點：posts/admin/comments/books/newsletter/watch/home/stats/series，
     前端全面 useQuery 吃生成型別（見 B7）。多輪抓到「build 過、200、但功能從沒生效」的既有缺陷
     （allow_comments、列表 excerpt 全空、後台按鈕、summary 死路、github private commit 洩漏…）。
   - ⏳ **utoipa 還沒動**（原計畫跟 specta derive 同批，目前只做了 specta）→ 這是 B6，剩下的一半。
4. **A2 i18n 補完**（內容工作，穿插做）
5. **B1 CI + C4 極簡 pre-commit**（一起，push 驗證）
6. **B3/B4/B5**（圖片/vitals/字型優化，效能批）
7. **B2 前端測試**（持續累積，不衝刺）

**明確不做**：Sentry SaaS（改自架 GlitchTip）、C2 CSRF、C3 helmet、C5 changelog、husky/commitlint 生態、**Redis（見下）**。

---

## 架構決策（2026-07-15）

### Staging 測試環境 + CD-to-staging ✅（修正原「不做 CD」）
原「不做 CD」講太死——那是指「不自動部署 prod」。正確模式：**CD 到 staging（自動）+ 手動 promote prod**。
- dev 子網域（CF）+ 獨立 docker compose（frontend+backend-rs+DB）
- E2E 跑 staging 不碰 prod；prod 控制權不失
- ⚠️ **真工程＝DB 資料策略**（不用 prod DB：seed fixture 或定期 sanitized 複製）——基礎設施不難，資料策略要想
- prod 仍手動 cutover（自主權）

### Redis ❌（現在不引入）
無非 Redis 不可的需求：JWT stateless（無 session store）、in-process cache 單機夠、Nitro ISR 用 **fs driver** 持久化、rate limit CrowdSec。
引入＝多養服務+故障點+破壞 SQLite 單機哲學。
**何時值得**：真多實例 / ISR 量大到 fs 不夠 / 要 pub/sub。現在都不是。
