// 手記頁的星軌（blog/Notes）：一篇文章是一道星軌。天極在畫面右上，越新的文章繞在越外圈，
// 寫得越長、弧就拖得越長；背景再補上一百多道很淡的星軌，整片夜空才是滿的。
// 打開頁面時軌跡慢慢長出來，之後整片繞著天極轉。這裡只有畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 背景補的淡星軌數量 */
const FIELD = 170;
/** 每秒繞天極轉多少（弧度）：慢到看不出在動，回頭看才發現位置變了 */
const SPIN = 0.012;

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

export interface SkyFrame {
  /** 秒，決定轉到哪裡 */
  t: number;
  /** 0 到 1：長出來到哪裡 */
  grow: number;
  /** 滑過的是第幾篇，-1 是沒有 */
  hovered: number;
}

export function createNoteSky() {
  const rnd = seeded(0.61);
  const field = Array.from({ length: FIELD }, () => ({
    r: rnd(),
    len: 0.12 + rnd() * 0.9,
    a0: rnd() * TAU,
    a: 0.04 + rnd() * 0.1,
  }));

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, posts: SkyPost[], f: SkyFrame) {
    ctx.clearRect(0, 0, w, h);
    const px = w * 0.76;
    const py = h * 0.3;
    const reach = Math.hypot(Math.max(px, w - px), Math.max(py, h - py));
    const spin = f.t * SPIN;
    ctx.lineWidth = 1;
    for (const s of field) {
      const r = 14 + s.r * reach;
      ctx.strokeStyle = `rgba(${INK}, ${s.a})`;
      ctx.beginPath();
      ctx.arc(px, py, r, s.a0 + spin, s.a0 + spin + s.len * f.grow);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${INK}, 0.6)`;
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, TAU);
    ctx.fill();

    const n = posts.length;
    const inner = 60;
    const outer = Math.min(reach * 0.8, Math.max(w, h) * 0.5);
    posts.forEach((p, i) => {
      const r = inner + ((n - i) / n) * (outer - inner);
      const len = (0.25 + 1.6 * p.length) * f.grow;
      const a0 = p.seed * TAU + spin;
      const on = i === f.hovered;
      ctx.strokeStyle = `rgba(${INK}, ${on ? 0.9 : p.dim ? 0.08 : 0.3})`;
      ctx.lineWidth = on ? 1.4 : 1;
      ctx.beginPath();
      ctx.arc(px, py, r, a0, a0 + len);
      ctx.stroke();
      ctx.lineWidth = 1;
      // 弧的前端是那篇文章的「星」
      const hx = px + Math.cos(a0 + len) * r;
      const hy = py + Math.sin(a0 + len) * r;
      if (on) {
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
        g.addColorStop(0, `rgba(${AMBER}, 0.6)`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, hy, 14, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = on ? `rgb(${AMBER})` : `rgba(${INK}, ${p.dim ? 0.2 : 0.8})`;
      ctx.beginPath();
      ctx.arc(hx, hy, on ? 2.6 : 1.5, 0, TAU);
      ctx.fill();
    });
  }

  return { draw };
}
