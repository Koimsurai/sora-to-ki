// 朋友頁的軌道：這個站在中心，每位朋友各在自己的軌道上繞，外面再留兩條空的軌道給下一位。
// 剛更新的朋友有一道訊號從他那顆星傳回中心；越久沒更新的星越暗。
// 這裡只畫點與線，名字、網址、最新一篇是疊在上面的 DOM（字要能點、要被裁字器看到）。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;
/** 軌道往左上傾斜的角度（弧度） */
const TILT = -0.18;
/** 最內圈與最外圈的軌道半徑（相對 R） */
const K_IN = 0.42;
const K_OUT = 1;
/** 多少天內有新文章算「剛更新」：有訊號傳回中心 */
export const FRESH_DAYS = 14;
/** 多少天沒更新就暗到底 */
const DIM_DAYS = 180;

export interface SkyStar {
  id: string;
  /** 最新一篇距今幾天；沒有 feed 或抓不到是 null */
  days: number | null;
}

export interface Placed {
  x: number;
  y: number;
  /** 這顆星長出來了沒（0–1），字跟著它淡入 */
  appear: number;
}

export interface SkyFrame {
  w: number;
  h: number;
  t: number;
  /** 換頁進來後軌道從內往外長出來的進度（0–1） */
  grow: number;
  /** 換頁離開時軌道收回中心的進度（0–1） */
  erase: number;
  /** 滑鼠滑到的那顆（沒有是 -1） */
  near: number;
  /** 表單裡打了名字：下一條空軌道上出現的預覽星的亮度（0–1） */
  preview: number;
}

/** 字串 → 0–1 的固定亂數（同一位朋友每次都在同一個起始角度） */
const hash01 = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return (h >>> 0) / 4294967296;
};

const brightnessOf = (days: number | null) => (days === null ? 0.45 : Math.max(0.35, Math.min(1, 1 - days / DIM_DAYS)));

/** 窄螢幕（手機直拿）的寬度門檻：寬度不夠，軌道改成比較圓、不那麼扁 */
const NARROW_PX = 600;

export function frameOf(w: number, h: number) {
  const narrow = w < NARROW_PX;
  return {
    cx: w * 0.5,
    cy: h * 0.5,
    R: narrow ? Math.min(w * 0.44, h * 0.46) : Math.min(w * 0.46, h * 0.78),
    squash: narrow ? 0.85 : 0.6,
  };
}

