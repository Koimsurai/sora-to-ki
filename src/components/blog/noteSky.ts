// 手記頁的星軌（blog/Notes）：一篇文章是一道星軌。天極在畫面右上，越新的文章繞在越外圈，
// 寫得越長、弧就拖得越長；背景的星星也是星軌——每一道淡淡的弧前端都是一顆星（手記頁收掉了
// 一般的背景星空，見 hooks/useBareSky），整片夜空像一張長曝光的照片。
// 打開頁面時像快門剛打開，所有的星一起拖出軌跡；之後整片繞著天極轉。
// 換到某一篇文章時，那一篇的星軌被拉成文章頁右邊那道軌道（lib/articleOrbit）。
// 這裡只有畫圖，不碰 React。
import type { OrbitGeom } from '@/lib/articleOrbit';
import { orbitPoint } from '@/lib/articleOrbit';
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

export interface SkyFrame {
  /** 秒，決定轉到哪裡 */
  t: number;
  /** 0 到 1：快門打開之後軌跡拖到哪裡 */
  grow: number;
  /** 滑過的是第幾篇，-1 是沒有 */
  hovered: number;
  /** 這一篇不跟著長，一開始就是滿的（從文章頁回來時那一篇已經在原位） */
  keep: number;
  /** 換到文章：第 i 篇被拉成文章頁的軌道，k 是拉到哪裡（0 到 1），其他的跟著淡掉 */
  zoom: { i: number; k: number; geom: OrbitGeom } | null;
  /** 0 到 1：換到別頁時整片縮回各自的那顆星 */
  retract: number;
  /** 轉場飛進來的那條線，落地後淡掉（它疊在最新那一篇的星軌上） */
  trail: { points: Pt[]; alpha: number } | null;
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
    ctx.clearRect(0, 0, w, h);
    const { x: px, y: py } = poleOf(w, h);
    const reach = reachOf(w, h);
    const spin = f.t * SPIN;
    const zk = f.zoom ? easeInOut(f.zoom.k) : 0;
    const fade = (1 - zk) * (1 - f.retract);
    const len = (base: number) => base * f.grow * (1 - f.retract);
    ctx.lineWidth = 1;

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
        ctx.fillStyle = `rgba(${INK}, ${Math.min(1, s.a * 4 * fade).toFixed(3)})`;
        ctx.fillRect(px + Math.cos(a1) * r - s.star / 2, py + Math.sin(a1) * r - s.star / 2, s.star, s.star);
      }
      ctx.fillStyle = `rgba(${INK}, ${0.6 * fade})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, TAU);
      ctx.fill();
    }

    const n = posts.length;
    posts.forEach((p, i) => {
      const zooming = f.zoom?.i === i;
      const full = zooming || f.keep === i;
      const arc = postArc(i, n, p, w, h, f.t, full ? 1 : f.grow);
      if (!full) arc.a0 = arc.a1 - (arc.a1 - arc.a0) * (1 - f.retract);
      const on = i === f.hovered || zooming || f.keep === i;
      if (zooming && f.zoom) {
        // 拉成文章頁的軌道：弧上每一點（從前端往尾端）移到軌道上對應的位置（從頂端往下）
        const g = f.zoom.geom;
        ctx.strokeStyle = `rgba(${INK}, ${0.9 - 0.12 * zk})`;
        ctx.lineWidth = 1.4 - 0.4 * zk;
        ctx.beginPath();
        for (let k = 0; k <= 64; k++) {
          const s = k / 64;
          const a = arcPoint(arc, arc.a1 - s * (arc.a1 - arc.a0));
          const o = orbitPoint(g, s);
          const x = a.x + (o.x - a.x) * zk;
          const y = a.y + (o.y - a.y) * zk;
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        return;
      }
      const alpha = (on ? 0.9 : p.dim ? 0.08 : 0.3) * fade;
      if (alpha < 0.01) return;
      ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
      ctx.lineWidth = on ? 1.4 : 1;
      ctx.beginPath();
      ctx.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1);
      ctx.stroke();
      ctx.lineWidth = 1;
      const head = arcPoint(arc, arc.a1);
      if (on) {
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
        g.addColorStop(0, `rgba(${AMBER}, ${0.6 * fade})`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 14, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = on ? `rgba(${AMBER}, ${fade})` : `rgba(${INK}, ${(p.dim ? 0.2 : 0.8) * fade})`;
      ctx.beginPath();
      ctx.arc(head.x, head.y, on ? 2.6 : 1.5, 0, TAU);
      ctx.fill();
    });

    // 飛進來的那條線：落在最新那一篇的星軌上，跟著淡掉
    if (f.trail && f.trail.alpha > 0.01 && f.trail.points.length > 1) {
      ctx.strokeStyle = `rgba(${INK}, ${(0.75 * f.trail.alpha).toFixed(3)})`;
      ctx.beginPath();
      f.trail.points.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    }
  }

  return { draw };
}
