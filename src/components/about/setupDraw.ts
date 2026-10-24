// 設備頁（about/Setup）圖紙上用畫布畫的東西：底下的點格與四角的對位記號、滑過零件時機殼上亮起來的那一塊、
// 拉到零件的引線、網路配線圖與智慧家庭流程圖的線、老家那台憑記憶畫的點狀草圖。只有畫圖，不碰 React。
import type { Box, Poly, ShapeKind } from './setupSheets';

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const rgba = (c: string, a: number) => `rgba(${c}, ${a.toFixed(3)})`;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 點格的間距（像素） */
const GRID = 24;

/**
 * 圖紙底下的點格與左上、右上、左下三個角的對位記號。reveal 是 0 到 1：
 * 換頁轉場的點落在左上角之後，點格從那個角一圈一圈往外鋪開
 */
export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, reveal: number) {
  ctx.clearRect(0, 0, w, h);
  const reach = reveal * Math.hypot(w, h) * 1.05;
  for (let y = GRID / 2; y < h; y += GRID) {
    for (let x = GRID / 2; x < w; x += GRID) {
      const d = Math.hypot(x, y);
      if (d > reach) continue;
      // 剛鋪到的那一圈亮一點，像墨剛印上去
      const fresh = Math.max(0, 1 - (reach - d) / 120);
      ctx.fillStyle = rgba(fresh > 0 ? AMBER : INK, fresh > 0 ? 0.15 + 0.5 * fresh : 0.13);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const mark = Math.min(1, reveal * 2.5);
  ctx.strokeStyle = rgba(INK, 0.35 * mark);
  ctx.lineWidth = 1;
  const corners: [number, number, number, number][] = [
    [0.5, 0.5, 1, 1],
    [w - 0.5, 0.5, -1, 1],
    [0.5, h - 0.5, 1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 18, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * 18);
    ctx.stroke();
  }
}

/** 一圈很淡的琥珀色光：亮起來的那一塊底下墊著 */
function halo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(AMBER, 0.22));
  g.addColorStop(1, rgba(AMBER, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** 從零件拉到機殼上那一塊的引線（虛線） */
function leader(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = rgba(AMBER, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 看不到裡面的機殼：在那一塊用虛線畫出零件的形狀（透視） */
function shape(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, kind: ShapeKind) {
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = rgba(AMBER, 0.95);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
  const fan = (fx: number, fy: number, r: number) => {
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(fx, fy, r * 0.25, 0, TAU);
    ctx.stroke();
  };
  const hline = (fy: number, x0: number, x1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, fy);
    ctx.lineTo(x1, fy);
    ctx.stroke();
  };
  if (kind === 'gpu') {
    fan(x + bw * 0.3, y + bh / 2, bh * 0.38);
    fan(x + bw * 0.7, y + bh / 2, bh * 0.38);
  } else if (kind === 'psu') {
    fan(x + bw * 0.3, y + bh / 2, bh * 0.36);
  } else if (kind === 'board') {
    ctx.strokeRect(x + bw * 0.35, y + bh * 0.12, bw * 0.22, bh * 0.2);
    for (let k = 0; k < 3; k++) hline(y + bh * (0.55 + k * 0.12), x + bw * 0.08, x + bw * 0.75);
  } else if (kind === 'tower') {
    for (let k = 1; k < 7; k++) hline(y + (bh * k) / 7, x, x + bw);
    fan(x + bw / 2, y + bh / 2, Math.min(bw, bh) * 0.32);
  } else if (kind === 'ram') {
    ctx.strokeRect(x + bw * 0.55, y, bw * 0.45, bh);
  } else if (kind === 'hdd') {
    ctx.beginPath();
    ctx.arc(x + bw * 0.5, y + bh * 0.45, Math.min(bw, bh) * 0.28, 0, TAU);
    ctx.stroke();
  } else if (kind === 'chip') {
    ctx.strokeRect(x + bw * 0.25, y + bh * 0.25, bw * 0.5, bh * 0.5);
  }
  ctx.restore();
}

/** 機殼線稿染成琥珀色的一份（玻璃側板那台用：滑過時只把多邊形裡的那一部分疊上去） */
export function tintOf(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  if (g) {
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${AMBER})`;
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/**
 * 看得到裡面的機殼：零件本身的線沿著線稿亮起來（只在那個多邊形裡疊上琥珀色的線稿），
 * 再從零件拉一條引線過去
 */
export function drawGlassPart(
  ctx: CanvasRenderingContext2D,
  caseRect: Rect,
  tint: HTMLCanvasElement | null,
  poly: Poly,
  from: { x: number; y: number },
) {
  const { x: rx, y: ry, w: rw, h: rh } = caseRect;
  const pts = poly.map(([u, v]) => [rx + u * rw, ry + v * rh] as const);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  halo(ctx, cx, cy, Math.max(rw, rh) * 0.22);
  if (tint) {
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.shadowColor = rgba(AMBER, 0.9);
    ctx.shadowBlur = 8;
    ctx.drawImage(tint, rx, ry, rw, rh);
    ctx.restore();
  }
  leader(ctx, from.x, from.y, cx, cy);
}

/** 看不到裡面的機殼（或老家那台的草圖）：虛線透視出零件的形狀，再拉一條引線 */
export function drawHiddenPart(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  box: Box,
  from: { x: number; y: number } | null,
) {
  const [u, v, bw, bh, kind] = box;
  const cx = rect.x + u * rect.w;
  const cy = rect.y + v * rect.h;
  halo(ctx, cx, cy, Math.max(bw * rect.w, bh * rect.h));
  if (kind !== 'case') shape(ctx, cx - (bw * rect.w) / 2, cy - (bh * rect.h) / 2, bw * rect.w, bh * rect.h, kind);
  if (from) leader(ctx, from.x, from.y, cx, cy);
}

/**
 * 網路配線圖的線：網際網路→路由器→一條橫的匯流排→分成四路往下。有線是實線、無線是虛線；
 * 有接著東西的（冷氣、燈、門鈴）再往右拉一條點線
 */
export function drawNetLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  buses: { x: number; dashed: boolean }[],
  ends: { x: number; y: number }[],
  dots: { x: number; y: number }[],
) {
  const line = (x1: number, y1: number, x2: number, y2: number, dash: number[]) => {
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK, 0.4);
  line(w * 0.46, h * 0.045, w * 0.46, h * 0.06, []);
  line(w * 0.46, h * 0.15, w * 0.46, h * 0.19, []);
  line(w * 0.12, h * 0.19, w * 0.8, h * 0.19, []);
  for (const b of buses) {
    const dash = b.dashed ? [4, 4] : [];
    line(b.x * w, h * 0.19, b.x * w, h * 0.24, dash);
    line(b.x * w, h * 0.32, b.x * w, h * 0.92, dash);
  }
  ctx.strokeStyle = rgba(INK, 0.5);
  for (const e of ends) line(e.x * w + 30, e.y * h, e.x * w + w * 0.12 - 34, e.y * h, [1, 4]);
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(INK, 0.8);
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x * w, d.y * h - 18, 2.5, 0, TAU);
    ctx.fill();
  }
}

/** 智慧家庭的流程：Home Assistant 那一點拉曲線到每個中樞，中樞再拉虛線到它控制的東西 */
export function drawFlowLines(
  ctx: CanvasRenderingContext2D,
  root: { x: number; y: number },
  hubs: { x: number; y: number; out: number; to: number }[],
) {
  ctx.lineWidth = 1;
  for (const hb of hubs) {
    ctx.strokeStyle = rgba(INK, 0.4);
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.bezierCurveTo(root.x + 80, root.y, hb.x - 80, hb.y, hb.x, hb.y);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(hb.out, hb.y);
    ctx.lineTo(hb.to, hb.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = `rgb(${AMBER})`;
  ctx.beginPath();
  ctx.arc(root.x, root.y, 3, 0, TAU);
  ctx.fill();
}

interface Pt {
  x: number;
  y: number;
}

/** 一道訊號：一個亮點拖一小段尾巴。上行（指令）是琥珀色、下行（回報）是白的 */
function pulse(ctx: CanvasRenderingContext2D, at: (p: number) => Pt, p: number, up: boolean) {
  const color = up ? AMBER : INK;
  for (let k = 4; k >= 0; k--) {
    const q = p - k * 0.012 * (up ? 1 : -1);
    if (q < 0 || q > 1) continue;
    const { x, y } = at(q);
    ctx.fillStyle = rgba(color, k === 0 ? 0.95 : 0.35 * (1 - k / 5));
    ctx.beginPath();
    ctx.arc(x, y, k === 0 ? 2.2 : 1.4, 0, TAU);
    ctx.fill();
  }
}

/** 沿著一串折線走到 p（0 到 1，照長度算） */
function along(pts: Pt[]) {
  const lens = pts.slice(1).map((b, i) => Math.hypot(b.x - pts[i].x, b.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  return (p: number): Pt => {
    let d = Math.min(1, Math.max(0, p)) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const k = lens[i] ? Math.min(1, d / lens[i]) : 0;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
      }
      d -= lens[i];
    }
    return pts[pts.length - 1];
  };
}

/** 三次貝茲曲線上的點（流程圖那幾條從 Home Assistant 拉出去的曲線） */
function bezier(a: Pt, b: Pt, c: Pt, d: Pt) {
  return (p: number): Pt => {
    const u = 1 - p;
    return {
      x: u * u * u * a.x + 3 * u * u * p * b.x + 3 * u * p * p * c.x + p * p * p * d.x,
      y: u * u * u * a.y + 3 * u * u * p * b.y + 3 * u * p * p * c.y + p * p * p * d.y,
    };
  };
}

/**
 * 網路配線圖上跑的訊號：從網際網路進來，經過路由器、匯流排，沿每一路往下送（上行）；
 * 每一路也有東西往回傳（下行）。有線跑得快、無線慢一點
 */
export function drawNetPulses(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  buses: { x: number; dashed: boolean }[],
  t: number,
) {
  buses.forEach((b, i) => {
    const path = along([
      { x: w * 0.46, y: h * 0.05 },
      { x: w * 0.46, y: h * 0.19 },
      { x: b.x * w, y: h * 0.19 },
      { x: b.x * w, y: h * 0.92 },
    ]);
    const period = b.dashed ? 4.2 : 2.6;
    const up = (t / period + i * 0.27) % 1;
    pulse(ctx, path, up, true);
    const down = 1 - ((t / (period * 1.3) + i * 0.41 + 0.5) % 1);
    pulse(ctx, path, down, false);
  });
}

/**
 * 智慧家庭流程圖上跑的訊號：Home Assistant（任務控制中心）的指令沿曲線送到中樞、再送到家電（上行）；
 * 有感測器的中樞（溫濕度、門鈴）把回報沿原路傳回來（下行）
 */
export function drawFlowPulses(
  ctx: CanvasRenderingContext2D,
  root: Pt,
  hubs: { x: number; y: number; out: number; to: number; reports: boolean }[],
  t: number,
) {
  hubs.forEach((hb, i) => {
    const curve = bezier(root, { x: root.x + 80, y: root.y }, { x: hb.x - 80, y: hb.y }, hb);
    const link = along([
      { x: hb.out, y: hb.y },
      { x: hb.to, y: hb.y },
    ]);
    // 一輪 3.6 秒：前一半沿曲線到中樞，後面沿虛線到家電
    const k = (t / 3.6 + i * 0.19) % 1;
    if (k < 0.55) pulse(ctx, curve, k / 0.55, true);
    else if (k > 0.6 && k < 0.92) pulse(ctx, link, (k - 0.6) / 0.32, true);
    if (hb.reports) {
      const r = (t / 5.2 + i * 0.37) % 1;
      if (r < 0.6) pulse(ctx, curve, 1 - r / 0.6, false);
    }
  });
}

/** 憑記憶畫的草圖：插圖取樣成一顆一顆的點（每隔 step 像素一顆，線越濃點越亮） */
export function sketchDots(img: HTMLImageElement, w: number, h: number, step = 3) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return [];
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const dots: { x: number; y: number; a: number; ph: number }[] = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      const a = data[(y * c.width + x) * 4 + 3] / 255;
      if (a > 0.25) dots.push({ x, y, a, ph: (x * 0.37 + y * 0.61) % TAU });
    }
  }
  return dots;
}

/** 草圖的點：每一顆都在原地微微晃（憑記憶畫的，線不會那麼確定） */
export function drawSketch(
  ctx: CanvasRenderingContext2D,
  dots: { x: number; y: number; a: number; ph: number }[],
  at: Rect,
  t: number,
) {
  for (const d of dots) {
    const jx = Math.sin(t * 1.3 + d.ph) * 0.6;
    const jy = Math.cos(t * 1.1 + d.ph * 1.7) * 0.6;
    ctx.fillStyle = rgba(INK, 0.75 * d.a);
    ctx.fillRect(at.x + d.x + jx, at.y + d.y + jy, 1.3, 1.3);
  }
}
