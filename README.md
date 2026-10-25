<div align="center">

<img src="public/favicon.svg" width="72" alt="宙と木 logo" />

# 宙と木 · Koimsurai

**個人網站與部落格**：寫技術手記、放照片與書單，也把自己的遊戲、音樂、動畫和寫程式紀錄串在同一個地方。

**繁體中文** · [English](README.en.md)

[**koimsurai.com**](https://koimsurai.com) · [手記](https://koimsurai.com/blog) · [RSS](https://koimsurai.com/rss) · [站點歷程](https://koimsurai.com/history)

[![CI](https://img.shields.io/github/actions/workflow/status/timo9378/sora-to-ki/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/timo9378/sora-to-ki/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![frontend cov](https://img.shields.io/codecov/c/github/timo9378/sora-to-ki/main?flag=frontend&label=frontend%20cov&logo=codecov&logoColor=white)](https://app.codecov.io/gh/timo9378/sora-to-ki?flags%5B0%5D=frontend)
[![e2e cov](https://img.shields.io/codecov/c/github/timo9378/sora-to-ki/main?flag=e2e&label=e2e%20cov&logo=playwright&logoColor=white)](https://app.codecov.io/gh/timo9378/sora-to-ki?flags%5B0%5D=e2e)
[![backend cov](https://img.shields.io/codecov/c/github/timo9378/sora-to-ki/main?flag=backend&label=backend%20cov&logo=rust&logoColor=white)](https://app.codecov.io/gh/timo9378/sora-to-ki?flags%5B0%5D=backend)

[![React 19](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-EF4444?logo=react&logoColor=white)](https://tanstack.com/start)
[![Rust](https://img.shields.io/badge/Rust_·_axum-000000?logo=rust&logoColor=white)](https://github.com/tokio-rs/axum)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

</div>

---

從 2025 年 4 月開始寫，一路改到現在。前端是 **React 19 + TanStack Start（SSR + ISR）**，後端是 **Rust（axum + sqlx + SQLite）**，全部跑在家裡的一台伺服器上，用 Docker Compose 部署。

> 2026-07 後端從 Express 整套遷移到 Rust：120 多個端點逐一對拍、確認回應一模一樣才切換。過程記錄在 [`backend/STRANGLER.md`](backend/STRANGLER.md)。

## 📸 畫面

| 首頁 | 手記列表 |
|:---:|:---:|
| [![首頁](.github/screenshots/home.jpg)](https://koimsurai.com) | [![手記列表](.github/screenshots/blog.jpg)](https://koimsurai.com/blog) |
| **文章頁** | **書櫃（知識星圖）** |
| [![文章頁](.github/screenshots/post.jpg)](https://koimsurai.com/blog) | [![書櫃](.github/screenshots/bookshelf.jpg)](https://koimsurai.com/bookshelf) |
| **我的配備** | **動態** |
| [![我的配備](.github/screenshots/setup.jpg)](https://koimsurai.com/setup) | [![動態](.github/screenshots/activity.jpg)](https://koimsurai.com/activity) |

## ✨ 有什麼

### 手記（部落格）

- **MDX 文章**：除了 GFM，另有二十多個自訂區塊（程式碼分頁、Diff、檔案樹、圖表、投票、Excalidraw 手繪圖、日文振假名、劇透、站長註解…）
- **五種語系**：繁中、簡中、English、日本語、한국어。簡中用 OpenCC 自動轉換，每篇文章可以各自翻譯
- **程式碼高亮**：Shiki 走 JavaScript 正規式引擎（文章頁不用下載 wasm），只有 C 家族語言才載入 Oniguruma
- **Mermaid 圖表**：可縮放、平移、全螢幕，跟著站點配色
- **圖片不跳版**：上傳時算出 thumbhash 和原始尺寸，載入前先顯示模糊佔位圖
- **留言、按讚、反應、系列文、目錄、閱讀進度**，以及 RSS、電子報（Resend）
- **碎念**：短篇動態，可以附上連結卡片，或從同步進來的紀錄帶入一部片、一本書、一首歌，前台寫成「看了／讀了／聽了」（五種語系各自翻）

### 生活紀錄

- **動態**：WakaTime 寫程式時數、GitHub 活動、Steam 個人檔案與遊戲時數
- **音樂**：Spotify 正在播放、最近播放、最愛曲風
- **在看什麼**：動畫瘋觀看紀錄自動同步（[anigamer](https://github.com/timo9378/anigamer-rs)，自己寫的 SDK），電影與影集透過 Simkl 和 TMDb 同步
- **書櫃**：把書排成星圖；ISBN 查詢走國家圖書館的資料，另有可以拖曳的 3D 零重力模式
- **照片**：瀑布流、EXIF 資訊、CLIP 自動標籤、可縮放的全螢幕檢視；標題、標籤、精選與隱藏在後台改，NAS 重新同步不會蓋掉
- **我的配備**：用終端機介面呈現 neofetch 風格的主機資訊，以及家裡的網路拓樸

### 站台本身

- **太空背景**：星空與土星由 three.js（WebGPU，不支援時退回 WebGL2）在 Web Worker 的 OffscreenCanvas 裡算；沒有 GPU 的裝置自動改成純 CSS
- **自製後台**：跟前台同一套材料（黑是紙、白是墨、琥珀是訊號），側欄照前台的分區分成「此刻、寫、收、回、站」
  - **寫**：Monaco 編輯器（夜色主題、Vim 模式、斜線指令、拖放上傳）與即時預覽；**排程發佈**（到時間自動發，電子報也那時才寄）；刪掉的文章先進**回收桶**，30 天內可以還原
  - **碎念**：右邊列出巴哈、Simkl、Spotify、書架同步進來的紀錄，按「寫」帶進撰寫框，附了作品可以不寫字
  - **收**：觀看紀錄與聽的歌可以設成不公開、排收藏頁的最愛；書架；照片的標題、標籤、精選
  - **回**：留言審核（鍵盤 j／k／a／s／r 操作）、**友鏈申請**（朋友頁的表單直接送進來，一鍵檢查對方的站連得到、有沒有回連、有沒有 RSS）、電子報訂閱者
  - **此刻**：總覽列出等你處理的事、近 28 天的 Web Vitals
- **MCP server**：[`packages/mcp-server`](packages/mcp-server) 提供 27 個工具，讓 AI 助手透過後台 API 寫文章（含排程與回收桶）、發碎念、上傳圖片、管理分類
- **其他**：GitHub／Google 登入、命令面板（`Ctrl+K`）、PWA 離線頁、每語系各自的 sitemap 與 hreflang、文章自動產生 OG 圖、嚴格的 CSP、自架的錯誤追蹤（GlitchTip）與 Core Web Vitals 回報

## 🏗️ 架構

```mermaid
flowchart LR
  user([瀏覽器]) --> nginx[nginx<br/>TLS / gzip / 靜態圖]
  nginx -->|頁面| fe[frontend<br/>TanStack Start · Nitro<br/>SSR + ISR]
  nginx -->|/api| be[backend-rs<br/>axum · sqlx]
  fe -->|SSR 取資料| be
  be --> db[(SQLite)]
  be -->|快取 + 失敗回舊資料| ext[第三方 API<br/>GitHub · Spotify · Steam<br/>WakaTime · TMDb · Simkl · 動畫瘋]
  be -.文章更新後清 ISR 快取.-> fe
  backup[db-backup<br/>每日備份 SQLite] --- db
```

- **型別只寫一次**：後端的 Rust struct 用 [specta](https://github.com/specta-rs/specta) 產生 TypeScript 型別（[`packages/api-types`](packages/api-types)），前端直接引用；CI 會檢查兩邊有沒有對上
- **第三方 API 都經過後端**：金鑰不會進前端。回應會快取，上游出錯時改回舊資料，不會整區空白
- **ISR**：頁面由 Nitro 快取，後端改到文章時主動通知前端清除快取

## 🛠️ 技術

| | |
|---|---|
| **前端** | React 19 · TanStack Start / Router / Query · Vite+（vite、vitest、oxlint、oxfmt）· Tailwind CSS v4 · Framer Motion · three.js · MDX · Shiki · beautiful-mermaid · Excalidraw · i18next · Radix UI / shadcn |
| **後端** | Rust 2024 · axum · tokio · sqlx（SQLite）· JWT + bcrypt · image / resvg / thumbhash（圖片與 OG 圖）· ferrous-opencc · utoipa（OpenAPI，`/api/docs`）· Sentry SDK |
| **基礎設施** | Docker Compose · nginx · GitHub Actions · Codecov · 自架 GlitchTip |

## 🧪 品質把關

每個 PR 都要通過下面這些才能合併（完整清單在 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)）：

- **型別與 lint**：`tsc`、oxlint（含型別感知規則與 `@shadcn/lint`）、Biome（CSS）、一支自己寫的 CSS token 檢查（間距、字級、顏色…都必須用設計 token）
- **測試**：vitest 單元測試、Playwright e2e（21 支 spec，含無障礙檢查、後台的往返操作，以及公開頁 11 條 × 3 種寬度加上後台頁的計算後樣式比對）、後端 cargo-nextest 搭配覆蓋率門檻
- **API**：用 OpenAPI 規格自動產生測試資料打後端（Schemathesis），並檢查回應符合宣告的 schema
- **後端**：`cargo clippy`（pedantic）、`cargo audit`、`cargo shear`、`typos`
- **效能**：Lighthouse CI 的效能預算
- **另外**（不在 CI，手動跑）：變異測試（Stryker、cargo-mutants），找出「測試有跑到、但其實沒在檢查」的地方

## ⚙️ 本機開發

需要 **Node.js ≥ 26**、**pnpm 12**、**Rust stable**（edition 2024），或者只要 Docker。

```bash
git clone https://github.com/timo9378/sora-to-ki.git
cd sora-to-ki
pnpm install
```

### 用 Docker 跑整套（最簡單）

```bash
cp backend/.env.example .env.backend   # 填上 JWT_SECRET
docker compose up -d --build
# → http://localhost:13588
```

### 分開跑前後端（開發用）

```bash
# 後端：讀 backend/.env
cp backend/.env.example backend/.env
#   把 DATABASE_URL 改成本機路徑，例如 sqlite://./dev.sqlite
#   把 BIND_ADDR 改成 127.0.0.1:3009（前端 dev server 預設連這個埠）
cd backend && cargo run

# 前端：http://localhost:13998
pnpm dev
```

資料庫不存在時會自動建立，schema 由 [`backend/migrations/`](backend/migrations) 在啟動時套用。

### 環境變數

必填的只有 `DATABASE_URL` 和 `JWT_SECRET`（範例檔裡都有）。其他的沒設時，對應的功能會自動關閉，或顯示空狀態。

| 用途 | 變數 |
|---|---|
| 基本 | `DATABASE_URL` `BIND_ADDR` `JWT_SECRET` `SITE_URL` |
| 後台帳號 | `ADMIN_USERNAME` `ADMIN_PASSWORD` |
| OAuth 登入 | `GITHUB_CLIENT_ID` `GITHUB_CLIENT_SECRET` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` |
| 動態頁 | `GITHUB_TOKEN` `WAKATIME_API_KEY` `STEAM_API_KEY` `STEAM_ID` |
| Spotify | `SPOTIFY_CLIENT_ID` `SPOTIFY_CLIENT_SECRET` `SPOTIFY_REFRESH_TOKEN` `SPOTIFY_REDIRECT_URI` |
| 影劇 | `TMDB_API_TOKEN` `SIMKL_CLIENT_ID` `SIMKL_ACCESS_TOKEN` `BAHAMUT_UID` `BAHAMUT_PASSWORD` |
| 書櫃 | `GOOGLE_BOOKS_API_KEY` `ENABLE_TW_ISBN_SYNC` |
| 電子報 | `RESEND_API_KEY` |
| 錯誤追蹤 | `SENTRY_DSN` `SENTRY_FRONTEND_DSN` |
| ISR 清快取 | `FRONTEND_REVALIDATE_URL` `REVALIDATE_SECRET` |

## 📜 常用指令

```bash
pnpm dev              # 前端 dev server
pnpm build            # 正式建置
pnpm test             # 單元測試
pnpm e2e              # Playwright e2e（跑的是上一次 build 的產物，改完 src/ 要先 build）
pnpm lint:css         # CSS lint（Biome）
pnpm check:css-tokens # CSS token 檢查
pnpm export:types     # 從 Rust 重新產生 TS 型別

cd backend
cargo nextest run --no-fail-fast   # 後端測試（請用 nextest，不要用 cargo test）
cargo clippy --all-targets -- -D warnings
```

## 📂 專案結構

```
.
├── backend/                 # Rust API
│   ├── src/router.rs        # 路由表
│   ├── src/handlers/        # 依領域拆分（posts、thoughts、watch、gallery、spotify…）
│   ├── migrations/          # SQLite schema
│   └── STRANGLER.md         # Express → Rust 遷移紀錄
├── packages/
│   ├── api-types/           # 由 Rust 產生的 TS 型別（不要手改）
│   ├── mdx-core/            # 前後端共用的 MDX 編譯設定
│   └── mcp-server/          # 後台 API 的 MCP server
├── src/
│   ├── routes/              # TanStack Router 的檔案路由（含 $locale/ 語系前綴）
│   ├── components/          # 依功能領域分組：layout、backdrop、blog、mdx、media、admin…
│   ├── data/ i18n/ seo/     # API 查詢、語系路由、meta 與 JSON-LD
│   ├── hooks/ store/ lib/
│   └── locales/             # 五種語系的翻譯
├── server/routes/           # Nitro 路由：sitemap、robots、rss、llms.txt
├── tests/e2e/               # Playwright
├── Dockerfile
└── docker-compose.yml
```

給 AI 助手（Claude Code 等）看的工作守則在 [`CLAUDE.md`](CLAUDE.md)，裡面也記錄了很多踩過的坑和設計理由。

## 🍴 想參考或拿去改

歡迎參考任何寫法，或直接 fork 來架自己的站。幾件事先說：

- 程式碼採 **AGPL-3.0**：如果你改過之後**架成網站對外提供**，也要以相同授權公開修改後的原始碼
- 站上的**文章、照片、碎念、頭像與 logo 都不在授權範圍內**（見下方），fork 之後請換成你自己的
- 很多內容綁定我的帳號：動態頁的 Steam／GitHub／WakaTime、動畫瘋同步、首頁與關於頁的自我介紹、我的配備頁的硬體清單。這些都要改成你自己的，或者直接拿掉
- 有問題或發現 bug 都歡迎開 [issue](https://github.com/timo9378/sora-to-ki/issues)

## 📄 授權

- **程式碼**：[GNU Affero General Public License v3.0](LICENSE)
- **內容**：文章、照片、碎念、書評、頭像與 logo 等站點內容 © Koimsurai，**保留所有權利**，未經同意請勿轉載或重製

## 🙏 致謝

站上用到的開源專案很多，特別感謝
[TanStack](https://tanstack.com/)、[axum](https://github.com/tokio-rs/axum)、[sqlx](https://github.com/launchbadge/sqlx)、
[three.js](https://threejs.org/)、[Shiki](https://shiki.style/)、[MDX](https://mdxjs.com/)、
[Excalidraw](https://excalidraw.com/)、[Radix UI](https://www.radix-ui.com/)、[shadcn/ui](https://ui.shadcn.com/)、
[OpenCC](https://github.com/BYVoid/OpenCC)、[thumbhash](https://github.com/evanw/thumbhash)，
以及 [Vite+](https://viteplus.dev/) 與 oxc 的工具鏈。

## 🌌 更多

- 站點走過的路：<https://koimsurai.com/history>
- 關於這個網站：<https://koimsurai.com/about-site>
- 交換友鏈（頁面上的表單直接申請）：<https://koimsurai.com/friends>
