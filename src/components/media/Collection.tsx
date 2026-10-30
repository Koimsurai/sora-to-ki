// 收藏：每部看過、讀過、聽過的作品，是看完、讀完、聽完那一刻從地球發出的一道訊號，到現在以光速
// 飛了一段距離（media/signalSky）。往下捲是鏡頭從地球往外退：剛聽的歌還在太陽系附近，
// 這幾年看的動畫電影在恆星之間。想讀的書還沒發出，繞著地球。滑過一點，旁邊開一個接收畫面
// 顯示它的封面（這時才載入那一張）、離地球多遠與寫的那句話。整頁只有一張畫布。
import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultLocale } from '@/lib/locales';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/contexts/auth';
import { booksQueryOptions } from '@/data/bookshelfData';
import { useSiteConfig } from '@/data/siteConfig';
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
import { after, isArriving } from '@/store/pageTransition';
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
import { createFramePacer } from '@/lib/framePacer';
import { createSignalSky, drawLaunch, LIGHT_YEAR, type Projected, type Signal, type SkyFrame } from './signalSky';
import './Collection.css';
import { sameTitle } from '@/lib/pageTitle';

/** 最常聽的取哪一段時間（Spotify 的「最近半年」） */
const TRACK_RANGE = 'medium_term';
/** 每退一個數量級要捲多少（視窗高的倍數；Collection.css 的預設長度照這個算） */
const DECADE_VH = 0.5;
/** 滑鼠離一點多近才算滑到它（像素） */
const NEAR_PX = 14;
/**
 * 進場分兩段，中間不停：
 * 頁面一出現，鏡頭在比最遠的訊號再遠三個多數量級的地方（DIVE_FROM），整片訊號只是一個點；
 * 琥珀點還在飛的時候，鏡頭已經慢慢往前推（DRIFT），那個點長成一小片，琥珀點落在它的中心。
 * 落地之後接著俯衝回地球（DIVE_MS），起步的速度跟前一段接上
 */
