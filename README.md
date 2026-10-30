<div align="center">

<img src="public/favicon.svg" width="72" alt="宙と木 logo" />

# 宙と木 · Koimsurai

**此處無他，唯有黑夜、白墨與微光。**

一個人的網站：寫技術手記、發碎念、放照片與書單，也把看的、聽的、寫的程式串在同一片天空裡。

**繁體中文** · [English](README.en.md)

[**koimsurai.com**](https://koimsurai.com) · [手記](https://koimsurai.com/blog) · [此站點](https://koimsurai.com/about-site) · [航行日誌](https://koimsurai.com/history) · [RSS](https://koimsurai.com/rss)

[![CI](https://img.shields.io/github/actions/workflow/status/Koimsurai/sora-to-ki/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/Koimsurai/sora-to-ki/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![frontend cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=frontend&label=frontend%20cov&logo=codecov&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=frontend)
[![e2e cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=e2e&label=e2e%20cov&logo=playwright&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=e2e)
[![backend cov](https://img.shields.io/codecov/c/github/Koimsurai/sora-to-ki/main?flag=backend&label=backend%20cov&logo=rust&logoColor=white)](https://app.codecov.io/gh/Koimsurai/sora-to-ki?flags%5B0%5D=backend)

[![React 19](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-EF4444?logo=react&logoColor=white)](https://tanstack.com/start)
[![Rust](https://img.shields.io/badge/Rust_·_axum-000000?logo=rust&logoColor=white)](https://github.com/tokio-rs/axum)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

</div>

---

從 2025 年 4 月開始寫，一路改到現在。前端是 **React 19 + TanStack Start（SSR + ISR）**，後端是 **Rust（axum + sqlx + SQLite）**，全部跑在家裡的一台伺服器上，用 Docker Compose 部署。

> **想看舊站？** 2026 年 10 月整站翻新成現在的「宙と木」。翻新前的最後一版留在 tag [`v1-final`](https://github.com/Koimsurai/sora-to-ki/tree/v1-final)（`git checkout v1-final`），也還跑在 <https://archive.koimsurai.com>（唯讀）。

## 🌌 設計

整個站只有一個概念：**每一頁都是同一片夜空裡的一種東西**，用首頁那顆點線土星的點和線變出來。完整的說明（還能一步一步看土星怎麼畫出來）在站上的 [此站點](https://koimsurai.com/about-site)。

### 只有三樣材料

| | | |
|---|---|---|
| ⬛ | **黑，是紙** | 整個站的底 |
| ⬜ | **白，是墨** | 字、線、點 |
| 🟧 | **琥珀，是訊號** | 只出現在一個點上：你在哪裡、正在發生的事。不拿來當大面積的強調色 |

### 三種字

- **思源宋體**：中文與所有混排的句子。按頁面實際用到的字裁切，一頁只下載幾十 KB
- **Instrument Serif**：只給整段英文的大字，不加粗
- **等寬字**：日期與數字

讀文章時還能換成黑體、楷體或現代無襯線，四種都照語系由站上提供。

### 三條規則

1. **一個畫面只有一個訊號**：琥珀色一次只亮一處
2. **只用點與線**：不塗色塊、不疊陰影、不用毛玻璃；直角、細線、點線分隔
3. **由數據長出來**：作品頁的星球大小是程式碼量、地貌是主要語言、衛星是 GitHub 星星

### 同一片天空

| 頁面 | 是天空裡的 |
|---|---|
| 首頁 | 繞著土星的衛星（五顆衛星對應五個分區） |
| 手記 | 一圈一圈的星軌，一篇文章就是一道 |
| 碎念 | 劃過的彗星，最新那則是彗核 |
| 作品 | 往外長的螺旋航線 |
| 收藏 | 從地球發出的訊號：看完、讀完、聽完的那一刻發出，以光速飛到現在，距離就是離現在多久 |
| 照片 | 從深空傳回來的照片，一行一行收下來 |
| 設備 | 太空船的工程圖 |
| 朋友 | 繞著同一個中心的星 |
| 留言 | 收到的電波 |
| 航行日誌 | 從地表升空 |
| 關於 | 一次下墜 |

## 📸 畫面

| 首頁：繞著土星的衛星 | 手記：一圈一圈的星軌 |
|:---:|:---:|
| [![首頁](.github/screenshots/home.jpg)](https://koimsurai.com) | [![手記](.github/screenshots/notes.jpg)](https://koimsurai.com/blog) |
| **文章** | **照片：從深空傳回來的照片** |
| [![文章](.github/screenshots/post.jpg)](https://koimsurai.com/blog) | [![照片](.github/screenshots/photos.jpg)](https://koimsurai.com/photos) |
| **作品：往外長的螺旋航線** | **收藏：從地球發出的訊號** |
| [![作品](.github/screenshots/works.jpg)](https://koimsurai.com/portfolio) | [![收藏](.github/screenshots/collection.jpg)](https://koimsurai.com/watch) |
| **朋友：繞著同一個中心的星** | **航行日誌：從地表升空** |
| [![朋友](.github/screenshots/friends.jpg)](https://koimsurai.com/friends) | [![航行日誌](.github/screenshots/log.jpg)](https://koimsurai.com/history) |
| **設備：太空船的工程圖** | **此站點** |
| [![設備](.github/screenshots/setup.jpg)](https://koimsurai.com/setup) | [![此站點](.github/screenshots/colophon.jpg)](https://koimsurai.com/about-site) |

### 後台

| 此刻 | 手記 |
|:---:|:---:|
| ![後台：此刻](.github/screenshots/admin-dashboard.jpg) | ![後台：手記](.github/screenshots/admin-posts.jpg) |
| **碎念**：右邊是同步進來的紀錄，按「寫」帶進左邊 | **留言**：左邊清單、右邊那一則，鍵盤 j／k／a／s／r |
| ![後台：碎念](.github/screenshots/admin-thoughts.jpg) | ![後台：留言](.github/screenshots/admin-comments.jpg) |

## 🚀 2026-10 的大遷移

這次不是換皮，是把整個站照上面的三條規則重新做一遍。舊版的樣子在 [`v1-final`](https://github.com/Koimsurai/sora-to-ki/tree/v1-final)。

**前台**

- 配色從品牌紫、洋紅、Happy Hues 那套收回到三樣材料；連結滑過變綠發光那條拿掉
- 每一頁各畫各的天空（`src/components/*/*Sky.ts`，2D canvas），共用首頁那顆土星的點與線；換頁時用轉場把兩片天空接起來
- 拿掉游標尾巴、流星、UFO 與首訪的高速穿越開場：裝飾一多，「一個畫面只有一個訊號」就不成立
- 字換成思源宋體並按頁裁字；每一頁有自己的動態分享圖

**後台**

- 換成跟前台同一套材料，側欄照前台的分區分成「此刻、寫、收、回、站」
- 內容撐滿側欄右邊的寬度（清單類的頁面收成一欄置中）；換頁時舊畫面淡出、新的那頁淡入上浮，切分頁也一樣
- 新功能：排程發佈、回收桶、碎念附作品、友鏈申請審核、照片與收藏的前台顯示設定（見下面「站台本身」）

**更早的一次遷移**：2026-07 後端從 Express 整套搬到 Rust，120 多個端點逐一對拍、確認回應一模一樣才切換。過程記錄在 [`backend/STRANGLER.md`](backend/STRANGLER.md)。

## ✨ 有什麼

### 手記與碎念

- **MDX 文章**：除了 GFM，另有二十多個自訂區塊（程式碼分頁、Diff、檔案樹、圖表、投票、手繪風草圖、日文振假名、劇透、站長註解…）
- **五種語系**：繁中、簡中、English、日本語、한국어。簡中用 OpenCC 自動轉換，每篇文章可以各自翻譯
- **程式碼高亮**：Shiki 走 JavaScript 正規式引擎（文章頁不用下載 wasm），只有 C 家族語言才載入 Oniguruma
- **Mermaid 圖表**：可縮放、平移、全螢幕，跟著站點配色
- **圖片不跳版**：上傳時算出 thumbhash 和原始尺寸，載入前先顯示模糊佔位圖
- **留言、按讚、系列文、目錄、閱讀進度**，以及 RSS、電子報（Resend）
- **碎念**：短篇動態，可以附上連結卡片，或從同步進來的紀錄帶入一部片、一本書、一首歌，前台寫成「看了／讀了／聽了」

### 收藏與生活紀錄

- **在看什麼**：動畫瘋觀看紀錄自動同步（[anigamer](https://github.com/Koimsurai/anigamer-rs)，自己寫的 SDK），電影與影集透過 Simkl 和 TMDb 同步
- **音樂**：Spotify 正在播放、最近播放、最愛曲風
- **書櫃**：ISBN 查詢走國家圖書館的資料
- **照片**：EXIF 資訊、CLIP 自動標籤、可縮放的全螢幕檢視；標題、標籤、精選與隱藏在後台改，NAS 重新同步不會蓋掉
- **動態**：WakaTime 寫程式時數、GitHub 活動、Steam 個人檔案與遊戲時數
- **設備**：主機的零件與家裡的網路拓樸，畫成工程圖

### 站台本身

- **太空背景**：星空與首頁的土星由 three.js（WebGPU，不支援時退回 WebGL2）在 Web Worker 的 OffscreenCanvas 裡算；偵測到軟體渲染的裝置自動改成純 CSS
- **自製後台**，照前台的分區：
  - **此刻**：總覽列出等你處理的事、近 28 天的 Web Vitals
  - **寫**：Monaco 編輯器（夜色主題、Vim 模式、斜線指令、拖放上傳）與即時預覽；**排程發佈**（到時間自動發，電子報也那時才寄）；刪掉的文章先進**回收桶**，30 天內可以還原；**碎念**的右邊列出巴哈、Simkl、Spotify、書架同步進來的紀錄，按「寫」帶進撰寫框
  - **收**：觀看紀錄與聽的歌可以設成不公開、排收藏頁的最愛；書架；照片的標題、標籤、精選
  - **回**：留言審核（鍵盤 j／k／a／s／r 操作）、**友鏈申請**（朋友頁的表單直接送進來，一鍵檢查對方的站連得到、有沒有回連、有沒有 RSS）、電子報訂閱者
  - **站**：帳號與權限
- **MCP server**：[`packages/mcp-server`](packages/mcp-server) 提供 27 個工具，讓 AI 助手透過後台 API 寫文章（含排程與回收桶）、發碎念、上傳圖片、管理分類
- **其他**：GitHub／Google 登入、命令面板（`Ctrl+K`）、PWA 離線頁、每語系各自的 sitemap 與 hreflang、嚴格的 CSP、自架的錯誤追蹤（GlitchTip）與 Core Web Vitals 回報

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
- **設計 token 有檢查在擋**：間距、字級、行高、圓角、透明度…都必須用 `src/index.css` 裡的 token，`pnpm check:css-tokens` 會擋掉現編的值

## 🛠️ 技術

| | |
|---|---|
| **前端** | React 19 · TanStack Start / Router / Query · Vite+（vite、vitest、oxlint、oxfmt）· Tailwind CSS v4 · Framer Motion · three.js · MDX · @pierre/highlights · pele · rough.js · i18next · Radix UI / shadcn |
| **後端** | Rust 2024 · axum · tokio · sqlx（SQLite）· JWT + bcrypt · image / resvg / thumbhash（圖片與分享圖）· ferrous-opencc · utoipa（OpenAPI，`/api/docs`）· Sentry SDK |
| **字** | 思源宋體（按頁裁字）· Instrument Serif · 等寬字 |
| **基礎設施** | Docker Compose · nginx · GitHub Actions · Codecov · 自架 GlitchTip |

## 🧪 品質把關

每個 PR 都要通過下面這些才能合併（完整清單在 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)）：

- **型別與 lint**：`tsc`、oxlint（含型別感知規則與 `@shadcn/lint`）、Biome（CSS）、CSS token 檢查、knip（沒用到的檔案與 export）
- **測試**：vitest 單元測試、Playwright e2e（21 支 spec，含無障礙檢查、後台的往返操作，以及公開頁 11 條 × 3 種寬度加上後台頁的計算後樣式比對）、後端 cargo-nextest 搭配覆蓋率門檻
- **API**：用 OpenAPI 規格自動產生測試資料打後端（Schemathesis），並檢查回應符合宣告的 schema
- **後端**：`cargo clippy`（pedantic）、`cargo audit`、`cargo shear`、`typos`
- **效能**：Lighthouse CI 的效能預算
- **另外**（不在 CI，手動跑）：變異測試（Stryker、cargo-mutants），找出「測試有跑到、但其實沒在檢查」的地方

## 🛰️ 架自己的站

只需要一台裝了 Docker 的機器，和一個指向它的網域。

```bash
git clone https://github.com/Koimsurai/sora-to-ki.git
cd sora-to-ki
cp .env.example .env                  # 網址、網域、站名、聯絡方式
cp .env.backend.example .env.backend  # JWT_SECRET、GitHub 或 Google 登入
docker compose up -d
docker compose logs backend-rs | grep setup   # 初次設定的網址
```

- 映像是發版時建好的（[GHCR](https://github.com/Koimsurai?tab=packages&repo_name=sora-to-ki)），不必在自己機器上編譯；要從原始碼建就加 `--build`
- 內建 Caddy：`.env` 的 `CADDY_ADDRESS` 填網域會自動申請 HTTPS；在本機試跑就填 `:80`，打開 <http://localhost>
- 第一次開機會在 log 印一行 `setup: open …/admin/init?code=…`。打開它：用 GitHub 或 Google 登入認領站長，
  再選語系、填站名、決定要開哪些頁面。登入的設定方式精靈裡一步一步寫著；`.env.backend` 填了 `OWNER_EMAIL` 的話不走精靈，
  用那個信箱登入就是站長
- 後台在 `/admin`，只能用 GitHub 或 Google 登入（`ADMIN_USERNAME`／`ADMIN_PASSWORD` 是給 MCP 用的機器帳號，不是給人登入的）。
  站名、介紹、哪幾頁要開，之後都在後台（或 MCP）改
- 升級：`docker compose pull && docker compose up -d`。要固定版本就在 `.env` 設 `SORA_TO_KI_VERSION=0.1.0`
- 資料庫每天自動備份到 `./backups`

- 關於、作品、航行日誌、此站點的問答、設備的內容都在後台「頁面」填（MCP 也能改）。新站的設備與照片預設是關著的
  （一個要先選圖紙、一個要先接相片來源），準備好再到站台設定打開
- 設備頁想用自己的手繪圖紙、讓滑過的部件整個亮起來：做一個圖紙包放進 `custom/setup/`，
  格式與交給 AI 的說法見 [`custom/setup/README.md`](custom/setup/README.md)

### 交給 AI 架

用 Claude Code、Codex 這類能在主機上跑指令的 AI 也可以，把下面這段貼給它（`<…>` 換成你的）：

```text
在這台主機上架 https://github.com/Koimsurai/sora-to-ki ，照 README「架自己的站」做。
網域是 <blog.example.com>，站名 <站名>，預設語系 <zh-TW>。
- .env：SITE_URL、CADDY_ADDRESS 填網域；.env.backend 的 JWT_SECRET 用 `openssl rand -hex 32` 產生
- 80／443 已經被別的服務用了的話，不要停掉它：照 docker-compose.yml 開頭的說明寫 docker-compose.override.yml
- 起來之後把 `docker compose logs backend-rs | grep setup` 那行網址給我，登入與認領我自己來
- .env、.env.backend 不要提交、不要貼到別的地方
```

登入一定要你本人來：GitHub／Google 的 OAuth App 是用你的帳號建的，精靈第一步會一步一步帶你做。
AI 能做的是把機器準備好、把設定檔填對、在你建好 OAuth App 之後把兩串值填進 `.env.backend` 並重開後端。

## ⚙️ 本機開發

需要 **Node.js ≥ 26**、**pnpm 12**、**Rust stable**（edition 2024），或者只要 Docker。

```bash
git clone https://github.com/Koimsurai/sora-to-ki.git
cd sora-to-ki
pnpm install
```

### 分開跑前後端

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
| 登入（站長與讀者） | `GITHUB_CLIENT_ID` `GITHUB_CLIENT_SECRET` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `OWNER_EMAIL` |
| MCP 的機器帳號 | `ADMIN_USERNAME` `ADMIN_PASSWORD` |
| 動態頁 | `GITHUB_TOKEN` `WAKATIME_API_KEY` `STEAM_API_KEY` `STEAM_ID` |
| Spotify | `SPOTIFY_CLIENT_ID` `SPOTIFY_CLIENT_SECRET` `SPOTIFY_REFRESH_TOKEN` `SPOTIFY_REDIRECT_URI` |
| 影劇 | `TMDB_API_TOKEN` `SIMKL_CLIENT_ID` `SIMKL_ACCESS_TOKEN` `BAHAMUT_UID` `BAHAMUT_PASSWORD` |
| 書櫃 | `GOOGLE_BOOKS_API_KEY` `ENABLE_TW_ISBN_SYNC` |
| 電子報 | `RESEND_API_KEY` |
| 錯誤追蹤 | `SENTRY_DSN` `SENTRY_FRONTEND_DSN` |
| 後台流量（Plausible） | `PLAUSIBLE_API_KEY` `PLAUSIBLE_SITE_ID` |
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
│   ├── components/          # 依功能領域分組；各頁的天空在同名的 *Sky.ts
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

歡迎參考任何寫法。只是想架一個站的話，照上面「架自己的站」就好，不需要 fork。幾件事先說：

- 程式碼採 **AGPL-3.0**：如果你改過之後**架成網站對外提供**，也要以相同授權公開修改後的原始碼
- 站上的**文章、照片、碎念、頭像與 logo 都不在授權範圍內**（見下方），fork 之後請換成你自己的
- 不接受 PR
- 想要翻新前的版本，從 tag [`v1-final`](https://github.com/Koimsurai/sora-to-ki/tree/v1-final) 開始
- 有問題或發現 bug 都歡迎開 [issue](https://github.com/Koimsurai/sora-to-ki/issues)

## 📄 授權

- **程式碼**：[GNU Affero General Public License v3.0](LICENSE)
- **內容**：文章、照片、碎念、書評、頭像與 logo 等站點內容 © Koimsurai，**保留所有權利**，未經同意請勿轉載或重製

## 🙏 致謝

站上用到的開源專案很多，特別感謝
[TanStack](https://tanstack.com/)、[axum](https://github.com/tokio-rs/axum)、[sqlx](https://github.com/launchbadge/sqlx)、
[three.js](https://threejs.org/)、[MDX](https://mdxjs.com/)、[pele](https://pele.run/)、[rough.js](https://roughjs.com/)、
[Excalifont](https://github.com/excalidraw/excalidraw)、[小賴字體](https://github.com/lxgw/kose-font)、[Radix UI](https://www.radix-ui.com/)、[shadcn/ui](https://ui.shadcn.com/)、
[OpenCC](https://github.com/BYVoid/OpenCC)、[thumbhash](https://github.com/evanw/thumbhash)、
[思源宋體](https://github.com/adobe-fonts/source-han-serif)、[Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif)，
以及 [Vite+](https://viteplus.dev/) 與 oxc 的工具鏈。

## 🌌 更多

- 此站點（設計的完整說明）：<https://koimsurai.com/about-site>
- 站點走過的路：<https://koimsurai.com/history>
- 舊站（v1，唯讀）：<https://archive.koimsurai.com>
- 交換友鏈（頁面上的表單直接申請）：<https://koimsurai.com/friends>
