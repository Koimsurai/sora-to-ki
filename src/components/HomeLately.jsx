// 首頁「動態帶」— 近期文章 / 碎念 / 留言迴聲 / 年度軌跡 / 今日訊號收尾。
// 取代原本的 Contact section（聯絡資訊 hero 與 footer 已足夠），
// 收尾的訊號區塊掛 id="contact" 讓既有錨點（hero CTA / footer / Messages）續用。
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './HomeLately.css';

const API = import.meta.env.VITE_API_URL || '/api';

/** 相對時間（30 天內），更久就顯示日期 */
function timeAgo(iso, t) {
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 3600) return t('home.lately.justNow');
  if (sec < 86400) return t('home.lately.hoursAgo', { n: Math.floor(sec / 3600) });
  if (sec < 86400 * 30) return t('home.lately.daysAgo', { n: Math.floor(sec / 86400) });
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 年度軌跡：把日期轉成 0~100% 位置 */
function yearPct(iso) {
  const d = new Date(String(iso).replace(' ', 'T'));
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear() + 1, 0, 1);
  return ((d - start) / (end - start)) * 100;
}

function OrbitTimeline({ timeline, t }) {
  const now = new Date();
  const nowPct = yearPct(now.toISOString());
  const seasons = [
    { pct: 4, key: 'winter' },
    { pct: 29, key: 'spring' },
    { pct: 54, key: 'summer' },
    { pct: 79, key: 'autumn' },
  ];
  // 同天（或太近）的點往右錯開，不要疊在一起；timeline 已依日期 ASC
  const MIN_GAP = 1.1; // %
  let lastPct = -Infinity;
  const dots = timeline.map((p) => {
    let pct = yearPct(p.created_at);
    if (pct - lastPct < MIN_GAP) pct = lastPct + MIN_GAP;
    lastPct = pct;
    return { ...p, pct: Math.min(pct, 99) };
  });
  return (
    <div className="lately-orbit">
      <h2 className="lately-h">{t('home.lately.orbitTitle')}</h2>
      <div className="orbit-track" aria-hidden="false">
        <div className="orbit-line" />
        {seasons.map((s) => (
          <span key={s.key} className="orbit-season" style={{ left: `${s.pct}%` }}>
            {t(`home.lately.seasons.${s.key}`)}
          </span>
        ))}
        {dots.map((p) => (
          <Link
            key={p.id}
            to={`/blog/${p.id}`}
            className="orbit-dot"
            style={{ left: `${p.pct}%` }}
            data-title={p.title}
            aria-label={p.title}
          />
        ))}
        <span className="orbit-now" style={{ left: `${nowPct}%` }} data-title={t('home.lately.today')} />
      </div>
      <div className="orbit-stat">
        {t('home.lately.orbitStat', { count: timeline.length })}
        <span className="orbit-stat-dot">·</span>
        <Link to="/blog" className="lately-more">{t('home.lately.viewAll')} →</Link>
      </div>
    </div>
  );
}

export default function HomeLately() {
  const { t, i18n } = useTranslation();
  const [digest, setDigest] = useState(null);
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    fetch(`${API}/home/digest`)
      .then((r) => r.json())
      .then((d) => setDigest(d))
      .catch(() => setDigest({ posts: [], thoughts: [], comments: [], timeline: [] }));
  }, []);

  // /#contact 深連結：本元件 lazy 掛載比 Header 的 100ms hash 捲動晚，掛載後自己補捲
  useEffect(() => {
    if (digest && window.location.hash === '#contact') {
      requestAnimationFrame(() => {
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, [digest]);

  useEffect(() => {
    fetch(`${API}/quote/daily?locale=${encodeURIComponent(i18n.resolvedLanguage || i18n.language)}`)
      .then((r) => r.json())
      .then((d) => setQuote(d.quote))
      .catch(() => setQuote(null));
  }, [i18n.resolvedLanguage, i18n.language]);

  const posts = digest?.posts || [];
  const thoughts = digest?.thoughts || [];
  const comments = digest?.comments || [];
  const timeline = digest?.timeline || [];

  return (
    <section className="home-section lately-v1">
      <div className="home-section-eyebrow">
        <span className="section-label">Lately</span>
        <span className="section-eyebrow-count">{t('home.lately.eyebrow')}</span>
      </div>

      <div className="lately-grid">
        {/* 左欄：近期文章 */}
        <div className="lately-posts">
          <h2 className="lately-h">{t('home.lately.postsTitle')}</h2>
          {posts.length === 0 && <p className="lately-empty">{t('home.lately.empty')}</p>}
          <ol className="lately-post-list">
            {posts.map((p, i) => (
              <li key={p.id}>
                <Link to={`/blog/${p.id}`} className="lately-post">
                  <span className="lately-post-no">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lately-post-body">
                    <span className="lately-post-title">{p.title}</span>
                    <span className="lately-post-meta">
                      {p.category ? `${p.category} · ` : ''}{timeAgo(p.created_at, t)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {/* 右欄：碎念 + 迴聲 */}
        <aside className="lately-side">
          <div className="lately-block">
            <h2 className="lately-h">
              {t('home.lately.murmursTitle')}
              <Link to="/thinking" className="lately-more lately-h-more">{t('home.lately.more')} →</Link>
            </h2>
            {thoughts.length === 0 && <p className="lately-empty">{t('home.lately.empty')}</p>}
            <ul className="lately-murmurs">
              {thoughts.map((th) => (
                <li key={th.id}>
                  <Link to={`/thinking/${th.id}`} className="lately-murmur">
                    <p className="lately-murmur-text">「{th.content}」</p>
                    <span className="lately-post-meta">{timeAgo(th.created_at, t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lately-divider" />

          <div className="lately-block">
            <h2 className="lately-h">{t('home.lately.echoesTitle')}</h2>
            {comments.length === 0 && <p className="lately-empty">{t('home.lately.empty')}</p>}
            <ul className="lately-echoes">
              {comments.map((c) => (
                <li key={c.id}>
                  <Link
                    to={c.thought_id ? `/thinking/${c.thought_id}` : `/blog/${c.post_id}`}
                    className="lately-echo"
                  >
                    <p className="lately-echo-text">{c.content}</p>
                    <span className="lately-post-meta">
                      — {c.author}
                      {c.post_title ? ` · ${c.post_title}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <OrbitTimeline timeline={timeline} t={t} />

      {/* 今日訊號 — 詩意收尾，承接 #contact 錨點 */}
      <div className="lately-signal" id="contact">
        <span className="section-label signal-label">{t('home.signal.label')}</span>
        {quote && (
          <>
            <blockquote className="signal-quote">「{quote.text}」</blockquote>
            {quote.from && <span className="signal-from">— {quote.from}</span>}
          </>
        )}
        <div className="signal-contact">
          <span className="signal-dot" />
          {t('home.signal.open')}
          <span className="orbit-stat-dot">·</span>
          <a href="mailto:timo9378@gmail.com" className="signal-mail">timo9378@gmail.com</a>
        </div>
      </div>
    </section>
  );
}
