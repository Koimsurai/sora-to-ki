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
  a: number;
  r: number;
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

/** 飛進來的那條線變成彗尾的第一筆：花這麼久從飛行路線彎成弧線 */
export const MORPH_MS = 650;
/** 彗尾從彗核往下長到畫面底的時間 */
export const REVEAL_MS = 900;

export interface CometFrame {
  /** 容器左上角的畫面座標 */
  origin: Pt;
  /** 滑到哪一則上（版面座標的高度），那附近的塵埃亮一點 */
  hoverY: number | null;
  /** 彗尾目前長到哪裡（版面座標）；Infinity = 全部 */
  revealY: number;
  /** 飛進來的那條線（畫面座標，已經反過來：第一個點是彗核），以及從開始彎過去多久了 */
  morph: { trail: Pt[]; elapsed: number } | null;
}

export function createComet(tailLength: number, narrow: boolean) {
  // 窄螢幕的彗尾只有三分之一寬，點數照比例減，不然擠成一條實心的柱子
  const count = Math.min(6000, Math.max(1500, tailLength * 1.6)) * (narrow ? 0.4 : 1);
  const dust: Dust[] = Array.from({ length: Math.round(count) }, () => ({
    u: Math.pow(Math.random(), 1.35),
    side: gauss(),
    j: Math.random(),
  }));
  const coma: Coma[] = Array.from({ length: 280 }, () => ({
    a: Math.random() * TAU,
    r: Math.abs(gauss()) * 0.55,
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

    // 彗核：外面一團亮的彗髮，往飛行方向（上方）偏一點
    const hx = arcX(L, L.y0) + ox;
    const hy = L.y0 + oy - 8;
    if (hy > -60 && hy < h + 60) {
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 54);
      glow.addColorStop(0, `rgba(${AMBER}, 0.24)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hx, hy, 54, 0, TAU);
      ctx.fill();
      for (const c of coma) {
        const r = c.r * 38;
        const a = (1 - c.r) * (0.35 + 0.5 * Math.sin(t * 2 + c.j * 9) ** 2);
        if (a < 0.05) continue;
        ctx.fillStyle = `rgba(${INK}, ${a})`;
        ctx.fillRect(snap(hx + Math.cos(c.a) * r), snap(hy + Math.sin(c.a) * r * 0.85), 2, 2);
      }
    }

    // 飛進來的那條線：從飛行路線彎成彗尾的弧線，邊彎邊散成塵埃
    if (f.morph) {
      const { trail, elapsed } = f.morph;
      const e = easeOut(clamp01(elapsed / MORPH_MS));
      const n = trail.length;
      if (n > 1) {
        let len = 0;
        for (let i = 1; i < n; i++) len += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
        const reach = Math.min(len, 520);
        ctx.strokeStyle = `rgba(${INK}, ${0.7 * (1 - e * e)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const y = L.y0 + (i / (n - 1)) * reach;
          const tx = arcX(L, y) + ox;
          const ty = y + oy;
          const x = trail[i].x + (tx - trail[i].x) * e;
          const yy = trail[i].y + (ty - trail[i].y) * e;
          if (i) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
    }
  }

  return { draw };
}
