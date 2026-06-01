import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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

/* 連結通通走 TMDb：電影 → /movie/{id}、動畫/影集 → /tv/{id} */
const tmdbUrl = (kind, id) =>
  id ? `https://www.themoviedb.org/${kind === 'film' || kind === 'movie' ? 'movie' : 'tv'}/${id}` : null;

/* 跨來源去重：同 tmdb_id 視為同一部（movie/tv 命名空間分開，避免同數字撞），保留集數最多的那筆。
   沒 tmdb_id 的不去重（避免用名字誤殺劇場版/相似名）。 */
const dedupeByTmdb = (items) => {
  const byKey = new Map();
  const out = [];
  for (const it of items) {
    if (it.tmdbId == null) { out.push(it); continue; }
    const key = `${it.type === 'film' || it.type === 'movie' ? 'm' : 't'}:${it.tmdbId}`;
    const idx = byKey.get(key);
    if (idx == null) { byKey.set(key, out.length); out.push(it); }
    else if ((it.epCount ?? 0) > (out[idx].epCount ?? 0)) out[idx] = it; // 留集數多的
  }
  return out;
};

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
  { id: 'a', kind: 'film',  year: 2014, tmdbId: 157336, poster: TMDB('/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'), rating: 5 }, // 星際效應
  { id: 'b', kind: 'film',  year: 2017, tmdbId: 335984, poster: TMDB('/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg'), rating: 5 }, // 銀翼殺手 2049
  { id: 'c', kind: 'film',  year: 2010, tmdbId: 27205,  poster: TMDB('/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg'), rating: 5 }, // 全面啟動
  { id: 'd', kind: 'film',  year: 1999, tmdbId: 603,    poster: TMDB('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'), rating: 5 }, // 駭客任務
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

