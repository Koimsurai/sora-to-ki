// 首頁「天空之窗」裡的天空：每一扇窗是那一區真正的天空縮影，而且是活的：
//   手記：星軌繞著天極轉（hover 時轉快，像快轉的長曝光），地平線上一棵樹
//   碎念：像素抖動的星雲與土星（琥珀色的點陣），星星明滅，偶爾一顆「閃過」
//   收藏：三顆主星的星座線一筆一筆連起來，主星呼吸
//   關於：一道光不斷往下掉，落進小星球的大氣層裡
// 每扇窗分三層：back（靜態，畫一次）→ frame（每幀）→ front（靜態，畫一次）。
// 靜態的部分快取在離屏 canvas，每幀只重畫會動的那一層。座標都是 CSS 像素。
// 純 2D canvas——首頁已經有一個 3D 場景在跑，不再多開。
import { drawTree, growTree, ridgeNoise, rng } from './horizon';

type Ctx = CanvasRenderingContext2D;

export interface WindowSky {
  back?: (ctx: Ctx, w: number, h: number) => void;
  /** t：窗出現後經過的秒數（hover 時走得比較快）；hover：滑鼠在窗上 */
  frame?: (ctx: Ctx, w: number, h: number, t: number, hover: boolean) => void;
  front?: (ctx: Ctx, w: number, h: number) => void;
  /** 動態層的幀率上限 */
  fps: number;
  /** hover 時時間走多快 */
  hoverSpeed: number;
}

const NIGHT_TOP = '#05060c';
const NIGHT_LOW = '#0e0f1d';
const GROUND = '#04050a';
const MOON = 'rgba(176, 168, 220, 0.35)';

function night(ctx: Ctx, w: number, h: number, horizon = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, h * horizon);
  g.addColorStop(0, NIGHT_TOP);
  g.addColorStop(1, NIGHT_LOW);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function dust(ctx: Ctx, w: number, h: number, n: number, seed: number) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = 0.15 + Math.pow(R(), 3) * 0.75;
    ctx.fillStyle = `rgba(226, 228, 245, ${a.toFixed(3)})`;
    const s = R() < 0.06 ? 1.6 : 1;
    ctx.fillRect(R() * w, R() * h, s, s);
  }
}

function ridgeLine(ctx: Ctx, w: number, h: number, f: (x: number) => number, fill: string, rim: string) {
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
}

