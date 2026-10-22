// 首頁「天空之窗」裡的天空：每一扇窗是那一區真正的天空縮影（手記的星軌與樹、碎念的像素抖動、
// 收藏的星座、關於的小星球）。純 2D canvas、畫一次就停——首頁已經有一個 3D 場景在跑，不再多開。
// 座標都是 CSS 像素（呼叫端先把 ctx 縮放到 dpr）。
import { drawTree, growTree, ridgeNoise, rng } from './horizon';

const NIGHT_TOP = '#05060c';
const NIGHT_LOW = '#0e0f1d';
const GROUND = '#04050a';
const MOON = 'rgba(176, 168, 220, 0.35)';

function night(ctx: CanvasRenderingContext2D, w: number, h: number, horizon = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, h * horizon);
  g.addColorStop(0, NIGHT_TOP);
  g.addColorStop(1, NIGHT_LOW);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function dust(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = 0.15 + Math.pow(R(), 3) * 0.75;
    ctx.fillStyle = `rgba(226, 228, 245, ${a.toFixed(3)})`;
    const s = R() < 0.06 ? 1.6 : 1;
    ctx.fillRect(R() * w, R() * h, s, s);
  }
}

/** 手記：繞著畫面外天極的星軌，地平線上一棵樹 */
export function drawNotesSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  night(ctx, w, h, 0.8);
  const R = rng(3);
  const pole = { x: w * 0.16, y: -h * 0.3 };
  const far = Math.hypot(w, h) * 1.25;
  for (let i = 0; i < 340; i++) {
    const r = 30 + Math.sqrt(R()) * far;
    const a0 = R() * Math.PI * 2;
    const len = 0.18 + R() * 0.22;
    const b = Math.pow(R(), 2.2);
    ctx.strokeStyle = R() < 0.18 ? `rgba(255, 214, 160, ${0.12 + b * 0.5})` : `rgba(206, 216, 255, ${0.1 + b * 0.55})`;
    ctx.lineWidth = 0.6 + b * 0.9;
    ctx.beginPath();
    ctx.arc(pole.x, pole.y, r, a0, a0 + len);
    ctx.stroke();
  }
  // 地平線：遠山一道、近地一道
  const farN = ridgeNoise(11);
  const nearN = ridgeNoise(37);
  const farY = (x: number) => h * 0.74 - (farN((x / w) * 2.6) * 0.5 + 0.35) * h * 0.12;
  const nearY = (x: number) => h * 0.86 - (nearN((x / w) * 2 + 5) * 0.5 + 0.4) * h * 0.08;
  const ridge = (f: (x: number) => number, fill: string, rim: string) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, f(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, f(x) + 0.5);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  ridge(farY, '#11121f', 'rgba(196, 186, 232, 0.18)');
  ridge(nearY, GROUND, 'rgba(233, 193, 122, 0.22)');
  const tx = w * 0.8;
  drawTree(ctx, growTree(tx, nearY(tx) + 2, Math.min(0.8, h / 420)), 1, GROUND, MOON);
}

/** 碎念：星空用 4×4 Bayer 矩陣二值化，最亮的幾格是琥珀色（跟碎念頁的 3D 天空同一套） */
export function drawMomentsSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const CELL = 4;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const lum = new Float32Array(cols * rows);
  const R = rng(9);
  // 一團偏右上的星雲光暈 + 一把星
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = x / cols - 0.7;
      const dy = y / rows - 0.3;
      lum[y * cols + x] = Math.exp(-(dx * dx * 10 + dy * dy * 16)) * 0.3;
    }
  }
  for (let i = 0; i < 55; i++) {
    const cx = R() * cols;
    const cy = R() * rows;
    const peak = 0.4 + Math.pow(R(), 2) * 1.6;
    const rad = 0.6 + peak * 0.9;
    for (let y = Math.max(0, Math.floor(cy - 4)); y < Math.min(rows, cy + 4); y++) {
      for (let x = Math.max(0, Math.floor(cx - 4)); x < Math.min(cols, cx + 4); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        lum[y * cols + x] += peak * Math.exp(-d2 / (rad * rad));
      }
    }
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  ctx.fillStyle = '#020306';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = lum[y * cols + x];
      if (v < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) continue;
      ctx.fillStyle = v > 1.5 ? '#ffa046' : '#9eadd1';
      ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    }
  }
}

/** 收藏的三顆主星（相對座標），標籤由頁面用 HTML 疊在同樣的位置 */
export const COLLECTION_STARS = [
  { key: 'music', x: 0.22, y: 0.3 },
  { key: 'watch', x: 0.72, y: 0.22 },
  { key: 'bookshelf', x: 0.52, y: 0.68 },
] as const;

/** 收藏：三顆主星連成一個星座，中間經過幾顆小星（跟書櫃頁的星圖同一種語言） */
export function drawCollectionSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  night(ctx, w, h);
  dust(ctx, w, h, Math.round((w * h) / 900), 13);
  const pts = COLLECTION_STARS.map((s) => ({ x: s.x * w, y: s.y * h }));
  const minor = [
    { x: 0.4 * w, y: 0.36 * h },
    { x: 0.6 * w, y: 0.44 * h },
    { x: 0.35 * w, y: 0.58 * h },
  ];
  const path = [pts[0], minor[0], minor[1], pts[1], minor[1], pts[2], minor[2], minor[0]];
  ctx.strokeStyle = 'rgba(233, 193, 122, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  const glow = (x: number, y: number, r: number, core: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, core);
    g.addColorStop(0.25, 'rgba(233, 193, 122, 0.35)');
    g.addColorStop(1, 'rgba(233, 193, 122, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const m of minor) glow(m.x, m.y, 6, 'rgba(240, 236, 228, 0.9)');
  for (const p of pts) glow(p.x, p.y, 18, 'rgba(255, 246, 226, 1)');
}

/** 關於：往下掉、終點是一顆只有一棵樹的小星球 */
export function drawAboutSky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  night(ctx, w, h);
  dust(ctx, w, h, Math.round((w * h) / 700), 29);
  // 下墜的軌跡：從右上斜斜落向星球
  const fall = ctx.createLinearGradient(w * 0.66, h * 0.05, w * 0.55, h * 0.5);
  fall.addColorStop(0, 'rgba(233, 193, 122, 0)');
  fall.addColorStop(1, 'rgba(255, 226, 178, 0.85)');
  ctx.strokeStyle = fall;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(w * 0.66, h * 0.05);
  ctx.lineTo(w * 0.55, h * 0.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 240, 214, 0.95)';
  ctx.beginPath();
  ctx.arc(w * 0.55, h * 0.5, 2, 0, Math.PI * 2);
  ctx.fill();
  // 星球：一個大圓的頂端，大氣層一圈光
  const cx = w * 0.5;
  const r = Math.max(w, h) * 0.9;
  const cy = h * 0.72 + r;
  const atmo = ctx.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.06);
  atmo.addColorStop(0, 'rgba(150, 140, 210, 0.4)');
  atmo.addColorStop(0.4, 'rgba(233, 193, 122, 0.12)');
  atmo.addColorStop(1, 'rgba(150, 140, 210, 0)');
  ctx.fillStyle = atmo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createLinearGradient(0, cy - r, 0, h);
  body.addColorStop(0, '#12131f');
  body.addColorStop(1, GROUND);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(206, 196, 240, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();
  drawTree(
    ctx,
    growTree(cx + w * 0.12, cy - Math.sqrt(r * r - (w * 0.12) ** 2) + 2, Math.min(0.42, h / 900)),
    1,
    GROUND,
    MOON,
  );
}
