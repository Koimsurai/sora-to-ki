import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SEOHead from './SEOHead';
import './Watch.css';

/* ──────────────────────────────────────────────────────────────
   在看什麼 — 編輯風「品味展示」
   - 動畫資料：/api/anime/history（後端透過 anigamer SDK 抓 Bahamut）
   - 電影資料：暫手動 curate（Letterboxd RSS 等之後接）
   - 一生推：純手動策展（這是主觀清單，不打算 auto-derive）
─────────────────────────────────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TMDB = (p) => `https://image.tmdb.org/t/p/w500${p}`;

/* ── 一生推（手動策展，想加就加；anime/drama/film 都可）── */
/* 「第 N 集」、「動畫瘋」服務名按語系切換 */
const EP_LABEL = {
  'zh-TW': '第 {{n}} 集', 'zh-CN': '第 {{n}} 集', en: 'Ep. {{n}}', ja: '第 {{n}} 話', ko: '{{n}}화',
};
const SERVICE_LABEL = {
  'zh-TW': '動畫瘋', 'zh-CN': '动画疯', en: 'Bahamut Anime', ja: '動畫瘋', ko: '動畫瘋',
};
const interpolate = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

const FAVORITES_STATIC = [
  { id: 'a', kind: 'film',  year: 2014, poster: TMDB('/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'), rating: 5 },
  { id: 'b', kind: 'film',  year: 2017, poster: TMDB('/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'), rating: 5 },
  { id: 'c', kind: 'film',  year: 2010, poster: TMDB('/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg'), rating: 5 },
  { id: 'd', kind: 'film',  year: 1999, poster: TMDB('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'), rating: 5 },
];

const FAVORITES_BY_LANG = {
  'zh-TW': [
    { title: '星際效應',      quote: '在 IMAX 看完那刻，覺得電影這個媒介還有救。' },
    { title: '銀翼殺手 2049', quote: '美術跟攝影直接封神，每一格都能截圖當桌布。' },
    { title: '全面啟動',      quote: '第一次知道敘事可以這樣摺疊。' },
    { title: '駭客任務',      quote: '紅藥丸還是藍藥丸 —— 看完只想選紅的。' },
  ],
  'zh-CN': [
    { title: '星际穿越',      quote: '在 IMAX 看完那刻，觉得电影这个媒介还有救。' },
    { title: '银翼杀手 2049', quote: '美术跟摄影直接封神，每一格都能截图当桌布。' },
    { title: '盗梦空间',      quote: '第一次知道叙事可以这样折叠。' },
    { title: '黑客帝国',      quote: '红药丸还是蓝药丸 —— 看完只想选红的。' },
  ],
  en: [
    { title: 'Interstellar',      quote: 'Walking out of the IMAX hall, I felt cinema still had a future.' },
    { title: 'Blade Runner 2049', quote: 'Production design and cinematography straight to god tier — every frame a wallpaper.' },
    { title: 'Inception',         quote: 'First time I realised narrative could fold like this.' },
    { title: 'The Matrix',        quote: 'Red pill or blue pill — afterwards I only wanted the red.' },
  ],
  ja: [
    { title: 'インターステラー',      quote: 'IMAX で観終わった瞬間、映画というメディアにはまだ未来があると思いました。' },
    { title: 'ブレードランナー 2049', quote: '美術と撮影が神の領域。どのフレームも壁紙にできる。' },
    { title: 'インセプション',        quote: '物語をこんなふうに折りたためるんだ、と初めて知った作品。' },
    { title: 'マトリックス',          quote: '赤い薬か青い薬か —— 観終わったあと、赤しか選びたくなかった。' },
  ],
  ko: [
    { title: '인터스텔라',        quote: 'IMAX 에서 본 순간, 영화라는 매체에 아직 미래가 있다고 느꼈어요.' },
    { title: '블레이드 러너 2049', quote: '미술과 촬영이 신의 영역. 모든 프레임이 배경화면감.' },
    { title: '인셉션',             quote: '서사를 이렇게 접을 수 있다는 걸 처음 알게 해 준 작품.' },
    { title: '매트릭스',           quote: '빨간 약인지 파란 약인지 — 본 뒤엔 빨간 거밖에 안 끌렸습니다.' },
  ],
};

/* 電影最近在看（暫時手動，等 Letterboxd / Trakt 串好替換） */
const FILMS_RECENT = [
  { id: 'f1', type: 'film', poster: TMDB('/d5NXSklXo0qyIYkgV94XAgMIckC.jpg'), rating: 4, isoDate: '2026-05-26', date: '5/26', titleByLang: { 'zh-TW': '沙丘', 'zh-CN': '沙丘', en: 'Dune', ja: 'デューン 砂の惑星', ko: '듄' } },
];

