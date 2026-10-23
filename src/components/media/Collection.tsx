// 收藏：看過的、讀過的、常聽的各是一團星雲，每部作品是一顆星（media/nebulaSky）。
// 往下捲就是鏡頭在三團之間飛，琥珀點在前面帶路、停在每一團的核心；數字是星圖旁邊的標註，
// 最愛的幾部是琥珀色的亮星、旁邊標著名字。滑過一顆星，旁邊開一個望遠鏡圓窗顯示它的封面
// （這時才載入那一張）與寫的那句話。整頁只有一張畫布，封面不會一次載幾百張。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
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
import { useBareSky } from '@/hooks/useBareSky';
import { usePageTransition } from '@/hooks/usePageTransition';
import { isArriving } from '@/store/pageTransition';
import {
  artistsOf,
  bookCounts,
  bookStars,
  trackStars,
  watchStars,
  type BookStatus,
  type WatchKind,
} from './collectionItems';
import FavoritesEditor from './FavoritesEditor';
import { createNebula, type Projected, type Star } from './nebulaSky';
import './Collection.css';

/** 最常聽的取哪一段時間（Spotify 的「最近半年」） */
const TRACK_RANGE = 'medium_term';
/** 從一團捲到下一團要捲多少（視窗高的倍數） */
const SEGMENT_VH = 1.25;
/** 滑鼠離一顆星多近才算滑到它（像素） */
const NEAR_PX = 14;
/** 琥珀點落地後，星雲從它那裡散開的時間（毫秒） */
const BLOOM_MS = 1100;

const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Line {
  key: string;
  n: number | undefined;
  label: string;
}

interface LiveLine {
  on: boolean;
  label: string;
  title: string;
  tail?: string;
}

/** 星圖上的標註：這一團叫什麼、幾個數字、正在看／聽什麼 */
function Label({
  title,
  latin,
  lines,
  live,
  children,
}: {
  title: string;
  latin: string;
  lines: Line[];
  live?: LiveLine | null;
  children?: React.ReactNode;
}) {
  return (
    <>
      <h2>
        {title}
        <span>{latin}</span>
      </h2>
      <dl>
        {lines.map((l) => (
          <div key={l.key}>
            <dd>{fmt(l.n)}</dd>
            <dt>{l.label}</dt>
          </div>
        ))}
      </dl>
      {live && (
        <p className={live.on ? 'cx-live is-on' : 'cx-live'}>
          <i aria-hidden="true" />
          {live.label}
          <b>{live.title}</b>
          {live.tail && <span>{live.tail}</span>}
        </p>
      )}
      {children}
    </>
  );
}

