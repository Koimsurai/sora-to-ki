// 收藏：看過的、讀過的、常聽的。三區同一套排法——上面是總覽的數字（量），接著是最喜歡的那幾部、
// 那幾本配上自己寫的話（品味），最下面是一整面封面牆，全部都在。
// 封面牆平常是點陣（灰階的封面蓋上一層點的遮罩），遠看像一片星雲；滑過哪一格它才顯出原本的顏色，
// 閒著的時候偶爾也有一格自己亮一下。點陣是 CSS 做的：不用讀圖片的像素，外站的封面不必經過代理。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
import { usePageTransition } from '@/hooks/usePageTransition';
import { booksQueryOptions } from '@/data/bookshelfData';
import {
  nowPlayingQueryOptions,
  recentlyPlayedQueryOptions,
  topGenresQueryOptions,
  topTracksQueryOptions,
} from '@/data/musicData';
import {
  animeLibraryQueryOptions,
  filmsLibraryQueryOptions,
  liveNowQueryOptions,
  tvLibraryQueryOptions,
  watchFavoritesQueryOptions,
  watchStatsQueryOptions,
} from '@/data/watchData';
import {
  albumCover,
  artistsOf,
  bookCells,
  bookCounts,
  bookStatus,
  favoriteBooks,
  stars,
  thumb,
  trackCells,
  watchCells,
  type BookStatus,
  type Cell,
  type WatchKind,
} from './collectionItems';
import FavoritesEditor from './FavoritesEditor';
import { reform, type Target } from './stardust';
import './Collection.css';

/** 閒著的時候多久亮一格、亮多久（毫秒） */
const TWINKLE_EVERY = 2200;
const TWINKLE_FOR = 1400;
/** 最常聽的取哪一段時間（Spotify 的「最近半年」） */
const TRACK_RANGE = 'medium_term';

const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'));

