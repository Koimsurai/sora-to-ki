// 碎念頁的彗星（blog/Thinking）：一條往下左右擺的大弧線，彗核是最新那一則，碎念沿著彗尾排開。
// 這裡只有幾何與畫圖，不碰 React：版面（每一則落在弧線的哪裡、字放哪一邊）與每一幀的彗尾。
//
// 座標分兩種：版面座標以頁面容器左上角為原點（捲動不變），畫面座標是視窗座標。
// 畫布固定在視窗上，每一幀把版面座標加上容器目前的位置（origin）。

import type { Pt } from '@/store/pageTransition';

export const AMBER = '233, 193, 122';
export const INK = '241, 236, 227';

/** 弧線一個來回的高度：大約一個半螢幕，捲著看會左右擺 */
const PERIOD = 1300;
const TAU = Math.PI * 2;

export interface ArcLayout {
  /** 弧線中心與擺幅；窄螢幕幾乎是直的、貼著左邊 */
  cx: number;
  amp: number;
  /** 彗核的高度（最新那一則） */
  y0: number;
  /** 彗尾畫到哪裡 */
  yEnd: number;
  narrow: boolean;
  /** 每一則的點：高度與字放在哪一邊 */
  posts: { y: number; left: boolean }[];
  /** 更舊的只剩一個點 */
  ghosts: number[];
  /** 結尾那行字的位置 */
  end: { y: number; left: boolean };
  height: number;
}

export const arcX = (L: Pick<ArcLayout, 'cx' | 'amp' | 'y0'>, y: number) =>
  L.cx + L.amp * Math.sin(((y - L.y0) / PERIOD) * TAU + 0.9);

/** 窄於這個寬度就收成貼左的直線，字一律在右邊 */
export const NARROW_PX = 760;
const GAP = 230;
const GAP_NARROW = 210;
const GHOST_STEP = 30;

/**
 * 排版：從彗核開始往下，每一則之間至少一個固定間距，字太長就再拉開。
 * 字放在「彗尾往下會彎過去的另一邊」，尾巴就不會穿過字
 */
export function layoutArc(width: number, top: number, heights: number[], ghostCount: number): ArcLayout {
  const narrow = width < NARROW_PX;
  const base = {
    cx: narrow ? 30 : width * 0.5,
    amp: narrow ? 18 : Math.min(width * 0.22, 330),
    y0: top,
  };
  const sideAt = (y: number) => !narrow && arcX(base, y + 160) > arcX(base, y);
  const gap = narrow ? GAP_NARROW : GAP;
  const posts: ArcLayout['posts'] = [];
  let y = top;
  heights.forEach((h, i) => {
    posts.push({ y, left: sideAt(y) });
    if (i < heights.length - 1) y += Math.max(gap, h + 64);
  });
  const lastH = heights.at(-1) ?? 0;
  const gy0 = y + Math.max(gap * 0.75, lastH + 48);
  const ghosts = Array.from({ length: ghostCount }, (_, k) => gy0 + k * GHOST_STEP);
  const endY = (ghosts.at(-1) ?? y + lastH) + (ghosts.length ? 90 : 120);
  const height = endY + 140;
  return { ...base, yEnd: height - 30, narrow, posts, ghosts, end: { y: endY, left: sideAt(endY) }, height };
}

interface Dust {
  u: number;
  side: number;
  j: number;
}
interface Coma {
  /** 在彗核後面多遠（0 是彗核，1 是彗髮的尾端） */
  u: number;
  /** 往兩側偏多少（-1 到 1，靠中間的多） */
  s: number;
  j: number;
}

/** 近似常態分布：四個均勻亂數相加，夠用而且不會有長尾把點甩到很遠 */
const gauss = () => {
  let u = 0;
  for (let k = 0; k < 4; k++) u += Math.random();
  return (u - 2) / 1.15;
};

const snap = (v: number) => Math.round(v / 3) * 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 飛進來的那條線散成塵埃的時間 */
export const DISSOLVE_MS = 750;
/** 彗尾從彗核往下長到畫面底的時間 */
export const REVEAL_MS = 900;
/** 換頁轉場的「收」：彗尾縮回彗核的時間 */
export const RETRACT_MS = 380;
/** 點飛進來時，最後沿著彗尾往上飛的那一段最長多長（實際是彗核到畫面底） */
export const APPROACH_PX = 640;

/** 彗星往哪裡飛（版面座標的單位向量）：沿著弧線往上 */
export function headDirection(L: ArcLayout): Pt {
  const dx = arcX(L, L.y0 - 6) - arcX(L, L.y0);
  const n = Math.hypot(dx, 6);
  return { x: dx / n, y: -6 / n };
}

