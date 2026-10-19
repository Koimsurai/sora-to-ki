import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FaBook, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { BookRow } from '@koimsurai/api-types';

import { useIsClient, useMediaQuery } from '@/hooks/useMediaQuery';
import './BookDetailDrawer.css';

/**
 * 書的詳情：從右側滑出（窄螢幕是從下方升起的面板）。
 *
 * portal 到 document.body——寫在頁面內容裡的覆蓋層，z-index 再大都只是「在所屬堆疊脈絡裡排第一」，
 * 頂欄照樣會浮在上面（CLAUDE.md 的 z-index 那節）。
 */

type Book = BookRow;

interface Props {
  book: Book | null;
  onClose: () => void;
  coverSrc: (url?: string | null) => string;
}

const fmtDate = (d?: string | null) => (d ? new Date(d.slice(0, 10)).toLocaleDateString('zh-TW') : null);

export default function BookDetailDrawer({ book, onClose, coverSrc }: Props) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  // 記「哪一本」展開了，而不是一個布林：換一本書時自然就是收合的，不用在 effect 裡重設
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // portal 只能在 client 掛：SSR 沒有 document
  const isClient = useIsClient();
  // 窄螢幕是從下方升起的面板（CSS 那邊同一個斷點）
  const narrow = useMediaQuery('(max-width: 640px)');
  const bookId = book?.id;

  // 開啟時把焦點移到關閉鈕、Esc 關閉；關閉後焦點還給原本按下去的那顆星或那一列。
  // 依賴的是 bookId 而不是 book／onClose：那兩個每次 render 都可能是新的參考，會讓焦點一直被搶回來。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (bookId == null) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [bookId]);

  if (!isClient) return null;
  const expanded = expandedId != null && expandedId === bookId;

  const status = book?.reading_status ?? 'to-read';
  const statusText =
    status === 'read'
      ? t('bookshelf.statuses.read')
      : status === 'reading'
        ? t('bookshelf.statuses.reading')
        : t('bookshelf.statuses.toRead');
  const started = fmtDate(book?.date_started);
  const finished = fmtDate(book?.date_finished);
  const longDesc = (book?.description?.length ?? 0) > 180;

  return createPortal(
    <AnimatePresence>
      {book && (
        <motion.div
          key="bd-backdrop"
          className="bd-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="bd-panel"
            // <dialog> 有自己的 top-layer 與 showModal/close 生命週期，跟 framer-motion 的進出場動畫
            // 搶同一件事；role="dialog" + aria-modal + 焦點管理已達成同樣的可存取行為（同 MobileNav）
            // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="dialog"
            aria-modal="true"
            aria-labelledby="bd-title"
            initial={narrow ? { y: '100%' } : { x: '100%' }}
            animate={narrow ? { y: 0 } : { x: 0 }}
            exit={narrow ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeRef}
              type="button"
              className="bd-close"
              onClick={onClose}
              aria-label={t('bookshelf.close')}
            >
              <FaTimes />
            </button>

            <div className="bd-hero">
              {book.cover_url ? (
                <img className="bd-cover" src={coverSrc(book.cover_url)} alt="" />
              ) : (
                <div className="bd-cover bd-cover--empty" aria-hidden="true">
                  <FaBook />
                </div>
              )}
              <div className="bd-heading">
                <span className="bd-status" data-status={status}>
                  {statusText}
                </span>
                <h2 id="bd-title" className="bd-title">
                  {book.title}
                </h2>
                {book.authors && <p className="bd-author">{book.authors}</p>}
                {book.rating != null && (
                  <p className="bd-rating" aria-label={`${book.rating} / 5`}>
                    <span className="bd-rating-stars" style={{ '--r': book.rating } as CSSProperties} />
                    <span className="bd-rating-num">{book.rating}</span>
                  </p>
                )}
              </div>
            </div>

            {(started ?? finished) && (
              <dl className="bd-dates">
                {started && (
                  <div>
                    <dt>{t('bookshelf.started')}</dt>
                    <dd>{started}</dd>
                  </div>
                )}
                {finished && (
                  <div>
                    <dt>{t('bookshelf.finished')}</dt>
                    <dd>{finished}</dd>
                  </div>
                )}
              </dl>
            )}

            {book.personal_notes && (
              <section className="bd-notes">
                <h3>{t('bookshelf.myNotes')}</h3>
                <p>{book.personal_notes}</p>
              </section>
            )}

            {book.description && (
              <section className="bd-desc">
                <h3>{t('bookshelf.about')}</h3>
                <p data-clamped={longDesc && !expanded ? '' : undefined}>{book.description}</p>
                {longDesc && (
                  <button type="button" className="bd-more" onClick={() => setExpandedId(expanded ? null : book.id)}>
                    {expanded ? t('bookshelf.showLess') : t('bookshelf.showMore')}
                  </button>
                )}
              </section>
            )}

            <dl className="bd-meta">
              {book.publisher && (
                <div>
                  <dt>{t('bookshelf.publisher')}</dt>
                  <dd>{book.publisher}</dd>
                </div>
              )}
              {book.published_date && (
                <div>
                  <dt>{t('bookshelf.publishedDate')}</dt>
                  <dd>{book.published_date}</dd>
                </div>
              )}
              {book.page_count ? (
                <div>
                  <dt>{t('bookshelf.pages')}</dt>
                  <dd>{book.page_count}</dd>
                </div>
              ) : null}
              {book.isbn && (
                <div>
                  <dt>ISBN</dt>
                  <dd>{book.isbn}</dd>
                </div>
              )}
            </dl>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
