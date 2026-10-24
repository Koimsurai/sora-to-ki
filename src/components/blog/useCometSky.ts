// 碎念的彗星（blog/comet）接到頁面上：列表頁（blog/Thinking）與單則頁（blog/ThinkingDetail）共用。
// 頁面給它幾組元素：沿彗尾排開的每一則（posts，第一則是彗核／這一則）、每一則的點（dots）、
// 更舊只剩一個點的（ghosts）、彗尾末端那一個（end），它負責：
//   排版  量每一則的高度，沿著弧線擺好（字型載入、寬度改變、資料變了都重排）
//   畫    每一幀畫彗尾，彗尾長到哪裡，那裡的元素才浮出來（加上 is-shown）
//   換頁  點從彗尾某一處切進來、沿彗尾往上飛進第一則；離開時彗尾縮回第一則，帶著彗星飛的方向離開。
//         列表頁點進一則碎念時不縮，而是往那一則放大進去（那一段亮著、其他退暗），單則頁接著同一個鏡頭
import { useLayoutEffect, useEffect, useRef, type RefObject } from 'react';
import { usePageTransition } from '@/hooks/usePageTransition';
import { after, isArriving, type Pt } from '@/store/pageTransition';
import {
  APPROACH_PX,
  arcX,
  createComet,
  headDirection,
  layoutArc,
  RETRACT_MS,
  REVEAL_MS,
  type ArcLayout,
} from './comet';
import { COMET_ZOOM, setCometZoom, setCometZoomOut, ZOOM_MS } from './cometZoom';