function glow(ctx: Ctx, x: number, y: number, r: number, core: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, core);
  g.addColorStop(0.25, 'rgba(233, 193, 122, 0.35)');
  g.addColorStop(1, 'rgba(233, 193, 122, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── 手記：星軌與樹 ──
const TRAILS = (() => {
  const R = rng(3);
  return Array.from({ length: 340 }, () => ({
    r: Math.sqrt(R()),
    a0: R() * Math.PI * 2,
    len: 0.18 + R() * 0.22,
    b: Math.pow(R(), 2.2),
    warm: R() < 0.18,
  }));
})();

export const notesSky: WindowSky = {
  fps: 30,
  hoverSpeed: 8,
  back: (ctx, w, h) => night(ctx, w, h, 0.8),
  frame(ctx, w, h, t) {
    const pole = { x: w * 0.16, y: -h * 0.3 };
    const far = Math.hypot(w, h) * 1.25;
    const spin = t * 0.03;
    for (const s of TRAILS) {
      ctx.strokeStyle = s.warm
        ? `rgba(255, 214, 160, ${0.12 + s.b * 0.5})`
        : `rgba(206, 216, 255, ${0.1 + s.b * 0.55})`;
      ctx.lineWidth = 0.6 + s.b * 0.9;
      ctx.beginPath();
      ctx.arc(pole.x, pole.y, 30 + s.r * far, s.a0 + spin, s.a0 + spin + s.len);
      ctx.stroke();
    }
  },
  front(ctx, w, h) {
    const farN = ridgeNoise(11);
    const nearN = ridgeNoise(37);
    const farY = (x: number) => h * 0.74 - (farN((x / w) * 2.6) * 0.5 + 0.35) * h * 0.12;
    const nearY = (x: number) => h * 0.86 - (nearN((x / w) * 2 + 5) * 0.5 + 0.4) * h * 0.08;
    ridgeLine(ctx, w, h, farY, '#11121f', 'rgba(196, 186, 232, 0.18)');
    ridgeLine(ctx, w, h, nearY, GROUND, 'rgba(233, 193, 122, 0.22)');
    const tx = w * 0.8;
    drawTree(ctx, growTree(tx, nearY(tx) + 2, Math.min(0.8, h / 420)), 1, GROUND, MOON);
  },
};

// ── 碎念：像素抖動 ──
// 跟畫布上 D 那張一樣：一團星雲、一顆土星，整個畫面用 4×4 Bayer 矩陣二值化成點陣。
// 土星是琥珀色的點、星雲與環是冷白的點，大片的黑留著。星雲慢慢飄、星星各自明滅，
// 偶爾有一顆「閃過」：一瞬間亮成琥珀色再暗回去，就是這一區的概念（腦海中閃過的瞬間）。
const CELL = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MOMENT_STARS = (() => {
  const R = rng(9);
  return Array.from({ length: 60 }, () => ({
    x: R(),
    y: R(),
    peak: 0.4 + Math.pow(R(), 3) * 1.1,
    phase: R() * Math.PI * 2,
    speed: 0.4 + R() * 1.2,
  }));
})();
const NEBULA = (() => {
  const R = rng(17);
  return Array.from({ length: 14 }, () => ({
    x: 0.08 + R() * 0.32,
    y: 0.08 + R() * 0.4,
    r: 0.08 + R() * 0.14,
    a: 0.25 + R() * 0.35,
    drift: (R() - 0.5) * 0.02,
  }));
})();
/** 每隔幾秒閃一顆 */
const FLASH_EVERY = 2.6;
const LIGHT = (() => {
  const v = [-0.8, -0.45, 0.4];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

export const momentsSky: WindowSky = {
  fps: 12,
  hoverSpeed: 2.5,
  back(ctx, w, h) {
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, w, h);
  },
  frame(ctx, w, h, t) {
    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);
    // 土星：右上（下半部留給文字），環傾斜
    const sx = 0.68 * w;
    const sy = 0.38 * h;
    const sr = Math.min(w, h) * 0.17;
    const tilt = -0.32;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const k = Math.floor(t / FLASH_EVERY);
    const flashing = (k * 37) % MOMENT_STARS.length;
    const ft = (t - k * FLASH_EVERY) / 0.9;
    const flash = ft < 1 ? Math.sin(Math.PI * Math.min(1, ft * 1.6)) * (1 - ft) * 3 : 0;
    const stars = MOMENT_STARS.map((s, i) => ({
      x: s.x * w,
      y: s.y * h,
      v: s.peak * (0.75 + 0.25 * Math.sin(t * s.speed + s.phase)) + (i === flashing ? flash : 0),
    }));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = (x + 0.5) * CELL;
        const py = (y + 0.5) * CELL;
        let amber = false;
        // 星雲：幾團光暈疊起來之後用飽和曲線封頂（最亮 0.8），點陣才有疏密，核心不會整片填滿
        let haze = 0;
        for (const n of NEBULA) {
          const dx = px / w - n.x - n.drift * t;
          const dy = py / h - n.y;
          haze += n.a * Math.exp(-(dx * dx + dy * dy) / (n.r * n.r));
        }
        // 雲紋：兩組不同方向的波疊起來，星雲才有一絲一絲的結構
        const wisp = 0.65 + 0.35 * Math.sin(px * 0.045 + py * 0.02 + t * 0.2) * Math.sin(py * 0.06 - px * 0.015);
        let lum = 0.8 * (1 - Math.exp(-haze * 1.4)) * wisp;
        // 環（局部座標：轉正、把扁的橢圓拉回圓）
        const rx = px - sx;
        const ry = py - sy;
        const ux = rx * ct + ry * st;
        const uy = (-rx * st + ry * ct) / 0.3;
        const rho = Math.hypot(ux, uy) / sr;
        const inPlanet = rx * rx + ry * ry < sr * sr;
        const ring = rho > 1.45 && rho < 1.95 && Math.abs(rho - 1.7) > 0.05;
        if (inPlanet && !(ring && uy > 0)) {
          // 球面的明暗：從左上方打光
          const nx = rx / sr;
          const ny = ry / sr;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          // 亮度留在 0–1 之間：明暗靠點的疏密表現（亮的那側密、背光那側疏），不是整片填滿
          lum = 0.09 + 0.75 * Math.pow(Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]), 1.4);
          amber = true;
        } else if (ring) {
          lum = Math.max(lum, 0.5 - Math.abs(rho - 1.7) * 0.6);
        }
        // 星：琥珀色只留給「閃過」的那一顆最亮的瞬間
        let star = 0;
        for (const s of stars) {
          const d2 = (px - s.x) ** 2 + (py - s.y) ** 2;
          if (d2 < 400) star += s.v * Math.exp(-d2 / (30 + s.v * 40));
        }
        lum += star;
        if (lum < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) continue;
        ctx.fillStyle = amber ? '#e9b864' : star > 1.3 ? '#ffa046' : lum > 0.9 ? '#e3e9ff' : '#9eadd1';
        ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      }
    }
  },
};

