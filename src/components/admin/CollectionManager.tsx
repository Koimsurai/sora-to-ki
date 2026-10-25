import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTrackItem, AdminWatchItem, WatchFavoriteRow as WatchFavorite } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminBahamutStatusQueryOptions, adminCollectionQueryOptions } from '@/data/adminData';
import { watchFavoritesQueryOptions } from '@/data/watchData';
import { jsonAuthHeaders } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';
import './CollectionManager.css';

// 收藏（2026-10 後台提案的「收」）：在看、在聽都是同步進來的（巴哈、Simkl、Spotify），
// 站長決定不了「有沒有看」，只能決定「這一部／這一首要不要出現在前台」，以及哪幾部放進最愛。
// 書在書架頁（/admin/books），這裡不重複一份。

type Tab = 'watch' | 'listen' | 'fav';

const TABS: { key: Tab; label: string }[] = [
  { key: 'watch', label: '在看' },
  { key: 'listen', label: '在聽' },
  { key: 'fav', label: '最愛' },
];

const KIND_LABEL: Record<string, string> = { anime: '動畫', film: '電影', tv: '影集', track: '歌' };
const SOURCE_LABEL: Record<string, string> = { bahamut: '巴哈', simkl: 'Simkl', trakt: 'Trakt' };

/** 最愛只收得了 TMDb 上查得到的（電影、影集；動畫有對上 TMDb 的也算影集） */
const favoriteKind = (w: AdminWatchItem) => (w.kind === 'film' ? 'film' : 'tv');

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: jsonAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(out.error ?? `${res.status}`);
  }
}