/* short date formatter: '2026-02-07' → '2/7' */
const toShortDate = (iso) => {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : '';
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
  const [films, setFilms] = useState(null);
  const [series, setSeries] = useState(null);
  const [stats, setStats] = useState(null);
  const [liveNow, setLiveNow] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, f, s, st] = await Promise.all([
          fetch(`${API_URL}/anime/history?limit=200`).then((r) => r.json()),
          fetch(`${API_URL}/films/recent?limit=20`).then((r) => r.json()),
          fetch(`${API_URL}/tv/recent?limit=20`).then((r) => r.json()),
          fetch(`${API_URL}/watch/stats`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setAnimeHistory(a.history || []);
        setFilms(f.films || []);
        setSeries(s.series || []);
        setStats(st);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'fetch failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* 即時觀看：輪詢 /watch/now（有人在播才有內容；30 秒一次）*/
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}/watch/now`).then((x) => x.json());
        if (!cancelled) setLiveNow(r.watching || null);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* ── 從 anime_history 聚合成「每部動畫一筆」── */
  const { now, recentAnime } = useMemo(() => {
    if (!animeHistory || animeHistory.length === 0) {
      return { now: null, recentAnime: [] };
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
        // tmdb_id 取「該動畫任一筆有值的」— 最新集數常是剛同步、還沒 enrich 的 NULL
        tmdbId: head.tmdb_id ?? eps.find((e) => e.tmdb_id != null)?.tmdb_id ?? null,
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
        // 連結走 TMDb；還沒 enrich（無 tmdb_id）就退而求其次連 TMDb 搜尋頁
        externalUrl: tmdbUrl('tv', head.tmdbId)
          || `https://www.themoviedb.org/search?query=${encodeURIComponent(head.title)}`,
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
          tmdbId: g.tmdbId,
          isoDate,
          date: shortDate,
          externalUrl: tmdbUrl('tv', g.tmdbId),
        };
      }),
    };
  }, [animeHistory]);

  const favsLocale = FAVORITES_BY_LANG[lang] || FAVORITES_BY_LANG['zh-TW'];
  const favorites = FAVORITES_STATIC.map((s, i) => ({
    ...s,
    ...favsLocale[i],
    externalUrl: tmdbUrl(s.kind, s.tmdbId),
  }));

  /* 把三條源 normalize 成同 shape，依 isoDate DESC 合流，取 12 筆 */
  const filmItems = (films || []).map((f) => ({
    id: `f${f.id}`,
    type: 'film',
    title: f.title,
    poster: f.poster_url,
    isoDate: f.watched_date,
    date: toShortDate(f.watched_date),
    year: f.release_year,
    tmdbId: f.tmdb_id,
    externalUrl: tmdbUrl('movie', f.tmdb_id),
  }));
  const tvItems = (series || []).map((s) => ({
    id: `t${s.series_name}`,
    type: 'tv',
    title: s.series_name,
    poster: s.poster_url,
    isoDate: s.last_watched,
    date: toShortDate(s.last_watched),
    epCount: s.ep_count,
    tmdbId: s.tmdb_id,
    externalUrl: tmdbUrl('tv', s.tmdb_id),
  }));
  // 先跨來源去重（同 tmdb_id 留集數多的），再依日期 DESC 取 14 筆
  const recentAll = dedupeByTmdb([...recentAnime, ...filmItems, ...tvItems])
    .sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''))
    .slice(0, 14);
  const recentGrouped = groupByWeek(recentAll);

  const epTemplate = EP_LABEL[lang] || EP_LABEL['zh-TW'];
  /* 同一天的 row 共用一個日期 anchor。傳入 prev 用來判斷是否要顯示日期 */
  const RecentRow = (r, prev) => {
    const showDate = !prev || prev.date !== r.date;
    const Inner = r.externalUrl ? 'a' : 'div';
    const linkProps = r.externalUrl
      ? { href: r.externalUrl, target: '_blank', rel: 'noopener noreferrer' }
      : {};
    return (
      <li className="w-recent-row" key={r.id}>
        <Inner
          className={'w-recent-link' + (showDate ? ' has-anchor' : '') + (r.externalUrl ? ' is-link' : '')}
          {...linkProps}
        >
          <span className="w-recent-anchor">{showDate ? r.date : ''}</span>
          <img className="w-recent-thumb" src={r.poster} alt={r.title} loading="lazy" />
          <span className="w-recent-title">{r.title}</span>
          <span className="w-recent-tags">
            {r.type === 'anime' && (
              <>
                <span className="w-recent-badge w-recent-badge--anime">{t('watch.typeAnime')}</span>
                {r.episode && <span className="w-recent-meta">{interpolate(epTemplate, { n: r.episode })}</span>}
              </>
            )}
            {r.type === 'film' && (
              <>
                <span className="w-recent-badge w-recent-badge--film">{t('watch.typeFilm')}</span>
                {r.year && <span className="w-recent-meta">{r.year}</span>}
              </>
            )}
            {r.type === 'tv' && (
              <>
                <span className="w-recent-badge w-recent-badge--tv">{t('watch.typeTv')}</span>
                {r.epCount && <span className="w-recent-meta">{interpolate(epTemplate, { n: r.epCount })}</span>}
              </>
            )}
          </span>
        </Inner>
      </li>
    );
  };

  const serviceLabel = SERVICE_LABEL[lang] || SERVICE_LABEL['zh-TW'];
  /* hero：即時優先（有人在播 → liveNow），否則退回「最近看完」的 now */
  const hero = liveNow
    ? {
        isLive: true,
        poster: liveNow.cover || now?.poster || null,
        title: liveNow.title,
        externalUrl: liveNow.externalUrl,
        progressPct: liveNow.progressPct,
        metaParts: [
          liveNow.episode ? interpolate(epTemplate, { n: liveNow.episode }) : null,
          liveNow.source === 'bahamut'
            ? serviceLabel
            : (liveNow.type === 'movie' ? t('watch.typeFilm') : t('watch.typeTv')),
        ].filter(Boolean),
      }
    : now
      ? {
          isLive: false,
          poster: now.poster,
          title: now.title,
          externalUrl: now.externalUrl,
          progressPct: null,
          metaParts: [
            interpolate(epTemplate, { n: now.episode ?? now.epCount }),
            serviceLabel,
            now.date || null,
          ].filter(Boolean),
        }
      : null;

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
              <span className="w-stat-num">{stats?.animeCount ?? '—'}</span>
              <span className="w-stat-label">{t('watch.stats.animeLabel')}</span>
            </div>
            <div className="w-stat">
              <span className="w-stat-num">{stats?.filmCount ?? '—'}</span>
              <span className="w-stat-label">{t('watch.stats.filmLabel')}</span>
            </div>
            <div className="w-stat">
              <span className="w-stat-num">{stats?.tvSeriesCount ?? '—'}</span>
              <span className="w-stat-label">{t('watch.stats.tvLabel')}</span>
            </div>
          </div>
        </motion.header>

        {/* hero（風格 C）：有人在播 → 真「● 正在看」LIVE + 進度條；否則「最近看完」。連結走 TMDb */}
        {hero && (
          <motion.section className="w-now" {...reveal}>
            <a
              className={'w-now-banner' + (hero.isLive ? ' is-live' : '')}
              href={hero.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {hero.poster && <img className="w-now-banner-img" src={hero.poster} alt={hero.title} />}
              <div className="w-now-overlay">
                <span className={'w-eyebrow ' + (hero.isLive ? 'w-eyebrow--live' : 'w-eyebrow--last')}>
                  {hero.isLive ? t('watch.eyebrowLive') : t('watch.eyebrowLast')}
                </span>
                <h2 className="w-now-title">{hero.title}</h2>
                <p className="w-now-meta">{hero.metaParts.join(' · ')}</p>
              </div>
              <span className="w-now-cta">{t('watch.viewOnTmdb')} →</span>
              {hero.isLive && hero.progressPct != null && (
                <span className="w-now-progress" aria-hidden="true">
                  <span style={{ width: `${hero.progressPct}%` }} />
                </span>
              )}
            </a>
          </motion.section>
        )}

        {/* 一生推 */}
        <motion.section className="w-section" {...reveal}>
          <h2 className="w-h2">{t('watch.favoritesTitle')}</h2>
          <p className="w-h2-sub">{t('watch.favoritesSubtitle')}</p>
          <div className="w-favs">
            {favorites.map((f) => (
              <figure className="w-fav" key={f.id}>
                <a className="w-fav-poster" href={f.externalUrl} target="_blank" rel="noopener noreferrer">
                  <img src={f.poster} alt={f.title} loading="lazy" />
                  <figcaption className="w-fav-quote">「{f.quote}」</figcaption>
                </a>
                <p className="w-fav-title">{f.title}</p>
                <p className="w-fav-line"><Stars n={f.rating} /> <span className="w-fav-year">{f.year}</span></p>
              </figure>
            ))}
          </div>
        </motion.section>

        {/* 最近在看（依週分組） */}
        <motion.section className="w-section" {...reveal}>
          <div className="w-h2-row">
            <h2 className="w-h2">{t('watch.recentTitle')}</h2>
            <Link to="/watch/library" className="w-section-link">
              {t('watch.library.title')} →
            </Link>
          </div>
          {err && <p className="w-recent-err">⚠️ {err}</p>}
          {recentGrouped.thisWeek.length > 0 && (
            <>
              <h3 className="w-recent-group">{t('watch.recentGroups.thisWeek')}</h3>
              <ul className="w-recent">
                {recentGrouped.thisWeek.map((r, i) => RecentRow(r, recentGrouped.thisWeek[i - 1]))}
              </ul>
            </>
          )}
          {recentGrouped.earlier.length > 0 && (
            <>
              <h3 className="w-recent-group w-recent-group--dim">{t('watch.recentGroups.earlier')}</h3>
              <ul className="w-recent">
                {recentGrouped.earlier.map((r, i) => RecentRow(r, recentGrouped.earlier[i - 1]))}
              </ul>
            </>
          )}
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
