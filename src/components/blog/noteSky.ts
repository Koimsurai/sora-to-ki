// 手記頁的星軌（blog/Notes）：一篇文章是一道星軌。天極在畫面右上，越新的文章繞在越外圈，
// 寫得越長、弧就拖得越長；背景的星星也是星軌——每一道淡淡的弧前端都是一顆星（手記頁收掉了
// 一般的背景星空，見 hooks/useBareSky），整片夜空像一張長曝光的照片。
// 打開頁面時像快門剛打開，所有的星一起拖出軌跡；之後整片繞著天極轉。
// 換到某一篇文章時，那一篇的星軌被拉成文章頁右邊那道軌道（lib/articleOrbit）。
// 這裡只有畫圖，不碰 React。
import type { OrbitGeom } from '@/lib/articleOrbit';
import type { Pt } from '@/store/pageTransition';

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 背景的星（每一顆都拖著一道淡淡的軌跡） */
const FIELD = 420;
/** 每秒繞天極轉多少（弧度）：內圈也看得出在走 */
export const SPIN = 0.035;

/** 字串 → 0 到 1 的固定亂數（同一篇文章每次都在同一個角度） */
export function hash01(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0) / 4294967296;
}

/** 有種子的亂數：背景星軌每次打開都長一樣 */
function seeded(seed: number) {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    s = (Math.imul(s, 48271) + 1) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

export interface SkyPost {
  /** 0 到 1：這篇有多長（相對最長的那篇） */
  length: number;
  /** 0 到 1：起點的角度 */
  seed: number;
  /** 這篇有沒有被篩掉（篩掉的只留很淡的一道） */
  dim: boolean;
}

/**
 * 文章 → 星軌的參數。手記頁與文章頁（換頁時要畫出同一道弧）都用這一份，兩邊才對得上：
 * 長度照內文字數（舊版後端沒有字數時用標題算一個固定的值），角度照標題
 */
export function skyPostOf(p: { title: string; content_length?: number }, maxLen: number): Omit<SkyPost, 'dim'> {
  const n = p.content_length ?? 0;
  return { length: n ? n / Math.max(1, maxLen) : 0.2 + 0.4 * hash01(`${p.title}#len`), seed: hash01(p.title) };
}

export const poleOf = (w: number, h: number): Pt => ({ x: w * 0.76, y: h * 0.3 });
const reachOf = (w: number, h: number) => {
  const p = poleOf(w, h);
  return Math.hypot(Math.max(p.x, w - p.x), Math.max(p.y, h - p.y));
};

export interface Arc {
  cx: number;
  cy: number;
  r: number;
  /** 尾端與前端（前端是那顆星）的角度 */
  a0: number;
  a1: number;
}

/** 第 i 篇（0 是最新）在畫面上的那道弧；t 是秒、grow 是長出來到哪裡 */
export function postArc(i: number, n: number, p: SkyPost, w: number, h: number, t: number, grow = 1): Arc {
  const { x, y } = poleOf(w, h);
  const reach = reachOf(w, h);
  const inner = 60;
  const outer = Math.min(reach * 0.8, Math.max(w, h) * 0.5);
  const r = inner + ((n - i) / n) * (outer - inner);
  const a0 = p.seed * TAU + t * SPIN;
  return { cx: x, cy: y, r, a0, a1: a0 + (0.25 + 1.6 * p.length) * grow };
}

export const arcPoint = (a: Arc, ang: number): Pt => ({ x: a.cx + Math.cos(ang) * a.r, y: a.cy + Math.sin(ang) * a.r });

/**
 * 從文章頁回到手記時，夜空要轉到哪個時間：那一篇的那顆星要在畫面裡（外圈的星常常轉在畫面外，
 * 點會落到看不到的地方）。arc 是 t = 0 時的那道星軌；挑轉最少就看得到的角度。
 * 文章頁（收的時候把軌道拉回這道星軌）與手記頁（接手）用同一個算法，兩邊對得上
 */
export function keepTimeOf(arc: Arc, w: number, h: number): number {
  // 先找列表右邊空著的那片天（不壓在標題與列表上），找不到才退而求其次只要在畫面裡
  const open = (q: Pt) => q.x > w / 2 + 180 && q.x < w - 60 && q.y > 110 && q.y < h - 60;
  const on = (q: Pt) => q.x > 60 && q.x < w - 60 && q.y > 110 && q.y < h - 60;
  for (const ok of [open, on]) {
    for (let deg = 0; deg <= 180; deg += 3) {
      for (const sign of deg ? [1, -1] : [1]) {
        const da = (sign * deg * Math.PI) / 180;
        if (ok(arcPoint(arc, arc.a1 + da))) return da / SPIN;
      }
    }
  }
  return 0;
}

/**
 * 鏡頭推近：把手記的整片星空當成一張照片，平移、旋轉、放大，直到第 i 篇的那道星軌剛好疊在文章頁的軌道上
 * （它的那顆星落在軌道頂端）。e 是推到哪裡（0 是原樣、1 是到位）；縮放在對數上內插，推起來是等速的
 */
export function zoomOf(arc: Arc, g: OrbitGeom, e: number) {
  const S = g.RB / arc.r;
  const scale = Math.exp(Math.log(S) * e);
  const rot = (g.aTop - arc.a1) * e;
  return { px: arc.cx, py: arc.cy, tx: arc.cx + (g.cx - arc.cx) * e, ty: arc.cy + (g.cy - arc.cy) * e, rot, scale };
}

export type Zoom = ReturnType<typeof zoomOf>;

export function zoomMap(z: Zoom, p: Pt): Pt {
  const dx = (p.x - z.px) * z.scale;
  const dy = (p.y - z.py) * z.scale;
  const c = Math.cos(z.rot);
  const s = Math.sin(z.rot);
  return { x: z.tx + dx * c - dy * s, y: z.ty + dx * s + dy * c };
}

export function applyZoom(ctx: CanvasRenderingContext2D, z: Zoom) {
  ctx.translate(z.tx, z.ty);
  ctx.rotate(z.rot);
  ctx.scale(z.scale, z.scale);
  ctx.translate(-z.px, -z.py);
}

/** 推到位之後，那道星軌只留下跟文章軌道一樣長的那一段（從那顆星往回量，弧度） */
export const orbitSpan = (g: OrbitGeom) => g.H / g.RB;

export interface SkyFrame {
  /** 秒，決定轉到哪裡 */
  t: number;
  /** 0 到 1：快門打開之後軌跡拖到哪裡 */
  grow: number;
  /** 滑過的是第幾篇，-1 是沒有 */
  hovered: number;
  /** 這一篇不跟著長，一開始就是滿的（從文章頁回來、或點剛沿著它飛進來）；keepGlow 是它還亮著多少 */
  keep: number;
  keepGlow: number;
  /** 換到文章：第 i 篇被拉成文章頁的軌道，k 是拉到哪裡（0 到 1），其他的跟著淡掉 */
  zoom: { i: number; k: number; geom: OrbitGeom } | null;
  /** 0 到 1：換到別頁時整片縮回各自的那顆星 */
  retract: number;
  /** 疊在別的東西上畫（換頁時由轉場接著畫推近的後半段）：不先清掉畫布 */
  overlay?: boolean;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createNoteSky() {
  const rnd = seeded(0.61);
  const field = Array.from({ length: FIELD }, () => ({
    r: Math.sqrt(rnd()),
    len: 0.1 + rnd() * 0.7,
    a0: rnd() * TAU,
    a: 0.035 + rnd() * rnd() * 0.16,
    star: 0.5 + rnd() * 1.1,
  }));

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, posts: SkyPost[], f: SkyFrame) {
    if (!f.overlay) ctx.clearRect(0, 0, w, h);
    const { x: px, y: py } = poleOf(w, h);
    const reach = reachOf(w, h);
    const spin = f.t * SPIN;
    const n = posts.length;
    // 換到文章：整片星空當一張照片推近（zoomOf），推到那一篇的星軌疊上文章的軌道
    const zk = f.zoom ? easeInOut(f.zoom.k) : 0;
    const zoom = f.zoom ? zoomOf(postArc(f.zoom.i, n, posts[f.zoom.i], w, h, f.t, 1), f.zoom.geom, zk) : null;
    /** 放大之後線與點要維持原本的粗細 */
    const px1 = zoom ? 1 / zoom.scale : 1;
    // 其他的星軌與背景的星：推近時從鏡頭旁邊飛過去，快到位才淡掉
    const zfade = f.zoom ? Math.min(1, Math.max(0, (f.zoom.k - 0.6) / 0.4)) : 0;
    const fade = (1 - 0.92 * zfade * zfade * (3 - 2 * zfade)) * (1 - f.retract);
    const len = (base: number) => base * f.grow * (1 - f.retract);
    ctx.save();
    if (zoom) applyZoom(ctx, zoom);
    ctx.lineWidth = px1;

    // 背景的星：每一顆拖著一道軌跡，前端是星本身
    if (fade > 0.01) {
      for (const s of field) {
        const r = 14 + s.r * reach;
        const a1 = s.a0 + spin + s.len * f.grow;
        const a0 = a1 - len(s.len);
        ctx.strokeStyle = `rgba(${INK}, ${(s.a * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, r, a0, a1);
        ctx.stroke();
        const size = s.star * px1;
        ctx.fillStyle = `rgba(${INK}, ${Math.min(1, s.a * 4 * fade).toFixed(3)})`;
        ctx.fillRect(px + Math.cos(a1) * r - size / 2, py + Math.sin(a1) * r - size / 2, size, size);
      }
      ctx.fillStyle = `rgba(${INK}, ${0.6 * fade})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.8 * px1, 0, TAU);
      ctx.fill();
    }

    posts.forEach((p, i) => {
      const zooming = f.zoom?.i === i;
      const full = zooming || f.keep === i;
      const arc = postArc(i, n, p, w, h, f.t, full ? 1 : f.grow);
      if (!full) arc.a0 = arc.a1 - (arc.a1 - arc.a0) * (1 - f.retract);
      // 推到位時只留下跟文章軌道一樣長的那一段
      if (zooming && f.zoom) arc.a0 = arc.a1 - ((arc.a1 - arc.a0) * (1 - zk) + orbitSpan(f.zoom.geom) * zk);
      // 亮的程度：滑過的、正在被推近的是全亮；留著的那一篇慢慢退回一般的亮度
      const glow = zooming || i === f.hovered ? 1 : f.keep === i ? f.keepGlow : 0;
      const on = glow > 0.01;
      const base = p.dim ? 0.08 : 0.3;
      const alpha = zooming ? 0.85 : (base + (0.9 - base) * glow) * fade;
      if (alpha < 0.01) return;
      ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
      ctx.lineWidth = (1 + 0.4 * glow) * px1;
      ctx.beginPath();
      ctx.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1);
      ctx.stroke();
      ctx.lineWidth = px1;
      if (zooming) return; // 那顆星由轉場畫（它變成讀者的琥珀點）
      const head = arcPoint(arc, arc.a1);
      if (on) {
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14 * px1);
        g.addColorStop(0, `rgba(${AMBER}, ${0.6 * fade * glow})`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 14 * px1, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${INK}, ${(p.dim ? 0.2 : 0.8) * fade * (1 - glow)})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, (1.5 + 1.1 * glow) * px1, 0, TAU);
      ctx.fill();
      if (on) {
        ctx.fillStyle = `rgba(${AMBER}, ${fade * glow})`;
        ctx.fill();
      }
    });
    ctx.restore();
  }

  return { draw };
}
