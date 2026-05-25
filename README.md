# 宙と木 (Koimsurai) — Personal Site & Blog

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

Koimsurai 的個人網站原始碼。一個 full-stack blog + portfolio + 多平台 activity dashboard，從 2025 年 4 月持續開發到現在。

🌐 **Live**: <https://koimsurai.com>

---

## ✨ Features

### Blog（手記）

- **完整 CMS** — 自製管理後台、文章 / 分類 / 標籤 / 系列文 / 評論 / 訂閱者 / 圖片管理
- **Markdown 編輯器** — Monaco Editor + Vim 模式 + 自訂 snippets + 斜線指令 + 拖放上傳
- **語法高亮** — Shiki async highlight，零 client-side 庫 bundle
- **Mermaid 圖表** — 即時渲染 + 多主題 + zoom/pan/fullscreen
- **多語系 i18n** — 繁中 / 簡中 / English / 日本語，OpenCC 自動轉繁簡，每語系獨立 Monaco model
- **AI 輔助** — AI 摘要生成、AI 標籤建議、文章自動生成
- **Thumbhash** — 上傳圖片自動產 25-byte hash 作為模糊佔位圖防 CLS
- **Newsletter** — Resend 整合，published 時自動推送，前端持久化訂閱狀態 + 一鍵退訂
- **PWA** — vite-plugin-pwa autoUpdate，NetworkFirst posts API、CacheFirst 圖片

### Home / Portfolio

- **3D 互動** — Three.js + @react-three/fiber Saturn 場景，hyperspace canvas intro 動畫
- **多平台 Activity Dashboard** — 即時抓 WakaTime / GitHub / Steam / Spotify 數據
  - Steam 個人化卡片：動畫頭像 + 頭像框 + 等級徽章 + nameplate webm
  - Spotify circuit breaker：audio-features API 廢棄後改抓 metadata + cache
- **照片牆** — Masonry layout + EXIF 提取 + AI CLIP Tagger 自動標籤 + 全螢幕 PhotoViewer (zoom/pan/share)
- **3D 書櫃** — Zero Gravity Library，可拖曳 3D 書本互動
- **資訊頁** — 此站點 / 歷史 / 留言 / 友鏈， 風 sticky TOC + scrollspy
- **OAuth 登入** — GitHub / Google，RBAC 用戶分權

### Infra

- **API Gateway** — Express.js proxy，串接外部 API 並保護 keys
- **動態 Sitemap** — 每語系獨立 URL + hreflang alternates
- **OG 圖自動生成** — 文章發布時自動產 1200×630 OG card
- **Dependabot 緊跟** — 漏洞 < 24 小時內處理

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + **Vite** + **React Router**
- **Tailwind CSS** + 大量 scoped CSS modules
- **Three.js / @react-three/fiber** for 3D scenes
- **Framer Motion** + **React Spring** for animations
- **Monaco Editor** with monaco-vim for blog editing
- **Shiki** lazy-loaded code highlighting
- **Mermaid** with ELK layout
- **React-Markdown** + remark-gfm + remarkAlert + rehype-raw

### Backend
- **Node.js** + **Express.js**
- **SQLite** with `sqlite3` native bindings (含 migration)
- **JWT** + **bcryptjs** authentication
- **Sharp** for image processing
- **Thumbhash** for blur placeholder
- **OpenCC-js** for 繁簡 conversion
- **Resend** for transactional email
- **opencc-js**, **axios**, **express-rate-limit**

### DevOps
- **Docker Compose** (`frontend` + `backend` + 共用 volumes)
- **Nginx** reverse proxy
- **pnpm** monorepo（含 frozen-lockfile build）

---

## ⚙️ Local Development

### Prerequisites
- Node.js v20+
- pnpm v10+
- Docker + Docker Compose（推薦走 Docker 跑）

### Setup

```bash
git clone https://github.com/timo9378/web.git
cd web

# 後端 .env
cp server/.env.example server/.env
# 編輯 .env，填入 ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET /
# WAKATIME_API_KEY / STEAM_API_KEY / STEAM_ID / SPOTIFY_* / RESEND_API_KEY 等

# 安裝
pnpm install

# 開發模式（單獨跑 frontend，後端打 13588）
pnpm dev
```

### Docker (推薦)

```bash
docker-compose up -d --build
# 站點：http://localhost:13588
docker-compose logs -f frontend backend
```

---

## 📂 Project Structure

```
/
├── server/                  # Express API gateway + SQLite
│   ├── index.js             # 主入口（routes / migrations / cron）
│   ├── mailer.js            # Resend newsletter batch sender
│   └── db/db.sqlite         # gitignored
├── src/
│   ├── components/
│   │   ├── animate-ui/      # shadcn animate-ui icons
│   │   ├── article-preview/ # hover sidebar 文章 preview 卡片
│   │   ├── mega-menu/       # 三欄式 mega menu 系統
│   │   ├── BlogPost.jsx     # 主文章頁
│   │   ├── InfoPage.jsx     # 此站點 / 歷史 / 留言 / 友鏈 layout
│   │   └── admin/           # 後台
│   ├── hooks/
│   └── lib/
├── public/
├── Dockerfile
└── docker-compose.yml
```

---

## 📜 Scripts

```bash
pnpm dev           # frontend dev server
pnpm build         # production build
pnpm preview       # serve production build
pnpm build:photos  # 處理照片牆圖片（EXIF + thumbhash + CLIP tagger）

# 後端
cd server && pnpm start  # or pnpm dev for auto-reload
```

---

## 🌌 More

站點走過的路：<https://koimsurai.com/history>
此站點 Q&A：<https://koimsurai.com/about-site>

歡迎友鏈：<https://koimsurai.com/friends>