/** [key, 數字, 標籤]：標籤會重複（動畫與影集都是「集」），所以另外給 key */
function Stats({ items }: { items: [string, number | undefined, string][] }) {
  return (
    <dl className="cx-stats">
      {items.map(([key, n, label]) => (
        <div key={key} data-piece>
          <dt>{label}</dt>
          <dd>{fmt(n)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 一區的開頭：一句話與數字（這一區叫什麼由上面的切換列說） */
function Head({ sub, children }: { sub: string; children?: React.ReactNode }) {
  return (
    <header className="cx-block-head">
      <p data-piece>{sub}</p>
      {children}
    </header>
  );
}

/** 一張會「顯影」的封面：平常是點陣，滑過才浮出原色。兩張同一個來源的圖疊著，瀏覽器只抓一次 */
function Cover({ src }: { src: string | null }) {
  if (!src) return <span className="cx-cover is-empty" aria-hidden="true" />;
  return (
    <span className="cx-cover" aria-hidden="true">
      <img className="cx-dot" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      <img className="cx-col" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    </span>
  );
}

interface Fav {
  key: string;
  title: string;
  meta: string;
  quote?: string | null;
  cover: string | null;
  href?: string | null;
}

function Favs({ items, square }: { items: Fav[]; square?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={square ? 'cx-favs is-square' : 'cx-favs'}>
      {items.map((f) => {
        const cover = <Cover src={f.cover} />;
        return (
          <li key={f.key} className="cx-fav" data-piece>
            {f.href ? (
              <a href={f.href} target="_blank" rel="noopener noreferrer" aria-label={f.title}>
                {cover}
              </a>
            ) : (
              cover
            )}
            <div>
              <b>{f.title}</b>
              <span className="cx-fav-meta">{f.meta}</span>
              {f.quote && <q>{f.quote}</q>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 封面牆：一格一個連結（或只是一張圖），滑過時旁邊浮出標題 */
function Wall({ cells, w, h, gap, label }: { cells: Cell[]; w: number; h: number; gap: number; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ i: number; x: number; y: number; left: boolean } | null>(null);

  // 閒著的時候偶爾一格自己亮一下，像星星閃。看不到這面牆時不閃
  useEffect(() => {
    const box = boxRef.current;
    if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box);
    let off = 0;
    const timer = window.setInterval(() => {
      if (!visible || box.matches(':hover')) return;
      const lit = box.querySelectorAll<HTMLElement>('.cx-cell:not(.is-empty)');
      const el = lit[Math.floor(Math.random() * lit.length)] as HTMLElement | undefined;
      if (!el) return;
      el.classList.add('is-lit');
      off = window.setTimeout(() => el.classList.remove('is-lit'), TWINKLE_FOR);
    }, TWINKLE_EVERY);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(off);
    };
  }, [cells.length]);

  const show = (target: EventTarget | null) => {
    const box = boxRef.current;
    const el = target instanceof Element ? target.closest<HTMLElement>('.cx-cell') : null;
    if (!box || !el) return setTip(null);
    const i = Number(el.dataset.i);
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 字放在格子右邊，靠右邊緣時改放左邊
    const left = r.right - b.left + 240 > b.width;
    setTip({ i, x: left ? r.left - b.left - 8 : r.right - b.left + 8, y: r.top - b.top, left });
  };

  const grid = useMemo(
    () =>
      cells.map((c, i) => {
        const name = `${c.title}${c.meta ? `，${c.meta}` : ''}`;
        return (
          <li key={c.id} data-piece>
            {c.href ? (
              <a
                className={c.cover ? 'cx-cell' : 'cx-cell is-empty'}
                data-i={i}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
              >
                <Cover src={c.cover} />
              </a>
            ) : (
              <span className={c.cover ? 'cx-cell' : 'cx-cell is-empty'} data-i={i}>
                <Cover src={c.cover} />
                <span className="sr-only">{name}</span>
              </span>
            )}
          </li>
        );
      }),
    [cells],
  );

  const hovered = tip ? cells[tip.i] : null;
  return (
    <div
      className="cx-wall"
      ref={boxRef}
      style={{ '--cw': `${w}px`, '--ch': `${h}px`, '--cg': `${gap}px` } as React.CSSProperties}
      onPointerOver={(e) => show(e.target)}
      onPointerLeave={() => setTip(null)}
      onFocus={(e) => show(e.target)}
      onBlur={() => setTip(null)}
    >
      <ul aria-label={label}>{grid}</ul>
      <div
        className={tip?.left ? 'cx-tip is-left' : 'cx-tip'}
        aria-hidden="true"
        style={tip ? { transform: `translate(${tip.x}px, ${tip.y}px)`, opacity: 1 } : undefined}
      >
        {hovered && (
          <>
            <b>{hovered.title}</b>
            <span>{hovered.meta}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Live({ on, label, title, tail }: { on: boolean; label: string; title: string; tail?: string }) {
  return (
    <p className={on ? 'cx-live is-on' : 'cx-live'} data-piece>
      <i aria-hidden="true" />
      {label}
      <b>{title}</b>
      {tail && <span>{tail}</span>}
    </p>
  );
}

function WatchBlock() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: stats } = useQuery(watchStatsQueryOptions);
  const { data: favorites = [] } = useQuery(watchFavoritesQueryOptions(lang));
  const { data: live = null } = useQuery(liveNowQueryOptions);
  const { data: anime = [] } = useQuery(animeLibraryQueryOptions);
  const { data: films = [] } = useQuery(filmsLibraryQueryOptions);
  const { data: tv = [] } = useQuery(tvLibraryQueryOptions);
  const kind = (k: WatchKind) => t(`collection.kind.${k}`);
  const { cells, latest } = useMemo(
    () => watchCells(anime, films, tv, (k) => t(`collection.kind.${k}`)),
    [anime, films, tv, t],
  );

  return (
    <section className="cx-block" aria-label={t('collection.watch.title')}>
      <Head sub={t('collection.watch.sub')}>
        <Stats
          items={[
            ['anime', stats?.animeCount, t('collection.watch.anime')],
            ['animeEp', stats?.animeEpisodes, t('collection.watch.animeEp')],
            ['film', stats?.filmCount, t('collection.watch.film')],
            ['tv', stats?.tvSeriesCount, t('collection.watch.tv')],
            ['tvEp', stats?.tvEpisodes, t('collection.watch.tvEp')],
          ]}
        />
      </Head>
      {live ? (
        <Live
          on
          label={t('collection.watch.live')}
          title={live.title}
          tail={live.episode ? t('collection.watch.episode', { n: live.episode }) : undefined}
        />
      ) : (
        latest && <Live on={false} label={t('collection.watch.last')} title={latest.title} tail={latest.date} />
      )}
      {isAdmin && (
        <button type="button" className="cx-edit" onClick={() => setEditing(true)}>
          {t('watch.favManage')}
        </button>
      )}
      <Favs
        items={favorites.map((f) => ({
          key: `f${f.id}`,
          title: f.title,
          meta: [kind(f.kind === 'film' ? 'film' : 'tv'), f.year, stars(f.rating)].filter(Boolean).join(' · '),
          quote: f.quote,
          cover: thumb(f.poster, 'fav'),
          href: f.externalUrl,
        }))}
      />
      <Wall cells={cells} w={30} h={45} gap={3} label={t('collection.watch.wall')} />
      {editing && (
        <FavoritesEditor
          favorites={favorites}
          onClose={() => setEditing(false)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['watch', 'favorites'] })}
        />
      )}
    </section>
  );
}

function BooksBlock() {
  const { t } = useTranslation();
  const { data: books = [] } = useQuery(booksQueryOptions);
  const status = (s: BookStatus) => t(`collection.status.${s}`);
  const counts = bookCounts(books);
  const cells = useMemo(() => bookCells(books, (s) => t(`collection.status.${s}`)), [books, t]);
  return (
    <section className="cx-block" aria-label={t('collection.books.title')}>
      <Head sub={t('collection.books.sub')}>
        <Stats
          items={[
            ['total', counts.total, t('collection.books.total')],
            ['read', counts.read, status('read')],
            ['reading', counts.reading, status('reading')],
            ['toRead', counts.toRead, status('to-read')],
          ]}
        />
      </Head>
      <Favs
        items={favoriteBooks(books).map((b) => ({
          key: `b${b.id}`,
          title: b.title,
          meta: [status(bookStatus(b)), stars(b.rating)].filter(Boolean).join(' · '),
          quote: b.personal_notes,
          cover: thumb(b.cover_url, 'fav'),
        }))}
      />
      <Wall cells={cells} w={46} h={69} gap={6} label={t('collection.books.wall')} />
    </section>
  );
}

function MusicBlock() {
  const { t } = useTranslation();
  const { data: top } = useQuery(topTracksQueryOptions(TRACK_RANGE));
  const { data: genres } = useQuery(topGenresQueryOptions);
  const { data: now } = useQuery(nowPlayingQueryOptions);
  const { data: recent } = useQuery(recentlyPlayedQueryOptions);
  const tracks = useMemo(() => top?.tracks ?? [], [top]);
  const cells = useMemo(() => trackCells(tracks), [tracks]);
  const topGenres = (genres?.genres ?? []).slice(0, 5);
  const maxGenre = Math.max(1, ...topGenres.map((g) => g.count));
  const playing = now?.is_playing ? now.item : null;
  const last = recent?.tracks?.[0]?.track ?? null;
  const first = tracks.at(0);
  return (
    <section className="cx-block" aria-label={t('collection.music.title')}>
      <Head sub={t('collection.music.sub')}>
        <Stats
          items={[
            ['tracks', tracks.length > 0 ? tracks.length : undefined, t('collection.music.tracks')],
            ['genres', genres?.genres?.length, t('collection.music.genres')],
          ]}
        />
      </Head>
      {playing ? (
        <Live on label={t('collection.music.live')} title={playing.name} tail={artistsOf(playing)} />
      ) : (
        last && <Live on={false} label={t('collection.music.last')} title={last.name} tail={artistsOf(last)} />
      )}
      {top?.error !== undefined && !tracks.length ? (
        <p className="cx-empty" data-piece>
          {t('collection.music.off')}
        </p>
      ) : (
        <>
          {topGenres.length > 0 && (
            <ul className="cx-genres" aria-label={t('collection.music.genres')}>
              {topGenres.map((g) => (
                <li key={g.genre} data-piece>
                  <span>{g.genre}</span>
                  <i style={{ '--w': `${(g.count / maxGenre) * 100}%` } as React.CSSProperties} />
                  <em>{g.count}</em>
                </li>
              ))}
            </ul>
          )}
          {first && (
            <Favs
              square
              items={[
                {
                  key: first.id,
                  title: first.name,
                  meta: `${artistsOf(first)} · ${t('collection.music.first')}`,
                  cover: albumCover(first, 'fav'),
                  href: first.external_urls.spotify,
                },
              ]}
            />
          )}
          <Wall cells={cells} w={64} h={64} gap={6} label={t('collection.music.wall')} />
        </>
      )}
    </section>
  );
}

const TABS = ['watch', 'books', 'music'] as const;
type Tab = (typeof TABS)[number];
const LATIN: Record<Tab, string> = { watch: 'WATCH', books: 'BOOKS', music: 'MUSIC' };
const isTab = (v: string): v is Tab => (TABS as readonly string[]).includes(v);
/** 琥珀點從一個分頁滑到另一個的時間（毫秒），中間往上拱一點 */
const DOT_MS = 560;

export default function Collection() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Tab>('watch');
  const stageRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const tabsRef = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const busyRef = useRef(false);
  /** 換區時等新的那一區排好：React 換完、版面算好之後由下面的 layout effect 叫 */
  const laidOutRef = useRef<(() => void) | null>(null);

  // 三區的資料一起抓：換過去的時候已經在快取裡，星塵散出去就有地方落
  useQuery(booksQueryOptions);
  useQuery(topTracksQueryOptions(TRACK_RANGE));
  useQuery(topGenresQueryOptions);
  useQuery(animeLibraryQueryOptions);
  useQuery(filmsLibraryQueryOptions);
  useQuery(tvLibraryQueryOptions);

  /** 琥珀點在切換列上的位置（相對切換列） */
  const dotX = (tab: Tab) => {
    const el = tabsRef.current[tab];
    return el ? el.offsetLeft - 12 : 0;
  };
  const placeDot = (tab: Tab, animate: boolean) => {
    const dot = dotRef.current;
    if (!dot) return;
    const to = dotX(tab);
    if (!animate) {
      dot.style.transform = `translate(${to}px, 0)`;
      return;
    }
    const from = new DOMMatrixReadOnly(getComputedStyle(dot).transform).m41;
    // 沿著一道弧滑過去：中間往上拱，跟站上其他地方的琥珀點一樣不走直線
    dot.animate(
      [
        { transform: `translate(${from}px, 0)` },
        { transform: `translate(${(from + to) / 2}px, -10px)` },
        { transform: `translate(${to}px, 0)` },
      ],
      { duration: DOT_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    dot.style.transform = `translate(${to}px, 0)`;
  };
  const dotCenter = () => {
    const r = dotRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: 120 };
  };

  // 換頁轉場的琥珀點落在切換列的那一點上
  usePageTransition({ anchor: () => (dotRef.current ? dotCenter() : null) });

  // 從舊網址轉過來的（/bookshelf → #books）直接打開那一區
  // （SSR 看不到 hash，所以第一幀一律是「在看」，hydrate 完下一幀再換過去）
  useEffect(() => {
    const tab = window.location.hash.slice(1);
    if (!isTab(tab) || tab === 'watch') return;
    const raf = requestAnimationFrame(() => setActive(tab));
    return () => cancelAnimationFrame(raf);
  }, []);

  // 換好區之後：琥珀點停在那個分頁上（換區時它已經沿著弧滑過去了，這裡只是把位置定住），
  // 正在等新的那一區排好的星塵可以散出去了
  useLayoutEffect(() => {
    const dot = dotRef.current;
    const el = tabsRef.current[active];
    if (dot && el) dot.style.transform = `translate(${el.offsetLeft - 12}px, 0)`;
    laidOutRef.current?.();
    laidOutRef.current = null;
  }, [active]);

  const go = (tab: Tab) => {
    if (tab === active || busyRef.current) return;
    // 換網址的 hash 但保留路由自己放在 history.state 裡的東西（上一頁、下一頁要靠它）
    window.history.replaceState(window.history.state, '', `#${tab}`);
    const stage = stageRef.current;
    const cv = dustRef.current;
    placeDot(tab, true);
    if (!stage || !cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(tab);
      return;
    }
    busyRef.current = true;
    stage.style.minHeight = `${stage.offsetHeight}px`;
    const sources = [...stage.querySelectorAll<HTMLElement>('[data-piece]')].map((el) => el.getBoundingClientRect());
    stage.classList.add('is-out');
    const swap = () =>
      new Promise<Target[]>((resolve) => {
        laidOutRef.current = () => {
          stage.classList.remove('is-out');
          stage.classList.add('is-in');
          resolve(
            [...stage.querySelectorAll<HTMLElement>('[data-piece]')].map((el) => ({
              rect: el.getBoundingClientRect(),
              reveal: () => el.classList.add('is-lit-in'),
            })),
          );
        };
        setActive(tab);
      });
    void reform(cv, sources, dotCenter, swap).then(() => {
      stage.classList.remove('is-in');
      stage.querySelectorAll('.is-lit-in').forEach((el) => el.classList.remove('is-lit-in'));
      stage.style.minHeight = '';
      busyRef.current = false;
    });
  };

  return (
    <div className="cx">
      <header className="cx-head">
        <div className="cx-head-title">
          <h1>{t('collection.title')}</h1>
          <span>Collection</span>
        </div>
        <p>{t('collection.subtitle')}</p>
      </header>
      <div className="cx-switch">
        <span className="cx-switch-dot" ref={dotRef} aria-hidden="true" />
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            ref={(el) => {
              tabsRef.current[tab] = el;
            }}
            className={tab === active ? 'is-on' : undefined}
            aria-pressed={tab === active}
            onClick={() => go(tab)}
          >
            {t(`collection.${tab}.title`)}
            <span>{LATIN[tab]}</span>
          </button>
        ))}
      </div>
      <div className="cx-stage" ref={stageRef}>
        {active === 'watch' && <WatchBlock />}
        {active === 'books' && <BooksBlock />}
        {active === 'music' && <MusicBlock />}
      </div>
      <canvas className="cx-dust" ref={dustRef} aria-hidden="true" />
    </div>
  );
}
