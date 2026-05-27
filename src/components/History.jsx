import React, { useEffect, useState } from 'react';
import InfoPage from './InfoPage';
import { LinkCard } from './BlogPost';

const SITE_BIRTH = new Date('2025-04-01T00:00:00+08:00');

// 從 git commit log 細讀後挑出的里程碑（big: true 是該階段最有代表性的）
const MILESTONES = [
  { date: '2025-04-01', text: '站點誕生 — Docker + SSL + Nginx 反向代理一次配齊', big: true },
  { date: '2025-04-05', text: 'Hero 區與作品集首版上線' },
  { date: '2025-08-25', text: '部落格上線 — 前後端完整實作（Express + SQLite + Nginx）。文章跟書籍忘記備份要找一下在哪裡...', big: true },
  { date: '2025-09-24', text: '效能優化大改造 — Lazy loading / useInView / 不可見時暫停動畫' },
  { date: '2025-10-07', text: 'Activity 動態頁面 + Steam / GitHub API 整合' },
  { date: '2025-10-08', text: 'Now 頁面 — 「目前在做什麼」（mood / location / learning / projects）' },
  { date: '2025-10-09', text: '0G Library — Three.js 3D 書本互動' },
  { date: '2025-10-10', text: 'PhotoViewer 全螢幕 + 星空相簿 + Music (Spotify)' },
  { date: '2025-10-11', text: 'shadcn/ui 元件導入 + 後台 Dashboard 重構' },
  { date: '2025-10-14', text: '自訂網域 — koimsurai.blogsyte.com:13579 → koimsurai.com', big: true },
  { date: '2025-12-10', text: '全專案改用 pnpm，新增 /cinema /anime 頁面' },
  { date: '2026-01-08', text: '搬家到自家 HomeLab — Ubuntu 重灌、Docker 起跑、站台從舊機器整批遷移過來' },
  { date: '2026-02-11', text: 'SEOHead 動態 metadata + Setup 深空主題頁面' },
  { date: '2026-02-19', text: '玻璃擬態風格全面導入 + AI 文章生成功能' },
  { date: '2026-02-20', text: 'AI 摘要 + AI 標籤建議 + ImageLightbox 燈箱' },
  { date: '2026-02-21', text: 'OAuth 登入 + RBAC 用戶管理（管理員 / 訪客分權）' },
  { date: '2026-02-24', text: 'RSS 供應 + Mermaid 圖表語法支援' },
  { date: '2026-02-26', text: '404 頁面 + 自動 OG 圖生成 + CJK 字型安裝' },
  { date: '2026-04-09', text: '黑洞、動態頁面重構 + 動態 sitemap' },
  { date: '2026-04-18', text: 'Spotify audio-features API 棄用緊急應對 — 加快取 + 熔斷器' },
  { date: '2026-04-20', text: '多語系 i18n — zh-TW / zh-CN / en / ja + OpenCC 繁簡轉換 + Monaco per-locale models', big: true },
  { date: '2026-04-25', text: 'Blog 風格統一 + Zen 編輯模式 + 拖放上傳 + 斜線指令 + View Transitions' },
  { date: '2026-04-26', text: '大規模設計重做 — Shiki + PWA + Series + Reactions + koim 全域按鈕系統 + Steam 動畫頭像', big: true },
  { date: '2026-04-26', text: '處理 33 個 Dependabot 漏洞（vite / axios / xmldom / dompurify / lodash / serialize-javascript ...）' },
  { date: '2026-05-08', text: 'Thumbhash 模糊佔位圖 + 編輯器 Vim 模式 + 自訂 snippets + 閱讀時間' },
  { date: '2026-05-15', text: '首頁版面重做 + 蟲洞 intro + Newsletter 全套訂閱系統（Resend）', big: true },
  { date: '2026-05-25', text: '新增 此站點 / 歷史 / 留言 三頁 + Portfolio 補上 GitHub repos + 全站字型統一 MiSans + Hero / Footer / Mega menu 視覺重整', big: true },
];

function useUptime() {
  const [text, setText] = useState('');
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      const diffMs = now - SITE_BIRTH;
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      setText(`${days} 天 ${hours} 小時 ${mins} 分 ${secs} 秒`);
    };
    fmt();
    const t = setInterval(fmt, 1000);
    return () => clearInterval(t);
  }, []);
  return text;
}

function History() {
  const uptime = useUptime();

  return (
    <InfoPage
      title="歷史"
      subtitle="站點走過的長河"
      slug="history"
      prev={{ to: '/about-site', title: '此站點 — 一個工程師的個人空間' }}
      next={{ to: '/messages', title: '留言 — 想說什麼都可以' }}
      closingNote={`本站已運行：${uptime}`}
    >
      <p>
        從 2025 年 4 月第一個 commit 到現在，記錄站點走過的每一個重要轉折。
        以下只挑出比較重要的時間點，碎碎念的變更就不列了。
      </p>

      <h2 id="timeline">里程碑</h2>

      <ul className="info-page-timeline">
        {MILESTONES.map((m) => (
          <li
            key={m.date}
            className={'info-page-timeline-item' + (m.big ? ' info-page-timeline-item--big' : '')}
          >
            <span className="info-page-timeline-date">{m.date}</span>
            <span className="info-page-timeline-text">
              {m.big ? <strong>{m.text}</strong> : m.text}
            </span>
          </li>
        ))}
      </ul>

      <p style={{ marginTop: '2rem', fontWeight: 600, color: 'rgba(244,244,245,0.95)' }}>
        一路走來，感謝有你。
      </p>

      <p style={{ marginTop: '2.5rem', color: 'rgba(229,229,245,0.55)', fontSize: '0.9rem' }}>
        想看更多側面，或是找我聊天，可以從這裡開始：
      </p>
      <LinkCard href="https://github.com/timo9378" />
    </InfoPage>
  );
}

export default History;