/** 頁面容器左上角的畫面座標（版面座標加上它就是畫面座標） */
const originOf = (page: HTMLElement | null): Pt => {
  const r = page?.getBoundingClientRect();
  return { x: r?.left ?? 0, y: r?.top ?? 0 };
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 第一則的高度：列表頁是彗核，單則頁是這一則（彗核在畫面外很上面） */
const coreY = (L: ArcLayout) => L.posts[0]?.y ?? L.y0;

/**
 * 鏡頭推近到 k（0 是原樣、1 是放大到底）：以 P（版面座標，當下在畫面的 Ps）為中心放大，同時把它帶到畫面上的 T。
 * 字與點那幾層（layers）直接套 transform，回傳畫布要用的 view
 */
function camera(layers: HTMLElement[], P: Pt, Ps: Pt, T: Pt, k: number) {
  const s = 1 + (COMET_ZOOM - 1) * k;
  for (const el of layers) {
    el.style.transformOrigin = `${P.x}px ${P.y}px`;
    el.style.transform = `translate(${(T.x - Ps.x) * k}px, ${(T.y - Ps.y) * k}px) scale(${s})`;
  }
  return { s, dx: Ps.x * (1 - s) + (T.x - Ps.x) * k, dy: Ps.y * (1 - s) + (T.y - Ps.y) * k };
}

/** 放大進去時跟著放大的那幾層（字、點、更舊的點） */
const zoomLayers = (page: HTMLElement | null) =>
  page ? [...page.querySelectorAll<HTMLElement>(':scope > .mo-list, :scope > .mo-dots, :scope > .mo-ghosts')] : [];

/** 一則在列表上「它那一段」的下緣：下一則（更舊的那一則）的高度，最多往下 260 */
const nextAfter = (L: ArcLayout, y: number) =>
  Math.min(y + 260, ...[...L.posts.map((p) => p.y), ...L.ghosts].filter((v) => v > y + 1));

interface Refs {
  pageRef: RefObject<HTMLDivElement | null>;
  /** 頁首：第一則擺在它底下 headGap 的地方 */
  headRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  postsRef: RefObject<(HTMLElement | null)[]>;
  dotsRef: RefObject<(HTMLElement | null)[]>;
  ghostsRef: RefObject<(HTMLElement | null)[]>;
  endRef: RefObject<HTMLElement | null>;
}

interface Options {
  /** 第一則在頁首底下多遠 */
  headGap: number;
  /**
   * 自己排（單則頁）：頁寬、第一則預設的高度、每一則的高度、頁面容器的畫面座標 → 排好的弧線。
   * 不給就是列表頁的排法
   */
  layout?: (width: number, top: number, heights: number[], origin: Pt) => ArcLayout;
  /** 放大了幾倍（單則頁）：塵埃顆粒、彗尾寬度跟著變大 */
  zoom?: number;
  /** 只亮第一則到彗尾末端那一段，外面退暗（單則頁） */
  focus?: boolean;
  /** 從列表放大進來的：點已經在第一則上，不用再飛；塵埃一開始就在（列表放大到最後那一刻的樣子） */
  handedOver?: boolean;
  /** 換頁要去的是哪一則碎念（列表頁）：它在 posts 或 ghosts 的第幾個，往那裡放大進去；不是就 null */
  zoomTarget?: (to: string) => { id: string; post: number | null; ghost: number | null } | null;
  /** 換頁回列表（單則頁）：回傳這一則的 id，列表頁接著從這一段拉遠；不是回列表就 null */
  zoomOutTo?: (to: string) => string | null;
  /** 從單則頁回來（列表頁）：那一則在 posts 或 ghosts 的第幾個、在畫面上停在哪；一開始停在放大的那一段，再拉遠 */
  zoomFrom?: { post: number | null; ghost: number | null; T: Pt } | null;
}

/** 回列表時拉遠要多久（毫秒） */
const PULL_MS = 900;
/** 回列表時單則頁的字退掉要多久（毫秒）：彗尾不動，換頁之後由列表頁拉遠 */
const HOLD_MS = 260;
/** 拉遠到這個進度時，其他碎念與標題浮回來 */
const PULL_SHOW = 0.55;
/** 轉場沒有交棒時，掛上多久之後自己開始拉遠（毫秒） */
const PULL_FALLBACK_MS = 1200;

export function useCometSky(refs: Refs, postCount: number, ghostCount: number, opts: Options) {
  const { pageRef, headRef, canvasRef, postsRef, dotsRef, ghostsRef, endRef } = refs;
  const { headGap, zoom = 1, focus = false, handedOver = false } = opts;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const layoutRef = useRef<ArcLayout | null>(null);
  /**
   * 彗尾從什麼時候開始長、從哪裡開始長（版面座標的高度）。
   * 點是沿著彗尾最後一段飛進來的，那一段已經「畫過」了，彗尾從那裡接著往下長
   */
  const growRef = useRef<{ at: number; from: number } | null>(null);
  /** 點沿著彗尾飛進來的那一段有多長（版面座標） */
  const approachRef = useRef(0);
  /** 換頁的「收」：從什麼時候、從哪裡開始縮回第一則 */
  const leaveRef = useRef<{ at: number; from: number } | null>(null);
  /** 換頁的「放大進去」：P 是那一則的版面座標、Ps 是它當時的畫面座標、T 是放大完它在畫面上的位置 */
  const zoomRef = useRef<{ at: number; P: Pt; Ps: Pt; T: Pt; from: number; to: number } | null>(null);
  /** 從單則頁回來的拉遠：什麼時候開始（-1 是還在等點落地）、拉完了沒 */
  const pullRef = useRef({ at: -1, done: !opts.zoomFrom });
  const hoverRef = useRef<number | null>(null);

  const origin = () => originOf(pageRef.current);

  /** 第一則在畫面上的位置；捲到看不到的時候夾在畫面邊上 */
  const coreOnScreen = (L: ArcLayout): Pt => {
    const o = origin();
    const y = coreY(L);
    return { x: o.x + arcX(L, y), y: Math.min(window.innerHeight - 24, Math.max(24, o.y + y)) };
  };

  usePageTransition({
    anchor: () => {
      // 從單則頁回來：點就停在那一則上（放大的那一段），拉遠從那裡開始
      const from = optsRef.current.zoomFrom;
      if (from && !pullRef.current.done)
        return { x: from.T.x, y: Math.min(window.innerHeight - 24, Math.max(24, from.T.y)) };
      return layoutRef.current ? coreOnScreen(layoutRef.current) : null;
    },
    // 點從彗尾某一處切進來，沿著彗尾的中線往上飛進第一則，跟彗星飛的方向一樣。
    // 切進來的位置挑「順路」的：從點現在的方向直直過去、到了那裡剛好就是彗尾往上的方向，
    // 不會繞一個尖角掉頭。落地後散開的那條線就疊在彗尾上
    arrive: ({ pos, vel }) => {
      if (handedOver || (optsRef.current.zoomFrom && !pullRef.current.done)) return { still: true };
      const L = layoutRef.current;
      if (!L) return null;
      const o = origin();
      const c = coreY(L);
      const reach = Math.max(0, Math.min(APPROACH_PX, L.yEnd - c, window.innerHeight - 40 - o.y - c));
      const at = (d: number): Pt => ({ x: o.x + arcX(L, c + d), y: o.y + c + d });
      const speed = Math.hypot(vel.x, vel.y);
      let best = Math.min(reach, 160);
      let bestScore = -Infinity;
      for (let d = 80; d <= reach; d += 20) {
        const e = at(d);
        const up = at(d - 6);
        const tx = up.x - e.x;
        const ty = up.y - e.y;
        const tl = Math.hypot(tx, ty) || 1;
        const gx = e.x - pos.x;
        const gy = e.y - pos.y;
        const gl = Math.hypot(gx, gy) || 1;
        // 抵達的方向跟彗尾往上的方向一致、出發的方向跟點現在的速度一致；距離太近（要急轉）扣分
        const along = (gx * tx + gy * ty) / (gl * tl);
        const ahead = speed > 0.05 ? (gx * vel.x + gy * vel.y) / (gl * speed) : 0;
        const score = along + 0.6 * ahead - (gl < 160 ? (160 - gl) / 160 : 0) + d / 2000;
        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }
      approachRef.current = best;
      const approach: Pt[] = [];
      for (let d = best; d >= 0; d -= 6) approach.push(at(d));
      return approach.length > 1 ? { approach } : null;
    },
    leave: (ctx) => {
      const L = layoutRef.current;
      const page = pageRef.current;
      if (!L || !page) return null;
      const o = origin();
      // 回列表（單則頁）：彗尾維持放大的樣子，只有字退掉；列表頁接著從這一段拉遠
      const outId = optsRef.current.zoomOutTo?.(ctx.to);
      if (outId) {
        const c = coreY(L);
        const T = { x: o.x + arcX(L, c), y: o.y + c };
        setCometZoomOut({ id: outId, T });
        page.classList.add('is-leaving');
        return { point: coreOnScreen(L), velocity: { x: 0, y: 0 }, done: after(HOLD_MS) };
      }
      // 點進一則碎念：往那一則放大進去，那一段亮著、其他的退暗；單則頁接著同一個鏡頭
      const target = optsRef.current.zoomTarget?.(ctx.to);
      const y =
        target?.post != null ? L.posts[target.post]?.y : target?.ghost != null ? L.ghosts[target.ghost] : undefined;
      if (target && y !== undefined) {
        const P = { x: arcX(L, y), y };
        const Ps = { x: o.x + P.x, y: o.y + P.y };
        const T = { x: Ps.x, y: window.innerHeight * 0.3 };
        zoomRef.current = { at: performance.now(), P, Ps, T, from: y - 40, to: nextAfter(L, y) - 40 };
        setCometZoom({
          id: target.id,
          zoom: COMET_ZOOM,
          P,
          T,
          arc: { cx: L.cx, amp: L.amp, y0: L.y0, period: L.period, phase: L.phase },
          span: L.yEnd - L.y0,
          narrow: L.narrow,
        });
        page.classList.add('is-zooming');
        // 點就是那一則的點：跟著放大一路被帶到 T
        const started = performance.now();
        const follow = (): Pt => {
          const k = easeInOut(Math.min(1, (performance.now() - started) / ZOOM_MS));
          return { x: Ps.x + (T.x - Ps.x) * k, y: Ps.y + (T.y - Ps.y) * k };
        };
        return { point: Ps, velocity: { x: 0, y: 0 }, done: after(ZOOM_MS), follow, followMs: ZOOM_MS };
      }
      // 其他：彗尾縮回第一則、字跟著退掉，帶著彗星飛的方向離開
      leaveRef.current = { at: performance.now(), from: Math.min(L.yEnd, window.innerHeight - o.y + 60) };
      page.classList.add('is-leaving');
      const dir = headDirection(L);
      return { point: coreOnScreen(L), velocity: { x: dir.x * 0.9, y: dir.y * 0.9 }, done: after(RETRACT_MS * 0.8) };
    },
    onGrow: () => {
      const L = layoutRef.current;
      growRef.current = { at: performance.now(), from: L ? coreY(L) + approachRef.current : 0 };
      // 從單則頁回來：這一頁露出來了，開始拉遠
      if (optsRef.current.zoomFrom && pullRef.current.at < 0) pullRef.current.at = performance.now();
    },
  });

  // 排版：量每一則的高度，沿著弧線擺好。字型載入、寬度改變、資料變了都重排
  useLayoutEffect(() => {
    const page = pageRef.current;
    const head = headRef.current;
    if (!page || !head) return;
    const place = () => {
      const width = page.clientWidth;
      const top = head.offsetTop + head.offsetHeight + headGap;
      const posts = postsRef.current.slice(0, postCount);
      const heights = posts.map((el) => el?.offsetHeight ?? 0);
      const custom = optsRef.current.layout;
      const L = custom ? custom(width, top, heights, originOf(page)) : layoutArc(width, top, heights, ghostCount);
      layoutRef.current = L;
      const at = (el: HTMLElement, x: number, y: number, left: boolean) => {
        const w = el.offsetWidth;
        const raw = left ? x - 26 - w : x + 26;
        el.style.transform = `translate(${Math.max(16, Math.min(width - 16 - w, raw))}px, ${y - 12}px)`;
        el.classList.toggle('is-left', left);
      };
      L.posts.forEach((p, i) => {
        const x = arcX(L, p.y);
        const el = posts[i];
        if (el) at(el, x, p.y, p.left);
        const dot = dotsRef.current[i];
        if (dot) {
          dot.style.left = `${x}px`;
          dot.style.top = `${p.y}px`;
        }
      });
      L.ghosts.forEach((y, k) => {
        const el = ghostsRef.current[k];
        if (!el) return;
        el.style.left = `${arcX(L, y)}px`;
        el.style.top = `${y}px`;
        el.style.setProperty('--fade', (0.9 - (k / Math.max(1, L.ghosts.length)) * 0.75).toFixed(2));
        el.classList.toggle('is-left', !L.narrow && arcX(L, y + 160) < arcX(L, y));
      });
      if (endRef.current) at(endRef.current, arcX(L, L.end.y), L.end.y, L.end.left);
      page.style.height = `${L.height}px`;
      page.classList.add('is-arc');
      // 從單則頁回來、還沒開始拉遠：第一次畫出來之前就先停在放大的那一段，字先藏著（不然會先閃一下原樣）
      const from = optsRef.current.zoomFrom;
      if (from && pullRef.current.at < 0 && !pullRef.current.done) {
        const y = from.post != null ? L.posts[from.post]?.y : from.ghost != null ? L.ghosts[from.ghost] : undefined;
        if (y !== undefined) {
          const o = originOf(page);
          const P = { x: arcX(L, y), y };
          page.classList.add('is-zooming', 'is-instant');
          camera(zoomLayers(page), P, { x: o.x + P.x, y: o.y + P.y }, from.T, 1);
          // 藏好之後下一幀才把過渡還回來（拉到一半字浮回來時要有過渡）
          requestAnimationFrame(() => requestAnimationFrame(() => page.classList.remove('is-instant')));
        }
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(page);
    // 單則頁的送出列會展開、長高：它長高也要重排
    if (endRef.current) ro.observe(endRef.current);
    void (document as { fonts?: FontFaceSet }).fonts?.ready.then(place);
    return () => ro.disconnect();
    // 內容變了但筆數沒變：ResizeObserver 會抓到高度改變（ref 本身不會變，列出來只是讓檢查看得懂）
  }, [postCount, ghostCount, headGap, pageRef, headRef, postsRef, dotsRef, ghostsRef, endRef]);

  // 彗星：每一幀畫彗尾，並把彗尾長到的地方的碎念浮出來
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const page = pageRef.current;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 轉場還在收上一頁、點還在飛：等它交棒（onGrow）。直接打開這一頁就現在開始長
    if (!growRef.current && !isArriving()) growRef.current = { at: performance.now(), from: 0 };
    const L0 = layoutRef.current;
    const comet = createComet(L0 ? L0.yEnd - L0.y0 : 1600, L0?.narrow ?? false, zoom);
    const shown: boolean[] = [];
    let raf = 0;
    let last = 0;
    /** 上一張畫的時候的狀態：沒有 GPU 時長完就不再流動，只在捲動、換大小、滑過時重畫 */
    let drawn = '';
    const mountedAt = performance.now();
    const layers = zoomLayers(page);

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [w, h] as const;
    };

    const reveal = (L: ArcLayout, revealY: number) => {
      const items: (HTMLElement | null)[] = [
        ...postsRef.current.slice(0, L.posts.length),
        ...ghostsRef.current.slice(0, L.ghosts.length),
        endRef.current,
      ];
      const ys = [...L.posts.map((p) => p.y), ...L.ghosts, L.end.y];
      items.forEach((el, i) => {
        const on = revealY >= ys[i] - 30;
        if (shown[i] === on || !el) return;
        shown[i] = on;
        el.classList.toggle('is-shown', on);
        const dot = dotsRef.current[i];
        if (i < L.posts.length && dot) dot.classList.toggle('is-shown', on);
      });
    };

    /** 單則頁亮的那一段：這一則到彗尾末端 */
    const focusOf = (L: ArcLayout) => (focus ? { from: coreY(L) - 60, to: L.end.y + 120 } : null);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = layoutRef.current;
      const grow = growRef.current;
      if (!grow && !isArriving()) growRef.current = { at: now, from: 0 };
      if (!L) return;
      const since = grow ? now - grow.at : -1;
      const leave = leaveRef.current;
      const zoomIn = zoomRef.current;
      // 從單則頁回來的拉遠：那一則在列表上的高度（找不到就不拉，照一般的長法）
      const from = optsRef.current.zoomFrom;
      const pull = pullRef.current;
      const pullY =
        from && !pull.done
          ? from.post != null
            ? L.posts[from.post]?.y
            : from.ghost != null
              ? L.ghosts[from.ghost]
              : undefined
          : undefined;
      if (from && !pull.done && pullY === undefined) pull.done = true;
      const pulling = pullY !== undefined && !pull.done;
      const busy = (since >= 0 && since < REVEAL_MS) || leave !== null || zoomIn !== null || pulling;
      // 長完之後 30fps 就夠：塵埃流得很慢
      if (!busy && now - last < 33) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const o = originOf(pageRef.current);
      const still = !busy && root.classList.contains('no-gpu');
      const key = `${o.x},${o.y},${window.innerWidth},${window.innerHeight},${hoverRef.current}`;
      if (still && key === drawn) return;
      drawn = key;
      const [w, h] = fit();
      let revealY = -Infinity;
      // 點還沒落地（頁面正跟著鏡頭滑進來）：彗核還不在，等點落進來才從那一點長出來
      let headScale = since < 0 ? 0 : easeOut(Math.min(1, since / 400));
      let view: { s: number; dx: number; dy: number } | null = null;
      let band = focusOf(L);
      let bandAmount = 1;
      if (pulling && from) {
        // 從單則頁回來：一開始停在放大的那一段（那一則在畫面上的 T），轉場把這一頁露出來之後（onGrow）
        // 慢慢拉遠回整條彗星，那一則落回它在列表上的位置；拉到一半，其他碎念與標題浮回來。
        // 萬一轉場沒有交棒（onGrow 沒來），轉場結束一陣子之後自己開始
        if (pull.at < 0 && !isArriving() && now - mountedAt > PULL_FALLBACK_MS) pull.at = now;
        const raw = pull.at < 0 ? 0 : Math.min(1, (now - pull.at) / PULL_MS);
        const k = 1 - easeInOut(raw);
        const P = { x: arcX(L, pullY), y: pullY };
        view = camera(layers, P, { x: o.x + P.x, y: o.y + P.y }, from.T, k);
        band = { from: pullY - 40, to: nextAfter(L, pullY) - 40 };
        bandAmount = k;
        revealY = raw >= PULL_SHOW ? Infinity : -Infinity;
        headScale = 1;
        pageRef.current?.classList.toggle('is-zooming', raw < PULL_SHOW);
        if (raw >= 1) {
          pull.done = true;
          for (const el of layers) {
            el.style.transform = '';
            el.style.transformOrigin = '';
          }
          growRef.current = { at: now - REVEAL_MS, from: 0 };
        }
      } else if (zoomIn) {
        // 放大進去：以那一則為中心放大，同時把它帶到畫面上方三成的地方；那一段亮著、其他慢慢退暗
        const k = easeInOut(Math.min(1, (now - zoomIn.at) / ZOOM_MS));
        view = camera(layers, zoomIn.P, zoomIn.Ps, zoomIn.T, k);
        band = { from: zoomIn.from, to: zoomIn.to };
        bandAmount = k;
        revealY = Infinity;
        headScale = 1;
      } else if (leave) {
        // 收：彗尾越縮越快地退回第一則，最後彗髮也收進那一點
        const k = Math.min(1, (now - leave.at) / RETRACT_MS);
        const c = coreY(L);
        revealY = leave.from + (c - 10 - leave.from) * easeIn(k);
        headScale = 1 - easeIn(k);
      } else if (since >= 0 && grow) {
        const start = Math.max(coreY(L) - 10, grow.from);
        const bottom = h - o.y + 200;
        revealY = since >= REVEAL_MS ? Infinity : start + easeOut(since / REVEAL_MS) * Math.max(0, bottom - start);
      }
      reveal(L, revealY);
      comet.draw(
        ctx,
        w,
        h,
        L,
        {
          origin: o,
          hoverY: hoverRef.current,
          // 從列表放大進來的：塵埃一開始就在（列表放大到最後就是這個樣子），只有留言一則一則浮出來
          // 從單則頁回來拉遠的時候也是：整條彗尾都在，字等拉到一半才浮回來
          revealY: (handedOver && !leave) || pulling ? Infinity : revealY,
          headScale,
          focus: band,
          focusAmount: bandAmount,
          view,
        },
        still ? 0 : dt,
        now / 1000,
      );
    };

    if (reduce) {
      // 減少動態：不流動、不長，畫一張靜態的，捲動時重畫
      growRef.current = { at: -REVEAL_MS, from: 0 };
      const still = () => {
        const L = layoutRef.current;
        if (!L) return;
        const [w, h] = fit();
        reveal(L, Infinity);
        comet.draw(
          ctx,
          w,
          h,
          L,
          {
            origin: originOf(pageRef.current),
            hoverY: null,
            revealY: Infinity,
            headScale: 1,
            focus: focusOf(L),
          },
          0,
          0,
        );
      };
      still();
      window.addEventListener('scroll', still, { passive: true });
      window.addEventListener('resize', still);
      return () => {
        window.removeEventListener('scroll', still);
        window.removeEventListener('resize', still);
      };
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [postCount, ghostCount, zoom, focus, handedOver, pageRef, canvasRef, postsRef, dotsRef, ghostsRef, endRef]);

  /** 滑到第 i 則：那附近的塵埃亮一點、那一則的點亮起來 */
  return (i: number, on: boolean) => {
    hoverRef.current = on ? (layoutRef.current?.posts[i]?.y ?? null) : null;
    dotsRef.current[i]?.classList.toggle('is-on', on);
  };
}