// ── 收藏：星座 ──
/** 三顆主星（相對座標），標籤由頁面用 HTML 疊在同樣的位置 */
export const COLLECTION_STARS = [
  { key: 'music', x: 0.22, y: 0.3 },
  { key: 'watch', x: 0.72, y: 0.22 },
  { key: 'bookshelf', x: 0.52, y: 0.68 },
] as const;
const MINOR = [
  { x: 0.4, y: 0.36 },
  { x: 0.6, y: 0.44 },
  { x: 0.35, y: 0.58 },
];
const [M0, M1, M2] = COLLECTION_STARS;
const PATH = [M0, MINOR[0], MINOR[1], M1, MINOR[1], M2, MINOR[2], MINOR[0]];

export const collectionSky: WindowSky = {
  fps: 30,
  hoverSpeed: 1,
  back(ctx, w, h) {
    night(ctx, w, h);
    dust(ctx, w, h, Math.round((w * h) / 900), 13);
  },
  frame(ctx, w, h, t, hover) {
    // 連線一筆一筆畫出來（窗出現後 2 秒內連完），hover 時線變亮
    const segs = PATH.length - 1;
    const drawn = Math.min(segs, (t / 2) * segs);
    ctx.strokeStyle = `rgba(233, 193, 122, ${hover ? 0.6 : 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PATH[0].x * w, PATH[0].y * h);
    for (let i = 1; i <= Math.ceil(drawn); i++) {
      const a = PATH[i - 1];
      const b = PATH[i];
      const k = Math.min(1, drawn - (i - 1));
      ctx.lineTo((a.x + (b.x - a.x) * k) * w, (a.y + (b.y - a.y) * k) * h);
    }
    ctx.stroke();
    for (const m of MINOR) glow(ctx, m.x * w, m.y * h, 6, 'rgba(240, 236, 228, 0.9)');
    COLLECTION_STARS.forEach((s, i) => {
      const breathe = 1 + 0.18 * Math.sin(t * 1.3 + i * 2.1);
      glow(ctx, s.x * w, s.y * h, 18 * breathe * (hover ? 1.2 : 1), 'rgba(255, 246, 226, 1)');
    });
  },
};

// ── 關於：往下掉 ──
const FALL_EVERY = 3.2;

function planet(w: number, h: number) {
  const r = Math.max(w, h) * 0.9;
  return { cx: w * 0.5, cy: h * 0.72 + r, r };
}

export const aboutSky: WindowSky = {
  fps: 30,
  hoverSpeed: 2,
  back(ctx, w, h) {
    night(ctx, w, h);
    dust(ctx, w, h, Math.round((w * h) / 700), 29);
  },
  frame(ctx, w, h, t) {
    // 一道光從右上方斜斜落下，碰到大氣層時閃一下；每一次落點都不一樣
    const k = Math.floor(t / FALL_EVERY);
    const p = (t - k * FALL_EVERY) / 1.6;
    const R = rng(100 + k);
    const sx = w * (0.55 + R() * 0.3);
    const ex = w * (0.42 + R() * 0.2);
    const { cx, cy, r } = planet(w, h);
    const ey = cy - Math.sqrt(Math.max(0, r * r - (ex - cx) ** 2));
    if (p < 1) {
      const e = p * p;
      const hx = sx + (ex - sx) * e;
      const hy = -10 + (ey + 10) * e;
      const back = Math.max(0, e - 0.25);
      const tx = sx + (ex - sx) * back;
      const ty = -10 + (ey + 10) * back;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, 'rgba(233, 193, 122, 0)');
      g.addColorStop(1, 'rgba(255, 226, 178, 0.9)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 240, 214, 0.95)';
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (p < 1.5) {
      const q = (p - 1) / 0.5;
      glow(ctx, ex, ey, 10 + q * 30, `rgba(255, 236, 200, ${(0.8 * (1 - q)).toFixed(3)})`);
    }
  },
  front(ctx, w, h) {
    const { cx, cy, r } = planet(w, h);
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
    const tx = cx + w * 0.12;
    drawTree(ctx, growTree(tx, cy - Math.sqrt(r * r - (w * 0.12) ** 2) + 2, Math.min(0.42, h / 900)), 1, GROUND, MOON);
  },
};
