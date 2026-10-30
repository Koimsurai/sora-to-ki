import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTrackItem, AdminWatchItem, WatchFavoriteRow as WatchFavorite } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminBahamutStatusQueryOptions, adminCollectionQueryOptions } from '@/data/adminData';
import { watchFavoritesQueryOptions } from '@/data/watchData';
import { jsonAuthHeaders } from '@/lib/authToken';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';
import './CollectionManager.css';

// 收藏（2026-10 後台提案的「收」）：在看、在聽都是同步進來的（巴哈、Simkl、Spotify），
// 站長決定不了「有沒有看」，只能決定「這一部／這一首要不要出現在前台」，以及哪幾部放進最愛。
// 書在書架頁（/admin/books），這裡不重複一份。

type Tab = 'watch' | 'listen' | 'fav';

const TABS: Tab[] = ['watch', 'listen', 'fav'];

const KINDS = new Set(['anime', 'film', 'tv', 'track']);
/** 巴哈要翻（是簡稱），其他是服務名 */
const SOURCE_NAME: Record<string, string> = { simkl: 'Simkl', trakt: 'Trakt' };

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
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(adminCollectionQueryOptions);
  const favorites = useQuery(watchFavoritesQueryOptions('zh-TW'));
  const bahamut = useQuery({ ...adminBahamutStatusQueryOptions, retry: false });
  const [tab, setTab] = useState<Tab>('watch');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const watch = data?.watch ?? [];
  const tracks = data?.tracks ?? [];
  const hiddenTracks = (data?.hidden ?? []).filter((h) => h.kind === 'track' && !tracks.some((tr) => tr.id === h.key));
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
      toast.error(t('collection.saveFailed', { error: e instanceof Error ? e.message : '' }));
    } finally {
      setBusyKey(null);
    }
  };

  const setHidden = (kind: string, key: string, title: string, hidden: boolean) =>
    run(
      `${kind}:${key}`,
      () => send('PUT', '/api/admin/collection/hidden', { kind, key, title, hidden }),
      hidden ? t('collection.hiddenNow', { title }) : t('collection.shownNow', { title }),
    );

  const toggleFavorite = (w: AdminWatchItem) =>
    run(
      `fav:${w.kind}:${w.key}`,
      () =>
        w.favorite_id != null
          ? send('DELETE', `/api/watch/favorites/${w.favorite_id}`)
          : send('POST', '/api/watch/favorites', { tmdbId: w.tmdb_id, kind: favoriteKind(w), rating: 5, quote: '' }),
      w.favorite_id != null
        ? t('collection.favRemoved', { title: w.title })
        : t('collection.favAdded', { title: w.title }),
    );

  const countOf = (k: Tab) => (k === 'watch' ? watch.length : k === 'listen' ? tracks.length : favs.length);
  const b = bahamut.data;

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.collection')}
        latin="Collection"
        meta={isPending ? t('common.loading') : t('collection.meta', { watch: watch.length, fav: favs.length })}
      />

      <p className="adm-coll-sources" aria-label={t('collection.sources')}>
        {b && (
          <span data-bad={!b.ok || undefined}>
            {b.ok ? '●' : '×'} {t('collection.bahamut')}
            {b.ok
              ? b.daysLeft !== null
                ? ` · ${t('collection.loginDaysLeft', { days: b.daysLeft })}`
                : ''
              : ` · ${t('collection.cookieExpired')}`}
          </span>
        )}
        <span data-bad={data?.tracks_error ? true : undefined}>
          {data?.tracks_error ? '×' : '●'} Spotify
          {data?.tracks_error
            ? ` · ${t('collection.spotifyFailed')}`
            : ` · ${t('collection.spotifyRecent', { count: tracks.length })}`}
        </span>
        <Link to="/admin/books" className="adm-coll-link">
          {t('collection.booksLink')}
        </Link>
      </p>

      <section className="adm-stack" aria-label={t('nav.collection')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(`collection.tab.${key}`)}
                <span className="adm-meta">{isPending ? '' : countOf(key)}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading label={t('collection.loadingCollection')} />
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
  const { t } = useAdminT();
  if (items.length === 0) return <p className="adm-empty">{t('collection.watchEmpty')}</p>;
  return (
    <>
      <p className="adm-form-note">{t('collection.watchNote')}</p>
      <ul className="adm-coll-list">
        {items.map((w) => (
          <li key={`${w.kind}:${w.key}`} className="adm-coll-row" data-hidden={w.hidden || undefined}>
            {w.cover ? (
              <img className="adm-cover" src={w.cover} alt="" loading="lazy" />
            ) : (
              <span className="adm-cover adm-cover-empty" aria-hidden="true" />
            )}
            <span className="adm-coll-main">
              <span className="adm-coll-title">{w.title || t('collection.untitled')}</span>
              <span className="adm-meta">
                {[
                  KINDS.has(w.kind) ? t(`collection.kind.${w.kind}`) : null,
                  // 巴哈的集數是原樣的字（「[03]」「特別篇」），不再包一層「第…集」
                  w.kind === 'anime' && w.detail ? t('collection.watchedUpTo', { detail: w.detail }) : w.detail,
                  formatWhen(w.watched_at, 'yyyy.MM.dd'),
                  w.source
                    ? w.source === 'bahamut'
                      ? t('collection.bahamut')
                      : (SOURCE_NAME[w.source] ?? w.source)
                    : null,
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
                title={w.tmdb_id == null ? t('collection.noTmdb') : undefined}
                onClick={() => void onFavorite(w)}
              >
                {w.favorite_id != null ? t('collection.favOn') : t('collection.favOff')}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn-small"
                aria-pressed={!w.hidden}
                aria-label={t('collection.showAria', { title: w.title })}
                disabled={busyKey !== null}
                onClick={() => void onHide(w.kind, w.key, w.title, !w.hidden)}
              >
                {w.hidden ? t('collection.hidden') : t('collection.shown')}
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
  const { t } = useAdminT();
  return (
    <>
      <p className="adm-form-note">{t('collection.listenNote')}</p>
      {error && <p className="adm-empty">{t('collection.spotifyError', { error })}</p>}
      {!error && tracks.length === 0 && <p className="adm-empty">{t('collection.listenEmpty')}</p>}
      <ul className="adm-coll-list">
        {tracks.map((tr) => (
          <li key={`${tr.id}:${tr.played_at}`} className="adm-coll-row" data-hidden={tr.hidden || undefined}>
            {tr.cover ? (
              <img className="adm-coll-square" src={tr.cover} alt="" loading="lazy" />
            ) : (
              <span className="adm-coll-square adm-cover-empty" aria-hidden="true" />
            )}
            <span className="adm-coll-main">
              <span className="adm-coll-title">{tr.name}</span>
              <span className="adm-meta">
                {tr.artists} · {formatWhen(tr.played_at)}
              </span>
            </span>
            <span className="adm-coll-actions">
              <button
                type="button"
                className="adm-btn adm-btn-small"
                aria-pressed={!tr.hidden}
                aria-label={t('collection.showAria', { title: tr.name })}
                disabled={busyKey !== null}
                onClick={() => void onHide('track', tr.id, tr.name, !tr.hidden)}
              >
                {tr.hidden ? t('collection.hidden') : t('collection.shown')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {hiddenTracks.length > 0 && (
        <div className="adm-coll-hidden">
          <span className="adm-caps">{t('collection.otherHidden')}</span>
          <ul className="adm-coll-list">
            {hiddenTracks.map((h) => (
              <li key={h.key} className="adm-coll-row" data-hidden>
                <span className="adm-coll-main">
                  <span className="adm-coll-title">{h.title || h.key}</span>
                  <span className="adm-meta">
                    {t('collection.hiddenOn', { date: formatWhen(h.hidden_at, 'yyyy.MM.dd') })}
                  </span>
                </span>
                <span className="adm-coll-actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn-small"
                    disabled={busyKey !== null}
                    onClick={() => void onHide('track', h.key, h.title, false)}
                  >
                    {t('collection.unhide')}
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
  const { t } = useAdminT();
  if (loading) return <AdminLoading label={t('collection.loadingFavs')} />;
  if (favorites.length === 0) {
    return <p className="adm-empty">{t('collection.favEmpty')}</p>;
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
      t('collection.moved'),
    );
  };

  return (
    <>
      <p className="adm-form-note">{t('collection.favNote')}</p>
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
                aria-label={t('collection.moveUp', { title: f.title })}
                disabled={i === 0 || busyKey !== null}
                onClick={() => move(i, i - 1)}
              >
                ←
              </button>
              <button
                type="button"
                className="adm-icon-btn"
                aria-label={t('collection.moveDown', { title: f.title })}
                disabled={i === favorites.length - 1 || busyKey !== null}
                onClick={() => move(i, i + 1)}
              >
                →
              </button>
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn-flare"
                aria-label={t('collection.removeFavAria', { title: f.title })}
                disabled={busyKey !== null}
                onClick={() =>
                  void run(
                    `fav:${f.id}`,
                    () => send('DELETE', `/api/watch/favorites/${f.id}`),
                    t('collection.favRemoved', { title: f.title }),
                  )
                }
              >
                {t('collection.remove')}
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
  const { t } = useAdminT();
  const [quote, setQuote] = useState(favorite.quote ?? '');
  const save = () => {
    if (quote === (favorite.quote ?? '')) return;
    void run(
      `quote:${favorite.id}`,
      () => send('PUT', `/api/watch/favorites/${favorite.id}`, { quote }),
      t('collection.saved'),
    );
  };
  return (
    <label className="adm-prompt adm-prompt-compact adm-coll-quote">
      <span className="sr-only">{t('collection.quoteLabel', { title: favorite.title })}</span>
      <input
        value={quote}
        disabled={disabled}
        placeholder={t('collection.quotePlaceholder')}
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
