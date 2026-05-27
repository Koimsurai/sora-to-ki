import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const START_YEAR = 2025;

function useStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data?.message !== 'success') return;
        setStats({ total: data.total_posts || 0, days: data.days || 1 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return stats;
}

// 在線人數：目前後端沒有 endpoint，直接回傳 null 走 fallback 顯示文章數 / 天數
// 之後想做即時人數，可加 SSE / WebSocket，或前端 fetch /api/online
function useOnline() {
  return null;
}

const ExternalArrow = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden style={{ marginLeft: 3, opacity: 0.6 }}>
    <path d="M3 1h6v6M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Footer() {
  const currentYear = new Date().getFullYear();
  const yearRange = currentYear > START_YEAR ? `${START_YEAR}-${currentYear}` : String(START_YEAR);
  const stats = useStats();
  const online = useOnline();

  return (
    <footer className="app-footer">
      <div className="app-footer-glow" aria-hidden />
      <div className="app-footer-container">
        <div className="app-footer-grid">
          {/* 品牌欄 */}
          <div className="app-footer-brand">
            <h3 className="app-footer-brand-name">Koimsurai</h3>
            <p className="app-footer-brand-tagline">Stay hungry. Stay foolish.</p>
            <p className="app-footer-copy">
              © {yearRange} Powered by{' '}
              <a href="https://github.com/timo9378/web" target="_blank" rel="noopener noreferrer">
                Koim Stack
              </a>
              {' & '}
              <a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer">Vite</a>
            </p>
            <div className="app-footer-meta">
              <span className="app-footer-viewers">
                <span className="app-footer-dot" />
                {typeof online === 'number'
                  ? `正被 ${online} 人披覽`
                  : stats
                    ? `已累積 ${stats.total} 篇文 · 寫了 ${stats.days} 天`
                    : '載入中…'}
              </span>
            </div>
          </div>

          {/* 關於 */}
          <div className="app-footer-col">
            <h4 className="app-footer-col-title">關於</h4>
            <Link to="/about-site" className="app-footer-link">關於本站</Link>
            <a href="/#about-me" className="app-footer-link">關於我</a>
            <a
              href="https://github.com/timo9378/web"
              target="_blank"
              rel="noopener noreferrer"
              className="app-footer-link"
            >
              關於此專案 <ExternalArrow />
            </a>
          </div>

          {/* 更多 */}
          <div className="app-footer-col">
            <h4 className="app-footer-col-title">更多</h4>
            <Link to="/photos" className="app-footer-link">照片廊</Link>
            <Link to="/setup" className="app-footer-link">配備</Link>
            <Link to="/activity" className="app-footer-link">動態</Link>
          </div>

          {/* 聯絡 */}
          <div className="app-footer-col">
            <h4 className="app-footer-col-title">聯繫</h4>
            <a href="/#contact" className="app-footer-link">寫留言</a>
            <a href="mailto:timo9378@gmail.com" className="app-footer-link">
              發郵件 <ExternalArrow />
            </a>
            <a
              href="https://github.com/timo9378"
              target="_blank"
              rel="noopener noreferrer"
              className="app-footer-link"
            >
              GitHub <ExternalArrow />
            </a>
          </div>
        </div>

        {/* 底部分隔 + 線 */}
        <div className="app-footer-divider" aria-hidden />

        {/* 底部資訊列 */}
        <div className="app-footer-bottom">
          <div className="app-footer-bottom-left">
            <a href="/api/rss" target="_blank" rel="noopener noreferrer" className="app-footer-bottom-link">
              RSS 訂閱
            </a>
            <span className="app-footer-bottom-sep">·</span>
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="app-footer-bottom-link">
              站點地圖
            </a>
            <span className="app-footer-bottom-sep">·</span>
            <a href="/#contact" className="app-footer-bottom-link">訂閱</a>
          </div>

          <div className="app-footer-bottom-right">
            <span className="app-footer-bottom-meta">繁體中文</span>
            <span className="app-footer-bottom-sep">·</span>
            <span className="app-footer-bottom-meta">Koimsurai © {currentYear}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