export default function CollectionManager() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(adminCollectionQueryOptions);
  const favorites = useQuery(watchFavoritesQueryOptions('zh-TW'));
  const bahamut = useQuery({ ...adminBahamutStatusQueryOptions, retry: false });
  const [tab, setTab] = useState<Tab>('watch');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const watch = data?.watch ?? [];
  const tracks = data?.tracks ?? [];
  const hiddenTracks = (data?.hidden ?? []).filter((h) => h.kind === 'track' && !tracks.some((t) => t.id === h.key));
  const favs = favorites.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'collection'] });
    void queryClient.invalidateQueries({ queryKey: ['watch'] });
  };

  /** 包一層：同一時間只做一件事、失敗跳提示、做完重抓 */
  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusyKey(key);
    try {
      await work();
      toast.success(done);
      refresh();
    } catch (e) {
      toast.error(`沒有存到：${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusyKey(null);
    }
  };

  const setHidden = (kind: string, key: string, title: string, hidden: boolean) =>
    run(
      `${kind}:${key}`,
      () => send('PUT', '/api/admin/collection/hidden', { kind, key, title, hidden }),
      hidden ? `〈${title}〉不出現在前台了` : `〈${title}〉回到前台了`,
    );

  const toggleFavorite = (w: AdminWatchItem) =>
    run(
      `fav:${w.kind}:${w.key}`,
      () =>
        w.favorite_id != null
          ? send('DELETE', `/api/watch/favorites/${w.favorite_id}`)
          : send('POST', '/api/watch/favorites', { tmdbId: w.tmdb_id, kind: favoriteKind(w), rating: 5, quote: '' }),
      w.favorite_id != null ? `〈${w.title}〉拿出最愛了` : `〈${w.title}〉放進最愛了`,
    );

  const countOf = (t: Tab) => (t === 'watch' ? watch.length : t === 'listen' ? tracks.length : favs.length);
  const b = bahamut.data;

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title="收藏"
        latin="Collection"
        meta={isPending ? '載入中' : `在看 ${watch.length} 部 · 最愛 ${favs.length} 部`}
      />

      <p className="adm-coll-sources" aria-label="資料來源">
        {b && (
          <span data-bad={!b.ok || undefined}>
            {b.ok ? '●' : '×'} 巴哈
            {b.ok ? (b.daysLeft !== null ? ` · 登入還有 ${b.daysLeft} 天` : '') : ' · cookie 失效'}
          </span>
        )}
        <span data-bad={data?.tracks_error ? true : undefined}>
          {data?.tracks_error ? '×' : '●'} Spotify{data?.tracks_error ? ' · 抓不到' : ` · 最近 ${tracks.length} 首`}
        </span>
        <Link to="/admin/books" className="adm-coll-link">
          書在書架 →
        </Link>
      </p>

      <section className="adm-stack" aria-label="收藏">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                <span className="adm-meta">{isPending ? '' : countOf(t.key)}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading label="讀收藏" />
          ) : tab === 'watch' ? (
            <WatchList items={watch} busyKey={busyKey} onHide={setHidden} onFavorite={toggleFavorite} />
          ) : tab === 'listen' ? (
            <ListenList
              tracks={tracks}
              hiddenTracks={hiddenTracks}
              error={data?.tracks_error ?? null}
              busyKey={busyKey}
              onHide={setHidden}
            />
          ) : (
            <FavoriteList favorites={favs} loading={favorites.isPending} busyKey={busyKey} run={run} />
          )}
        </TabPanel>
      </section>
    </div>
  );
}

function WatchList({
  items,
  busyKey,
  onHide,
  onFavorite,
}: {
  items: AdminWatchItem[];
  busyKey: string | null;
  onHide: (kind: string, key: string, title: string, hidden: boolean) => Promise<void>;
  onFavorite: (w: AdminWatchItem) => Promise<void>;
}) {
  if (items.length === 0) return <p className="adm-empty">還沒有觀看紀錄。巴哈、Simkl 同步之後會出現在這裡。</p>;
  return (
    <>
      <p className="adm-form-note">
        同步進來的紀錄改不了，只能決定要不要出現在前台；電影與影集可以放進收藏頁最上面那一排。
      </p>
      <ul className="adm-coll-list">
        {items.map((w) => (
          <li key={`${w.kind}:${w.key}`} className="adm-coll-row" data-hidden={w.hidden || undefined}>
            {w.cover ? (
              <img className="adm-cover" src={w.cover} alt="" loading="lazy" />
            ) : (
              <span className="adm-cover adm-cover-empty" aria-hidden="true" />
            )}
            <span className="adm-coll-main">
              <span className="adm-coll-title">{w.title || '（沒有名字）'}</span>
              <span className="adm-meta">
                {[
                  KIND_LABEL[w.kind],
                  // 巴哈的集數是原樣的字（「[03]」「特別篇」），不再包一層「第…集」
                  w.kind === 'anime' && w.detail ? `看到 ${w.detail}` : w.detail,
                  formatWhen(w.watched_at, 'yyyy.MM.dd'),
                  w.source ? (SOURCE_LABEL[w.source] ?? w.source) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="adm-coll-actions">
              <button
                type="button"
                className="adm-btn adm-btn-small"
                aria-pressed={w.favorite_id != null}
                disabled={w.tmdb_id == null || busyKey !== null}
                title={w.tmdb_id == null ? '沒有對上 TMDb，放不進最愛' : undefined}
                onClick={() => void onFavorite(w)}
              >
                {w.favorite_id != null ? '★ 最愛' : '☆ 最愛'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-small"
                aria-pressed={!w.hidden}
                aria-label={`${w.title} 在前台顯示`}
                disabled={busyKey !== null}
                onClick={() => void onHide(w.kind, w.key, w.title, !w.hidden)}
              >
                {w.hidden ? '不公開' : '前台顯示'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ListenList({
  tracks,
  hiddenTracks,
  error,
  busyKey,
  onHide,
}: {
  tracks: AdminTrackItem[];
  hiddenTracks: { key: string; title: string; hidden_at: string }[];
  error: string | null;
  busyKey: string | null;
  onHide: (kind: string, key: string, title: string, hidden: boolean) => Promise<void>;
}) {
  return (
    <>
      <p className="adm-form-note">直接從 Spotify 來（最近播放的 50 首），這裡只能決定哪幾首不要出現在前台。</p>
      {error && <p className="adm-empty">Spotify 現在抓不到：{error}</p>}
      {!error && tracks.length === 0 && <p className="adm-empty">沒有最近播放。Spotify 沒接上的話這裡會是空的。</p>}
      <ul className="adm-coll-list">
        {tracks.map((t) => (
          <li key={`${t.id}:${t.played_at}`} className="adm-coll-row" data-hidden={t.hidden || undefined}>
            {t.cover ? (
              <img className="adm-coll-square" src={t.cover} alt="" loading="lazy" />
            ) : (
              <span className="adm-coll-square adm-cover-empty" aria-hidden="true" />
            )}
            <span className="adm-coll-main">
              <span className="adm-coll-title">{t.name}</span>
              <span className="adm-meta">
                {t.artists} · {formatWhen(t.played_at)}
              </span>
            </span>
            <span className="adm-coll-actions">
              <button
                type="button"
                className="adm-btn adm-btn-small"
                aria-pressed={!t.hidden}
                aria-label={`${t.name} 在前台顯示`}
                disabled={busyKey !== null}
                onClick={() => void onHide('track', t.id, t.name, !t.hidden)}
              >
                {t.hidden ? '不公開' : '前台顯示'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {hiddenTracks.length > 0 && (
        <div className="adm-coll-hidden">
          <span className="adm-caps">其他不公開的歌</span>
          <ul className="adm-coll-list">
            {hiddenTracks.map((h) => (
              <li key={h.key} className="adm-coll-row" data-hidden>
                <span className="adm-coll-main">
                  <span className="adm-coll-title">{h.title || h.key}</span>
                  <span className="adm-meta">{formatWhen(h.hidden_at, 'yyyy.MM.dd')} 藏起來的</span>
                </span>
                <span className="adm-coll-actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn-small"
                    disabled={busyKey !== null}
                    onClick={() => void onHide('track', h.key, h.title, false)}
                  >
                    改回公開
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function FavoriteList({
  favorites,
  loading,
  busyKey,
  run,
}: {
  favorites: WatchFavorite[];
  loading: boolean;
  busyKey: string | null;
  run: (key: string, work: () => Promise<void>, done: string) => Promise<void>;
}) {
  if (loading) return <AdminLoading label="讀最愛" />;
  if (favorites.length === 0) {
    return <p className="adm-empty">還沒有最愛。在「在看」裡按「☆ 最愛」放進來。</p>;
  }

  /** 換位置：整排重新編號（sort_order 從 0 起），只送有變的 */
  const move = (from: number, to: number) => {
    const next = [...favorites];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    void run(
      `move:${it.id}`,
      async () => {
        for (const [i, f] of next.entries()) {
          if (favorites[i]?.id !== f.id) await send('PUT', `/api/watch/favorites/${f.id}`, { sort_order: i });
        }
      },
      '換好位置了',
    );
  };

  return (
    <>
      <p className="adm-form-note">收藏頁最上面那一排，照這裡的順序；每一部可以留一句話。</p>
      <ol className="adm-coll-favs">
        {favorites.map((f, i) => (
          <li key={f.id} className="adm-coll-fav">
            {f.poster ? (
              <img className="adm-coll-poster" src={f.poster} alt="" loading="lazy" />
            ) : (
              <span className="adm-coll-poster adm-cover-empty" aria-hidden="true" />
            )}
            <span className="adm-coll-title">
              {String(i + 1).padStart(2, '0')} · {f.title}
              {f.year ? <span className="adm-meta"> {f.year}</span> : null}
            </span>
            <QuoteField favorite={f} disabled={busyKey !== null} run={run} />
            <span className="adm-coll-actions">
              <button
                type="button"
                className="adm-icon-btn"
                aria-label={`把 ${f.title} 往前移`}
                disabled={i === 0 || busyKey !== null}
                onClick={() => move(i, i - 1)}
              >
                ←
              </button>
              <button
                type="button"
                className="adm-icon-btn"
                aria-label={`把 ${f.title} 往後移`}
                disabled={i === favorites.length - 1 || busyKey !== null}
                onClick={() => move(i, i + 1)}
              >
                →
              </button>
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn-flare"
                aria-label={`把 ${f.title} 拿出最愛`}
                disabled={busyKey !== null}
                onClick={() =>
                  void run(
                    `fav:${f.id}`,
                    () => send('DELETE', `/api/watch/favorites/${f.id}`),
                    `〈${f.title}〉拿出最愛了`,
                  )
                }
              >
                拿掉
              </button>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** 一句話：離開欄位（或按 Enter）時有改才存 */
function QuoteField({
  favorite,
  disabled,
  run,
}: {
  favorite: WatchFavorite;
  disabled: boolean;
  run: (key: string, work: () => Promise<void>, done: string) => Promise<void>;
}) {
  const [quote, setQuote] = useState(favorite.quote ?? '');
  const save = () => {
    if (quote === (favorite.quote ?? '')) return;
    void run(`quote:${favorite.id}`, () => send('PUT', `/api/watch/favorites/${favorite.id}`, { quote }), '存好了');
  };
  return (
    <label className="adm-prompt adm-prompt-compact adm-coll-quote">
      <span className="sr-only">{favorite.title} 的一句話</span>
      <input
        value={quote}
        disabled={disabled}
        placeholder="留一句話"
        maxLength={120}
        onChange={(e) => setQuote(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
