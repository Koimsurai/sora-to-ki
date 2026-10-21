import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookRow } from '@koimsurai/api-types';

import { layoutConstellation, SKY_H, SKY_W, type PlacedStar } from '@/lib/bookConstellation';
import type { ThumbWidth } from '@/lib/api';
import './BookConstellation.css';

/**
 * 「知識星圖」：每本書是一顆星。
 *
 *   已讀 → 點亮的星，評分越高越大越亮
 *   閱讀中 → 正在點亮（脈動的光環）
 *   想讀 → 還沒點亮（只有一圈淡淡的輪廓）
 *   有個人筆記 → 多了十字星芒
 *
 * 系列連成星座、同類聚成星團，版面是 lib/bookConstellation.ts 算的（純函式、可測）。
 * 連線與星團名稱是 SVG；**每顆星是 HTML <button>**——鍵盤 Tab 得到、螢幕閱讀器念得出來，
 * hover 卡片也不用跟 SVG 的座標系打交道。
 */

type Book = BookRow;

interface Props {
  books: readonly Book[];
  /** 不符合篩選／搜尋的書：星星變暗，但留在原位（天空不能因為篩選而重排）。 */
  isDimmed: (book: Book) => boolean;
  selectedId: number | null;
  onSelect: (book: Book) => void;
  coverSrc: (url?: string | null, w?: ThumbWidth) => string;
}

/** 0～1 之間的穩定偽隨機數，讓每顆星的閃爍節奏錯開。 */
const phaseOf = (id: number) => ((id * 0.618034) % 1) * 6;

function starSize(book: Book): number {
  if (book.reading_status !== 'read') return 7;
  // 已讀：4～11px，沒評分的給中間值
  return 4 + (book.rating ?? 3) * 1.4;
}

export default function BookConstellation({ books, isDimmed, selectedId, onSelect, coverSrc }: Props) {
  const { t } = useTranslation();
  const sky = useMemo(() => layoutConstellation(books), [books]);
  const [hovered, setHovered] = useState<PlacedStar<Book> | null>(null);

  // 窄螢幕上天空是可以左右滑的（畫布固定 720px 寬，星星才不會擠成一團）；一開始置中
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  const dimmedIds = useMemo(() => new Set(books.filter(isDimmed).map((b) => b.id)), [books, isDimmed]);

  const statusLabel = (s?: string | null) =>
    s === 'read'
      ? t('bookshelf.statuses.read')
      : s === 'reading'
        ? t('bookshelf.statuses.reading')
        : t('bookshelf.statuses.toRead');

  return (
    <div className="bc-scroll" ref={scrollRef}>
      <div className="bc-canvas" onMouseLeave={() => setHovered(null)}>
        <svg className="bc-svg" viewBox={`0 0 ${SKY_W} ${SKY_H}`} aria-hidden="true" focusable="false">
          {sky.clusters.map((c) => (
            <text key={c.key} className="bc-cluster-label" x={c.x} y={c.y + 6} textAnchor="middle">
              {t(`bookshelf.groups.${c.key}`)}
            </text>
          ))}
          {sky.lines.map((l, i) => (
            <line
              key={`${l.ids[0]}-${l.ids[1]}`}
              className="bc-line"
              data-dim={dimmedIds.has(l.ids[0]) || dimmedIds.has(l.ids[1]) ? '' : undefined}
              x1={l.from.x}
              y1={l.from.y}
              x2={l.to.x}
              y2={l.to.y}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
          {sky.seriesLabels.map((s) => (
            <text key={s.name} className="bc-series-label" x={s.x} y={s.y} textAnchor="middle">
              {s.name}
            </text>
          ))}
        </svg>

        {sky.stars.map((s) => {
          const b = s.book;
          const size = starSize(b);
          return (
            <button
              key={b.id}
              type="button"
              className="bc-star"
              data-status={b.reading_status ?? 'to-read'}
              data-notes={b.personal_notes ? '' : undefined}
              data-dim={dimmedIds.has(b.id) ? '' : undefined}
              data-selected={selectedId === b.id ? '' : undefined}
              style={
                {
                  left: `${(s.x / SKY_W) * 100}%`,
                  top: `${(s.y / SKY_H) * 100}%`,
                  '--size': `${size}px`,
                  '--phase': `${phaseOf(b.id)}s`,
                } as CSSProperties
              }
              aria-label={`${b.title}（${statusLabel(b.reading_status)}${b.rating != null ? `，${b.rating} 星` : ''}）`}
              onClick={() => onSelect(b)}
              onMouseEnter={() => setHovered(s)}
              onFocus={() => setHovered(s)}
              onBlur={() => setHovered(null)}
            >
              <span className="bc-star-glow" />
              <span className="bc-star-core" />
              <span className="bc-star-label">{s.series ? s.series.index : b.title}</span>
            </button>
          );
        })}

        {hovered && (
          <div
            className="bc-tip"
            data-flip={hovered.x > SKY_W * 0.62 ? '' : undefined}
            style={{ left: `${(hovered.x / SKY_W) * 100}%`, top: `${(hovered.y / SKY_H) * 100}%` }}
            aria-hidden="true"
          >
            {hovered.book.cover_url && (
              <img src={coverSrc(hovered.book.cover_url, 256)} alt="" className="bc-tip-cover" />
            )}
            <div className="bc-tip-body">
              <div className="bc-tip-title">{hovered.book.title}</div>
              {hovered.book.authors && <div className="bc-tip-author">{hovered.book.authors}</div>}
              <div className="bc-tip-meta">
                <span data-status={hovered.book.reading_status ?? 'to-read'}>
                  {statusLabel(hovered.book.reading_status)}
                </span>
                {hovered.book.rating != null && <span>★ {hovered.book.rating}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
