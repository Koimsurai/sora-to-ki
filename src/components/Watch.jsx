import React from 'react';
import { motion } from 'framer-motion';
import SEOHead from './SEOHead';
import './Watch.css';

/* ──────────────────────────────────────────────────────────────
   在看什麼 — 編輯風「品味展示」
   內容浮在背景上、不裝玻璃盒、留白大、scroll 漸顯、克制動效
   mock 資料版。後端：anime_history（Bahamut）+ Letterboxd RSS + 手動策展
─────────────────────────────────────────────────────────────── */

const TMDB = (p) => `https://image.tmdb.org/t/p/w500${p}`;
const MAID = 'https://p2.bahamut.com.tw/B/2KU/71/1293ad110784ede7da06fe5e2d1yjsj5.JPG';

const NOW = {
  type: 'anime',
  title: '女僕小姐的貪吃日常',
  meta: '第 9 集 · 動畫瘋 · 5/27',
  poster: MAID,
  note: '深夜放鬆首選，療癒到不行。每一集都在我餓的時候播，很壞。',
};

const FAVORITES = [
  { id: 'a', title: '星際效應', year: 2014, poster: TMDB('/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'), rating: 5, quote: '在 IMAX 看完那刻，覺得電影這個媒介還有救。' },
  { id: 'b', title: '銀翼殺手 2049', year: 2017, poster: TMDB('/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'), rating: 5, quote: '美術跟攝影直接封神，每一格都能截圖當桌布。' },
  { id: 'c', title: '全面啟動', year: 2010, poster: TMDB('/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg'), rating: 5, quote: '第一次知道敘事可以這樣摺疊。' },
  { id: 'd', title: '駭客任務', year: 1999, poster: TMDB('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'), rating: 5, quote: '紅藥丸還是藍藥丸 —— 看完只想選紅的。' },
];

// 已按作品聚合：一部一筆
const RECENT = [
  { id: 'r1', type: 'anime', title: '女僕小姐的貪吃日常', poster: MAID, detail: '看到第 9 集', date: '5/27' },
  { id: 'r2', type: 'film', title: '沙丘', poster: TMDB('/d5NXSklXo0qyIYkgV94XAgMIckC.jpg'), rating: 4, date: '5/26' },
  { id: 'r4', type: 'film', title: '全面啟動', poster: TMDB('/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg'), rating: 5, date: '5/24' },
  { id: 'r5', type: 'film', title: '駭客任務', poster: TMDB('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'), rating: 5, date: '5/22' },
  { id: 'r6', type: 'film', title: '星際效應', poster: TMDB('/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'), rating: 5, date: '5/20' },
];

// 口味（文字化，取代雷達圖）
const TASTE_LINE = '偏好科幻與慢節奏敘事，是 Nolan 與 Villeneuve 的信徒；動畫挑日常療癒系。';
const TASTE_TAGS = ['科幻', '賽博龐克', '慢節奏', '諾蘭', 'Villeneuve', '日常系', '太空歌劇'];

const STATS = '今年 · 86 部動畫 · 42 部電影 · 平均 ★ 4.3';

const reveal = {
  initial: { opacity: 0, y: 26, filter: 'blur(8px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const Stars = ({ n }) => (
  <span className="w-stars">{'★'.repeat(n)}<span className="w-stars-dim">{'★'.repeat(5 - n)}</span></span>
);

function Watch() {
  return (
    <div className="w-page">
      <div className="w-scrim" />
      <SEOHead title="在看什麼" description="我的動畫與電影品味 — 自動同步自動畫瘋與 Letterboxd" />

      <div className="w-wrap">
        {/* header */}
        <motion.header className="w-header" {...reveal}>
          <h1 className="w-title">在看什麼</h1>
          <p className="w-subtitle">我的動畫與電影品味，一頁攤開給你看</p>
          <p className="w-stats-line">{STATS}</p>
        </motion.header>

        {/* 正在看 */}
        <motion.section className="w-now" {...reveal}>
          <span className="w-eyebrow w-eyebrow--live">● 正在看</span>
          <div className="w-now-body">
            <div className="w-now-poster">
              <img src={NOW.poster} alt={NOW.title} />
            </div>
            <div className="w-now-text">
              <h2 className="w-now-title">{NOW.title}</h2>
              <p className="w-now-meta">{NOW.meta}</p>
              <p className="w-now-note">{NOW.note}</p>
            </div>
          </div>
        </motion.section>

        {/* 鎮站之寶 —— 品味核心 */}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">鎮站之寶</h2>
          <p className="w-h2-sub">逢人就推的四部，hover 看我碎念</p>
          <div className="w-favs">
            {FAVORITES.map((f) => (
              <figure className="w-fav" key={f.id}>
                <div className="w-fav-poster">
                  <img src={f.poster} alt={f.title} loading="lazy" />
                  <figcaption className="w-fav-quote">「{f.quote}」</figcaption>
                </div>
                <p className="w-fav-title">{f.title}</p>
                <p className="w-fav-line"><Stars n={f.rating} /> <span className="w-fav-year">{f.year}</span></p>
              </figure>
            ))}
          </div>
        </motion.section>

        {/* 最近在看 */}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">最近在看</h2>
          <ul className="w-recent">
            {RECENT.map((r) => (
              <li className="w-recent-row" key={r.id}>
                <img className="w-recent-thumb" src={r.poster} alt={r.title} loading="lazy" />
                <span className="w-recent-title">{r.title}</span>
                <span className="w-recent-detail">{r.type === 'anime' ? r.detail : <Stars n={r.rating} />}</span>
                <span className="w-recent-date">{r.date}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* 口味（文字化）*/}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">口味</h2>
          <p className="w-taste-line">{TASTE_LINE}</p>
          <div className="w-taste-tags">
            {TASTE_TAGS.map((t) => <span className="w-tag" key={t}>{t}</span>)}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

export default Watch;
