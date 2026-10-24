// 收藏：每部看過、讀過、聽過的作品，是看完、讀完、聽完那一刻從地球發出的一道訊號，到現在以光速
// 飛了一段距離（media/signalSky）。往下捲是鏡頭從地球往外退：剛聽的歌還在太陽系附近，
// 這幾年看的動畫電影在恆星之間。想讀的書還沒發出，繞著地球。滑過一點，旁邊開一個接收畫面
// 顯示它的封面（這時才載入那一張）、離地球多遠與寫的那句話。整頁只有一張畫布。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/contexts/auth';
import { booksQueryOptions } from '@/data/bookshelfData';
import { nowPlayingQueryOptions, recentlyPlayedQueryOptions, topTracksQueryOptions } from '@/data/musicData';
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
  bookSignals,
  dotDate,
  musicSignals,
  watchSignals,
  type BookStatus,
  type WatchKind,
} from './collectionItems';
import FavoritesEditor from './FavoritesEditor';
import { createSignalSky, LIGHT_YEAR, type Projected, type Signal, type SkyFrame } from './signalSky';
import './Collection.css';

/** 最常聽的取哪一段時間（Spotify 的「最近半年」） */
const TRACK_RANGE = 'medium_term';
/** 每退一個數量級要捲多少（視窗高的倍數；Collection.css 的預設長度照這個算） */
const DECADE_VH = 0.5;
/** 滑鼠離一點多近才算滑到它（像素） */
const NEAR_PX = 14;
/** 琥珀點落地後，第一道波前掃過整個畫面的時間（毫秒） */
const BLOOM_MS = 1400;
/** 窄螢幕的接收畫面固定開在哪裡（離視窗頂端，像素）：頂欄下面 */
const PIN_TOP = 76;
/** 捲動的慣性：鏡頭追上捲軸位置的時間常數（毫秒） */
const FOLLOW_MS = 110;
/** 地標的名字（畫布上那一點旁邊的一行字） */
const MARK_KEYS = [
  'earth',
  'geo',
  'moon',
  'jwst',
  'sun',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'voyager1',
  'heliopause',
  'oort',
  'proxima',
  'barnard',
  'wolf359',
  'lalande',
  'sirius',
  'epsEri',
  'procyon',
  'tauCeti',
  'scale-sec',
  'scale-min',
  'scale-hour',
  'scale-day',
  'scale-year',
  'records',
] as const;

const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 距離（光秒）換成最順口的單位：光秒、光分、光時、光日、光年 */
function distance(t: TFunction, ls: number): { n: string; unit: string } {
  const pick = (v: number, unit: string) => ({
    n: v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'),
    unit: t(`collection.sky.unit.${unit}`),
  });
  if (ls < 60) return pick(ls, 's');
  if (ls < 3600) return pick(ls / 60, 'm');
  if (ls < 86_400) return pick(ls / 3600, 'h');
  if (ls < LIGHT_YEAR) return pick(ls / 86_400, 'd');
  return pick(ls / LIGHT_YEAR, 'y');
}