const DIVE_FROM = 1.35;
/** 換頁的點繞進地球：沿外圈訊號圈的前導段多長（弧度）、取幾點；往內收的螺旋繞幾圈、取幾點 */
const SPIRAL_LEAD_ARC = 0.9;
const SPIRAL_LEAD = 18;
const SPIRAL_TURNS = 1.1;
const SPIRAL_STEPS = 90;
const DRIFT = 0.3;
const DRIFT_MS = 700;
const DIVE_MS = 2000;
/** 俯衝到一半之後，地標名字、圖例才淡進來（毫秒） */
const BLOOM_MS = 900;
/** 退場：鏡頭收回地球要多久、波前從台灣擴出去要多久（毫秒）；點發射出去的速度（px/ms） */
const EXIT_MS = 620;
const LAUNCH_MS = 900;
const LAUNCH_SPEED = 1.1;
/** 窄螢幕的接收畫面固定開在哪裡（離視窗頂端，像素）：頂欄下面 */
const PIN_TOP = 76;
/** 捲動的慣性：鏡頭追上捲軸位置的時間常數（毫秒） */
const FOLLOW_MS = 110;
/** 地標的名字（畫布上那一點旁邊的一行字） */
const MARK_KEYS = [
  'earth',
  'geo',
  'iss',
  'moon',
  'jwst',
  'sun',
  'mercury',
  'venus',
  'mars',
  'asteroids',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'kuiper',
  'newHorizons',
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
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 畫面上的一個框（DOMRect 也合這個形狀） */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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
  const lang = i18n.resolvedLanguage ?? defaultLocale();
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
  // 琥珀點在站長設的發射台（站台設定；型別上可能是 null，沒有就交給 createSignalSky 的預設）
  const { launch_pad: pad } = useSiteConfig();
  const homeLat = pad.lat;
  const homeLon = pad.lon;
  const sky = useMemo(
    () =>
      createSignalSky(
        signals,
        Date.now(),
        homeLat === null || homeLon === null ? undefined : { lat: homeLat, lon: homeLon },
      ),
    [signals, homeLat, homeLon],
  );
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
  /** 鏡頭現在退到哪裡（含進場俯衝、退場收回）；捲軸那份另外記在 effect 裡。
   *  一開始是深空（DIVE_FROM）：換頁的點在這一頁還沒畫第一幀時就會來問錨點，那時鏡頭在深空、地球只是一點 */
  const sRef = useRef(DIVE_FROM);
  /** 琥珀點現在在畫面上的哪裡（視窗座標）：退場時轉場的點跟著它 */
  const dotRef = useRef({ x: 0, y: 0 });
  /** 退場開始的時間與那時鏡頭在哪裡；null 是還沒要離開 */
  const exitRef = useRef<{ at: number; from: number } | null>(null);
  /**
   * 進場與捲動的狀態：頁面第一次畫的時候、點落地的時候、落地那一刻鏡頭在哪與往前推的速度（每毫秒）、
   * 捲軸位置（帶一點慣性；鏡頭位置 sRef 是它再疊上進場、退場）
   */
  const motionRef = useRef({ mounted: -1, born: -1, landS: DIVE_FROM, landV: 0, scrolled: 0 });
  const [hovered, setHovered] = useState<Signal | null>(null);
  const hoverRef = useRef<string | null>(null);

  // 背景的星星讓位：這一頁的天空自己畫（有真的行星、恆星，跟著鏡頭轉）
  useBareSky();

  /** 鏡頭在 s 時、此刻的一幀（換頁算錨點與進來的路時用） */
  const frameAt = (s: number): SkyFrame => ({
    w: window.innerWidth,
    h: window.innerHeight,
    now: Date.now(),
    t: performance.now() / 1000,
    s,
    hovered: null,
    bloom: 1,
  });

  // 換頁轉場的琥珀點落在台灣；離開時鏡頭收回地球，點從台灣帶著一道波前發射出去
  usePageTransition({
    leave: () => {
      const cv = canvasRef.current;
      if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const r = cv.getBoundingClientRect();
      const at = performance.now();
      exitRef.current = { at, from: sRef.current };
      // 收完那一刻（鏡頭回到地球旁邊）琥珀點在哪、往哪飛：從地心往台灣指出去
      const end: SkyFrame = {
        w: window.innerWidth,
        h: window.innerHeight,
        now: Date.now() + EXIT_MS,
        t: (at + EXIT_MS) / 1000,
        s: 0,
        hovered: null,
        bloom: 1,
      };
      const e = sky.earth(end);
      const c = sky.center(end);
      const len = Math.hypot(e.x - c.x, e.y - c.y);
      const dir = len > 3 ? { x: (e.x - c.x) / len, y: (e.y - c.y) / len } : { x: 0, y: -1 };
      const point = { x: r.left + e.x, y: r.top + e.y };
      const diag = Math.hypot(window.innerWidth, window.innerHeight);
      return {
        point,
        velocity: { x: dir.x * LAUNCH_SPEED, y: dir.y * LAUNCH_SPEED },
        done: after(EXIT_MS),
        follow: () => dotRef.current,
        // 這一頁藏起來之後，波前由轉場接著畫完
        residue: (g: CanvasRenderingContext2D) =>
          drawLaunch(g, point.x, point.y, (performance.now() - at - EXIT_MS * 0.7) / LAUNCH_MS, diag),
      };
    },
    anchor: () => {
      const cv = canvasRef.current;
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const e = sky.earth(frameAt(sRef.current));
      return { x: r.left + e.x, y: r.top + e.y };
    },
    // 點飛進來時切進外圈一道訊號圈（以地球為圓心的扁圓），沿著它繞、一路往內收，落在地球上；
    // 鏡頭接著俯衝回地球，台灣那顆琥珀點就從落地的那一點長出來。飛過的路就是一道訊號
    arrive: ({ pos, vel }) => {
      const cv = canvasRef.current;
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const f = frameAt(sRef.current);
      const c = sky.center(f);
      const cx = r.left + c.x;
      const cy = r.top + c.y;
      const k = sky.ringAspect(f);
      const R0 = Math.min(window.innerWidth, window.innerHeight) * 0.42;
      // 從點現在所在的方向切進那一圈；繞的方向挑跟點飛來的方向順的那一邊
      const th0 = Math.atan2((pos.y - cy) / k, pos.x - cx);
      const tangent = { x: -Math.sin(th0), y: Math.cos(th0) * k };
      const turn = tangent.x * vel.x + tangent.y * vel.y >= 0 ? 1 : -1;
      const at = (th: number, rr: number) => ({ x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr * k });
      // 圈上的前導段（可以在畫面外）：點沿著圈進來，鏡頭在第 join 點停下
      const lead = Array.from({ length: SPIRAL_LEAD }, (_, i) =>
        at(th0 - turn * SPIRAL_LEAD_ARC * (1 - i / SPIRAL_LEAD), R0),
      );
      const spiral = Array.from({ length: SPIRAL_STEPS + 1 }, (_, i) => {
        const u = i / SPIRAL_STEPS;
        return at(th0 + turn * SPIRAL_TURNS * Math.PI * 2 * u, R0 * (1 - u) ** 1.4);
      });
      return { approach: [...lead, ...spiral], join: lead.length };
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
    // 跟首頁同一個節拍器：鏡頭停住、沒在換頁時降到 30fps（閃爍的星與波前在 30fps 下看不出差別），
    // 在動的時候 60fps。用「每 N 個 vsync 畫一次」，144Hz、165Hz 的螢幕間隔也是均勻的
    const pacer = createFramePacer();
    let settled = false;
    // 進場的計時放在 ref：資料載到之後天空會重建、這個 effect 會重跑，進場不能因此重來一次
    const m = motionRef.current;
    let pointer: { x: number; y: number } | null = null;
    // 每幀都會寫字的地方：字沒變就不動 DOM
    const texts = new Map<HTMLElement, string>();
    // 名字的寬度（決定寫在點的左邊還是右邊）：每幀現量的話，前面剛寫過位置，量一次就逼瀏覽器重排一次版；
    // 字沒變寬度就沒變，換字、字型載完、視窗大小變了才重量
    const widths = new Map<HTMLElement, number>();
    const widthOf = (el: HTMLElement) => {
      let wd = widths.get(el);
      if (wd === undefined) {
        wd = el.offsetWidth;
        widths.set(el, wd);
      }
      return wd;
    };
    // 名字與地標的框（避讓用）：每幀寫完位置再 getBoundingClientRect 的話，一幀要多排一次版（換頁進來時
    // CPU 降速 4 倍一幀 44–88ms）。框 = 畫布左上 + 這幀寫的位移 + 固定的偏移（CSS 的 translate），
    // 偏移與尺寸量一次記著，跟寬度同一套時機重量
    const boxes = new Map<HTMLElement, { dx: number; dy: number; w: number; h: number }>();
    const placed = new Map<HTMLElement, [number, number]>();
    const remeasure = () => {
      widths.clear();
      boxes.clear();
    };
    document.fonts.addEventListener('loadingdone', remeasure);
    window.addEventListener('resize', remeasure);
    const setText = (el: HTMLElement, s: string) => {
      if (texts.get(el) === s) return;
      texts.set(el, s);
      el.textContent = s;
      widths.delete(el);
      boxes.delete(el);
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
      // 換頁轉場的點還在飛：鏡頭從深空慢慢往前推，等它落地再接著俯衝回地球
      const arriving = isArriving();
      if (m.mounted < 0) m.mounted = nowMs;
      if (!arriving && m.born < 0) {
        m.born = nowMs;
        const k = Math.exp(-(nowMs - m.mounted) / DRIFT_MS);
        m.landS = DIVE_FROM - DRIFT * (1 - k);
        m.landV = (DRIFT / DRIFT_MS) * k;
      }
      const born = m.born;
      if (!pacer.shouldRender(nowMs, settled ? 1000 / 30 : 1000 / 60)) return;
      const dt = last ? Math.min(nowMs - last, 100) : 16;
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
      m.scrolled = reduce ? target : m.scrolled + (target - m.scrolled) * (1 - Math.exp(-dt / FOLLOW_MS));
      const scrolled = m.scrolled;
      let s: number;
      if (reduce) s = scrolled;
      else if (born < 0) s = DIVE_FROM - DRIFT * (1 - Math.exp(-(nowMs - m.mounted) / DRIFT_MS));
      else {
        // 落地後俯衝回捲軸的位置：Hermite 曲線，起點與起速接上漂移那一段，終點停穩
        const p = clamp01((nowMs - born) / DIVE_MS);
        const p2 = p * p;
        const p3 = p2 * p;
        s = (2 * p3 - 3 * p2 + 1) * m.landS - (p3 - 2 * p2 + p) * m.landV * DIVE_MS + (3 * p2 - 2 * p3) * scrolled;
      }
      // 退場：鏡頭收回地球，快收完時波前從台灣發出去
      const exit = exitRef.current;
      let launch: number | undefined;
      if (exit) {
        s = exit.from * (1 - easeInOut(clamp01((nowMs - exit.at) / EXIT_MS)));
        launch = (nowMs - exit.at - EXIT_MS * 0.7) / LAUNCH_MS;
      }
      sRef.current = s;
      settled =
        !arriving && !exit && born >= 0 && nowMs - born > DIVE_MS + BLOOM_MS && Math.abs(target - m.scrolled) < 1e-4;
      // 名字、圖例：俯衝到一半之後淡進來，離開時先淡掉
      const bloom =
        (reduce ? 1 : born < 0 ? 0 : easeOut(clamp01((nowMs - born - DIVE_MS * 0.55) / BLOOM_MS))) *
        (exit ? 1 - clamp01((nowMs - exit.at) / (EXIT_MS * 0.5)) : 1);
      const clock = Date.now();
      const f: SkyFrame = {
        w,
        h,
        now: clock,
        t: reduce ? 0 : nowMs / 1000,
        s,
        hovered: exit ? null : hoverRef.current,
        bloom,
        dot: !arriving && !exit,
        launch,
      };
      const { points, marks, inView } = sky.draw(ctx, f);
      const cr = cv.getBoundingClientRect();
      // 頁首與底欄先佔位：在這一幀寫任何樣式之前量（版面還是乾淨的）
      const taken: Box[] = [footRef.current, headRef.current].flatMap((el) =>
        el ? [...el.children].map((c) => c.getBoundingClientRect()) : [],
      );
      // 字型載完、換字之後寬度與框要重量：也在寫入之前一次量完（寫一個量一個的話，每量一次就重排一次版）。
      // 框照上一幀寫的位置算，那就是它現在在畫面上的位置
      for (const el of [...marksRef.current.values(), ...namesRef.current.values()]) {
        widthOf(el);
        const at = placed.get(el);
        if (at && !boxes.has(el)) {
          const r = el.getBoundingClientRect();
          boxes.set(el, { dx: r.left - cr.left - at[0], dy: r.top - cr.top - at[1], w: r.width, h: r.height });
        }
      }
      const e = sky.earth(f);
      dotRef.current = { x: cr.left + e.x, y: cr.top + e.y };
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
        const flip = !m.key.startsWith('scale-') && m.key !== 'records' && m.x + 20 + widthOf(el) > w - 8;
        const mx = flip ? Math.max(-8, m.x - widthOf(el) - 24) : m.x;
        el.style.transform = `translate(${mx}px, ${m.y}px)`;
        placed.set(el, [mx, m.y]);
        el.style.opacity = String(Math.min(1, m.a) * bloom);
        if (m.key === 'records') {
          setText(el, t('collection.sky.records', { date: sentAt(t, m.dist, clock) }));
        } else if (m.key === 'earth' || m.key === 'iss' || m.key.startsWith('scale-')) {
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
        const nx = left ? q.x - 12 - widthOf(el) : q.x + 12;
        el.style.transform = `translate(${nx}px, ${q.y - 9}px)`;
        placed.set(el, [nx, q.y - 9]);
        el.style.opacity = String(q.a * bloom * (sid === id ? 0 : 1));
      });

      // 這一幀寫的位置換成畫面上的框（偏移與尺寸只在記著的失效時量一次）
      const boxOf = (el: HTMLElement): Box => {
        const at = placed.get(el);
        if (!at) return el.getBoundingClientRect();
        let b = boxes.get(el);
        if (!b) {
          const r = el.getBoundingClientRect();
          b = { dx: r.left - cr.left - at[0], dy: r.top - cr.top - at[1], w: r.width, h: r.height };
          boxes.set(el, b);
        }
        const left = cr.left + at[0] + b.dx;
        const top = cr.top + at[1] + b.dy;
        return { left, top, right: left + b.w, bottom: top + b.h };
      };
      // 名字擠在一起的話，後面的讓開：頁首與底欄先佔位，再來是最愛的名字，最後是地標（地球最前面）
      const claim = (el: HTMLElement) => {
        if (Number(el.style.opacity) < 0.05) return;
        const r = boxOf(el);
        if (taken.some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) {
          el.style.opacity = '0';
          return;
        }
        taken.push(r);
      };
      namesRef.current.forEach(claim);
      marksRef.current.forEach(claim);

      // 圖例：畫面裡有那一種訊號的，那一行比較亮。暗的那幾行下限 0.7：原本 0.45 疊上灰字，
      // 「最近看的是」後面的日期只剩 1.6:1，等於看不到（2026-10 可讀性檢查）
      legendRef.current.forEach((el, kind) => {
        const n = inView[kind as keyof typeof inView];
        el.style.opacity = String(0.7 + 0.3 * Math.min(1, n / 3));
      });

      // 底欄（圖例、讀數）跟名字一起：俯衝到一半才淡進來，離開時先淡掉
      if (footRef.current) footRef.current.style.opacity = String(bloom);

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
      document.fonts.removeEventListener('loadingdone', remeasure);
      window.removeEventListener('resize', remeasure);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('click', onClick);
    };
  }, [sky, byId, t]);

  // 滑過的那一點一換（捲動時星從游標底下滑過，換得很勤）這一頁就重新渲染一次：
  // 跟它無關的幾塊先包好，不然每次都要把全部作品的清單、每個名字重建一遍
  const markSpans = useMemo(
    () =>
      MARK_KEYS.map((key) => (
        <span
          key={key}
          className={key === 'records' ? 'cx-mark is-edge' : key.startsWith('scale-') ? 'cx-mark is-scale' : 'cx-mark'}
          aria-hidden="true"
          ref={(el) => {
            if (el) marksRef.current.set(key, el);
            else marksRef.current.delete(key);
          }}
        />
      )),
    [],
  );
  const nameSpans = useMemo(
    () =>
      named.map((s) => (
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
      )),
    [named],
  );
  const srList = useMemo(
    () =>
      (['watch', 'book', 'music'] as const).map((kind) => {
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
      }),
    [signals, t],
  );

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
        {markSpans}
        {nameSpans}
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
          {!sameTitle(t('collection.title'), 'Collection') && <span>Collection</span>}
        </div>
        <p>{t('collection.subtitle')}</p>
      </header>
      <p className="cx-hint" ref={hintRef} aria-hidden="true">
        {t('collection.hint')}
      </p>

      {/* 畫布上的訊號給螢幕閱讀器與搜尋引擎的版本：每一種的全部作品 */}
      <div className="sr-only">{srList}</div>

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
