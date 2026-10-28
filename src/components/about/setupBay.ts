// 設備頁的畫布：太空梭的貨艙。四件酬載（主力機、伺服器、網路、周邊）裝在箱子裡，遠處軌道上是老家那台。
//
// 琥珀點是讀者（站上每一頁的「你在這裡」），住在駕駛艙後段的頂窗：真的太空梭也是從那裡操作機械手臂。
// 選一件：點沿著貨艙邊緣流到手臂肩部、再順著手臂流，流到哪個關節那個關節才開始轉；夾住箱子舉到後窗前，
// 圖紙從箱子裡展開、藍圖一樣掃出來。放回去時圖紙收回箱子，手臂把它放回托架。
// 老家那台：點從後窗射出一道訊號，鏡頭跟著飛過去。
// 進場：太空梭沿機頭方向滑進來（前段兩顆 OMS 推，後段機頭 RCS 噴三下煞住）；離場：OMS 點火往前飛走。
//
// 這裡只有畫布與動畫，不碰 React：標籤、零件表、提示是頁面給的 DOM，這裡只負責擺位置、切狀態
// （根元素的 data-mode / data-open / data-arriving）；選了哪一件用 onSelect 告訴頁面。
//
// 摺疊機摺起來（lib/viewportFold）：書本式太空梭在左半、老家那台在右半，圖紙的零件表那欄剛好在右半；
// 筆電式俯視圖轉成機頭朝右放在上半，零件表從下半升起。
import { currentFold, subscribeFold, type Fold } from '@/lib/viewportFold';
import { artSrc, BASE, partsSrc, PAYLOADS, type Payload, type Pt as Pct } from './setupPayloads';

interface Pt {
  x: number;
  y: number;
}
interface Pose {
  t1: number;
  t2: number;
  t3: number;
}
interface Cam {
  x: number;
  y: number;
  z: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Nozzle {
  x: number;
  y: number;
  r: number;
  d: Pt;
}
interface View {
  img: string;
  w: number;
  h: number;
  /** 整架在底稿上的範圍：鏡頭 z = 1 時剛好放進場景 */
  box: Box;
  shoulder: Pt;
  armScale: number;
  stow: number;
  boomR: number;
  slots: Pt[];
  /** 舉起來的位置：駕駛艙後窗前 */
  lift: Pt;
  /** 俯視的箱子大小 */
  crate?: { w: number; h: number };
  /** 斜側面：貨艙的軸向與橫向（底稿上的方向） */
  u?: Pt;
  v?: Pt;
  oms: Nozzle[];
  rcs: Pt;
  /** 機頭方向 */
  fwd: Pt;
  /** 駕駛艙後段的頂窗：琥珀點的家 */
  deck: Pt;
}
type Mode = 'wide' | 'tall' | 'short';
/** 選中的是第幾件；4 是老家那台，-1 是整架 */
export type Target = number | 'home';
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  cold: boolean;
}

export interface BayOptions {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 0–3 是四件酬載的標籤，4 是老家那台 */
  tags: HTMLElement[];
  panel: HTMLElement;
  /** 頁首：直版的場景從它底下開始 */
  header: HTMLElement;
  /** 選中哪一件（-1 整架、4 老家那台），以及圖紙攤開了沒（零件表等它攤開才出來） */
  onSelect: (sel: number, shown: boolean) => void;
}

const TAU = Math.PI * 2;
/** 線稿的亮度：跟站上的 --paper-2 同一階，細線＋淡一階才像工程圖 */
const LINE = 0.72;
/** 噴焰的點活多久（秒），跟航行日誌的火箭一樣 */
const FLAME_LIFE = 0.55;
/** 手臂四段的長度（俯視底稿上的像素，乘上 armScale） */
const ARM = { upper: 797, lower: 763.4, wrist: 220 };

const VIEWS: { top: View; obl: View } = {
  top: {
    img: 'bay-top',
    w: 1493,
    h: 2000,
    box: { x: 110, y: 90, w: 1275, h: 1830 },
    shoulder: { x: 606, y: 630 },
    armScale: 0.42,
    stow: Math.PI / 2,
    boomR: 8,
    slots: [0, 1, 2, 3].map((i) => ({ x: 757, y: 740 + i * 193 })),
    lift: { x: 757, y: 548 },
    crate: { w: 226, h: 172 },
    // 兩顆 OMS 噴嘴：機尾左右兩個莢艙，噴口朝後略往外
    oms: [
      { x: 630, y: 1774, r: 24, d: { x: -0.17, y: 0.985 } },
      { x: 870, y: 1774, r: 24, d: { x: 0.17, y: 0.985 } },
    ],
    rcs: { x: 750, y: 112 },
    fwd: { x: 0, y: -1 },
    deck: { x: 740, y: 548 },
  },
  obl: {
    img: 'bay-oblique',
    w: 1451,
    h: 1084,
    box: { x: 70, y: 230, w: 1330, h: 790 },
    // 肩部在貨艙前端的左舷縱梁上（真的太空梭就是這樣裝的），收起時沿縱梁往機尾放平
    shoulder: { x: 512, y: 330 },
    armScale: 0.26,
    stow: Math.atan2(0.386, 0.922),
    boomR: 5,
    // 托架往機尾挪：第一件離肩部太近的話，手臂得折成很高的 V 字
    slots: [0.34, 0.5, 0.66, 0.82].map((t) => ({ x: 400 + 525 * t, y: 365 + 220 * t + 26 })),
    lift: { x: 572, y: 222 },
    u: { x: 0.922, y: 0.386 },
    v: { x: -0.824, y: 0.566 },
    oms: [
      { x: 1244, y: 591, r: 24, d: { x: 0.95, y: 0.31 } },
      { x: 1116, y: 662, r: 20, d: { x: 0.95, y: 0.31 } },
    ],
    rcs: { x: 84, y: 330 },
    fwd: { x: -0.922, y: -0.386 },
    deck: { x: 382, y: 278 },
  },
};

