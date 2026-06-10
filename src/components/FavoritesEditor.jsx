// /watch 一生推 admin 編輯浮窗：TMDb 搜尋選片 → 設星等 + 短評 → 存。
// 標題/海報/年份由後端依語系即時帶，這裡只管策展資料（rating/quote/排序/增刪）。
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import './FavoritesEditor.css';

const API = import.meta.env.VITE_API_URL || '/api';

function StarPicker({ value, onChange }) {
  return (
    <span className="fe-stars" role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={'fe-star ' + (n <= value ? 'on' : '')}
          onClick={() => onChange(n)}
          aria-label={`${n}`}
        >★</button>
      ))}
    </span>
  );
}

export default function FavoritesEditor({ favorites, onClose, onChanged }) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);

  // 新增區：TMDb 搜尋
  const [kind, setKind] = useState('film');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debRef = useRef(null);

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }), [getToken]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 搜尋（debounce 400ms）
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim()) { setResults([]); return; }
    debRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `${API}/watch/tmdb-search?q=${encodeURIComponent(query)}&kind=${kind === 'film' ? 'movie' : 'tv'}`,
          { headers: authHeaders() },
        ).then((x) => x.json());
        setResults(r.results || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [query, kind, authHeaders]);

  const addFavorite = async (item) => {
    setBusy(true);
    try {
      await fetch(`${API}/watch/favorites`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tmdbId: item.tmdbId, kind, rating: 5, quote: '' }),
      });
      setQuery(''); setResults([]);
      onChanged();
    } finally { setBusy(false); }
  };

  const patchFavorite = async (id, patch) => {
    await fetch(`${API}/watch/favorites/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(patch),
    });
    onChanged();
  };

  const removeFavorite = async (id) => {
    setBusy(true);
    try {
      await fetch(`${API}/watch/favorites/${id}`, { method: 'DELETE', headers: authHeaders() });
      onChanged();
    } finally { setBusy(false); }
  };

  // 移動排序：跟相鄰項互換 sort_order
  const move = async (idx, dir) => {
    const a = favorites[idx], b = favorites[idx + dir];
    if (!a || !b) return;
    setBusy(true);
    try {
      await Promise.all([
        patchFavorite(a.id, { sort_order: idx + dir }),
        patchFavorite(b.id, { sort_order: idx }),
      ]);
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fe-overlay" onClick={onClose}>
      <div className="fe-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fe-head">
          <h3>{t('watch.favManage')}</h3>
          <button className="fe-close" onClick={onClose} aria-label="close">✕</button>
        </div>

        {/* 現有清單 */}
        <div className="fe-list">
          {favorites.length === 0 && <p className="fe-empty">{t('watch.favEmpty')}</p>}
          {favorites.map((f, i) => (
            <div className="fe-item" key={f.id}>
              {f.poster
                ? <img className="fe-item-poster" src={f.poster} alt={f.title} loading="lazy" />
                : <span className="fe-item-poster fe-item-poster--blank">{f.title.slice(0, 2)}</span>}
              <div className="fe-item-body">
                <div className="fe-item-top">
                  <span className="fe-item-title">{f.title}{f.year ? ` · ${f.year}` : ''}</span>
                  <span className="fe-item-actions">
                    <button disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="up">↑</button>
                    <button disabled={i === favorites.length - 1 || busy} onClick={() => move(i, 1)} aria-label="down">↓</button>
                    <button className="fe-del" disabled={busy} onClick={() => removeFavorite(f.id)} aria-label="delete">🗑</button>
                  </span>
                </div>
                <StarPicker value={f.rating} onChange={(n) => patchFavorite(f.id, { rating: n })} />
                <textarea
                  className="fe-quote"
                  defaultValue={f.quote}
                  placeholder={t('watch.favQuotePlaceholder')}
                  onBlur={(e) => { if (e.target.value !== f.quote) patchFavorite(f.id, { quote: e.target.value }); }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 新增區 */}
        <div className="fe-add">
          <div className="fe-add-row">
            <div className="fe-kind">
              <button className={kind === 'film' ? 'on' : ''} onClick={() => setKind('film')}>{t('watch.kindFilm')}</button>
              <button className={kind === 'tv' ? 'on' : ''} onClick={() => setKind('tv')}>{t('watch.kindTv')}</button>
            </div>
            <input
              className="fe-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('watch.favSearchPlaceholder')}
            />
          </div>
          {searching && <p className="fe-searching">{t('watch.favSearching')}</p>}
          {results.length > 0 && (
            <ul className="fe-results">
              {results.map((r) => (
                <li key={r.tmdbId}>
                  <button className="fe-result" disabled={busy} onClick={() => addFavorite(r)}>
                    {r.poster
                      ? <img src={r.poster} alt={r.title} loading="lazy" />
                      : <span className="fe-result-blank">—</span>}
                    <span className="fe-result-meta">
                      <span className="fe-result-title">{r.title}</span>
                      <span className="fe-result-year">{r.year || ''}</span>
                    </span>
                    <span className="fe-result-add">＋</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