/** 決定性的亂數（同一個 k 每一幀都一樣），讓散開的塵埃不會每幀亂跳 */
const hash = (k: number) => {
  const v = Math.sin(k * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export interface CometFrame {
  /** 容器左上角的畫面座標 */
  origin: Pt;
  /** 滑到哪一則上（版面座標的高度），那附近的塵埃亮一點 */
  hoverY: number | null;
  /** 彗尾目前長到哪裡（版面座標）；Infinity = 全部 */
  revealY: number;
  /** 飛進來的那條線（版面座標）與它散開多久了：線斷成一粒一粒、往兩側散開，跟彗尾混在一起 */
  dissolve: { trail: Pt[]; elapsed: number } | null;
  /** 彗髮的大小（0 到 1）：換頁收的時候跟著縮回彗核 */
  headScale: number;
}

export function createComet(tailLength: number, narrow: boolean) {
  // 窄螢幕的彗尾只有三分之一寬，點數照比例減，不然擠成一條實心的柱子
  const count = Math.min(6000, Math.max(1500, tailLength * 1.6)) * (narrow ? 0.4 : 1);
  const dust: Dust[] = Array.from({ length: Math.round(count) }, () => ({
    u: Math.pow(Math.random(), 1.35),
    side: gauss(),
    j: Math.random(),
  }));
  const coma: Coma[] = Array.from({ length: 320 }, () => ({
    u: Math.pow(Math.random(), 2.2),
    s: Math.max(-1, Math.min(1, gauss() / 1.6)),
    j: Math.random(),
  }));

  /** dt 是秒；0 代表不前進（減少動態時只畫靜態的一張） */
  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    L: ArcLayout,
    f: CometFrame,
    dt: number,
    t: number,
  ) {
    ctx.clearRect(0, 0, w, h);
    const { x: ox, y: oy } = f.origin;
    const span = L.yEnd - L.y0;

    // 彗尾：塵埃從彗核一路往下流，越往後散得越開、越淡；尾巴往弧線外側變寬
    for (const d of dust) {
      d.u += dt * (0.006 + 0.02 * d.u);
      if (d.u > 1) {
        d.u = Math.random() * 0.03;
        d.side = gauss();
      }
      const y = L.y0 + d.u * span;
      if (y > f.revealY) continue;
      const sy = y + oy;
      if (sy < -8 || sy > h + 8) continue;
      const width = 6 + (L.narrow ? 16 : 46) * Math.sqrt(d.u);
      const x = arcX(L, y) + d.side * width;
      let a = Math.pow(1 - d.u, 1.2) * (0.3 + 0.7 * d.j) * 0.8;
      if (f.hoverY !== null) a *= 1 + 1.4 * Math.exp(-(((y - f.hoverY) / 50) ** 2));
      // 剛長出來的那一段先淡一點，看起來是長出來的而不是切出來的
      if (f.revealY !== Infinity) a *= clamp01((f.revealY - y) / 120);
      if (a < 0.03) continue;
      ctx.fillStyle = `rgba(${INK}, ${Math.min(1, a)})`;
      ctx.fillRect(snap(x) + ox, snap(y) + oy, 2, 2);
    }

    // 彗核：最新那一則的點（DOM 的 .mo-dot.is-new，轉場的點也落在這裡）。彗髮是一個往後張開的
    // 拋物面，開口朝彗尾：前緣貼著彗核、越往後越寬越淡，直接接進彗尾的塵埃
    const hx = arcX(L, L.y0) + ox;
    const hy = L.y0 + oy;
    const k = f.headScale;
    if (k > 0.01 && hy > -80 && hy < h + 80) {
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 30 * k);
      glow.addColorStop(0, `rgba(${AMBER}, 0.3)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hx, hy, 30 * k, 0, TAU);
      ctx.fill();
      const fwd = headDirection(L);
      const side = { x: -fwd.y, y: fwd.x };
      for (const c of coma) {
        // 彗髮包著彗核：前緣在彗核前面一點，最寬、最亮的地方就在彗核上，往後收窄接進彗尾
        const back = (-9 + 58 * c.u) * k;
        const spread = (7 + 12 * Math.sqrt(c.u)) * k;
        const a = Math.pow(1 - c.u, 1.4) * (0.4 + 0.45 * Math.sin(t * 1.6 + c.j * 9) ** 2);
        if (a < 0.04) continue;
        ctx.fillStyle = `rgba(${INK}, ${a.toFixed(3)})`;
        ctx.fillRect(
          hx - fwd.x * back + side.x * c.s * spread - 0.75,
          hy - fwd.y * back + side.y * c.s * spread - 0.75,
          1.5,
          1.5,
        );
      }
    }

    // 飛進來的那條線散成塵埃：線先淡掉，同一個位置冒出一粒一粒的塵埃往兩側散開、慢慢熄掉
    if (f.dissolve) {
      const { trail, elapsed } = f.dissolve;
      const e = clamp01(elapsed / DISSOLVE_MS);
      const lineAlpha = 0.75 * (1 - clamp01(e * 3));
      if (lineAlpha > 0.01 && trail.length > 1) {
        ctx.strokeStyle = `rgba(${INK}, ${lineAlpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        trail.forEach((p, i) => (i ? ctx.lineTo(p.x + ox, p.y + oy) : ctx.moveTo(p.x + ox, p.y + oy)));
        ctx.stroke();
      }
      const spread = easeOut(e);
      for (let i = 1; i < trail.length; i += 2) {
        const p = trail[i];
        const q = trail[i - 1];
        const seg = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const nx = -(p.y - q.y) / seg;
        const ny = (p.x - q.x) / seg;
        for (let j = 0; j < 2; j++) {
          const r1 = hash(i * 7.1 + j * 3.3);
          const r2 = hash(i * 1.7 + j * 9.1);
          const a = Math.pow(1 - e, 1.3) * (0.35 + 0.5 * r2) * Math.min(1, e * 6);
          if (a < 0.03) continue;
          const off = (r1 - 0.5) * 2 * (1 + 16 * spread);
          ctx.fillStyle = `rgba(${INK}, ${a.toFixed(3)})`;
          ctx.fillRect(p.x + ox + nx * off - 0.75, p.y + oy + ny * off + 10 * spread * r2 - 0.75, 1.5, 1.5);
        }
      }
    }
  }

  return { draw };
}