export function createSky(stars: SkyStar[]) {
  // 朋友一人一條，外面再兩條空的（第一條給表單的預覽星）
  const rings = stars.length + 2;
  const kOf = (j: number) => K_IN + ((K_OUT - K_IN) * j) / Math.max(1, rings - 1);
  const orbits = stars.map((s, i) => {
    const k = kOf(i);
    return { k, phase: hash01(s.id) * TAU, speed: 0.016 / Math.pow(k, 1.5), lum: brightnessOf(s.days) };
  });
  const previewK = kOf(stars.length);

  const at = (w: number, h: number, k: number, a: number): [number, number] => {
    const { cx, cy, R, squash } = frameOf(w, h);
    const x = Math.cos(a) * R * k * 1.05;
    const y = Math.sin(a) * R * k * squash;
    return [cx + x * Math.cos(TILT) - y * Math.sin(TILT), cy + x * Math.sin(TILT) + y * Math.cos(TILT)];
  };

  /** 每條軌道長出來的進度：從內往外一條接一條 */
  const ringGrow = (grow: number, j: number) => Math.max(0, Math.min(1, grow * (rings + 1) - j));

  const angleOf = (i: number, t: number) => orbits[i].phase + t * orbits[i].speed;

  return {
    previewAt: (w: number, h: number, t: number) => at(w, h, previewK, 4.6 + t * 0.012),

    positions: (w: number, h: number, t: number) => orbits.map((o, i) => at(w, h, o.k, angleOf(i, t))),

    draw(ctx: CanvasRenderingContext2D, f: SkyFrame): Placed[] {
      const { w, h, t, grow, erase, near, preview } = f;
      const { cx, cy } = frameOf(w, h);
      const fade = 1 - erase;
      // 離開時軌道往中心收
      const shrink = 1 - 0.7 * erase;
      ctx.clearRect(0, 0, w, h);

      // 軌道：朋友的是細點線，空的更淡、間隔更開
      const orbit = (k: number, from: number, span: number, alpha: number, dash: number[]) => {
        if (span <= 0 || alpha <= 0) return;
        ctx.setLineDash(dash);
        ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
        ctx.beginPath();
        const n = Math.max(8, Math.round(160 * span));
        for (let s = 0; s <= n; s++) {
          const [x, y] = at(w, h, k * shrink, from - (s / n) * span * TAU);
          if (s) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      orbits.forEach((o, i) => orbit(o.k, angleOf(i, t), ringGrow(grow, i), 0.24 * fade, [1, 4]));
      for (let j = stars.length; j < rings; j++) {
        const lift = j === stars.length ? preview * 0.16 : 0;
        orbit(kOf(j), 4.6 + t * 0.012, ringGrow(grow, j), (0.09 + lift) * fade, [2, 6]);
      }

      // 中心：這個站（琥珀點）
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
      cg.addColorStop(0, `rgba(${AMBER}, ${0.55 * fade})`);
      cg.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${fade})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.6, 0, TAU);
      ctx.fill();

      const placed = orbits.map((o, i) => {
        const [x0, y0] = at(w, h, o.k, angleOf(i, t));
        const x = cx + (x0 - cx) * shrink;
        const y = cy + (y0 - cy) * shrink;
        const appear = ringGrow(grow, i) * fade;
        const s = stars[i];
        // 剛更新的朋友：一道訊號從他那裡傳回中心
        if (s.days !== null && s.days <= FRESH_DAYS && appear > 0) {
          const p = (t * 0.28 + i * 0.37) % 1;
          ctx.strokeStyle = `rgba(${INK}, ${0.12 * appear})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(cx, cy);
          ctx.stroke();
          const sx = x + (cx - x) * p;
          const sy = y + (cy - y) * p;
          const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8);
          sg.addColorStop(0, `rgba(${INK}, ${0.9 * Math.sin(p * Math.PI) * appear})`);
          sg.addColorStop(1, `rgba(${INK}, 0)`);
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(sx, sy, 8, 0, TAU);
          ctx.fill();
        }
        const fresh = s.days !== null && s.days <= FRESH_DAYS;
        const pulse = fresh ? 0.6 + 0.4 * Math.sin(t * 2.4 + i) : 0.45;
        const hg = ctx.createRadialGradient(x, y, 0, x, y, 16);
        hg.addColorStop(0, `rgba(${INK}, ${0.35 * pulse * o.lum * appear})`);
        hg.addColorStop(1, `rgba(${INK}, 0)`);
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${INK}, ${o.lum * appear})`;
        ctx.beginPath();
        ctx.arc(x, y, i === near ? 4.2 : 3.2, 0, TAU);
        ctx.fill();
        return { x, y, appear };
      });

      if (preview > 0.02) {
        const [x, y] = at(w, h, previewK * shrink, 4.6 + t * 0.012);
        ctx.fillStyle = `rgba(${INK}, ${preview * fade})`;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
      }
      return placed;
    },
  };
}

/** 對接插圖的切法（public/illustrations/docking.webp，880×585）：在兩艘船之間切開，
 *  兩半慢慢靠近又退開；RSS 的點從右邊那艘的艙口走到左邊那艘的艙口 */
const DOCK = { IW: 880, IH: 585, CUT: 0.511, LEFT_PORT: 0.443, RIGHT_PORT: 0.585, AXIS: 0.5 } as const;

export function drawDock(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, t: number) {
  const { IW, IH, CUT, LEFT_PORT, RIGHT_PORT, AXIS } = DOCK;
  ctx.clearRect(0, 0, w, h);
  if (!img.complete || !img.naturalWidth) return;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const sc = Math.min(w / IW, h / IH);
  const dw = IW * sc;
  const dh = IH * sc;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  const d = (0.5 - 0.5 * Math.cos(t * 0.5)) * 9;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(img, 0, 0, sw * CUT, sh, ox + d, oy, dw * CUT, dh);
  ctx.drawImage(img, sw * CUT, 0, sw * (1 - CUT), sh, ox + dw * CUT - d, oy, dw * (1 - CUT), dh);
  ctx.globalAlpha = 1;
  const ax = ox + dw * LEFT_PORT + d;
  const bx = ox + dw * RIGHT_PORT - d;
  const y = oy + dh * AXIS;
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.6 + k / 3) % 1;
    ctx.fillStyle = `rgba(${INK}, ${0.8 * Math.sin(p * Math.PI)})`;
    ctx.fillRect(Math.round(bx + (ax - bx) * p) - 1, y - 1, 2, 2);
  }
}
