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
import { usePageTransition } from '@/hooks/usePageTransition';
import { useBareSky } from '@/hooks/useBareSky';
import { orbitGeometry, orbitPoint, setOrbitHandoff, takeOrbitHandoff } from '@/lib/articleOrbit';
import { after, type Pt } from '@/store/pageTransition';
import { arcPoint, createNoteSky, poleOf, postArc, skyPostOf, type SkyPost } from './noteSky';
import './Notes.css';

/* 手記：一篇文章是一道星軌（畫在 noteSky），列表照目錄排、年份在左、一篇一行。
   滑過一篇，它那道星軌就亮起來、尾端變成琥珀色。分類在上面一排；從文章頁的標籤點過來時
   （?tag=）多一個可以清掉的標籤條件。全文搜尋在命令面板（⌘K）。 */

/** 先列這麼多篇，其他的按「還有 N 篇」才展開 */
const FIRST = 20;
/** 估閱讀時間：一分鐘讀幾個字（內文含程式碼與 markdown 記號，比純中文讀得快） */
const CHARS_PER_MIN = 700;
/** 快門打開、星軌拖出來的時間（秒） */
const EXPOSE_S = 1.8;
/** 點進一篇文章時，它的星軌拉成文章頁軌道的時間 */
const ZOOM_MS = 700;
/** 去別頁時整片縮回去的時間 */
const RETRACT_MS = 380;
/** 飛進來的那條線落地後淡掉的時間 */
const TRAIL_FADE_MS = 900;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
    ...skyPostOf({ title: p.title, content_length: lengthOf(p) }, maxLen),
    dim: !shownIds.has(p.id),
  }));

  // 背景的星星讓位：這一頁的星都畫成星軌
  useBareSky();
  const pageRef = useRef<HTMLDivElement>(null);
  /** 快門什麼時候打開（星軌開始長）；-1 是還沒 */
  const startRef = useRef(-1);
  const zoomRef = useRef<{ i: number; at: number } | null>(null);
  const retractRef = useRef(-1);
  const trailRef = useRef<{ points: Pt[]; at: number } | null>(null);
  /** 從文章頁回來：那一篇的星軌一開始就是滿的、亮著 */
  const keepRef = useRef(-1);
  const backFrom = posts.length ? takeOrbitHandoff('notes') : null;
  if (backFrom !== null) keepRef.current = indexOf.get(backFrom) ?? -1;

  const skyTime = () => (startRef.current < 0 ? 0 : (performance.now() - startRef.current) / 1000);
  const arcOf = (i: number) =>
    postArc(i, skyRef.current.length, skyRef.current[i], window.innerWidth, window.innerHeight, skyTime());

  usePageTransition({
    // 從文章頁回來：文章的軌道已經被拉回那一篇的星軌，點就停在它的那顆星上
    anchor: () => {
      if (keepRef.current < 0) return null;
      const arc = arcOf(keepRef.current);
      return arcPoint(arc, arc.a1);
    },
    // 點飛進來時沿著最新那一篇的星軌走，落在它的那顆星上：飛過的線就是那一篇的星軌
    arrive: () => {
      if (keepRef.current >= 0) return null;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const on = (q: Pt) => q.x > 16 && q.x < w - 16 && q.y > 72 && q.y < h - 16;
      // 最新的那幾篇星軌很大，那顆星常在畫面外：往下找最新、而且看得到那顆星的一篇
      for (let i = 0; i < skyRef.current.length; i++) {
        const arc = arcOf(i);
        if (!on(arcPoint(arc, arc.a1))) continue;
        const run: Pt[] = [];
        for (let k = 0; k <= 48; k++) {
          const q = arcPoint(arc, arc.a0 + ((arc.a1 - arc.a0) * k) / 48);
          if (on(q)) run.push(q);
          else run.length = 0;
        }
        if (run.length > 6) return { approach: run };
      }
      return null;
    },
    onGrow: ({ trail }) => {
      trailRef.current = { points: trail, at: performance.now() };
      return 'trail';
    },
    // 收：點進一篇文章時，那一篇的星軌被拉成文章頁右邊的軌道（lib/articleOrbit），它的那顆星變成
    // 讀者的琥珀點；去別的地方時整片縮回各自的那顆星
    leave: ({ source }) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      pageRef.current?.classList.add('is-leaving');
      const id = Number(/^post:(\d+)$/.exec(source ?? '')?.[1] ?? NaN);
      const i = indexOf.get(id);
      const geom = orbitGeometry(w, h);
      if (i !== undefined && geom) {
        setOrbitHandoff('article', id);
        const at = performance.now();
        zoomRef.current = { i, at };
        const from = (() => {
          const arc = arcOf(i);
          return arcPoint(arc, arc.a1);
        })();
        const to = orbitPoint(geom, 0);
        return {
          point: to,
          follow: () => {
            const k = easeInOut(Math.min(1, (performance.now() - at) / ZOOM_MS));
            return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
          },
          done: after(ZOOM_MS),
          // 拉好的軌道留在畫面上，等文章頁的軌道接手
          residue: (c) => {
            c.strokeStyle = 'rgba(241, 236, 227, 0.78)';
            c.lineWidth = 1;
            c.beginPath();
            c.arc(geom.cx, geom.cy, geom.RB, geom.aBot, geom.aTop);
            c.stroke();
          },
        };
      }
      retractRef.current = performance.now();
      return { point: poleOf(w, h), done: after(RETRACT_MS * 0.8) };
    },
  });

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
    let drawn = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場還在把這一頁藏著：等它露出來才打開快門
      if (root.dataset.pt === 'out') return;
      if (startRef.current < 0) startRef.current = now;
      const t = (now - startRef.current) / 1000;
      // 快門打開：所有的星一起拖出軌跡，越拖越慢
      const grow = reduce ? 1 : Math.min(1, 1 - Math.pow(1 - t / EXPOSE_S, 3));
      const zoom = zoomRef.current;
      const zk = zoom ? Math.min(1, (now - zoom.at) / ZOOM_MS) : 0;
      const retract = retractRef.current < 0 ? 0 : Math.min(1, (now - retractRef.current) / RETRACT_MS) ** 2;
      const trail = trailRef.current;
      const trailAlpha = trail ? Math.max(0, 1 - (now - trail.at) / TRAIL_FADE_MS) : 0;
      const busy = grow < 1 || zoom !== null || retractRef.current >= 0 || trailAlpha > 0;
      // 長完之後 30fps 就夠；沒有 GPU 的機器長完就不再轉，只在滑過時重畫
      if (!busy && now - last < 33) return;
      const still = !busy && (reduce || root.classList.contains('no-gpu'));
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
      const geom = zoom ? orbitGeometry(w, h) : null;
      sky.draw(ctx, w, h, skyRef.current, {
        t: still ? 0 : t,
        grow,
        hovered: hoveredRef.current,
        keep: keepRef.current,
        zoom: zoom && geom ? { i: zoom.i, k: zk, geom } : null,
        retract,
        trail: trail && trailAlpha > 0 ? { points: trail.points, alpha: trailAlpha } : null,
      });
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
    <div className="nt" ref={pageRef}>
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
                      data-pt-source={`post:${p.id}`}
                      // 滑過就先載入：點下去時星軌拉成軌道的那 0.7 秒裡文章多半已經好了
                      preload="intent"
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