const TASTE_BY_LANG = {
  'zh-TW': {
    line: '偏好科幻與慢節奏敘事，是 Nolan 與 Villeneuve 的信徒；動畫挑日常療癒系。',
    tags: ['科幻', '賽博龐克', '慢節奏', '諾蘭', 'Villeneuve', '日常系', '太空歌劇'],
  },
  'zh-CN': {
    line: '偏好科幻与慢节奏叙事，是 Nolan 与 Villeneuve 的信徒；动画挑日常治愈系。',
    tags: ['科幻', '赛博朋克', '慢节奏', '诺兰', 'Villeneuve', '日常系', '太空歌剧'],
  },
  en: {
    line: 'Sci-fi and slow-burn storytelling, a disciple of Nolan and Villeneuve; on the anime side I pick comfort slice-of-life.',
    tags: ['Sci-fi', 'Cyberpunk', 'Slow burn', 'Nolan', 'Villeneuve', 'Slice of life', 'Space opera'],
  },
  ja: {
    line: 'SF とスローテンポの物語が好きで、Nolan と Villeneuve の信者。アニメは日常系の癒し作品を選びがちです。',
    tags: ['SF', 'サイバーパンク', 'スローテンポ', 'ノーラン', 'Villeneuve', '日常系', 'スペースオペラ'],
  },
  ko: {
    line: 'SF 와 느린 호흡의 서사를 선호하고, Nolan 과 Villeneuve 의 신도예요. 애니메이션은 일상 힐링물을 고르는 편.',
    tags: ['SF', '사이버펑크', '슬로우 템포', '놀란', 'Villeneuve', '일상물', '스페이스 오페라'],
  },
};