/** 這個距離的訊號是什麼時候發出的：一天之內說幾秒、幾分鐘、幾小時前，再早的寫日期 */
function sentAt(t: TFunction, ls: number, now: number): string {
  if (ls < 1) return t('collection.sky.ago.now');
  if (ls < 90) return t('collection.sky.ago.s', { n: Math.round(ls) });
  if (ls < 5400) return t('collection.sky.ago.m', { n: Math.round(ls / 60) });
  if (ls < 86_400) return t('collection.sky.ago.h', { n: Math.round(ls / 3600) });
  const d = new Date(now - ls * 1000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return ls < LIGHT_YEAR ? dotDate(iso) : dotDate(iso).slice(0, 7);
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
  const { data: now } = useQuery(nowPlayingQueryOptions);
  const { data: recent } = useQuery(recentlyPlayedQueryOptions);

  const playing = now?.is_playing ? now.item : null;
  const tracks = useMemo(() => top?.tracks ?? [], [top]);
  const watch = useMemo(
    () => watchSignals(anime, films, tv, favorites, (k: WatchKind) => t(`collection.kind.${k}`)),
    [anime, films, tv, favorites, t],
  );
  const signals = useMemo(() => {
    const list: Signal[] = [
      ...watch.signals,
      ...bookSignals(books, (s: BookStatus) => t(`collection.status.${s}`)),
      ...musicSignals(recent?.tracks ?? [], tracks, playing),
    ];
    if (live) {
      list.push({
        id: 'live-watch',
        kind: 'watch',
        title: live.title,
        meta: live.episode ? t('collection.watch.episode', { n: live.episode }) : t('collection.watch.live'),
        cover: live.cover,
        href: live.externalUrl,
        at: null,
        size: 0.6,
        home: 'live',
        on: true,
      });
    }
    return list;
  }, [watch.signals, books, recent, tracks, playing, live, t]);
  // 天空照「現在」建；資料換了才重建（每一幀照當下的時間畫，訊號一直在往外飛）
  const sky = useMemo(() => createSignalSky(signals, Date.now()), [signals]);
  const byId = useMemo(() => new Map(signals.map((s) => [s.id, s])), [signals]);
  const named = useMemo(() => signals.filter((s) => s.amber && !s.home), [signals]);

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marksRef = useRef<Map<string, HTMLElement>>(new Map());
  const namesRef = useRef<Map<string, HTMLElement>>(new Map());
  const legendRef = useRef<Map<string, HTMLElement>>(new Map());
  const scopeRef = useRef<HTMLDivElement>(null);
  const reachRef = useRef<HTMLParagraphElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const sRef = useRef(0);
  const [hovered, setHovered] = useState<Signal | null>(null);
  const hoverRef = useRef<string | null>(null);

  // 背景的星星讓位：這一頁的天空自己畫（有真的行星、恆星，跟著鏡頭轉）
  useBareSky();

  // 換頁轉場的琥珀點落在地球上
  usePageTransition({
    anchor: () => {
      const cv = canvasRef.current;
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const e = sky.earth({
        w: window.innerWidth,
        h: window.innerHeight,
        now: Date.now(),
        t: 0,
        s: sRef.current,
        hovered: null,
        bloom: 1,
      });
      return { x: r.left + e.x, y: r.top + e.y };
    },
  });

  useEffect(() => {
    const page = pageRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!page || !cv || !ctx) return;
    // 頁面多長照跨了幾個數量級算；跟「現在」有關，只在瀏覽器端設（伺服器那份用 CSS 的預設長度）
    page.style.height = `calc(100vh + ${Math.round(sky.decades * DECADE_VH * 100)}vh)`;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let born = -1;
    let pointer: { x: number; y: number } | null = null;
    // 每幀都會寫字的地方：字沒變就不動 DOM
    const texts = new Map<HTMLElement, string>();
    const setText = (el: HTMLElement, s: string) => {
      if (texts.get(el) === s) return;
      texts.set(el, s);
      el.textContent = s;
    };
    // 觸控沒有「滑過」：點一下打開接收畫面，再點同一點才開連結
    let touch = false;
    let armed: string | null = null;
    let lastPoints: Projected[] = [];
    const at = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const nearest = (p: { x: number; y: number }) => {
      let best = NEAR_PX;
      let hit: Projected | null = null;
      for (const q of lastPoints) {
        if (q.a < 0.3) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < best) {
          best = d;
          hit = q;
        }
      }
      return hit;
    };
    const onMove = (e: PointerEvent) => {
      pointer = at(e);
    };
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType !== 'mouse';
      armed = hoverRef.current;
      pointer = at(e);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') pointer = null;
    };
    const onClick = (e: MouseEvent) => {
      const id = touch ? nearest({ x: e.offsetX, y: e.offsetY })?.id : hoverRef.current;
      if (!id || (touch && id !== armed)) return;
      const s = byId.get(id);
      if (s?.href) window.open(s.href, '_blank', 'noopener,noreferrer');
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('click', onClick);

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場的點還在飛：等它落在地球上，第一道波前才出發
      const arriving = isArriving();
      if (!arriving && born < 0) born = nowMs;
      const dt = last ? nowMs - last : 16;
      if (dt < 16) return;
      last = nowMs;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const travel = Math.max(1, page.offsetHeight - h);
      const target = Math.min(1, Math.max(0, -page.getBoundingClientRect().top / travel));
      sRef.current = reduce ? target : sRef.current + (target - sRef.current) * (1 - Math.exp(-dt / FOLLOW_MS));
      const s = sRef.current;
      const bloom = reduce ? 1 : born < 0 ? 0 : easeOut(Math.min(1, (nowMs - born) / BLOOM_MS));
      const clock = Date.now();
      const f: SkyFrame = {
        w,
        h,
        now: clock,
        t: reduce ? 0 : nowMs / 1000,
        s,
        hovered: hoverRef.current,
        bloom,
        dot: !arriving,
      };
      const { points, marks, inView } = sky.draw(ctx, f);
      lastPoints = points;

      // 滑到哪一點：最近的那一點，夠近、也夠清楚才算
      const near = pointer ? nearest(pointer) : null;
      const id = near?.id ?? null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        const sig = id ? (byId.get(id) ?? null) : null;
        setHovered(sig);
        cv.style.cursor = sig?.href ? 'pointer' : '';
      }
      const scope = scopeRef.current;
      const sig = near ? byId.get(near.id) : undefined;
      if (scope && near && sig) {
        // 開在點的右邊，右邊放不下就開在左邊；窄螢幕兩邊都放不下，固定開在頁首下面（不蓋住星）
        const sw = scope.offsetWidth;
        const pinned = w < 760;
        const left = !pinned && near.x + 20 + sw > w - 8;
        scope.classList.toggle('is-left', left);
        scope.classList.toggle('is-pinned', pinned);
        scope.style.transform = pinned ? `translate(0, ${PIN_TOP}px)` : `translate(${near.x}px, ${near.y}px)`;
        const dist = scope.querySelector<HTMLElement>('[data-dist]');
        if (dist) {
          const ls = sky.distOf(sig, clock);
          const d = distance(t, ls);
          setText(
            dist,
            sig.home
              ? t(sig.home === 'live' ? 'collection.sky.live' : 'collection.sky.queued')
              : sig.beyond
                ? t('collection.sky.beyond')
                : t('collection.sky.away', { n: d.n, unit: d.unit, date: sentAt(t, ls, clock) }),
          );
        }
      }

      // 地標的名字：跟著那一點，太近、太遠的淡掉
      const seen = new Set<string>();
      for (const m of marks) {
        const el = marksRef.current.get(m.key);
        if (!el) continue;
        seen.add(m.key);
        // 點的右邊放不下名字，就寫在左邊
        const flip = !m.key.startsWith('scale-') && m.key !== 'records' && m.x + 20 + el.offsetWidth > w - 8;
        el.style.transform = `translate(${flip ? Math.max(-8, m.x - el.offsetWidth - 24) : m.x}px, ${m.y}px)`;
        el.style.opacity = String(Math.min(1, m.a) * bloom);
        if (m.key === 'records') {
          setText(el, t('collection.sky.records', { date: sentAt(t, m.dist, clock) }));
        } else if (m.key === 'earth' || m.key.startsWith('scale-')) {
          setText(el, t(`collection.sky.mark.${m.key}`));
        } else {
          const d = distance(t, m.dist);
          setText(el, `${t(`collection.sky.mark.${m.key}`)} · ${d.n} ${d.unit}`);
        }
      }
      marksRef.current.forEach((el, key) => {
        if (!seen.has(key)) el.style.opacity = '0';
      });

      // 最愛的名字：跟著那一點
      const pos = new Map(points.map((q) => [q.id, q]));
      namesRef.current.forEach((el, sid) => {
        const q = pos.get(sid);
        if (!q) {
          el.style.opacity = '0';
          return;
        }
        const left = q.x > w * 0.7;
        el.style.transform = `translate(${left ? q.x - 12 - el.offsetWidth : q.x + 12}px, ${q.y - 9}px)`;
        el.style.opacity = String(q.a * bloom * (sid === id ? 0 : 1));
      });

      // 名字擠在一起的話，後面的讓開：頁首與底欄先佔位，再來是最愛的名字，最後是地標（地球最前面）
      const taken: DOMRect[] = [footRef.current, headRef.current].flatMap((el) =>
        el ? [...el.children].map((c) => c.getBoundingClientRect()) : [],
      );
      const claim = (el: HTMLElement) => {
        if (Number(el.style.opacity) < 0.05) return;
        const r = el.getBoundingClientRect();
        if (taken.some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) {
          el.style.opacity = '0';
          return;
        }
        taken.push(r);
      };
      namesRef.current.forEach(claim);
      marksRef.current.forEach(claim);

      // 圖例：畫面裡有那一種訊號的，那一行比較亮
      legendRef.current.forEach((el, kind) => {
        const n = inView[kind as keyof typeof inView];
        el.style.opacity = String(0.45 + 0.55 * Math.min(1, n / 3));
      });

      // 讀數：現在看到多遠，這個距離的訊號是什麼時候發出的
      const reach = reachRef.current;
      if (reach) {
        const ls = sky.reach(f);
        const d = distance(t, ls);
        setText(reach, t('collection.sky.reach', { n: d.n, unit: d.unit, date: sentAt(t, ls, clock) }));
        reach.style.opacity = String(bloom);
      }
      const hint = hintRef.current;
      if (hint) hint.style.opacity = String(Math.max(0, 1 - s * 30) * bloom);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('click', onClick);
    };
  }, [sky, byId, t]);

  const counts = bookCounts(books);
  const lastTrack = recent?.tracks?.[0]?.track ?? null;
  const latest = watch.latest;
  const watchLive = live
    ? {
        on: true,
        label: t('collection.watch.live'),
        title: live.title,
        tail: live.episode ? t('collection.watch.episode', { n: live.episode }) : undefined,
      }
    : latest
      ? { on: false, label: t('collection.watch.last'), title: latest.title, tail: latest.date }
      : null;
  const musicLive = playing
    ? { on: true, label: t('collection.music.live'), title: playing.name, tail: artistsOf(playing) }
    : lastTrack
      ? { on: false, label: t('collection.music.last'), title: lastTrack.name, tail: artistsOf(lastTrack) }
      : null;

  const legend = [
    {
      kind: 'watch',
      title: t('collection.watch.title'),
      lines: [
        `${fmt(stats?.animeCount)} ${t('collection.watch.anime')}`,
        `${fmt(stats?.filmCount)} ${t('collection.watch.film')}`,
        `${fmt(stats?.tvSeriesCount)} ${t('collection.watch.tv')}`,
      ],
      live: watchLive,
    },
    {
      kind: 'book',
      title: t('collection.books.title'),
      lines: [
        `${fmt(counts.total)} ${t('collection.books.total')}`,
        `${t('collection.status.read')} ${fmt(counts.read)}`,
        `${t('collection.status.reading')} ${fmt(counts.reading)}`,
        `${t('collection.status.to-read')} ${fmt(counts.toRead)}`,
      ],
      live: null,
    },
    {
      kind: 'music',
      title: t('collection.music.title'),
      lines: tracks.length > 0 ? [`${fmt(tracks.length)} ${t('collection.music.tracks')}`] : [],
      live: musicLive,
    },
  ];

  return (
    <div className="cx" ref={pageRef}>
      <div className="cx-sky">
        <canvas ref={canvasRef} aria-hidden="true" />
        {MARK_KEYS.map((key) => (
          <span
            key={key}
            className={
              key === 'records' ? 'cx-mark is-edge' : key.startsWith('scale-') ? 'cx-mark is-scale' : 'cx-mark'
            }
            aria-hidden="true"
            ref={(el) => {
              if (el) marksRef.current.set(key, el);
              else marksRef.current.delete(key);
            }}
          />
        ))}
        {named.map((s) => (
          <span
            key={s.id}
            className="cx-name"
            aria-hidden="true"
            ref={(el) => {
              if (el) namesRef.current.set(s.id, el);
              else namesRef.current.delete(s.id);
            }}
          >
            {s.title}
          </span>
        ))}
        <div className={hovered ? 'cx-scope is-on' : 'cx-scope'} ref={scopeRef} aria-hidden="true">
          {hovered && (
            <>
              {/* 接收畫面照作品自己的比例：海報與書是直的、專輯是方的，不裁掉 */}
              <span
                key={hovered.id}
                className={hovered.kind === 'music' ? 'cx-scope-frame is-square' : 'cx-scope-frame'}
              >
                {hovered.cover ? (
                  <img
                    key={hovered.id}
                    src={hovered.cover}
                    alt=""
                    referrerPolicy="no-referrer"
                    // 載到之後框改成圖本身的比例（巴哈的動畫封面是橫的）
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.parentElement && img.naturalHeight > 0) {
                        img.parentElement.style.aspectRatio = String(img.naturalWidth / img.naturalHeight);
                      }
                    }}
                  />
                ) : null}
              </span>
              <span className="cx-scope-text">
                <b>{hovered.title}</b>
                <span>{hovered.meta}</span>
                <span className="cx-scope-dist" data-dist="" />
                {hovered.quote && <q>{hovered.quote}</q>}
              </span>
            </>
          )}
        </div>

        <div className="cx-foot" ref={footRef}>
          <dl className="cx-legend">
            {legend.map((l) => (
              <div
                key={l.kind}
                className="cx-legend-row"
                ref={(el) => {
                  if (el) legendRef.current.set(l.kind, el);
                  else legendRef.current.delete(l.kind);
                }}
              >
                <dt>
                  <i className={`cx-glyph is-${l.kind}`} aria-hidden="true" />
                  {l.title}
                </dt>
                <dd>
                  {l.lines.join(' · ')}
                  {l.kind === 'watch' && isAdmin && (
                    <button type="button" className="cx-edit" onClick={() => setEditing(true)}>
                      {t('watch.favManage')}
                    </button>
                  )}
                </dd>
                {l.live && (
                  <dd className={l.live.on ? 'cx-live is-on' : 'cx-live'}>
                    <i aria-hidden="true" />
                    {l.live.label}
                    <b>{l.live.title}</b>
                    {l.live.tail && <span>{l.live.tail}</span>}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <p className="cx-reach" ref={reachRef} aria-hidden="true" />
        </div>
      </div>

      <header className="cx-head" ref={headRef}>
        <div className="cx-head-title">
          <h1>{t('collection.title')}</h1>
          <span>Collection</span>
        </div>
        <p>{t('collection.subtitle')}</p>
      </header>
      <p className="cx-hint" ref={hintRef} aria-hidden="true">
        {t('collection.hint')}
      </p>

      {/* 畫布上的訊號給螢幕閱讀器與搜尋引擎的版本：每一種的全部作品 */}
      <div className="sr-only">
        {(['watch', 'book', 'music'] as const).map((kind) => {
          const title = t(`collection.${kind === 'book' ? 'books' : kind}.title`);
          return (
            <section key={kind} aria-label={title}>
              <h2>{title}</h2>
              <ul>
                {signals
                  .filter((s) => s.kind === kind)
                  .map((s) => (
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
          );
        })}
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
