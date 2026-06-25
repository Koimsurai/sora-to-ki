import { useEffect, useState, useMemo, useCallback, type ElementType, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import SEOHead from './SEOHead';
import FavoritesEditor from './FavoritesEditor';
import './Watch.css';

/* ──────────────────────────────────────────────────────────────
   在看什麼 — 編輯風「品味展示」
─────────────────────────────────────────────────────────────── */

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

type WatchType = 'anime' | 'film' | 'tv';

interface WatchEntry {
  id?: string;
  type: WatchType;
  title: string;
  poster?: string;
  isoDate?: string;
  date?: string;
  episode?: number | string;
  epCount?: number;
  year?: number | string;
  tmdbId?: number | string | null;
  externalUrl?: string | null;
  animeSn?: number | string;
  videoSn?: number | string;
}

interface AnimeRow { anime_sn: number | string; video_sn?: number | string; last_watched_at?: string; tmdb_id?: number | string | null; title: string; cover_url?: string; episode?: number | string }
interface FilmRow { id: number | string; title: string; poster_url?: string; watched_date?: string; release_year?: number | string; tmdb_id?: number | string | null }
interface TvRow { series_name: string; poster_url?: string; last_watched?: string; ep_count?: number; tmdb_id?: number | string | null }
interface WatchStats { animeCount?: number; filmCount?: number; tvSeriesCount?: number }
interface LiveNow { cover?: string; title: string; externalUrl?: string; progressPct?: number | null; episode?: number | string; source?: string; type?: string }
interface WatchFavorite { id: number; title: string; rating: number; poster?: string; quote?: string; year?: number; externalUrl?: string }

/* 連結通通走 TMDb */
const tmdbUrl = (kind: string, id?: number | string | null): string | null =>
  id ? `https://www.themoviedb.org/${kind === 'film' || kind === 'movie' ? 'movie' : 'tv'}/${id}` : null;

const dedupeByTmdb = (items: WatchEntry[]): WatchEntry[] => {
  const byKey = new Map<string, number>();
  const out: WatchEntry[] = [];
  for (const it of items) {
    if (it.tmdbId == null) { out.push(it); continue; }
    const key = `${it.type === 'film' ? 'm' : 't'}:${it.tmdbId}`;
    const idx = byKey.get(key);
    if (idx == null) { byKey.set(key, out.length); out.push(it); }
    else if ((it.epCount ?? 0) > (out[idx].epCount ?? 0)) out[idx] = it; // 留集數多的
  }
  return out;
};

const EP_LABEL: Record<string, string> = {
  'zh-TW': '第 {{n}} 集', 'zh-CN': '第 {{n}} 集', en: 'Ep. {{n}}', ja: '第 {{n}} 話', ko: '{{n}}화',
};
const SERVICE_LABEL: Record<string, string> = {
  'zh-TW': '動畫瘋', 'zh-CN': '动画疯', en: 'Bahamut Anime', ja: '動畫瘋', ko: '動畫瘋',
};
const interpolate = (tpl: string, vars: Record<string, string | number | undefined>) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));

/* short date formatter: '2026-02-07' → '2/7' */
const toShortDate = (iso?: string): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : '';
};