const reveal = {
  initial: { opacity: 0, y: 26, filter: 'blur(8px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const Stars = ({ n }) => (
  <span className="w-stars">{'★'.repeat(n)}<span className="w-stars-dim">{'★'.repeat(5 - n)}</span></span>
);

/* '2026-05-27 16:53:40' → '5/27'，並產 isoDate */
const parseAnimeDate = (raw) => {
  if (!raw) return { isoDate: '', shortDate: '' };
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return { isoDate: '', shortDate: '' };
  return { isoDate: d.toISOString().slice(0, 10), shortDate: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
};

/* 把 RECENT 依 isoDate 分本週 / 更早 */
const groupByWeek = (items) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const thisWeek = [], earlier = [];
  for (const item of items) {
    const d = item.isoDate ? new Date(item.isoDate) : null;
    if (d && d >= cutoff) thisWeek.push(item); else earlier.push(item);
  }
  return { thisWeek, earlier };
};

function Watch() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'zh-TW';
  const [animeHistory, setAnimeHistory] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/anime/history?limit=200`);
        const json = await res.json();
        if (!cancelled) setAnimeHistory(json.history || []);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'fetch failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── 從 anime_history 聚合成「每部動畫一筆」── */
  const { now, recentAnime, animeCount } = useMemo(() => {
    if (!animeHistory || animeHistory.length === 0) {
      return { now: null, recentAnime: [], animeCount: 0 };
    }
    // group by anime_sn，每部取 last_watched_at 最新一筆做代表
    const byAnime = new Map();
    for (const row of animeHistory) {
      if (!byAnime.has(row.anime_sn)) byAnime.set(row.anime_sn, []);
      byAnime.get(row.anime_sn).push(row);
    }
    const grouped = [...byAnime.values()].map((eps) => {
      const sorted = eps.slice().sort((a, b) => (b.last_watched_at || '').localeCompare(a.last_watched_at || ''));
      const head = sorted[0];
      return {
        anime_sn: head.anime_sn,
        video_sn: head.video_sn,
        title: head.title,
        cover_url: head.cover_url,
        episode: head.episode,
        lastWatchedAt: head.last_watched_at,
        epCount: eps.length,
      };
    });
    // 按真實看的時間 DESC
    grouped.sort((a, b) => (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''));
    const head = grouped[0];
    const headParsed = parseAnimeDate(head.lastWatchedAt);
    return {
      now: {
        type: 'anime',
        poster: head.cover_url,
        title: head.title,
        animeSn: head.anime_sn,
        videoSn: head.video_sn,
        episode: head.episode,
        epCount: head.epCount,
        date: headParsed.shortDate,
        bahamutUrl: `https://ani.gamer.com.tw/animeVideo.php?sn=${head.video_sn}`,
      },
      recentAnime: grouped.slice(1, 12).map((g) => {
        const { isoDate, shortDate } = parseAnimeDate(g.lastWatchedAt);
        return {
          id: `a${g.anime_sn}`,
          type: 'anime',
          poster: g.cover_url,
          title: g.title,
          episode: g.episode,
          epCount: g.epCount,
          isoDate,
          date: shortDate,
          bahamutUrl: `https://ani.gamer.com.tw/animeVideo.php?sn=${g.video_sn}`,
        };
      }),
      animeCount: grouped.length,
    };
  }, [animeHistory]);

  const favsLocale = FAVORITES_BY_LANG[lang] || FAVORITES_BY_LANG['zh-TW'];
  const favorites = FAVORITES_STATIC.map((s, i) => ({ ...s, ...favsLocale[i] }));

  const films = FILMS_RECENT.map((f) => ({ ...f, title: f.titleByLang[lang] || f.titleByLang['zh-TW'] }));
  const recentAll = [...recentAnime, ...films].sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || '')).slice(0, 12);
  const recentGrouped = groupByWeek(recentAll);

  const taste = TASTE_BY_LANG[lang] || TASTE_BY_LANG['zh-TW'];

  const epTemplate = EP_LABEL[lang] || EP_LABEL['zh-TW'];
  const RecentRow = (r) => (
    <li className="w-recent-row" key={r.id}>
      <img className="w-recent-thumb" src={r.poster} alt={r.title} loading="lazy" />
      <span className="w-recent-title">{r.title}</span>
      <span className="w-recent-detail">
        {r.type === 'anime'
          ? (r.episode
              ? interpolate(epTemplate, { n: r.episode })
              : <span className="w-recent-badge w-recent-badge--anime">{t('watch.typeAnime')}</span>)
          : (r.rating ? <Stars n={r.rating} /> : <span className="w-recent-badge w-recent-badge--film">{t('watch.typeFilm')}</span>)}
      </span>
      <span className="w-recent-date">{r.date}</span>
    </li>
  );

  return (
    <div className="w-page">
      <div className="w-scrim" />
      <SEOHead title={t('watch.title')} description={t('watch.metaDescription')} />

      <div className="w-wrap">
        {/* header */}
        <motion.header className="w-header" {...reveal}>
          <h1 className="w-title">{t('watch.title')}</h1>
          <p className="w-subtitle">{t('watch.subtitle')}</p>

          <div className="w-stats">
            <div className="w-stat">
              <span className="w-stat-num">{animeCount || '—'}</span>
              <span className="w-stat-label">{t('watch.stats.animeLabel')}</span>
            </div>
            <div className="w-stat">
              <span className="w-stat-num">{FILMS_RECENT.length || '—'}</span>
              <span className="w-stat-label">{t('watch.stats.filmLabel')}</span>
            </div>
            <div className="w-stat">
              <span className="w-stat-num">★ {FAVORITES_STATIC.length > 0 ? (FAVORITES_STATIC.reduce((s, f) => s + f.rating, 0) / FAVORITES_STATIC.length).toFixed(1) : '—'}</span>
              <span className="w-stat-label">{t('watch.stats.avgLabel')}</span>
            </div>
            <span className="w-stats-year">{t('watch.stats.yearLabel')}</span>
          </div>
        </motion.header>

        {/* 正在看 */}
        {now && (
          <motion.section className="w-now" {...reveal}>
            <span className="w-eyebrow w-eyebrow--live">{t('watch.eyebrowLive')}</span>
            <div className="w-now-body">
              <a className="w-now-poster" href={now.bahamutUrl} target="_blank" rel="noopener noreferrer">
                <img src={now.poster} alt={now.title} />
              </a>
              <div className="w-now-text">
                <h2 className="w-now-title">{now.title}</h2>
                <p className="w-now-meta">
                  {interpolate(EP_LABEL[lang] || EP_LABEL['zh-TW'], { n: now.episode ?? now.epCount })}
                  {' · '}{SERVICE_LABEL[lang] || SERVICE_LABEL['zh-TW']}
                  {now.date ? ` · ${now.date}` : ''}
                </p>
              </div>
            </div>
          </motion.section>
        )}

        {/* 一生推 */}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">{t('watch.favoritesTitle')}</h2>
          <p className="w-h2-sub">{t('watch.favoritesSubtitle')}</p>
          <div className="w-favs">
            {favorites.map((f) => (
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

        {/* 最近在看（依週分組） */}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">{t('watch.recentTitle')}</h2>
          {err && <p className="w-recent-err">⚠️ {err}</p>}
          {recentGrouped.thisWeek.length > 0 && (
            <>
              <h3 className="w-recent-group">{t('watch.recentGroups.thisWeek')}</h3>
              <ul className="w-recent">{recentGrouped.thisWeek.map(RecentRow)}</ul>
            </>
          )}
          {recentGrouped.earlier.length > 0 && (
            <>
              <h3 className="w-recent-group w-recent-group--dim">{t('watch.recentGroups.earlier')}</h3>
              <ul className="w-recent">{recentGrouped.earlier.map(RecentRow)}</ul>
            </>
          )}
        </motion.section>

        {/* 口味（文字化）*/}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">{t('watch.tasteTitle')}</h2>
          <p className="w-taste-line">{taste.line}</p>
          <div className="w-taste-tags">
            {taste.tags.map((tag) => <span className="w-tag" key={tag}>{tag}</span>)}
          </div>
        </motion.section>

        {/* 收尾 */}
        <motion.p className="w-ending" {...reveal}>
          {t('watch.ending')}
        </motion.p>
      </div>
    </div>
  );
}

export default Watch;
