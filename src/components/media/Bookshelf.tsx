import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { FaBook, FaSearch, FaTimes, FaFeatherAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { BookRow } from '@koimsurai/api-types';

import { filterAndSortBooks } from '@/lib/mediaLists';
import { proxiedImage } from '@/lib/api';
import { enterStyle } from '@/lib/enter';
import { booksQueryOptions, bookStatsQueryOptions } from '@/data/bookshelfData';
import NebulaBackground from '@/components/backdrop/NebulaBackground';
import BookConstellation from './BookConstellation';
import BookDetailDrawer from './BookDetailDrawer';
import { useHardwareGpu } from '@/hooks/useHardwareGpu';
import './Bookshelf.css';

// 3D 圖書館用 lazy import:three.js/R3F 只在 client 切到 3D 模式時才動態載入,
// 完全不進 server bundle / SSR render(避免每個請求白跑 three.js 的伺服器負擔)。
const ZeroGravityLibrary = lazy(() => import('./ZeroGravityLibrary'));

// 書封走後端 image-proxy（Google Books 是 http、而且不送 CORS header）
const proxiedCover = proxiedImage;

/** `GET /api/books` 的單本，型別由後端 Rust struct 生成（見 backend/SPECTA_PLAN.md）。 */
type Book = BookRow;

export interface BookStats {
  total_books: number;
  books_read: number;
  books_reading: number;
  average_rating?: number;
}

type StatusFilter = 'all' | 'reading' | 'read' | 'to-read';
const STATUS_ORDER = ['reading', 'read', 'to-read'] as const;

/** 書目清單裡每一組的排法：讀完的照評分、其他照加入時間（新的在前）。 */
function sortForList(list: Book[], status: string): Book[] {
  return [...list].sort((a, b) =>
    status === 'read'
      ? (b.rating ?? 0) - (a.rating ?? 0) || b.id - a.id
      : (b.date_added ?? '').localeCompare(a.date_added ?? ''),
  );
}

const Bookshelf = () => {
  const { t } = useTranslation();
  // 資料改由 TanStack Query 管理：route loader 已 ensureQueryData 預取 → SSR 首屏 baked、
  // hydrate 後 useQuery 讀同一份快取（不重抓）；15 分鐘輪詢 = queryOptions 的 refetchInterval。
  const { data: books = [], isPending } = useQuery(booksQueryOptions);
  const { data: stats = null } = useQuery(bookStatsQueryOptions);
  const [selected, setSelected] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [is3DMode, setIs3DMode] = useState(false);
  const closeZeroGravity = useCallback(() => setIs3DMode(false), []);
  // 軟體渲染（沒有 GPU）跑不動 3D 場景：按鈕留著但停用——藏起來的話 hydrate 後才出現，
  // 窄螢幕上它自己佔一列，會造成版面位移。探測結果整個分頁共用，只會做一次。
  const noGpu = useHardwareGpu() === false;

  // 符合條件的書。星圖上不符合的只是變暗、不會消失——天空不能因為篩選而重排。
  const matching = useMemo(
    () =>
      new Set(
        filterAndSortBooks(books, {
          searchTerm,
          statusFilter,
          ratingFilter: 'all',
          sortBy: 'date_added_desc',
        }).map((b) => b.id),
      ),
    [books, searchTerm, statusFilter],
  );
  const isDimmed = useCallback((b: Book) => !matching.has(b.id), [matching]);

  const statusLabel = (s: string) =>
    s === 'read'
      ? t('bookshelf.statuses.read')
      : s === 'reading'
        ? t('bookshelf.statuses.reading')
        : t('bookshelf.statuses.toRead');

  if (isPending) {
    return (
      <div className="bookshelf-container">
        <div className="loading-spinner">
          <FaBook className="spinning-book" />
          <p>{t('bookshelf.loading')}</p>
        </div>
      </div>
    );
  }

  const filters: StatusFilter[] = ['all', ...STATUS_ORDER];

  return (
    <div className="bookshelf-container">
      <NebulaBackground />

      <div className="bookshelf-content-wrapper">
        {/* 首屏進場用 CSS（.enter）：不等 JS，SSR 出來的星圖不會是 opacity:0 */}
        <section className="bs-sky enter" aria-label={t('bookshelf.heroTitle')}>
          {/* 頁面標題放進星圖左上角的圖例框：打開就是一整片天空，而不是「大標＋副標＋內容」。
              那個角落由 layoutConstellation 讓出來（LEGEND_CORNER），星星不會被蓋到。 */}
          <header className="bs-sky-card enter" style={enterStyle({ delay: 350, x: -16, y: 0, dur: 500 })}>
            <h1 className="bookshelf-title">
              <span className="bs-title-main">{t('bookshelf.heroTitle')}</span>
              <span className="bs-title-sub">Knowledge Constellation</span>
            </h1>
            <p className="bookshelf-subtitle">{t('bookshelf.subtitle')}</p>
            {stats && (
              <p className="bs-sky-stats">
                {t('bookshelf.skyStats', {
                  total: stats.total_books,
                  read: stats.books_read,
                  reading: stats.books_reading,
                })}
                {stats.average_rating ? (
                  <span className="bs-sky-stats-avg">{t('bookshelf.avgRating', { rating: stats.average_rating })}</span>
                ) : null}
              </p>
            )}
          </header>
          <BookConstellation
            books={books}
            isDimmed={isDimmed}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            coverSrc={proxiedCover}
          />
          <div className="bs-toolbar enter" style={enterStyle({ delay: 300, y: 12, dur: 500 })}>
            <fieldset className="bs-chips">
              <legend className="sr-only">{t('bookshelf.filterStatus')}</legend>
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="bs-chip"
                  data-status={f}
                  aria-pressed={statusFilter === f}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === 'all' ? t('common.all') : statusLabel(f)}
                </button>
              ))}
            </fieldset>
            <div className="bs-search">
              <FaSearch className="bs-search-icon" aria-hidden="true" />
              <input
                type="search"
                placeholder={t('bookshelf.searchPlaceholder')}
                aria-label={t('bookshelf.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" className="bs-search-clear" aria-label="清除" onClick={() => setSearchTerm('')}>
                  <FaTimes />
                </button>
              )}
            </div>
            <button
              type="button"
              className="view-mode-toggle"
              disabled={noGpu}
              title={noGpu ? t('bookshelf.zg.unavailable') : undefined}
              onClick={() => setIs3DMode(true)}
            >
              🌌 {t('bookshelf.zeroGravity')}
            </button>
          </div>
          <p className="bs-sky-hint" aria-hidden="true">
            {t('bookshelf.skyHint')}
          </p>
          <ul className="bs-legend">
            <li data-status="read">{t('bookshelf.legend.read')}</li>
            <li data-status="reading">{t('bookshelf.legend.reading')}</li>
            <li data-status="to-read">{t('bookshelf.legend.toRead')}</li>
            <li data-notes>{t('bookshelf.legend.notes')}</li>
          </ul>
        </section>

        {/* 書目：星圖是看全貌的，這裡是逐本掃的（手機、螢幕閱讀器、搜尋引擎也靠它） */}
        <motion.section
          className="bs-list"
          aria-labelledby="bs-list-title"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <h2 id="bs-list-title" className="bs-list-title">
            {t('bookshelf.listTitle')}
          </h2>
          {matching.size === 0 && <p className="bs-empty">{t('bookshelf.noMatch')}</p>}
          {STATUS_ORDER.map((status) => {
            const list = sortForList(
              books.filter((b) => (b.reading_status ?? 'to-read') === status && matching.has(b.id)),
              status,
            );
            if (list.length === 0) return null;
            return (
              <div key={status} className="bs-list-group" data-status={status}>
                <h3 className="bs-list-group-title">
                  {statusLabel(status)} <span className="bs-list-count">{list.length}</span>
                </h3>
                <ul className="bs-list-items">
                  {list.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className="bs-row"
                        data-selected={selected?.id === b.id ? '' : undefined}
                        onClick={() => setSelected(b)}
                      >
                        {b.cover_url ? (
                          <img className="bs-row-cover" src={proxiedCover(b.cover_url)} alt="" loading="lazy" />
                        ) : (
                          <span className="bs-row-cover bs-row-cover--empty" aria-hidden="true">
                            <FaBook />
                          </span>
                        )}
                        <span className="bs-row-text">
                          <span className="bs-row-title">{b.title}</span>
                          {b.authors && <span className="bs-row-author">{b.authors}</span>}
                        </span>
                        <span className="bs-row-meta">
                          {b.personal_notes && (
                            <FaFeatherAlt className="bs-row-note" aria-label={t('bookshelf.hasNotes')} />
                          )}
                          {b.rating != null && <span className="bs-row-rating">★ {b.rating}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </motion.section>
      </div>

      <BookDetailDrawer book={selected} onClose={() => setSelected(null)} coverSrc={proxiedCover} />

      {/* 3D 零重力圖書館(client-only,lazy)*/}
      {is3DMode && (
        <Suspense fallback={null}>
          <ZeroGravityLibrary books={books.filter((b) => matching.has(b.id))} onClose={closeZeroGravity} />
        </Suspense>
      )}
    </div>
  );
};

export default Bookshelf;
