import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { PostListItem } from '@koimsurai/api-types';
import { blogCategoriesQueryOptions, postsListQueryOptions } from '@/data/blogList';
import { useLocale } from '@/hooks/useLocale';
import { LocaleLink } from '@/i18n/locale-link';
import { filterPosts, groupPostsByYear } from '@/lib/blogFilter';
import { splitTitle } from '@/lib/blogReading';
import { useCategoryLabel, useTagLabel } from '@/lib/categoryLabel';
import { postPath } from '@/lib/postPath';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { createNoteSky, hash01, type SkyPost } from './noteSky';
import './Notes.css';

/* 手記：一篇文章是一道星軌（畫在 noteSky），列表照目錄排、年份在左、一篇一行。
   滑過一篇，它那道星軌就亮起來、尾端變成琥珀色。分類在上面一排；從文章頁的標籤點過來時
   （?tag=）多一個可以清掉的標籤條件。全文搜尋在命令面板（⌘K）。 */

/** 先列這麼多篇，其他的按「還有 N 篇」才展開 */
const FIRST = 20;
/** 估閱讀時間：一分鐘讀幾個字（內文含程式碼與 markdown 記號，比純中文讀得快） */
const CHARS_PER_MIN = 700;
/** 星軌長出來的時間（秒） */
const GROW_S = 2.4;

/** 舊版後端沒有 content_length（正式環境更新後端前）：當成沒有長度，弧長只看標題 */
const lengthOf = (p: PostListItem) => (p as Partial<PostListItem>).content_length ?? 0;

function Notes() {
  const { t } = useTranslation();
  const locale = useLocale();
  const categoryLabel = useCategoryLabel();
  const tagLabel = useTagLabel();
  const { data: posts = [] } = useQuery(postsListQueryOptions(locale, 'newest'));
  const { data: categories = [] } = useQuery(blogCategoriesQueryOptions(locale));
  const search = useRouterState({ select: (s) => s.location.search }) as { category?: string; tag?: string };

  // 分類與標籤的條件：網址帶了就照網址（從選單或文章頁點過來），之後由頁面上的按鈕改
  const [category, setCategory] = useState(search.category ?? '');
  const [tag, setTag] = useState(search.tag ?? '');
  const [seen, setSeen] = useState(search);
  if (seen.category !== search.category || seen.tag !== search.tag) {
    setSeen(search);
    setCategory(search.category ?? '');
    setTag(search.tag ?? '');
  }
  const [showAll, setShowAll] = useState(false);

  const shown = useMemo(
    () => filterPosts(posts, { searchTerm: '', selectedTag: tag, selectedCategory: category }),
    [posts, tag, category],
  );
  const visible = showAll ? shown : shown.slice(0, FIRST);
  const groups = groupPostsByYear(visible);

  // 星軌跟著「全部」的文章畫（篩掉的變淡），換分類時夜空不會整片重排
  const hoveredRef = useRef(-1);
  const indexOf = useMemo(() => new Map(posts.map((p, i) => [p.id, i])), [posts]);
  const skyRef = useRef<SkyPost[]>([]);
  const maxLen = Math.max(1, ...posts.map(lengthOf));
  const shownIds = new Set(shown.map((p) => p.id));
  skyRef.current = posts.map((p) => ({
    length: lengthOf(p) ? lengthOf(p) / maxLen : 0.2 + 0.4 * hash01(`${p.title}#len`),
    seed: hash01(p.title),
    dim: !shownIds.has(p.id),
  }));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sky = createNoteSky();
    let raf = 0;
    let last = 0;
    let start = -1;
    let drawn = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場還在把這一頁藏著：等它露出來才開始長
      if (root.dataset.pt === 'out') return;
      if (start < 0) start = now;
      const t = (now - start) / 1000;
      const grow = reduce ? 1 : Math.min(1, 1 - Math.pow(1 - t / GROW_S, 3));
      const growing = grow < 1;
      // 長完之後轉得很慢，20fps 就夠；沒有 GPU 的機器長完就不再轉，只在滑過時重畫
      if (!growing && now - last < 50) return;
      const still = !growing && (reduce || root.classList.contains('no-gpu'));
      const w = window.innerWidth;
      const h = window.innerHeight;
      const key = `${w},${h},${hoveredRef.current},${skyRef.current.length}`;
      if (still && key === drawn) return;
      drawn = key;
      last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky.draw(ctx, w, h, skyRef.current, { t: still ? 0 : t, grow, hovered: hoveredRef.current });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const label = t('blog.title');
  const latin = 'Notes';
  const minutes = (p: PostListItem) => {
    const n = lengthOf(p);
    return n ? t('blog.minutes', { count: Math.max(1, Math.round(n / CHARS_PER_MIN)) }) : '';
  };

  return (
    <div className="nt">
      <canvas className="nt-sky" ref={canvasRef} aria-hidden="true" />
      <div className="nt-in">
        <header className="nt-head nt-shadow">
          <div className="nt-title">
            <h1>{label}</h1>
            {label.toLowerCase() !== latin.toLowerCase() && <span className="nt-latin">{latin}</span>}
          </div>
          <p>{t('blog.subtitle')}</p>
        </header>

        <div className="nt-filters nt-shadow">
          <ul className="nt-cats" aria-label={t('blog.sideCategories')}>
            <li>
              <button type="button" className={category ? undefined : 'is-on'} onClick={() => setCategory('')}>
                {t('blog.all')} <em>{posts.length}</em>
              </button>
            </li>
            {categories
              .filter((c) => c.post_count > 0)
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={category === c.name ? 'is-on' : undefined}
                    aria-pressed={category === c.name}
                    onClick={() => setCategory(category === c.name ? '' : c.name)}
                  >
                    {categoryLabel(c.name)} <em>{c.post_count}</em>
                  </button>
                </li>
              ))}
          </ul>
          {tag && (
            <button type="button" className="nt-tag" onClick={() => setTag('')}>
              # {tagLabel(tag)} <span aria-hidden="true">✕</span>
              <span className="sr-only">{t('blog.clearFilters')}</span>
            </button>
          )}
        </div>

        {shown.length === 0 && <p className="nt-empty">{t('blog.emptyFiltered')}</p>}

        {groups.map((g) => (
          <section key={g.year} className="nt-year" aria-label={String(g.year)}>
            <span className="nt-y nt-shadow" aria-hidden="true">
              {g.year}
            </span>
            <ul className="nt-list">
              {g.posts.map((p) => {
                const i = indexOf.get(p.id) ?? -1;
                const d = parseServerDate(p.created_at);
                const title = splitTitle(p.title);
                return (
                  <li
                    key={p.id}
                    onPointerEnter={() => (hoveredRef.current = i)}
                    onPointerLeave={() => (hoveredRef.current = -1)}
                  >
                    <time dateTime={p.created_at} suppressHydrationWarning>
                      {dotDate(d, true)}
                    </time>
                    <LocaleLink
                      to={postPath(p)}
                      className="nt-shadow"
                      onFocus={() => (hoveredRef.current = i)}
                      onBlur={() => (hoveredRef.current = -1)}
                    >
                      <b>{title.main}</b>
                      {title.sub && <span className="nt-sub">{title.sub}</span>}
                    </LocaleLink>
                    <span className="nt-meta">
                      {[p.category ? categoryLabel(p.category) : '', minutes(p)].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {!showAll && shown.length > FIRST && (
          <button type="button" className="nt-more" onClick={() => setShowAll(true)}>
            {t('blog.more', { count: shown.length - FIRST })}
          </button>
        )}
      </div>
    </div>
  );
}

export default Notes;