const DOORS = [
  { hinge: 590, closed: ['bay-door-closed-l', 588, 576], open: ['bay-door-open-l', 410, 583], lag: 0 },
  { hinge: 907, closed: ['bay-door-closed-r', 749, 576], open: ['bay-door-open-r', 905, 583], lag: 0.12 },
] as const;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angLerp = (a: number, b: number, t: number) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
};
const mid = (p: Pt, q: Pt, k: number): Pt => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export function createBay(opts: BayOptions) {
  const { root, canvas, tags, panel, header, onSelect } = opts;
  const maybe = canvas.getContext('2d');
  if (!maybe) return null;
  // 函式宣告會被提升，型別收窄跟不進去：另外存一個確定不是 null 的
  const ctx: CanvasRenderingContext2D = maybe;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(root);
  const INK = css.getPropertyValue('--paper-rgb').trim() || '241, 236, 227';
  const AMB = css.getPropertyValue('--amber-rgb').trim() || '233, 193, 122';
  const GROUND_RGB = css.getPropertyValue('--ground-rgb').trim() || '10, 10, 12';
  const GROUND = `rgb(${GROUND_RGB})`;
  const MONO = css.getPropertyValue('--mono-font').trim() || 'monospace';
  const ground = (a: number) => `rgba(${GROUND_RGB}, ${a})`;

  const IMG: Record<string, HTMLImageElement | undefined> = {};
  /** 每張圖紙的零件編號（每個像素屬於第幾個零件）與每個零件染成琥珀色的版本 */
  const parts: Record<string, { labels: Uint8Array; w: number; h: number; art: Uint8ClampedArray } | undefined> = {};
  const tinted = new Map<string, HTMLCanvasElement>();

  const S = {
    mode: 'tall' as Mode,
    /** 摺起來時的兩半（畫布座標）；攤平是 null */
    fold: null as Fold | null,
    view: VIEWS.top,
    rot: 0,
    W: 0,
    H: 0,
    dpr: 1,
    top: 0,
    cam: { x: 0, y: 0, z: 1 },
    home: { x: 0, y: 0 },
    dim: 0,
    intro: 0,
    doors: 0,
    arm: { t1: 0, t2: 0, t3: 0 },
    grip: 0,
    carried: -1,
    liftK: 0,
    cratePos: null as Pt | null,
    show: null as Payload | typeof BASE | null,
    scan: 0,
    calls: 0,
    unfold: 0,
    sel: -1,
    busy: false,
    pending: null as Target | null,
    hover: -1,
    satHover: false,
    /** 零件表滑過的那一列（第幾個有編號的零件） */
    hot: null as number | null,
    hk: [0, 0, 0, 0],
    oms: 0,
    puffs: 0,
    particles: [] as Particle[],
    leave: 0,
    leaving: false,
    baseK: 0,
    /** 琥珀點沿「後窗 → 肩 → 肘 → 腕 → 末端器」走到第幾段（0–4） */
    du: 0,
    /** 往老家那台的訊號走到哪（0–1） */
    sk: 0,
    tok: 0,
    worldM: null as DOMMatrix | null,
    /** 摺起來或攤開：從換之前的鏡頭（中心、縮放、旋轉）滑到新的，太空梭不是一下跳到另一半 */
    morph: null as { c: Pt; s: number; rot: number; cam: Cam; t0: number } | null,
    lastNow: 0,
    t0: performance.now(),
    alive: true,
  };

  // ── 版面 ──
  function layout() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    // 姿勢真的變了（不是一般的縮放）：記下換之前畫面上的鏡頭，applyWorld 從這裡滑過去
    const nextPose = currentFold()?.pose ?? null;
    if (S.W && nextPose !== (S.fold?.pose ?? null) && !reduce) {
      const from = S.morph ? morphNow() : { c: center(), s: fitScale() * S.cam.z, rot: S.rot, cam: { ...S.cam } };
      S.morph = { ...from, t0: performance.now() };
    }
    S.W = W;
    S.H = H;
    S.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * S.dpr);
    canvas.height = Math.round(H * S.dpr);
    const fold = currentFold();
    const at = root.getBoundingClientRect();
    const shift = (b: Fold['first']) => ({ ...b, x: b.x - at.left, y: b.y - at.top });
    S.fold = fold && { pose: fold.pose, first: shift(fold.first), second: shift(fold.second) };
    // 攤平時整個拿掉（CSS 用 [data-fold] 判斷，空字串也算有）
    if (S.fold) root.dataset.fold = S.fold.pose;
    else delete root.dataset.fold;
    // 攤開時標籤回到一行字的寬度（摺起來時貨單那一列的寬度由 drawTags 寫）
    if (!S.fold) for (const el of tags) el.style.width = '';
    // 書本式是寬版（951 × 585 本來就是）；筆電式照直版排，零件表從下半升起
    S.mode =
      S.fold?.pose === 'laptop'
        ? 'tall'
        : S.fold?.pose === 'book'
          ? 'wide'
          : H < 480 && W > H
            ? 'short'
            : W >= 760 && W / H >= 1.05
              ? 'wide'
              : 'tall';
    root.dataset.mode = S.mode;
    S.view = S.mode === 'wide' ? VIEWS.obl : VIEWS.top;
    // 很矮的橫式與筆電式的上半：俯視圖轉 90 度，機頭朝右
    S.rot = S.mode === 'short' || S.fold?.pose === 'laptop' ? Math.PI / 2 : 0;
    S.top = header.offsetTop + header.offsetHeight;
    S.home = { x: S.view.box.x + S.view.box.w / 2, y: S.view.box.y + S.view.box.h / 2 };
    if (!S.busy && S.sel < 0) S.cam = { x: S.home.x, y: S.home.y, z: 1 };
    if (S.sel < 0) S.arm = stowPose();
    placePanel();
  }
  /** 場景區：從頁首底下開始，底下留給提示（很矮的橫式整個畫面都是場景，頁首縮成一行壓在左上） */
  function sceneRect(): Box {
    const top = S.mode === 'short' ? 0 : S.top + 4;
    const f = S.fold;
    // 摺起來：場景只在第一半（書本式的左半、筆電式頁首以下的上半）
    if (f?.pose === 'book') return { x: 0, y: top, w: f.first.width, h: S.H - top - 34 };
    if (f) return { x: 0, y: top, w: S.W, h: f.first.y + f.first.height - top - 8 };
    const bottom = S.mode === 'short' ? 0 : 34;
    return { x: 0, y: top, w: S.W, h: S.H - top - bottom };
  }
  /** 世界一單位對應幾個螢幕像素（鏡頭 z = 1 時整架剛好放進場景區，寬版留一圈給標籤與提示） */
  function fitScale() {
    const r = sceneRect();
    const b = S.view.box;
    const bw = S.rot ? b.h : b.w;
    const bh = S.rot ? b.w : b.h;
    const f = S.mode === 'wide' ? 0.9 : 0.94;
    return Math.min((r.w * f) / bw, (r.h * f) / bh);
  }
  function center(): Pt {
    const r = sceneRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  /** 世界 → 螢幕（不含太空梭自己的漂移與進出場位移） */
  function toScreen(p: Pt, cam: Cam = S.cam): Pt {
    const s = fitScale() * cam.z;
    const c = center();
    let dx = (p.x - cam.x) * s;
    let dy = (p.y - cam.y) * s;
    if (S.rot) [dx, dy] = [dx * Math.cos(S.rot) - dy * Math.sin(S.rot), dx * Math.sin(S.rot) + dy * Math.cos(S.rot)];
    return { x: c.x + dx, y: c.y + dy };
  }
  /** 世界 → 螢幕（含太空梭的位移，這一幀畫出來的位置） */
  const wToS = (p: Pt): Pt => {
    const m = S.worldM;
    if (!m) return toScreen(p);
    return { x: (m.a * p.x + m.c * p.y + m.e) / S.dpr, y: (m.b * p.x + m.d * p.y + m.f) / S.dpr };
  };
  /** 摺起來或攤開時鏡頭滑多久 */
  const REFOLD_MS = 600;
  /** 這一刻的鏡頭：平常就是版面算出來的；換姿勢的那 0.6 秒從換之前的鏡頭滑過去（旋轉也一起轉） */
  function morphNow(): { c: Pt; s: number; rot: number; cam: Cam } {
    const to = { c: center(), s: fitScale() * S.cam.z, rot: S.rot, cam: S.cam };
    const m = S.morph;
    if (!m) return to;
    const k = ease(clamp01((performance.now() - m.t0) / REFOLD_MS));
    if (k >= 1) {
      S.morph = null;
      return to;
    }
    return {
      c: { x: lerp(m.c.x, to.c.x, k), y: lerp(m.c.y, to.c.y, k) },
      s: lerp(m.s, to.s, k),
      rot: lerp(m.rot, to.rot, k),
      cam: { x: lerp(m.cam.x, to.cam.x, k), y: lerp(m.cam.y, to.cam.y, k), z: to.cam.z },
    };
  }
  function applyWorld() {
    const { c, s, rot, cam } = morphNow();
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.translate(c.x, c.y);
    if (rot) ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-cam.x, -cam.y);
  }
  const screenSpace = () => ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);

  // ── 動畫工具 ──
  function tween(ms: number, fn: (t: number) => void): Promise<void> {
    if (reduce || ms <= 0) {
      fn(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        if (!S.alive) return resolve();
        const t = clamp01((now - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms: number) => (reduce ? Promise.resolve() : new Promise<void>((r) => window.setTimeout(r, ms)));
  const fade = (key: 'dim', to: number, ms: number) => {
    const from = S[key];
    return tween(ms, (t) => {
      S[key] = lerp(from, to, ease(t));
    });
  };

  // ── 手臂：兩段 IK（下臂＋腕當成一段），關節依序接手 ──
  function lens() {
    const k = S.view.armScale;
    return { L1: ARM.upper * k, L2: ARM.lower * k, L3: ARM.wrist * k };
  }
  function stowPose(): Pose {
    const a = S.view.stow;
    return { t1: a, t2: a, t3: a };
  }
  function ik(target: Pt): Pose {
    const { L1, L2, L3 } = lens();
    const L = L2 + L3;
    const sh = S.view.shoulder;
    const dx = target.x - sh.x;
    const dy = target.y - sh.y;
    const dist = Math.hypot(dx, dy) || 1;
    // 構不到或太近時夾到可達的範圍（沿同一個方向）
    const d = Math.max(Math.abs(L1 - L) + 2, Math.min(L1 + L - 2, dist));
    const tx = sh.x + (dx / dist) * d;
    const ty = sh.y + (dy / dist) * d;
    const base = Math.atan2(dy, dx);
    const c = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L * L) / (2 * L1 * d))));
    // 手肘往哪一邊彎：斜側面往上；俯視往機頭那邊（往貨艙外彎的話，鏡頭推近時整段會跑出畫面）
    let best = { t1: 0, t2: 0, score: -Infinity };
    for (const sg of [1, -1]) {
      const t1 = base + sg * c;
      const el = { x: sh.x + L1 * Math.cos(t1), y: sh.y + L1 * Math.sin(t1) };
      const t2 = Math.atan2(ty - el.y, tx - el.x);
      const score = S.view === VIEWS.top ? -el.y - Math.abs(el.x - 757) * 0.5 : -el.y;
      if (score > best.score) best = { t1, t2, score };
    }
    return { t1: best.t1, t2: best.t2, t3: best.t2 };
  }
  function fk(p: Pose = S.arm) {
    const { L1, L2, L3 } = lens();
    const sh = S.view.shoulder;
    const el = { x: sh.x + L1 * Math.cos(p.t1), y: sh.y + L1 * Math.sin(p.t1) };
    const wr = { x: el.x + L2 * Math.cos(p.t2), y: el.y + L2 * Math.sin(p.t2) };
    const tip = { x: wr.x + L3 * Math.cos(p.t3), y: wr.y + L3 * Math.sin(p.t3) };
    return { sh, el, wr, tip };
  }
  /** 手臂動到 to：肩先動、肘晚兩成、腕再晚兩成，像三顆伺服馬達依序接手 */
  function moveArm(to: Pose, ms: number, onFrame?: (t: number) => void) {
    const from = { ...S.arm };
    return tween(ms, (t) => {
      const k1 = ease(clamp01(t / 0.6));
      const k2 = ease(clamp01((t - 0.2) / 0.6));
      const k3 = ease(clamp01((t - 0.4) / 0.6));
      S.arm = { t1: angLerp(from.t1, to.t1, k1), t2: angLerp(from.t2, to.t2, k2), t3: angLerp(from.t3, to.t3, k3) };
      onFrame?.(t);
    });
  }
  function moveCam(to: Cam, ms: number) {
    const from = { ...S.cam };
    return tween(ms, (t) => {
      const k = ease(t);
      S.cam = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), z: lerp(from.z, to.z, k) };
    });
  }

  // ── 太空梭 ──
  /** 待機的漂移：幾個像素的浮動與極小的轉動（選中時停） */
  function wobble(now: number) {
    if (reduce) return { dx: 0, dy: 0, r: 0 };
    const t = (now - S.t0) / 1000;
    const k = 1 - Math.min(1, S.dim * 2);
    return { dx: Math.sin(t * 0.21) * 6 * k, dy: Math.sin(t * 0.33) * 5 * k, r: Math.sin(t * 0.17) * 0.004 * k };
  }
  /** 整組（本體、艙門、酬載、手臂）的位移：進場沿機頭方向滑進來，離場沿機頭方向加速飛走 */
  function shuttleTransform(now: number) {
    const v = S.view;
    const w = wobble(now);
    const f = v.fwd;
    const inD = (v === VIEWS.top ? 1500 : 760) * (1 - easeOut(S.intro));
    const outD = (v === VIEWS.top ? 2600 : 1700) * S.leave ** 2.2;
    ctx.translate(-f.x * inD + f.x * outD + w.dx, -f.y * inD + f.y * outD + w.dy);
    ctx.translate(v.w / 2, v.h / 2);
    ctx.rotate(w.r);
    ctx.translate(-v.w / 2, -v.h / 2);
  }
  /**
   * 噴焰與 RCS：跟航行日誌的火箭同一套，2×2 的像素點從噴嘴往後噴，前 35% 的壽命是琥珀色、之後變淡墨色。
   * 點在螢幕座標裡、生出來就不跟著機身走，太空梭移動時尾巴自然拖在後面。RCS 是冷氣體，只有墨色
   */
  function emit(dt: number) {
    const v = S.view;
    const m = ctx.getTransform();
    const d = S.dpr;
    const toS = (p: Pt) => ({ x: (m.a * p.x + m.c * p.y + m.e) / d, y: (m.b * p.x + m.d * p.y + m.f) / d });
    const dirS = (p: Pt) => {
      const vx = m.a * p.x + m.c * p.y;
      const vy = m.b * p.x + m.d * p.y;
      const l = Math.hypot(vx, vy) || 1;
      return { x: vx / l, y: vy / l };
    };
    const unit = Math.hypot(m.a, m.b) / d;
    if (S.oms > 0.01 && !reduce)
      for (const n of v.oms) {
        const o = toS(n);
        const dir = dirS(n.d);
        const r = n.r * unit;
        // 噴嘴在螢幕上比火箭大：點的數量與速度跟著放大，點本身維持 2px
        const k = Math.max(1, r / 7);
        const count = Math.round(3 * k * S.oms);
        for (let q = 0; q < count; q++) {
          const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 0.45;
          const sp = (30 + Math.random() * 45) * k * (0.6 + 0.4 * S.oms);
          const side = (Math.random() - 0.5) * r * 0.9;
          S.particles.push({
            x: o.x - dir.y * side,
            y: o.y + dir.x * side,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: 0,
            max: FLAME_LIFE,
            cold: false,
          });
        }
      }
    for (; S.puffs > 0; S.puffs--) {
      const o = toS(v.rcs);
      const dir = dirS(v.fwd);
      for (let i = 0; i < 26; i++) {
        const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 1.1;
        const sp = 40 + Math.random() * 70;
        S.particles.push({
          x: o.x,
          y: o.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: Math.random() * 0.05,
          max: 0.42,
          cold: true,
        });
      }
    }
    S.particles = S.particles.filter((p) => (p.life += dt) <= p.max);
  }
  function drawParticles() {
    const f = 1 - 0.9 * S.dim;
    for (const p of S.particles) {
      const q = p.life / p.max;
      const px = Math.round((p.x + p.vx * p.life) / 2) * 2;
      const py = Math.round((p.y + p.vy * p.life) / 2) * 2;
      ctx.fillStyle = !p.cold && q < 0.35 ? `rgba(${AMB}, ${0.9 * (1 - q) * f})` : `rgba(${INK}, ${0.6 * (1 - q) * f})`;
      ctx.fillRect(px, py, 2, 2);
    }
  }
  function drawShuttle() {
    const v = S.view;
    const im = IMG[v.img];
    if (!im) return;
    ctx.globalAlpha = LINE * (v === VIEWS.top ? 1 : 0.35 + 0.65 * easeOut(S.intro)) * (1 - 0.9 * S.dim);
    ctx.drawImage(im, 0, 0, v.w, v.h);
    if (v === VIEWS.top) drawDoors();
    ctx.globalAlpha = 1;
  }
  /** 艙門：關著的那片以鉸鏈為軸收到 0，打開的那片從 0 攤出去；右門晚一點 */
  function drawDoors() {
    const base = ctx.globalAlpha;
    for (const d of DOORS) {
      const k = ease(clamp01((S.doors - d.lag) / (1 - 0.12)));
      const [name, x, y] = k < 0.5 ? d.closed : d.open;
      const im = IMG[name];
      const sx = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2;
      if (!im || sx < 0.01) continue;
      ctx.save();
      ctx.translate(d.hinge, 0);
      ctx.scale(sx, 1);
      ctx.translate(-d.hinge, 0);
      ctx.globalAlpha = base;
      ctx.fillStyle = GROUND;
      ctx.fillRect(x, y, im.width, im.height);
      // 翻到側面時暗一點
      ctx.globalAlpha = base * (0.45 + 0.55 * sx);
      ctx.drawImage(im, x, y);
      ctx.restore();
    }
  }
  /**
   * 一件酬載（箱子）：跟機身同一種線（約 1.2px、亮度 0.72），外框＋往內縮一圈的面板線，
   * 側面有耳軸（真的酬載靠兩側的耳軸卡在縱梁上）。俯視是框，斜側面照貨艙方向畫成立體
   */
  function drawCrate(
    i: number,
    pos: Pt,
    o: { alpha?: number; carried?: boolean; scale?: number; shadow?: number } = {},
  ) {
    const v = S.view;
    const sel = i === S.sel || o.carried === true || S.hk[i] > 0.5;
    const a = (o.alpha ?? 1) * (o.carried ? 1 : 1 - 0.9 * S.dim);
    if (a <= 0.01) return;
    const col = sel ? AMB : INK;
    const main = (sel ? 0.95 : LINE) * a;
    const fine = (sel ? 0.55 : 0.32) * a;
    const px = 1 / (fitScale() * S.cam.z);
    const poly = (pts: Pt[], fill?: string) => {
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
    };
    /** 面往內縮一圈（四個角各往對角拉 k） */
    const inset = (f: Pt[], k: number) => {
      const c = { x: (f[0].x + f[2].x) / 2, y: (f[0].y + f[2].y) / 2 };
      return f.map((p) => mid(p, c, k));
    };
    const sc = o.scale ?? 1;
    ctx.save();
    ctx.lineWidth = 1.2 * px;
    ctx.lineJoin = 'round';
    if (v.crate) {
      const w = v.crate.w * sc;
      const h = v.crate.h * sc;
      if (o.carried && o.shadow) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * a})`;
        ctx.fillRect(pos.x - w / 2 + o.shadow, pos.y - h / 2 + o.shadow * 1.4, w, h);
      }
      const f = [
        { x: pos.x - w / 2, y: pos.y - h / 2 },
        { x: pos.x + w / 2, y: pos.y - h / 2 },
        { x: pos.x + w / 2, y: pos.y + h / 2 },
        { x: pos.x - w / 2, y: pos.y + h / 2 },
      ];
      ctx.strokeStyle = `rgba(${col}, ${main})`;
      poly(f, ground(0.92 * a));
      ctx.strokeStyle = `rgba(${col}, ${fine})`;
      poly(inset(f, 0.12));
      poly(inset(f, 0.16));
      for (const k of [0.4, 0.6]) {
        const p1 = mid(f[0], f[3], k);
        const p2 = mid(f[1], f[2], k);
        ctx.beginPath();
        ctx.moveTo(lerp(p1.x, p2.x, 0.16), p1.y);
        ctx.lineTo(lerp(p1.x, p2.x, 0.84), p2.y);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${col}, ${main})`;
      for (const sx of [-1, 1])
        for (const fy of [-0.28, 0.28]) {
          const x = pos.x + sx * (w / 2);
          const y = pos.y + h * fy;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + sx * 10 * sc, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x + sx * 15 * sc, y, 5 * sc, 0, TAU);
          ctx.stroke();
        }
    } else if (v.u && v.v) {
      const { u, v: vv } = v;
      const L = 74 * sc;
      const Wd = 84 * sc;
      const Hh = 52 * sc;
      const c = (su: number, sv: number, up: number) => ({
        x: pos.x + ((u.x * L) / 2) * su + ((vv.x * Wd) / 2) * sv,
        y: pos.y + ((u.y * L) / 2) * su + ((vv.y * Wd) / 2) * sv - Hh * up,
      });
      const b = [c(-1, -1, 0), c(1, -1, 0), c(1, 1, 0), c(-1, 1, 0)];
      const t = [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)];
      const side = [b[3], b[2], t[2], t[3]];
      const end = [b[1], b[2], t[2], t[1]];
      ctx.strokeStyle = `rgba(${col}, ${main})`;
      // 近側兩面與頂面填底色，蓋住後面的肋條
      poly(side, ground(0.9 * a));
      poly(end, ground(0.9 * a));
      poly(t, ground(0.9 * a));
      ctx.strokeStyle = `rgba(${col}, ${fine})`;
      poly(inset(side, 0.14));
      poly(inset(end, 0.16));
      poly(inset(t, 0.14));
      for (const k of [0.4, 0.6]) {
        const p1 = mid(t[0], t[3], k);
        const p2 = mid(t[1], t[2], k);
        ctx.beginPath();
        ctx.moveTo(lerp(p1.x, p2.x, 0.14), lerp(p1.y, p2.y, 0.14));
        ctx.lineTo(lerp(p1.x, p2.x, 0.86), lerp(p1.y, p2.y, 0.86));
        ctx.stroke();
      }
      // 長邊底部兩根耳軸：從底邊往外伸的短軸
      ctx.strokeStyle = `rgba(${col}, ${fine * 1.6})`;
      for (const k of [0.2, 0.8]) {
        const base = mid(mid(b[3], b[2], k), mid(t[3], t[2], k), 0.18);
        const tip = { x: base.x + vv.x * 6, y: base.y + vv.y * 6 };
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.2, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  /**
   * 手臂：程式畫，跟機身與箱子同一種線。照真的 Canadarm 分段：肩座、上臂、肘、下臂、腕、末端器。
   * 臂桿是圓柱（兩條邊線＋隔熱毯的環帶＋很淡的中線），關節是雙圈
   */
  function drawArm() {
    const v = S.view;
    const f = fk();
    const r = v.boomR;
    const px = 1 / (fitScale() * S.cam.z);
    ctx.save();
    ctx.globalAlpha *= 1 - 0.9 * S.dim * (S.carried >= 0 ? 0.6 : 1);
    ctx.lineWidth = 1.2 * px;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const ink = (k: number) => `rgba(${INK}, ${LINE * k})`;
    const fill = ground(0.92);
    const boom = (p: Pt, q: Pt, rr: number, bands: number[] = []) => {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * rr;
      const ny = (dx / l) * rr;
      ctx.beginPath();
      ctx.moveTo(p.x + nx, p.y + ny);
      ctx.lineTo(q.x + nx, q.y + ny);
      ctx.lineTo(q.x - nx, q.y - ny);
      ctx.lineTo(p.x - nx, p.y - ny);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = ink(1);
      ctx.stroke();
      ctx.strokeStyle = ink(0.45);
      for (const k of bands) {
        const x = lerp(p.x, q.x, k);
        const y = lerp(p.y, q.y, k);
        ctx.beginPath();
        ctx.moveTo(x + nx, y + ny);
        ctx.lineTo(x - nx, y - ny);
        ctx.stroke();
      }
      ctx.strokeStyle = ink(0.18);
      ctx.beginPath();
      ctx.moveTo(p.x + nx * 0.35, p.y + ny * 0.35);
      ctx.lineTo(q.x + nx * 0.35, q.y + ny * 0.35);
      ctx.stroke();
    };
    const joint = (p: Pt, rr: number) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ink(1);
      ctx.stroke();
      ctx.strokeStyle = ink(0.45);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr * 0.55, 0, TAU);
      ctx.stroke();
    };
    const sd = { x: Math.cos(v.stow), y: Math.sin(v.stow) };
    boom({ x: f.sh.x - sd.x * r * 2.4, y: f.sh.y - sd.y * r * 2.4 }, f.sh, r * 1.5);
    boom(f.sh, f.el, r, [0.12, 0.5, 0.88]);
    boom(f.el, f.wr, r * 0.92, [0.12, 0.5, 0.88]);
    const wd = { x: f.tip.x - f.wr.x, y: f.tip.y - f.wr.y };
    const w1 = { x: f.wr.x + wd.x * 0.35, y: f.wr.y + wd.y * 0.35 };
    boom(f.wr, w1, r * 0.9);
    boom(w1, f.tip, r * 1.25, [0.25]);
    joint(f.sh, r * 1.6);
    joint(f.el, r * 1.4);
    joint(f.wr, r * 1.3);
    joint(w1, r * 1.1);
    ctx.strokeStyle = ink(1);
    ctx.beginPath();
    ctx.ellipse(f.tip.x, f.tip.y, r * 0.55, r * 1.25, Math.atan2(wd.y, wd.x), 0, TAU);
    ctx.stroke();
    if (S.grip > 0.01) {
      const rg = 26 * px * 2.2;
      const g = ctx.createRadialGradient(f.tip.x, f.tip.y, 0, f.tip.x, f.tip.y, rg);
      g.addColorStop(0, `rgba(${AMB}, ${0.75 * S.grip})`);
      g.addColorStop(1, `rgba(${AMB}, 0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.tip.x, f.tip.y, rg, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── 老家那台 ──
  function satRect() {
    const r = sceneRect();
    // 書本式：老家那台在右半（右半平常只有它和軌道，選一件時那裡是零件表）
    // 貼著頂欄底下，底下留給貨單
    if (S.fold?.pose === 'book') {
      const sz = Math.max(90, Math.min(140, S.fold.second.width * 0.26));
      return { x: S.W - sz - 36, y: 56, s: sz };
    }
    if (S.mode === 'tall') {
      const sz = Math.max(70, Math.min(104, r.w * 0.24));
      return { x: r.w - sz - 14, y: r.y + 4, s: sz };
    }
    const sz = Math.max(90, Math.min(168, r.w * 0.11));
    return { x: r.x + r.w - sz - 36, y: r.y + (S.mode === 'short' ? 30 : 8), s: sz };
  }
  /** 鏡頭飛到老家那台時，衛星停在哪裡、多大（跟酬載線稿同一塊區域） */
  function satBig() {
    const A = artRect(1);
    const s = A.w * 0.96;
    return { x: A.x + (A.w - s) / 2, y: A.y + (A.h - s) / 2, s };
  }
  function satNow() {
    const a = satRect();
    const b = satBig();
    const k = ease(S.baseK);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k) };
  }
  /** 老家那台的軌道：一段很淡的點線弧，從畫面右上角掃過衛星 */
  function drawOrbit() {
    const R = satNow();
    const a = (1 - ease(S.baseK)) * 0.5 * clamp01(S.intro * 1.4) * (1 - clamp01(S.leave * 5));
    if (a <= 0.01) return;
    screenSpace();
    const cx = R.x + R.s / 2;
    const cy = R.y + R.s / 2;
    const oc = { x: S.W + R.s * 2.2, y: -R.s * 1.6 };
    const rr = Math.hypot(cx - oc.x, cy - oc.y);
    const a0 = Math.atan2(cy - oc.y, cx - oc.x);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = `rgba(${INK}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(oc.x, oc.y, rr, a0 - 0.5, a0 + 0.35);
    ctx.stroke();
    ctx.restore();
  }
  function drawSatellite(now: number) {
    const im = IMG['bay-satellite'];
    if (!im) return;
    const R = satNow();
    const t = (now - S.t0) / 1000;
    const k = ease(S.baseK);
    const away = 1 - k;
    screenSpace();
    ctx.save();
    ctx.globalAlpha = lerp(0.9 * (1 - 0.6 * S.dim), 0.9, k) * clamp01(S.intro * 1.4) * (1 - clamp01(S.leave * 5));
    ctx.translate(R.x + R.s / 2 + Math.sin(t * 0.2) * 6 * away, R.y + R.s / 2 + Math.cos(t * 0.15) * 4 * away);
    // 遠處慢慢自轉；飛近時轉回正（編號圈要對得上線稿）
    const spin = reduce ? 0 : (t * 0.08) % TAU;
    ctx.rotate(angLerp(spin, 0, k));
    ctx.drawImage(im, -R.s / 2, -R.s / 2, R.s, R.s);
    ctx.restore();
    if (S.show === BASE && S.calls > 0)
      drawCalls(
        BASE.calls.map(([ax, ay, bx, by]) => ({ at: [ax, ay] as Pct, b: [bx, by] as Pct })),
        { x: R.x, y: R.y, w: R.s, h: R.s },
        1,
      );
  }

  // ── 琥珀點 ──
  /** 進場時點先落在最後的位置（換頁轉場的點落在這裡），太空梭再滑進來把後窗對上它 */
  const deckFinal = () => toScreen(S.view.deck);
  function dotPath(): Pt[] {
    const f = fk();
    return [S.view.deck, f.sh, f.el, f.wr, f.tip].map(wToS);
  }
  function along(pts: Pt[], u: number): Pt {
    const i = Math.min(pts.length - 2, Math.floor(u));
    return mid(pts[i], pts[i + 1], clamp01(u - i));
  }
  function drawDot(now: number) {
    if (!S.worldM || S.leaving || S.W === 0) return;
    screenSpace();
    const t = (now - S.t0) / 1000;
    const pts = dotPath();
    const w = clamp01((S.intro - 0.8) / 0.2);
    const deck = mid(deckFinal(), pts[0], w);
    pts[0] = deck;
    ctx.save();
    ctx.lineWidth = 1.2;
    let p: Pt;
    if (S.sk > 0) {
      // 往老家那台的訊號：點線
      const R = satNow();
      p = mid(deck, { x: R.x + R.s / 2, y: R.y + R.s / 2 }, S.sk);
      ctx.strokeStyle = `rgba(${AMB}, 0.5)`;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(deck.x, deck.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      p = along(pts, S.du);
      if (S.du > 0.001) {
        // 走過的那段線留著淡淡的琥珀色：指令還接著
        ctx.strokeStyle = `rgba(${AMB}, 0.55)`;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i <= Math.floor(S.du) && i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (!S.busy && (S.hover >= 0 || S.satHover)) {
        // 滑過標籤：預告指令會走的路
        ctx.strokeStyle = `rgba(${AMB}, 0.6)`;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(deck.x, deck.y);
        if (S.hover >= 0) {
          ctx.lineTo(pts[1].x, pts[1].y);
          const c = wToS(tagAnchor(S.hover));
          ctx.lineTo(c.x, c.y);
        } else {
          const R = satNow();
          ctx.lineTo(R.x + R.s / 2, R.y + R.s / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // 點本身：跟航行日誌「現在」那顆同一種畫法（呼吸的光暈＋實心點）。
    // 訊號到了老家那台之後點淡掉，只留那條線，不壓在衛星的線稿上
    ctx.globalAlpha = 1 - clamp01((S.sk - 0.85) / 0.15);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16 + pulse * 8);
    glow.addColorStop(0, `rgba(${AMB}, 0.6)`);
    glow.addColorStop(1, `rgba(${AMB}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgb(${AMB})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ── 標籤 ──
  /** 第 i 件的標籤錨點（箱頂中心，世界座標） */
  function tagAnchor(i: number): Pt {
    const sl = S.view.slots[i];
    return S.view === VIEWS.obl ? { x: sl.x, y: sl.y - 52 } : sl;
  }
  /**
   * 標籤擺好位置、畫引線。斜側面：四個標籤上下排成一欄，在最右邊那個箱子的右上方，
   * 線從箱頂垂直往上到自己那一行再水平拉到字（左邊的箱子走最上面那行，線不會交叉）；
   * 俯視：全部往右拉到艙門上
   */
  /** 走線之間隔多遠（px） */
  const TRACE_GAP = 8;
  /**
   * 摺起來時四件酬載的標籤排成另一半的貨單（編號、名稱、件數、一句說明），引線像電路板的走線一樣
   * 從箱子出發、走到總線、跨過摺痕再轉進那一列。走線的次序照箱子在畫面上的左右排，四條不會交叉：
   * 書本式總線在太空梭上方、貨單在右半由上往下；筆電式總線在摺痕下緣、貨單在下半由下往上
   */
  function manifest(f: Fold): { route: Pt[]; x: number; y: number; w: number }[] {
    const ats = [0, 1, 2, 3].map((i) => wToS(tagAnchor(i)));
    const rank = ats.map((p) => ats.filter((q) => q.x < p.x).length);
    const heights = tags.slice(0, 4).map((el) => el.offsetHeight);
    const sum = heights.reduce((s, h) => s + h, 0);
    const ROW_GAP = 14;
    const book = f.pose === 'book';
    const x = book ? f.second.x + 72 : S.W / 2 - 130;
    const w = book ? f.second.x + f.second.width - 28 - x : 280;
    const busTop = book ? Math.max(sceneRect().y + 10, Math.min(...ats.map((p) => p.y)) - 120) : f.second.y + 14;
    const sat = satRect();
    const rowsTop = book
      ? Math.max(sat.y + sat.s + 28, (S.H + sat.y + sat.s - sum - ROW_GAP * 3) / 2)
      : busTop + TRACE_GAP * 4 + 28;
    // 第幾列（由上往下）：書本式最左的箱子在最上面；筆電式反過來，最左的在最下面
    const tops: number[] = [];
    let y = rowsTop;
    for (let row = 0; row < 4; row++) {
      const i = rank.indexOf(book ? row : 3 - row);
      tops[i] = y;
      y += (heights[i] ?? 0) + ROW_GAP;
    }
    return ats.map((at, i) => {
      const r = rank[i];
      const busY = busTop + r * TRACE_GAP;
      const xv = book ? x - 18 - r * TRACE_GAP : x - 18 - (3 - r) * TRACE_GAP;
      const rowY = tops[i] + 11;
      return {
        route: [at, { x: at.x, y: busY }, { x: xv, y: busY }, { x: xv, y: rowY }, { x: x - 6, y: rowY }],
        x,
        y: tops[i],
        w,
      };
    });
  }
  function drawTags() {
    if (!S.worldM) return;
    screenSpace();
    const appear = S.view === VIEWS.top ? clamp01((S.doors - 0.6) / 0.4) : clamp01((S.intro - 0.85) / 0.15);
    const base = (1 - Math.min(1, S.dim * 1.5)) * appear * (1 - clamp01(S.leave * 5));
    const rows = S.fold ? manifest(S.fold) : null;
    // 尺寸先一次量完再寫（同首頁衛星的字，home/HomeOrbit）：讀寫交錯的話，每讀一次 offsetWidth
    // 瀏覽器就得把前一個標籤剛寫的樣式排一次版。這裡寫的 data-hot（只改顏色）、data-off（只改
    // pointer-events）、opacity、transform 都不影響尺寸；width 只寫在摺起來的貨單列上，那幾個不在這裡量
    const sizes = tags.map((el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
    tags.forEach((el, i) => {
      let at: Pt;
      let to: Pt;
      let a = base;
      let column = false;
      const row = i < 4 ? rows?.[i] : undefined;
      if (row) {
        if (i === S.carried) a = 0;
        const hot = i === S.hover || i === S.sel;
        el.dataset.hot = hot ? '1' : '';
        el.dataset.off = a < 0.3 ? '1' : '';
        el.style.opacity = a.toFixed(3);
        el.style.width = `${row.w}px`;
        el.style.transform = `translate(${row.x.toFixed(1)}px, ${row.y.toFixed(1)}px)`;
        if (a <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${hot ? AMB : INK}, ${hot ? 0.9 : 0.4})`;
        ctx.beginPath();
        row.route.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.fillStyle = `rgba(${hot ? AMB : INK}, 0.9)`;
        ctx.beginPath();
        ctx.arc(row.route[0].x, row.route[0].y, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }
      if (i < 4) {
        at = wToS(tagAnchor(i));
        if (S.view === VIEWS.obl) {
          column = true;
          const a0 = wToS(tagAnchor(0));
          const a3 = wToS(tagAnchor(3));
          const top = Math.max(sceneRect().y + 12, a0.y - 150);
          to = { x: a3.x + 56, y: top + i * (S.mode === 'short' ? 22 : 30) };
        } else {
          // 俯視：拉到右邊的艙門上；俯視圖轉成機頭朝右時（很矮的橫式、筆電式）一個在上、一個在下交錯，字才排得開
          const side = S.rot && i % 2 ? 474 : 1040;
          to = wToS({ x: side, y: S.view.slots[i].y });
          // 筆電式的上半比矮橫式小，下排的 03 會撞到 01：往下錯開一行
          if (S.fold && i === 2) to = { x: to.x, y: to.y + 24 };
        }
        if (i === S.carried) a = 0;
      } else {
        const R = satNow();
        at = { x: R.x + R.s * 0.5, y: R.y + R.s * 0.55 };
        to = { x: R.x - 10, y: R.y + R.s + 12 };
        a *= 1 - clamp01(S.baseK * 3);
      }
      const hot = i < 4 ? i === S.hover || i === S.sel : S.satHover || S.sel === 4;
      el.dataset.hot = hot ? '1' : '';
      el.dataset.off = a < 0.3 ? '1' : '';
      el.style.opacity = a.toFixed(3);
      if (a <= 0.01) return;
      const { w, h } = sizes[i];
      const dx = to.x - at.x;
      const dy = to.y - at.y;
      /** -1 字在左、1 字在右、0 字在正上（下）方 */
      const side = column ? 1 : Math.abs(dx) >= Math.abs(dy) * 0.35 ? (dx < 0 ? -1 : 1) : 0;
      const x = side === 0 ? to.x - w / 2 : side < 0 ? to.x - w : to.x;
      const y = side === 0 ? (dy < 0 ? to.y - h - 2 : to.y + 2) : to.y - h - 1;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${hot ? AMB : INK}, ${hot ? 0.9 : 0.4})`;
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      if (column) ctx.lineTo(at.x, to.y);
      ctx.lineTo(to.x, to.y);
      if (side) ctx.lineTo(to.x + side * w, to.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${hot ? AMB : INK}, 0.9)`;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── 圖紙 ──
  /** 整張圖紙（寬版與矮橫式）：外框、右側零件表那欄從哪裡切開 */
  function sheetRect() {
    const top = S.top + 8;
    const bottom = S.mode === 'short' ? 10 : 40;
    const r = { x: 20, y: top, w: S.W - 40, h: S.H - top - bottom };
    // 書本式：零件表那欄從摺痕右邊開始，線稿在左半、零件表在右半
    if (S.fold?.pose === 'book') {
      const div = S.fold.second.x + 4;
      return { ...r, div, pw: r.x + r.w - div };
    }
    const pw = Math.min(S.mode === 'short' ? 300 : 440, r.w * 0.42);
    return { ...r, div: r.x + r.w - pw, pw };
  }
  function panelRect(): Box {
    const r = sheetRect();
    return { x: r.div + 18, y: r.y + 20, w: r.pw - 36, h: r.h - 40 };
  }
  /** 線稿畫在哪裡（照它的高寬比放進圖紙左邊；直版是零件表上面那一塊） */
  function artRect(ratio: number): Box {
    let box: Box;
    if (S.mode === 'tall') {
      // 筆電式：零件表佔滿下半，線稿在上半
      const ph = S.fold ? S.H - S.fold.first.y - S.fold.first.height : S.H * 0.46;
      // 圖紙外框比線稿往外 10px：再留一段，框線才不會頂到頁首的字
      const y = S.top + 24;
      box = { x: 16, y, w: S.W - 32, h: S.H - ph - y - 12 };
    } else {
      const r = sheetRect();
      box = { x: r.x + 34, y: r.y + 34, w: r.div - r.x - 68, h: r.h - 68 };
    }
    let w = box.w;
    let h = w * ratio;
    if (h > box.h) {
      h = box.h;
      w = h / ratio;
    }
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  }
  /** 手上那個箱子在螢幕上的範圍：圖紙從這裡展開、收回這裡 */
  function crateRect(): Box | null {
    if (!S.cratePos || !S.worldM) return null;
    const u = fitScale() * S.cam.z;
    const crate = S.view.crate;
    const c = wToS(crate ? S.cratePos : { x: S.cratePos.x, y: S.cratePos.y - 30 });
    const w = (crate ? crate.w * 1.35 : 120) * u;
    const h = (crate ? crate.h * 1.35 : 90) * u;
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }
  /** 圖紙外框：外框、內框、上下的分區字母與左右的分區數字、零件表那欄的分隔線 */
  function drawSheet() {
    if (!S.show) return;
    const isBase = S.show === BASE;
    const k = isBase ? 1 : ease(S.unfold);
    const a = isBase ? ease(S.baseK) : clamp01(S.unfold * 4);
    if (a <= 0.01) return;
    screenSpace();
    const full =
      S.mode === 'tall'
        ? (() => {
            const A = artRect(isBase ? 1 : (S.show as Payload).ratio);
            return { x: 10, y: A.y - 10, w: S.W - 20, h: A.h + 20, div: S.W, pw: 0 };
          })()
        : sheetRect();
    const from = isBase ? null : crateRect();
    const r =
      from && k < 1
        ? {
            x: lerp(from.x, full.x, k),
            y: lerp(from.y, full.y, k),
            w: lerp(from.w, full.w, k),
            h: lerp(from.h, full.h, k),
            div: full.div,
            pw: full.pw,
          }
        : full;
    const g = 14;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 1;
    if (!isBase) {
      ctx.fillStyle = ground(0.82);
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (S.mode === 'tall' || k < 0.98) {
      // 展開中（或直版）：只有外框，分區刻度等攤平了再出現
      ctx.strokeStyle = `rgba(${INK}, 0.35)`;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = `rgba(${INK}, 0.3)`;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.strokeStyle = `rgba(${INK}, 0.16)`;
    ctx.strokeRect(r.x + g + 0.5, r.y + g + 0.5, r.w - 2 * g - 1, r.h - 2 * g - 1);
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = `rgba(${INK}, 0.4)`;
    ctx.textAlign = 'center';
    const cols = 'ABCDEFGH'.slice(0, Math.max(4, Math.min(8, Math.round(r.w / 180))));
    for (let i = 0; i < cols.length; i++) {
      const x0 = r.x + (r.w / cols.length) * i;
      if (i)
        for (const y of [r.y, r.y + r.h - g]) {
          ctx.beginPath();
          ctx.moveTo(x0 + 0.5, y);
          ctx.lineTo(x0 + 0.5, y + g);
          ctx.stroke();
        }
      ctx.fillText(cols[i], x0 + r.w / cols.length / 2, r.y + 10);
      ctx.fillText(cols[i], x0 + r.w / cols.length / 2, r.y + r.h - 4);
    }
    const rows = Math.max(3, Math.min(6, Math.round(r.h / 160)));
    for (let i = 0; i < rows; i++) {
      const y0 = r.y + (r.h / rows) * i;
      if (i)
        for (const x of [r.x, r.x + r.w - g]) {
          ctx.beginPath();
          ctx.moveTo(x, y0 + 0.5);
          ctx.lineTo(x + g, y0 + 0.5);
          ctx.stroke();
        }
      ctx.fillText(String(i + 1), r.x + 7, y0 + r.h / rows / 2 + 3);
      ctx.fillText(String(i + 1), r.x + r.w - 7, y0 + r.h / rows / 2 + 3);
    }
    ctx.strokeStyle = `rgba(${INK}, 0.2)`;
    ctx.beginPath();
    ctx.moveTo(r.div + 0.5, r.y + g);
    ctx.lineTo(r.div + 0.5, r.y + r.h - g);
    ctx.stroke();
    ctx.restore();
  }
  /** 編號圈：引線從零件拉出去，圈一個一個亮；零件表滑過的那個是琥珀色 */
  function drawCalls(calls: { at: Pct; b: Pct }[], R: Box, alpha: number) {
    calls.forEach((c, i) => {
      const t = clamp01(S.calls * (calls.length + 2) - i);
      if (t <= 0) return;
      const at = { x: R.x + (R.w * c.at[0]) / 100, y: R.y + (R.h * c.at[1]) / 100 };
      const b = { x: R.x + (R.w * c.b[0]) / 100, y: R.y + (R.h * c.b[1]) / 100 };
      const hot = S.hot === i;
      const col = hot ? AMB : INK;
      const rr = Math.max(8, Math.min(12, R.w * 0.016));
      ctx.save();
      ctx.globalAlpha = t * alpha;
      ctx.strokeStyle = `rgba(${col}, ${hot ? 0.95 : 0.55})`;
      ctx.lineWidth = 1;
      const e = easeOut(t);
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(lerp(at.x, b.x, e), lerp(at.y, b.y, e));
      ctx.stroke();
      ctx.fillStyle = `rgba(${col}, 0.9)`;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 1.8, 0, TAU);
      ctx.fill();
      if (t > 0.6) {
        const pop = easeOut(clamp01((t - 0.6) / 0.4));
        ctx.fillStyle = GROUND;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr * pop, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(${col}, ${hot ? 1 : 0.8})`;
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, ${pop})`;
        ctx.font = `${Math.round(rr * 0.95)}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), b.x, b.y + rr * 0.34);
      }
      ctx.restore();
    });
  }
  /**
   * 零件亮起來：零件編號圖裡屬於第 k 個零件的像素，照底稿原本的濃淡染成琥珀色。
   * 第一次用到才算、算完留著（一張圖紙最多十來個零件）
   */
  function tintOf(p: Payload, k: number): HTMLCanvasElement | null {
    const key = `${p.art}:${k}`;
    const hit = tinted.get(key);
    if (hit) return hit;
    const m = parts[p.art];
    if (!m) return null;
    const cv = document.createElement('canvas');
    cv.width = m.w;
    cv.height = m.h;
    const c2 = cv.getContext('2d');
    if (!c2) return null;
    const img = c2.createImageData(m.w, m.h);
    const [r, g, b] = AMB.split(',').map((v) => Number(v));
    const want = k + 1;
    for (let i = 0; i < m.labels.length; i++) {
      if (m.labels[i] !== want) continue;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = m.art[i];
    }
    c2.putImageData(img, 0, 0);
    tinted.set(key, cv);
    return cv;
  }
  async function loadParts(p: Payload) {
    if (parts[p.art]) return;
    const [art, map] = await Promise.all([
      IMG[p.art] ? Promise.resolve(IMG[p.art] ?? null) : loadImage(artSrc(p.art)),
      loadImage(partsSrc(p.art)),
    ]);
    if (!art || !map) return;
    IMG[p.art] = art;
    const read = (im: HTMLImageElement) => {
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth;
      cv.height = im.naturalHeight;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      if (!c2) return null;
      c2.drawImage(im, 0, 0);
      return c2.getImageData(0, 0, cv.width, cv.height).data;
    };
    const a = read(art);
    const l = read(map);
    if (!a || !l || map.naturalWidth !== art.naturalWidth || map.naturalHeight !== art.naturalHeight) return;
    const n = art.naturalWidth * art.naturalHeight;
    const labels = new Uint8Array(n);
    const alpha = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      labels[i] = l[i * 4];
      alpha[i] = a[i * 4 + 3];
    }
    parts[p.art] = { labels, w: art.naturalWidth, h: art.naturalHeight, art: alpha };
  }
  function drawArt(now: number) {
    const p = S.show;
    if (!p || p.key === 'base-ii' || S.scan <= 0) return;
    const im = IMG[p.art];
    if (!im) return;
    screenSpace();
    const R = artRect(p.ratio);
    // 方格紙：掃描線經過之前就淡淡地在
    ctx.save();
    ctx.globalAlpha = 0.5 * clamp01(S.scan * 3);
    ctx.strokeStyle = `rgba(${INK}, 0.05)`;
    ctx.lineWidth = 1;
    for (let x = R.x; x <= R.x + R.w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, R.y);
      ctx.lineTo(x, R.y + R.h);
      ctx.stroke();
    }
    for (let y = R.y; y <= R.y + R.h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(R.x, y);
      ctx.lineTo(R.x + R.w, y);
      ctx.stroke();
    }
    ctx.restore();
    // 掃描：左到右，掃過的地方才顯出線稿
    const k = clamp01(S.scan);
    const sx = R.x + R.w * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x - 2, R.y - 2, sx - R.x + 2, R.h + 4);
    ctx.clip();
    ctx.drawImage(im, R.x, R.y, R.w, R.h);
    // 零件表滑過的那個零件：染成琥珀色疊上去
    const tint = S.hot != null && S.calls > 0 ? tintOf(p, S.hot) : null;
    if (tint) {
      ctx.globalAlpha = clamp01(S.calls * 3);
      ctx.drawImage(tint, R.x, R.y, R.w, R.h);
    }
    ctx.restore();
    if (k > 0 && k < 1) {
      const g = ctx.createLinearGradient(sx - 60, 0, sx + 6, 0);
      g.addColorStop(0, `rgba(${AMB}, 0)`);
      g.addColorStop(1, `rgba(${AMB}, 0.18)`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - 60, R.y, 66, R.h);
      ctx.fillStyle = `rgba(${AMB}, 0.95)`;
      ctx.fillRect(sx - 0.75, R.y - 8, 1.5, R.h + 16);
      ctx.fillStyle = `rgba(${AMB}, 0.8)`;
      ctx.font = `9px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(`SCAN ${String(Math.round(k * 100)).padStart(3, ' ')}%`, sx + 6, R.y - 10);
    }
    drawCalls(p.parts, R, 1);
    if (p.links && S.calls > 0) drawLinks(now, p, R);
  }
  /**
   * 網路圖紙的連線：有線走等角圖的兩個地面方向（先沿一軸、再轉另一軸，像真的佈線），無線是點線；
   * 路由器底部有往外擴散的訊號圈；點（封包）沿線一去一回
   */
  function drawLinks(now: number, p: Payload, R: Box) {
    const t = (now - S.t0) / 1000;
    const P = (q: Pct) => ({ x: R.x + (R.w * q[0]) / 100, y: R.y + (R.h * q[1]) / 100 });
    const c30 = Math.cos(Math.PI / 6);
    ctx.save();
    ctx.globalAlpha = clamp01(S.calls * 1.5);
    ctx.lineWidth = 1;
    if (p.rings && !reduce) {
      const o = P(p.rings);
      for (let k = 0; k < 3; k++) {
        const ph = (t / 2.4 + k / 3) % 1;
        const rx = R.w * (0.06 + 0.4 * ph);
        ctx.strokeStyle = `rgba(${INK}, ${0.32 * (1 - ph)})`;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, rx, rx * Math.tan(Math.PI / 6), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    (p.links ?? []).forEach((L, n) => {
      const A = P(L.from);
      const B = P(L.to);
      let pts = [A, B];
      if (L.wired) {
        // A + t·(cos30, sin30) + s·(cos30, −sin30) = B
        const tt = ((B.x - A.x) / c30 + (B.y - A.y) / 0.5) / 2;
        pts = [A, { x: A.x + tt * c30, y: A.y + tt * 0.5 }, B];
      }
      ctx.strokeStyle = `rgba(${INK}, ${L.wired ? 0.6 : 0.4})`;
      if (!L.wired) ctx.setLineDash([3, 4]);
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${INK}, 0.8)`;
      for (const q of [pts[0], pts[pts.length - 1]]) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.8, 0, TAU);
        ctx.fill();
      }
      if (reduce) return;
      const seg: number[] = [];
      let tot = 0;
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        seg.push(l);
        tot += l;
      }
      for (let q = 0; q < 2; q++) {
        let f = (t * (0.35 + (n % 3) * 0.07) + q * 0.5 + n * 0.21) % 1;
        if (q) f = 1 - f;
        let d = f * tot;
        let i = 0;
        while (i < seg.length - 1 && d > seg[i]) {
          d -= seg[i];
          i++;
        }
        const at = mid(pts[i], pts[i + 1], seg[i] ? d / seg[i] : 0);
        ctx.fillStyle = `rgba(${INK}, ${0.9 * Math.sin(f * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(at.x, at.y, 2, 0, TAU);
        ctx.fill();
      }
    });
    // 另外兩張圖紙上的主機：標「見第幾張」（工程圖的參照寫法）
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = `rgba(${INK}, 0.55)`;
    ctx.textAlign = 'left';
    for (const r of p.refs ?? []) {
      const q = P(r.at);
      ctx.fillText(`SHEET ${r.sheet}`, q.x, q.y);
    }
    ctx.restore();
  }

  function frame(now: number) {
    if (!S.alive) return;
    requestAnimationFrame(frame);
    if (S.W === 0) layout();
    screenSpace();
    ctx.clearRect(0, 0, S.W, S.H);
    S.hk = S.hk.map((v, i) => lerp(v, i === S.hover ? 1 : 0, reduce ? 1 : 0.2));
    applyWorld();
    shuttleTransform(now);
    S.worldM = ctx.getTransform();
    // 噴焰先畫（火在機身底下）：生點要用到噴嘴在螢幕上的位置，畫點回到螢幕座標
    const dt = Math.min(0.05, (now - (S.lastNow || now)) / 1000);
    S.lastNow = now;
    emit(dt);
    screenSpace();
    drawParticles();
    ctx.setTransform(S.worldM);
    drawShuttle();
    const appear = S.view === VIEWS.top ? clamp01((S.doors - 0.55) / 0.45) : clamp01((S.intro - 0.3) / 0.7);
    if (appear > 0) {
      for (let i = 0; i < 4; i++) if (i !== S.carried) drawCrate(i, S.view.slots[i], { alpha: appear });
      ctx.save();
      ctx.globalAlpha = appear * LINE;
      drawArm();
      ctx.restore();
    }
    if (S.carried >= 0 && S.cratePos) {
      const top = S.view === VIEWS.top;
      drawCrate(S.carried, S.cratePos, {
        carried: true,
        alpha: 1 - clamp01(S.unfold * 1.4),
        scale: top ? 1 + S.liftK * 0.35 : 1 + S.liftK * 0.15,
        shadow: top ? S.liftK * 26 : 0,
      });
    }
    ctx.globalAlpha = 1;
    drawOrbit();
    drawSheet();
    drawSatellite(now);
    drawTags();
    drawArt(now);
    // 選中時（圖紙蓋住場景）點藏起來；老家那台的訊號例外，那條線就是鏡頭飛過去的理由
    if (!S.show || S.show === BASE) drawDot(now);
  }

  // ── 編排 ──
  /** 箱子跟著末端器：俯視在末端器正下方，斜側面吊在末端器下面 */
  function attach() {
    const tip = fk().tip;
    S.cratePos = S.view.crate ? { x: tip.x, y: tip.y } : { x: tip.x, y: tip.y + 46 };
  }
  function gripPoint(i: number): Pt {
    const s = S.view.slots[i];
    return S.view.crate ? s : { x: s.x, y: s.y - 46 };
  }
  function placePanel() {
    if (S.mode === 'tall') {
      panel.style.cssText = '';
      return;
    }
    const r = panelRect();
    Object.assign(panel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }
  const setOpen = (on: boolean) => {
    root.dataset.open = on && S.mode === 'tall' ? '1' : '';
  };

  async function pick(i: number, from = -1) {
    const p = PAYLOADS[i];
    S.carried = -1;
    S.cratePos = null;
    S.sel = i;
    S.hover = -1;
    S.hot = null;
    onSelect(i, false);
    void loadParts(p);
    const tok = ++S.tok;
    const lift = S.view.lift;
    // 鏡頭只動一次：往舉起的位置推近一點
    const cam = moveCam(
      { x: lerp(S.home.x, lift.x, 0.45), y: lerp(S.home.y, lift.y, 0.45), z: S.view === VIEWS.top ? 1.3 : 1.22 },
      900,
    );
    // 1. 琥珀點從駕駛艙後窗流到手臂肩部（從上一件換過來的話，點已經在末端器上）
    if (from < 0)
      await tween(180, (t) => {
        S.du = ease(t);
      });
    // 2. 指令順著手臂流：流到哪個關節，那個關節才開始轉
    await moveArm(ik(gripPoint(i)), from >= 0 ? 480 : 540, (t) => {
      if (from < 0) S.du = 1 + 3 * clamp01(t / 0.6);
    });
    S.du = 4;
    S.carried = i;
    attach();
    // 3. 夾住
    await tween(110, (t) => {
      S.grip = Math.sin(t * Math.PI);
    });
    S.grip = 0.35;
    // 4. 舉到駕駛艙後窗前；快到的時候圖紙從箱子裡展開，攤平前掃描就開始
    S.show = p;
    S.scan = 0;
    S.calls = 0;
    S.unfold = 0;
    const up = moveArm(ik(lift), 520, (t) => {
      attach();
      S.liftK = ease(t);
    });
    await wait(300);
    setOpen(true);
    await Promise.all([
      up,
      cam,
      fade('dim', 1, 420),
      tween(380, (t) => {
        S.unfold = t;
      }),
      (async () => {
        await wait(260);
        if (tok === S.tok) onSelect(i, true);
        await tween(520, (t) => {
          S.scan = t;
        });
      })(),
    ]);
    attach();
    S.grip = 0;
    // 編號圈一個一個亮：不擋下一個操作（換件時用 tok 讓它停手）
    void tween(700, (t) => {
      if (tok === S.tok) S.calls = t;
    });
  }
  /** 放回去：圖紙反向掃掉、收回箱子裡，箱子再放回托架 */
  async function putBack(next = -1) {
    const i = S.carried;
    if (i < 0) return;
    S.tok++;
    S.hot = null;
    onSelect(S.sel, false);
    await tween(160, (t) => {
      S.scan = 1 - t;
      S.calls = 0;
    });
    await Promise.all([
      tween(300, (t) => {
        S.unfold = 1 - ease(t);
      }).then(() => {
        S.show = null;
        S.scan = 0;
        S.unfold = 0;
        if (next < 0) setOpen(false);
      }),
      fade('dim', 0, 360),
      (async () => {
        await wait(150);
        await moveArm(ik(gripPoint(i)), 460, (t) => {
          attach();
          S.liftK = 1 - ease(t);
        });
      })(),
    ]);
    S.carried = -1;
    S.cratePos = null;
    S.liftK = 0;
    S.grip = 0;
  }
  /** 收手臂：琥珀點沿手臂流回肩部、再回到駕駛艙後窗 */
  async function stow() {
    await Promise.all([
      moveArm(stowPose(), 560, (t) => {
        S.du = 4 * (1 - ease(t));
      }),
      moveCam({ x: S.home.x, y: S.home.y, z: 1 }, 600),
    ]);
    S.du = 0;
    S.sel = -1;
    onSelect(-1, false);
  }
  /** 鏡頭飛去老家那台：太空梭往左下滑出半個畫面（變暗但還在），衛星從角落飛到中間、轉正 */
  function baseCam(): Cam {
    const r = sceneRect();
    const s = fitScale();
    return S.mode === 'tall'
      ? { x: S.home.x - (r.w * 0.1) / s, y: S.home.y - (r.h * 0.42) / s, z: 0.85 }
      : { x: S.home.x + (r.w * 0.6) / s, y: S.home.y - (r.h * 0.46) / s, z: 0.8 };
  }
  async function showBase() {
    S.sel = 4;
    S.hover = -1;
    S.satHover = false;
    S.hot = null;
    onSelect(4, false);
    S.show = BASE;
    S.scan = 1;
    S.calls = 0;
    const tok = ++S.tok;
    setOpen(true);
    await Promise.all([
      tween(700, (t) => {
        S.sk = ease(t);
      }),
      moveCam(baseCam(), 800),
      fade('dim', 0.8, 700),
      tween(800, (t) => {
        S.baseK = t;
      }),
    ]);
    if (tok === S.tok) onSelect(4, true);
    void tween(700, (t) => {
      if (tok === S.tok) S.calls = t;
    });
  }
  async function hideBase() {
    setOpen(false);
    S.tok++;
    S.calls = 0;
    S.hot = null;
    onSelect(4, false);
    await Promise.all([
      tween(700, (t) => {
        S.sk = 1 - ease(t);
      }),
      moveCam({ x: S.home.x, y: S.home.y, z: 1 }, 750),
      fade('dim', 0, 600),
      tween(750, (t) => {
        S.baseK = 1 - t;
      }),
    ]);
    S.sk = 0;
    S.show = null;
    S.sel = -1;
    onSelect(-1, false);
  }
  /** 依序處理：動畫中又點了別的，記下最後一個，做完這段再接著做 */
  async function go(target: Target) {
    if (S.leaving || S.intro < 1) return;
    if (S.busy) {
      S.pending = target;
      return;
    }
    S.busy = true;
    root.dataset.busy = '1';
    try {
      let t: Target | null = target;
      while (t !== null && S.alive) {
        S.pending = null;
        if (S.sel === 4 && t !== 4) await hideBase();
        if (t === 'home') {
          if (S.carried >= 0) await putBack();
          if (S.sel >= 0) await stow();
        } else if (t === 4) {
          if (S.sel !== 4) {
            if (S.carried >= 0) {
              await putBack();
              await stow();
            }
            await showBase();
          }
        } else if (t !== S.sel || S.carried < 0) {
          // 換一件：手臂放下這件就直接去拿下一件，中間不收回、鏡頭不回整架
          const from = S.carried;
          if (from >= 0) await putBack(t);
          await pick(t, from);
        }
        t = S.pending;
      }
    } finally {
      S.busy = false;
      root.dataset.busy = '';
    }
  }
  const step = (d: 1 | -1) => go(((((S.sel < 0 ? (d > 0 ? -1 : 0) : S.sel) + d) % 5) + 5) % 5);

  // ── 進出場 ──
  /** 進場：沿機頭方向滑進來。前四成 OMS 點著，熄火後滑行，最後機頭 RCS 噴三下煞住；俯視再打開艙門 */
  async function arrive() {
    S.leave = 0;
    S.leaving = false;
    S.intro = 0;
    S.oms = 0;
    S.particles = [];
    root.dataset.arriving = '1';
    const puffsAt = [0.66, 0.76, 0.86];
    let next = 0;
    await tween(2200, (t) => {
      S.intro = t;
      S.oms = t < 0.06 ? t / 0.06 : t < 0.38 ? 1 : Math.max(0, 1 - (t - 0.38) / 0.1);
      if (next < puffsAt.length && t >= puffsAt[next]) {
        S.puffs++;
        next++;
      }
    });
    S.intro = 1;
    S.oms = 0;
    root.dataset.arriving = '';
    if (S.view === VIEWS.top)
      await tween(1300, (t) => {
        S.doors = t;
      });
    S.doors = 1;
    // 圖紙晚一點再載（進場時不跟底稿搶頻寬）
    for (const p of PAYLOADS) void loadParts(p);
  }
  /** 離場：換頁最多等 0.8 秒，所以只有點火加速飛走，艙門保持原樣 */
  async function depart() {
    S.leaving = true;
    root.dataset.arriving = '1';
    onSelect(-1, false);
    await tween(120, (t) => {
      S.oms = Math.max(S.oms, t);
    });
    await tween(640, (t) => {
      S.leave = t;
    });
  }
  /** 琥珀點現在在畫面上的哪裡（離場時換頁轉場的點跟著它飛） */
  function dotNow(): Pt {
    return S.worldM ? wToS(S.view.deck) : deckFinal();
  }

  // ── 輸入 ──
  const local = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function hitCrate(p: Pt) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < 4; i++) {
      if (i === S.carried) continue;
      const sl = S.view.slots[i];
      const c = wToS(S.view.crate ? sl : { x: sl.x, y: sl.y - 26 });
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const r = Math.max(28, 90 * fitScale() * S.cam.z);
      if (d < r && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  const onSat = (p: Pt) => {
    const R = satNow();
    return p.x >= R.x && p.x <= R.x + R.s && p.y >= R.y && p.y <= R.y + R.s + 20;
  };
  /** 左右滑：換一件（整架時往左滑從第一件開始、往右滑從老家那台開始） */
  function swipe(dx: number, dy: number) {
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return false;
    void step(dx < 0 ? 1 : -1);
    return true;
  }
  let down: Pt | null = null;
  const onDown = (e: PointerEvent) => {
    down = local(e);
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const p = local(e);
    const dx = p.x - down.x;
    const dy = p.y - down.y;
    down = null;
    if (swipe(dx, dy) || Math.hypot(dx, dy) > 10) return;
    if (S.sel !== 4 && !S.show && onSat(p)) return void go(4);
    if (S.show) {
      // 點線稿本身不返回，點線稿以外的空白才返回
      const A = S.show.key === 'base-ii' ? artRect(1) : artRect(S.show.ratio);
      if (p.x >= A.x && p.x <= A.x + A.w && p.y >= A.y && p.y <= A.y + A.h) return;
      return void go('home');
    }
    const i = hitCrate(p);
    if (i >= 0) return void go(i);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (S.show || S.busy) {
      canvas.style.cursor = '';
      S.hover = -1;
      S.satHover = false;
      return;
    }
    const p = local(e);
    const sat = onSat(p);
    S.hover = sat ? -1 : hitCrate(p);
    S.satHover = sat;
    canvas.style.cursor = sat || S.hover >= 0 ? 'pointer' : '';
  };
  const onLeave = () => {
    S.hover = -1;
    S.satHover = false;
  };
  let pdown: Pt | null = null;
  const onPanelDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') pdown = { x: e.clientX, y: e.clientY };
  };
  const onPanelUp = (e: PointerEvent) => {
    if (!pdown) return;
    const dx = e.clientX - pdown.x;
    const dy = e.clientY - pdown.y;
    pdown = null;
    swipe(dx, dy);
  };
  const onPanelCancel = () => {
    pdown = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    if (e.key === 'Escape' && S.sel >= 0) void go('home');
    else if (e.key === 'ArrowRight') void step(1);
    else if (e.key === 'ArrowLeft') void step(-1);
  };
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  // 摺起來或攤開時畫布大小不一定會變
  const unsubscribeFold = subscribeFold(() => layout());
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  panel.addEventListener('pointerdown', onPanelDown);
  panel.addEventListener('pointerup', onPanelUp);
  panel.addEventListener('pointercancel', onPanelCancel);
  window.addEventListener('keydown', onKey);

  layout();
  S.arm = stowPose();
  requestAnimationFrame(frame);
  const ready = Promise.all(
    ['bay-oblique', 'bay-top', 'bay-satellite', ...DOORS.flatMap((d) => [d.closed[0], d.open[0]])].map(async (n) => {
      IMG[n] = (await loadImage(artSrc(n))) ?? undefined;
    }),
  );

  return {
    ready,
    arrive,
    depart,
    go: (t: Target) => void go(t),
    step: (d: 1 | -1) => void step(d),
    /** 零件表滑過第 k 個有編號的零件（null 是離開） */
    setHot: (k: number | null) => {
      S.hot = k;
    },
    /** 標籤滑過（-1 是離開；4 是老家那台） */
    setHover: (i: number) => {
      if (S.show || S.busy) return;
      S.hover = i < 4 ? i : -1;
      S.satHover = i === 4;
    },
    /** 換頁的點落在這裡（相對畫布左上角） */
    anchor: deckFinal,
    dotNow,
    /** 整架時的離場方向（機頭方向，螢幕上） */
    heading: (): Pt => {
      const a = toScreen({ x: 0, y: 0 });
      const b = toScreen(S.view.fwd);
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    },
    destroy: () => {
      S.alive = false;
      ro.disconnect();
      unsubscribeFold();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      panel.removeEventListener('pointerdown', onPanelDown);
      panel.removeEventListener('pointerup', onPanelUp);
      panel.removeEventListener('pointercancel', onPanelCancel);
      window.removeEventListener('keydown', onKey);
    },
  };
}

export type Bay = NonNullable<ReturnType<typeof createBay>>;