export default function Collection() {
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
  const { data: books = [] } = useQuery(booksQueryOptions);
  const { data: top } = useQuery(topTracksQueryOptions(TRACK_RANGE));
  const { data: genres } = useQuery(topGenresQueryOptions);
  const { data: now } = useQuery(nowPlayingQueryOptions);
  const { data: recent } = useQuery(recentlyPlayedQueryOptions);

  const watch = useMemo(
    () => watchStars(anime, films, tv, favorites, (k: WatchKind) => t(`collection.kind.${k}`)),
    [anime, films, tv, favorites, t],
  );
  const bookList = useMemo(() => bookStars(books, (s: BookStatus) => t(`collection.status.${s}`)), [books, t]);
  const tracks = useMemo(() => top?.tracks ?? [], [top]);
  const trackList = useMemo(() => trackStars(tracks), [tracks]);
  const clouds = useMemo(
    () => [
      { key: 'watch', stars: watch.stars },
      { key: 'books', stars: bookList },
      { key: 'music', stars: trackList },
    ],
    [watch.stars, bookList, trackList],
  );
  const nebula = useMemo(() => createNebula(clouds), [clouds]);
  const allStars = useMemo(() => new Map(clouds.flatMap((c) => c.stars.map((s) => [s.id, s] as const))), [clouds]);
  const quoted = useMemo(() => clouds.flatMap((c) => c.stars.filter((s) => s.amber && s.quote)), [clouds]);

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const quotesRef = useRef<Map<string, HTMLElement>>(new Map());
  const scopeRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const pRef = useRef(0);
  const [hovered, setHovered] = useState<Star | null>(null);
  const hoverRef = useRef<string | null>(null);

  // 背景的星星讓位：這一頁的星都是星雲裡的作品，背景的星由星雲自己畫（有深度、會跟著鏡頭流過去）
  useBareSky();

  const counts = bookCounts(books);
  const playing = now?.is_playing ? now.item : null;
  const lastTrack = recent?.tracks?.[0]?.track ?? null;
  const topGenres = (genres?.genres ?? []).slice(0, 5);
  const maxGenre = Math.max(1, ...topGenres.map((g) => g.count));

  // 換頁轉場的琥珀點落在現在這一團的核心（一進來是「在看」那一團）
  usePageTransition({
    anchor: () => {
      const cv = canvasRef.current;
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const d = nebula.dot({
        w: window.innerWidth,
        h: window.innerHeight,
        t: 0,
        p: pRef.current,
        hovered: null,
        bloom: 1,
      });
      return { x: r.left + d.x, y: r.top + d.y };
    },
  });

  useEffect(() => {
    const page = pageRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!page || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let born = -1;
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    const onClick = () => {
      const s = hoverRef.current ? allStars.get(hoverRef.current) : null;
      if (s?.href) window.open(s.href, '_blank', 'noopener,noreferrer');
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('click', onClick);

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場的點還在飛：星雲還沒散開，等它落在核心上
      const arriving = isArriving();
      if (!arriving && born < 0) born = nowMs;
      if (nowMs - last < 16) return;
      last = nowMs;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const seg = h * SEGMENT_VH;
      const p = Math.min(nebula.count - 1, Math.max(0, -page.getBoundingClientRect().top / seg));
      pRef.current = p;
      const bloom = reduce ? 1 : born < 0 ? 0 : easeOut(Math.min(1, (nowMs - born) / BLOOM_MS));
      const f = { w, h, t: reduce ? 0 : nowMs / 1000, p, hovered: hoverRef.current, bloom, dot: !arriving };
      const projected = nebula.draw(ctx, f);

      // 滑到哪一顆星：最近的那一顆，夠近才算
      let near: Projected | null = null;
      if (pointer) {
        let best = NEAR_PX;
        for (const q of projected) {
          const d = Math.hypot(q.x - pointer.x, q.y - pointer.y);
          if (d < best) {
            best = d;
            near = q;
          }
        }
      }
      const id = near?.id ?? null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        const star = id ? (allStars.get(id) ?? null) : null;
        setHovered(star);
        cv.style.cursor = star?.href ? 'pointer' : '';
      }
      const scope = scopeRef.current;
      if (scope && near) scope.style.transform = `translate(${near.x}px, ${near.y}px)`;

      // 標註跟著各自那一團：停在哪一團，哪一團的標註最清楚
      const narrow = w < 760;
      // 窄螢幕的標註在星雲上面：不能壓到頁首（頁首捲走之後就不受限）
      const below = (headRef.current?.getBoundingClientRect().bottom ?? 0) + 20;
      labelsRef.current.forEach((el, i) => {
        if (!el) return;
        const c = nebula.core(f, i);
        const R = nebula.cloudRadius(f, i);
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        const x = narrow ? 20 : Math.max(24, c.x - R * 1.08 - lw);
        const y = narrow ? Math.max(below, c.y - R * 0.62 - lh - 16) : c.y - lh / 2;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = String(Math.max(0, 1 - Math.abs(p - i) * 1.8) * bloom);
      });
      const pos = new Map(projected.map((q) => [q.id, q]));
      quotesRef.current.forEach((el, sid) => {
        const q = pos.get(sid);
        if (!q) {
          el.style.opacity = '0';
          return;
        }
        const left = q.x > w * 0.7;
        el.classList.toggle('is-left', left);
        el.style.transform = `translate(${left ? q.x - 14 - el.offsetWidth : q.x + 14}px, ${q.y - 10}px)`;
        el.style.opacity = String(Math.max(0, 1 - Math.abs(p - q.cloud) * 3) * bloom * (sid === id ? 0 : 1));
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('click', onClick);
    };
  }, [nebula, allStars]);

  const latest = watch.latest;
  const watchLive: LiveLine | null = live
    ? {
        on: true,
        label: t('collection.watch.live'),
        title: live.title,
        tail: live.episode ? t('collection.watch.episode', { n: live.episode }) : undefined,
      }
    : latest
      ? { on: false, label: t('collection.watch.last'), title: latest.title, tail: latest.date }
      : null;
  const musicLive: LiveLine | null = playing
    ? { on: true, label: t('collection.music.live'), title: playing.name, tail: artistsOf(playing) }
    : lastTrack
      ? { on: false, label: t('collection.music.last'), title: lastTrack.name, tail: artistsOf(lastTrack) }
      : null;

  const labels = [
    <Label
      key="watch"
      title={t('collection.watch.title')}
      latin="WATCH"
      lines={[
        { key: 'anime', n: stats?.animeCount, label: t('collection.watch.anime') },
        { key: 'animeEp', n: stats?.animeEpisodes, label: t('collection.watch.animeEp') },
        { key: 'film', n: stats?.filmCount, label: t('collection.watch.film') },
        { key: 'tv', n: stats?.tvSeriesCount, label: t('collection.watch.tv') },
        { key: 'tvEp', n: stats?.tvEpisodes, label: t('collection.watch.tvEp') },
      ]}
      live={watchLive}
    >
      {isAdmin && (
        <button type="button" className="cx-edit" onClick={() => setEditing(true)}>
          {t('watch.favManage')}
        </button>
      )}
    </Label>,
    <Label
      key="books"
      title={t('collection.books.title')}
      latin="BOOKS"
      lines={[
        { key: 'total', n: counts.total, label: t('collection.books.total') },
        { key: 'read', n: counts.read, label: t('collection.status.read') },
        { key: 'reading', n: counts.reading, label: t('collection.status.reading') },
        { key: 'toRead', n: counts.toRead, label: t('collection.status.to-read') },
      ]}
    />,
    <Label
      key="music"
      title={t('collection.music.title')}
      latin="MUSIC"
      lines={[{ key: 'tracks', n: tracks.length > 0 ? tracks.length : undefined, label: t('collection.music.tracks') }]}
      live={musicLive}
    >
      {topGenres.length > 0 && (
        <ul className="cx-genres" aria-label={t('collection.music.genres')}>
          {topGenres.map((g) => (
            <li key={g.genre}>
              <span>{g.genre}</span>
              <i style={{ '--w': `${(g.count / maxGenre) * 100}%` } as React.CSSProperties} />
              <em>{g.count}</em>
            </li>
          ))}
        </ul>
      )}
    </Label>,
  ];

  return (
    <div className="cx" ref={pageRef}>
      <div className="cx-sky">
        <canvas ref={canvasRef} aria-hidden="true" />
        {labels.map((l, i) => (
          <div
            key={l.key}
            className="cx-label"
            ref={(el) => {
              labelsRef.current[i] = el;
            }}
          >
            {l}
          </div>
        ))}
        {quoted.map((s) => (
          <span
            key={s.id}
            className="cx-quote"
            aria-hidden="true"
            ref={(el) => {
              if (el) quotesRef.current.set(s.id, el);
              else quotesRef.current.delete(s.id);
            }}
          >
            {s.title}
          </span>
        ))}
        <div className={hovered ? 'cx-scope is-on' : 'cx-scope'} ref={scopeRef} aria-hidden="true">
          {hovered && (
            <>
              <span className="cx-scope-lens">
                {hovered.cover ? (
                  <img key={hovered.id} src={hovered.cover} alt="" referrerPolicy="no-referrer" />
                ) : null}
              </span>
              <span className="cx-scope-text">
                <b>{hovered.title}</b>
                <span>{hovered.meta}</span>
                {hovered.quote && <q>{hovered.quote}</q>}
              </span>
            </>
          )}
        </div>
      </div>

      <header className="cx-head" ref={headRef}>
        <div className="cx-head-title">
          <h1>{t('collection.title')}</h1>
          <span>Collection</span>
        </div>
        <p>{t('collection.subtitle')}</p>
      </header>
      <p className="cx-hint" aria-hidden="true">
        {t('collection.hint')}
      </p>

      {/* 畫布上的星給螢幕閱讀器與搜尋引擎的版本：每一團的全部作品 */}
      <div className="sr-only">
        {clouds.map((c) => (
          <section key={c.key} aria-label={t(`collection.${c.key}.title`)}>
            <h2>{t(`collection.${c.key}.title`)}</h2>
            <ul>
              {c.stars.map((s) => (
                <li key={s.id}>
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                  {`，${s.meta}`}
                  {s.quote ? `：「${s.quote}」` : ''}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <FavoritesEditor
          favorites={favorites}
          onClose={() => setEditing(false)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['watch', 'favorites'] })}
        />
      )}
    </div>
  );
}