const reveal = {
  initial: { opacity: 0, y: 26, filter: 'blur(8px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

const Stars = ({ n }: { n: number }) => (
  <span className="w-stars">{'★'.repeat(n)}<span className="w-stars-dim">{'★'.repeat(5 - n)}</span></span>
);

const parseAnimeDate = (raw?: string): { isoDate: string; shortDate: string } => {
  if (!raw) return { isoDate: '', shortDate: '' };
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return { isoDate: '', shortDate: '' };
  return { isoDate: d.toISOString().slice(0, 10), shortDate: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
};

const groupByWeek = (items: WatchEntry[]): { thisWeek: WatchEntry[]; earlier: WatchEntry[] } => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const thisWeek: WatchEntry[] = [], earlier: WatchEntry[] = [];
  for (const item of items) {
    const d = item.isoDate ? new Date(item.isoDate) : null;
    if (d && d >= cutoff) thisWeek.push(item); else earlier.push(item);
  }
  return { thisWeek, earlier };
};

function Watch() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const [animeHistory, setAnimeHistory] = useState<AnimeRow[] | null>(null);
  const [films, setFilms] = useState<FilmRow[] | null>(null);
  const [series, setSeries] = useState<TvRow[] | null>(null);
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [liveNow, setLiveNow] = useState<LiveNow | null>(null);
  const [favorites, setFavorites] = useState<WatchFavorite[]>([]);
  const [favEditing, setFavEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const loadFavorites = useCallback(() => {
    void fetch(`${API_URL}/watch/favorites?locale=${encodeURIComponent(lang)}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ favorites?: WatchFavorite[] }>)
      .then((d) => setFavorites(d.favorites ?? []))
      .catch(() => setFavorites([]));
  }, [lang]);

  const shareToThinking = (item: WatchEntry | null) => {
    if (!item) return;
    const media = {
      tmdbId: item.tmdbId ?? null,
      mediaType: item.type === 'film' ? 'movie' : 'tv',
      kind: item.type === 'anime' ? '動畫' : item.type === 'film' ? '電影' : '影集',
      title: item.title,
      poster: item.poster,
    };
    try { sessionStorage.setItem('thinking_prefill', JSON.stringify(media)); } catch { /* ignore */ }
    void navigate('/thinking');
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [a, f, s, st] = await Promise.all([
          fetch(`${API_URL}/anime/history?limit=200`).then((r) => r.json() as Promise<{ history?: AnimeRow[] }>),
          fetch(`${API_URL}/films/recent?limit=20`).then((r) => r.json() as Promise<{ films?: FilmRow[] }>),
          fetch(`${API_URL}/tv/recent?limit=20`).then((r) => r.json() as Promise<{ series?: TvRow[] }>),
          fetch(`${API_URL}/watch/stats`).then((r) => r.json() as Promise<WatchStats>),
        ]);
        if (cancelled) return;
        setAnimeHistory(a.history ?? []);
        setFilms(f.films ?? []);
        setSeries(s.series ?? []);
        setStats(st);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'fetch failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  /* 即時觀看：輪詢 /watch/now */
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}/watch/now`).then((x) => x.json() as Promise<{ watching?: LiveNow | null }>);
        if (!cancelled) setLiveNow(r.watching ?? null);
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(() => { void poll(); }, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* ── 從 anime_history 聚合成「每部動畫一筆」── */
  const { now, recentAnime } = useMemo<{ now: WatchEntry | null; recentAnime: WatchEntry[] }>(() => {
    if (!animeHistory || animeHistory.length === 0) {
      return { now: null, recentAnime: [] };
    }
    const byAnime = new Map<number | string, AnimeRow[]>();
    for (const row of animeHistory) {
      const arr = byAnime.get(row.anime_sn);
      if (arr) arr.push(row); else byAnime.set(row.anime_sn, [row]);
    }
    const grouped = [...byAnime.values()].map((eps) => {
      const sorted = eps.slice().sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? ''));
      const head = sorted[0];
      return {
        anime_sn: head.anime_sn,
        video_sn: head.video_sn,
        title: head.title,
        cover_url: head.cover_url,
        episode: head.episode,
        tmdbId: head.tmdb_id ?? eps.find((e) => e.tmdb_id != null)?.tmdb_id ?? null,
        lastWatchedAt: head.last_watched_at,
        epCount: eps.length,
      };
    });
    grouped.sort((a, b) => (b.lastWatchedAt ?? '').localeCompare(a.lastWatchedAt ?? ''));
    const head = grouped[0];
    const headParsed = parseAnimeDate(head.lastWatchedAt);
    return {
      now: {
        type: 'anime' as const,
        poster: head.cover_url,
        title: head.title,
        animeSn: head.anime_sn,
        videoSn: head.video_sn,
        episode: head.episode,
        epCount: head.epCount,
        tmdbId: head.tmdbId,
        date: headParsed.shortDate,
        externalUrl: tmdbUrl('tv', head.tmdbId)
          ?? `https://www.themoviedb.org/search?query=${encodeURIComponent(head.title)}`,
      },
      recentAnime: grouped.slice(1, 12).map((g) => {
        const { isoDate, shortDate } = parseAnimeDate(g.lastWatchedAt);
        return {
          id: `a${g.anime_sn}`,
          type: 'anime' as const,
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

  const filmItems: WatchEntry[] = (films ?? []).map((f) => ({
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
  const tvItems: WatchEntry[] = (series ?? []).map((s) => ({
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
  const recentAll = dedupeByTmdb([...recentAnime, ...filmItems, ...tvItems])
    .sort((a, b) => (b.isoDate ?? '').localeCompare(a.isoDate ?? ''))
    .slice(0, 14);
  const recentGrouped = groupByWeek(recentAll);

  const epTemplate = EP_LABEL[lang] || EP_LABEL['zh-TW'];
  const renderRecentRow = (r: WatchEntry, prev?: WatchEntry): ReactElement => {
    const showDate = !prev || prev.date !== r.date;
    const Inner: ElementType = r.externalUrl ? 'a' : 'div';
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
  const hero = liveNow
    ? {
        isLive: true,
        poster: liveNow.cover ?? now?.poster ?? null,
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
            now.date ?? null,
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

        {hero && (
          <motion.section className="w-now" {...reveal}>
            <a
              className={'w-now-banner' + (hero.isLive ? ' is-live' : '')}
              href={hero.externalUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              {hero.poster && <img className="w-now-banner-img" src={hero.poster ?? undefined} alt={hero.title} />}
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
          <div className="w-h2-row">
            <div>
              <h2 className="w-h2">{t('watch.favoritesTitle')}</h2>
              <p className="w-h2-sub">{t('watch.favoritesSubtitle')}</p>
            </div>
            {isAdmin && (
              <button className="w-share-btn" onClick={() => setFavEditing(true)}>
                {t('watch.favManage')}
              </button>
            )}
          </div>
          <div className="w-favs">
            {favorites.map((f) => (
              <figure className="w-fav" key={f.id}>
                <a className="w-fav-poster" href={f.externalUrl} target="_blank" rel="noopener noreferrer">
                  {f.poster
                    ? <img src={f.poster} alt={f.title} loading="lazy" />
                    : <span className="w-fav-noposter">{f.title}</span>}
                  {f.quote && <figcaption className="w-fav-quote">「{f.quote}」</figcaption>}
                </a>
                <p className="w-fav-title">{f.title}</p>
                <p className="w-fav-line"><Stars n={f.rating} /> <span className="w-fav-year">{f.year}</span></p>
              </figure>
            ))}
          </div>
        </motion.section>

        {favEditing && (
          <FavoritesEditor
            favorites={favorites}
            onClose={() => setFavEditing(false)}
            onChanged={loadFavorites}
          />
        )}

        {/* 最近在看（依週分組） */}
        <motion.section className="w-section" {...reveal}>
          <div className="w-h2-row">
            <h2 className="w-h2">{t('watch.recentTitle')}</h2>
            <div className="w-h2-actions">
              {isAdmin && now && (
                <button className="w-share-btn" onClick={() => shareToThinking(now)}>＋ 發碎念</button>
              )}
              <Link to="/watch/library" className="w-section-link">
                {t('watch.library.title')} →
              </Link>
            </div>
          </div>
          {err && <p className="w-recent-err">⚠️ {err}</p>}
          {recentGrouped.thisWeek.length > 0 && (
            <>
              <h3 className="w-recent-group">{t('watch.recentGroups.thisWeek')}</h3>
              <ul className="w-recent">
                {recentGrouped.thisWeek.map((r, i) => renderRecentRow(r, recentGrouped.thisWeek[i - 1]))}
              </ul>
            </>
          )}
          {recentGrouped.earlier.length > 0 && (
            <>
              <h3 className="w-recent-group w-recent-group--dim">{t('watch.recentGroups.earlier')}</h3>
              <ul className="w-recent">
                {recentGrouped.earlier.map((r, i) => renderRecentRow(r, recentGrouped.earlier[i - 1]))}
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
