import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FaSearch, FaChevronDown } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './WatchLibrary.css';

/* ──────────────────────────────────────────────────────────────
   /watch/library — 完整清單（Bookshelf 風，3 tab：動畫 / 電影 / 影集）
   依賴：/api/anime/history、/api/films/recent、/api/tv/recent
─────────────────────────────────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL || '/api';

const reveal = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

/* ── normalize 三條源到同一個 shape ────────────────────────── */
function normalizeAnime(rows) {
  // group by anime_sn，每部一筆
  const byAnime = new Map();
  for (const r of rows || []) {
    if (!byAnime.has(r.anime_sn)) byAnime.set(r.anime_sn, []);
    byAnime.get(r.anime_sn).push(r);
  }
  return [...byAnime.values()].map((eps) => {
    const sorted = eps.slice().sort((a, b) => (b.last_watched_at || '').localeCompare(a.last_watched_at || ''));
    const head = sorted[0];
    // tmdb_id 取「該動畫任一筆有值的」— 最新集數常是剛同步、還沒 enrich 的 NULL
    const tmdbId = head.tmdb_id ?? eps.find((e) => e.tmdb_id != null)?.tmdb_id ?? null;
    return {
      id: `a${head.anime_sn}`,
      type: 'anime',
      title: head.title,
      poster: head.cover_url,
      isoDate: (head.last_watched_at || '').slice(0, 10),
      episode: head.episode,
      epCount: eps.length,
      tmdbId,
      // 連結走 TMDb（動畫算 TV）；尚未 enrich 就退到 TMDb 搜尋頁
      externalUrl: tmdbId
        ? `https://www.themoviedb.org/tv/${tmdbId}`
        : `https://www.themoviedb.org/search?query=${encodeURIComponent(head.title)}`,
    };
  });
}

function normalizeFilms(rows) {
  return (rows || []).map((f) => ({
    id: `f${f.id}`,
    type: 'film',
    title: f.title,
    poster: f.poster_url,
    isoDate: f.watched_date,
    year: f.release_year,
    tmdbId: f.tmdb_id,
    genres: f.genres,
    externalUrl: f.tmdb_id ? `https://www.themoviedb.org/movie/${f.tmdb_id}` : null,
  }));
}

function normalizeTv(rows) {
  return (rows || []).map((s) => ({
    id: `t${s.series_name}`,
    type: 'tv',
    title: s.series_name,
    poster: s.poster_url,
    isoDate: s.last_watched,
    epCount: s.ep_count,
    tmdbId: s.tmdb_id,
    genres: s.genres,
    externalUrl: s.tmdb_id ? `https://www.themoviedb.org/tv/${s.tmdb_id}` : null,
  }));
}

const SORT_OPTIONS = ['newest', 'oldest', 'titleAsc', 'titleDesc'];

function WatchLibrary() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('anime');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  const [items, setItems] = useState({ anime: null, film: null, tv: null });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // close sort popup on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const onDoc = (e) => { if (!sortRef.current?.contains(e.target)) setSortOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sortOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, f, s] = await Promise.all([
          fetch(`${API_URL}/anime/history?limit=2000`).then((r) => r.json()),
          fetch(`${API_URL}/films/recent?limit=200`).then((r) => r.json()),
          fetch(`${API_URL}/tv/recent?limit=200`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setItems({
          anime: normalizeAnime(a.history),
          film: normalizeFilms(f.films),
          tv: normalizeTv(s.series),
        });
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setErr(e.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const list = items[activeTab] || [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? list.filter((it) => (it.title || '').toLowerCase().includes(term))
      : list;
    const sorted = filtered.slice();
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return (a.isoDate || '').localeCompare(b.isoDate || '');
        case 'titleAsc': return (a.title || '').localeCompare(b.title || '');
        case 'titleDesc': return (b.title || '').localeCompare(a.title || '');
        case 'newest':
        default: return (b.isoDate || '').localeCompare(a.isoDate || '');
      }
    });
    return sorted;
  }, [items, activeTab, search, sortBy]);

  const counts = {
    anime: items.anime?.length ?? 0,
    film: items.film?.length ?? 0,
    tv: items.tv?.length ?? 0,
  };

  return (
    <div className="wl-page">
      <div className="wl-scrim" />
      <SEOHead title={t('watch.library.title')} description={t('watch.library.subtitle')} path="/watch/library" />

      <div className="wl-wrap">
        <motion.header className="wl-header" {...reveal}>
          <Link to="/watch" className="wl-back">{t('watch.library.viewWatch')}</Link>
          <h1 className="wl-title">{t('watch.library.title')}</h1>
          <p className="wl-subtitle">{t('watch.library.subtitle')}</p>
        </motion.header>

        {/* tabs */}
        <div className="wl-tabs">
          {['anime', 'film', 'tv'].map((k) => (
            <button
              key={k}
              className={`wl-tab ${activeTab === k ? 'active' : ''}`}
              onClick={() => setActiveTab(k)}
            >
              {t(`watch.library.tabs.${k}`)}
              <span className="wl-tab-count">{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* controls */}
        <div className="wl-controls">
          <label className="wl-search">
            <FaSearch />
            <input
              type="text"
              placeholder={t('watch.library.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="wl-sort" ref={sortRef}>
            <button
              type="button"
              className="wl-sort-trigger"
              onClick={() => setSortOpen((o) => !o)}
              aria-expanded={sortOpen}
            >
              <span>{t(`watch.library.sort.${sortBy}`)}</span>
              <FaChevronDown className={`wl-sort-chev${sortOpen ? ' is-open' : ''}`} />
            </button>
            <AnimatePresence>
              {sortOpen && (
                <motion.ul
                  className="wl-sort-menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <li key={opt}>
                      <button
                        type="button"
                        className={`wl-sort-item${sortBy === opt ? ' active' : ''}`}
                        onClick={() => { setSortBy(opt); setSortOpen(false); }}
                      >
                        {t(`watch.library.sort.${opt}`)}
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* grid */}
        {loading && <p className="wl-info">{t('watch.library.loading')}</p>}
        {err && <p className="wl-info wl-info--err">⚠️ {err}</p>}
        {!loading && !err && visible.length === 0 && (
          <p className="wl-info">{t('watch.library.empty')}</p>
        )}

        {!loading && visible.length > 0 && (
          <div className="wl-grid">
            {visible.map((it) => (
              <a
                key={it.id}
                href={it.externalUrl || '#'}
                target={it.externalUrl ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="wl-card"
              >
                <div className="wl-card-poster">
                  {it.poster ? (
                    <img src={it.poster} alt={it.title} loading="lazy" />
                  ) : (
                    <div className="wl-card-placeholder">
                      {it.type === 'anime' ? '🌸' : it.type === 'film' ? '🎬' : '📺'}
                    </div>
                  )}
                </div>
                <div className="wl-card-meta">
                  <p className="wl-card-title">{it.title}</p>
                  <p className="wl-card-sub">
                    {it.type === 'film' && it.year ? <span>{it.year}</span> : null}
                    {it.type === 'tv' && it.epCount
                      ? <span>{it.epCount} {t('watch.library.epsSuffix')}</span>
                      : null}
                    {it.type === 'anime' && it.epCount
                      ? <span>{it.epCount} {t('watch.library.epsSuffix')}</span>
                      : null}
                    {it.isoDate ? <span className="wl-card-date">{it.isoDate}</span> : null}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WatchLibrary;
