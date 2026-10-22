// 首頁「天空之窗」裡的天空：每一扇窗是那一區真正的天空縮影，而且是活的：
//   手記：星軌繞著天極轉（hover 時轉快，像快轉的長曝光），地平線上一棵樹
//   碎念：像素抖動的星雲與土星（琥珀色的點陣），星星明滅，偶爾一顆「閃過」
//   收藏：三顆主星的星座線一筆一筆連起來，主星呼吸
//   關於：一顆藍色火球劃過、把整片天空照亮，然後沒入小星球的地平線
// 每扇窗分三層：back（靜態，畫一次）→ frame（每幀）→ front（靜態，畫一次）。
// 靜態的部分快取在離屏 canvas，每幀只重畫會動的那一層。座標都是 CSS 像素。
// 純 2D canvas——首頁已經有一個 3D 場景在跑，不再多開。
import { drawTree, growTree, ridgeNoise, rng } from './horizon';
import { createDitherScene } from './ditherScene';

type Ctx = CanvasRenderingContext2D;

export interface WindowSky {
  back?: (ctx: Ctx, w: number, h: number) => void;
  /** t：窗出現後經過的秒數（hover 時走得比較快）；hover：滑鼠在窗上 */
  frame?: (ctx: Ctx, w: number, h: number, t: number, hover: boolean) => void;
  front?: (ctx: Ctx, w: number, h: number) => void;
  /** 畫在 front 之上（每幀）：會照亮整個畫面的東西，例如關於窗那顆火球的閃光 */
  over?: (ctx: Ctx, w: number, h: number, t: number, hover: boolean) => void;
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

// ── 碎念：點陣的星雲與土星（lib/ditherScene，跟碎念頁同一套）──
let momentsScene: { w: number; h: number; scene: ReturnType<typeof createDitherScene> } | null = null;

export const momentsSky: WindowSky = {
  fps: 12,
  hoverSpeed: 2.5,
  back(ctx, w, h) {
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, w, h);
  },
  frame(ctx, w, h, t) {
    if (momentsScene?.w !== w || momentsScene.h !== h) {
      // 土星在右上（下半部留給文字），星雲在左上
      momentsScene = {
        w,
        h,
        scene: createDitherScene(w, h, {
          cell: 4,
          saturn: { x: 0.68, y: 0.38, r: 0.17 },
          nebula: { x: 0.08, y: 0.08, w: 0.32, h: 0.4 },
          stars: 60,
          seed: 17,
        }),
      };
    }
    momentsScene.scene.draw(ctx, t);
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

// ── 關於：藍色火球 ──
// 那段在網路上瘋傳的自拍影片：深夜裡，身後的天空突然被一道霓虹般的青藍色光照得像白天，
// 一顆藍色火球拖著長尾巴劃過、落到地平線後面，前後大約七秒。這扇窗留住的就是那一瞬間：
// 平常是安靜的夜空和小星球，每隔一陣子，一顆藍色火球從左上方直直劃向地平線，一出現就亮，
// 一路越燒越亮、一次比一次大地爆亮，整片天空和星球表面都被照成青藍色；沒入地平線之後，光要好幾秒才退。
const FIREBALL_EVERY = 13;
const FIREBALL_START = 0.5;
const FIREBALL_SECONDS = 5;

function planet(w: number, h: number) {
  const r = Math.max(w, h) * 0.9;
  return { cx: w * 0.5, cy: h * 0.72 + r, r };
}

/**
 * 亮度曲線（s 是這一次落下的進度 0–1）：不是維持同一個亮度，而是一路越燒越亮——
 * 底下是一條往上爬的曲線，上面疊幾次一次比一次大的爆亮（一階一階往上），
 * 最亮的那一下在沉入地平線之前，接著很快暗下去
 */
const SURGES = [
  { at: 0.3, size: 0.18 },
  { at: 0.5, size: 0.32 },
  { at: 0.66, size: 0.5 },
  { at: 0.78, size: 0.8 },
];
function fireGlow(s: number) {
  if (s < 0 || s > 1) return 0;
  const ramp = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const ignite = ramp(0, 0.06, s);
  const climb = Math.pow(ramp(0.05, 0.8, s), 1.6);
  let surges = 0;
  for (const g of SURGES) surges += g.size * Math.exp(-(((s - g.at) / 0.035) ** 2));
  const sink = 1 - 0.75 * ramp(0.82, 1, s);
  return (ignite * 0.35 + climb * 1.05 + surges) * sink;
}

/** 這一刻火球在哪、多亮。s 是這一次落下的進度（0–1） */
function fireball(w: number, h: number, t: number) {
  const k = Math.floor(t / FIREBALL_EVERY);
  const local = t - k * FIREBALL_EVERY - FIREBALL_START;
  const s = local / FIREBALL_SECONDS;
  const { cx, cy, r } = planet(w, h);
  const R = rng(300 + k);
  const sx = w * (0.02 + R() * 0.12);
  const sy = h * (0.02 + R() * 0.08);
  const ex = w * (0.62 + R() * 0.16);
  const ey = cy - Math.sqrt(Math.max(0, r * r - (ex - cx) ** 2)) + 6; // 落點在地平線後面一點
  // 幾乎是直線（大氣裡的流星走的是直線），只在最後稍微往下壓一點；速度大致等速
  const at = (q: number) => {
    const e = q * (0.9 + 0.1 * q);
    return { x: sx + (ex - sx) * e, y: sy + (ey - sy) * (e * (0.92 + 0.08 * e)) };
  };
  return { s, at, glow: fireGlow(s), end: { x: ex, y: ey }, local, seed: k };
}

export const aboutSky: WindowSky = {
  fps: 30,
  hoverSpeed: 2,
  back(ctx, w, h) {
    night(ctx, w, h);
    dust(ctx, w, h, Math.round((w * h) / 700), 29);
  },
  frame(ctx, w, h, t) {
    const f = fireball(w, h, t);
    if (f.s < 0 || f.s > 1) return;
    const head = f.at(f.s);
    // 尾巴：沿著來的路往回拉，越後面越細、越淡；外層青藍、裡面一條白芯
    const TAIL = 18;
    for (let i = TAIL; i > 0; i--) {
      const a = f.at(Math.max(0, f.s - (i / TAIL) * 0.3));
      const b = f.at(Math.max(0, f.s - ((i - 1) / TAIL) * 0.3));
      const fade = 1 - i / TAIL;
      ctx.strokeStyle = `rgba(90, 210, 255, ${(0.55 * fade * Math.min(1, f.glow)).toFixed(3)})`;
      ctx.lineWidth = 1 + fade * 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(235, 252, 255, ${(0.8 * fade * fade * Math.min(1, f.glow)).toFixed(3)})`;
      ctx.lineWidth = 0.6 + fade * 1.8;
      ctx.stroke();
    }
    // 碎屑：從火球上剝落、落在後面
    const R = rng(f.seed * 997 + Math.floor(f.local * 30));
    for (let i = 0; i < 10; i++) {
      const p = f.at(Math.max(0, f.s - R() * 0.25));
      ctx.fillStyle = `rgba(160, 235, 255, ${(R() * 0.8 * Math.min(1, f.glow)).toFixed(3)})`;
      ctx.fillRect(p.x + (R() - 0.5) * 14, p.y + (R() - 0.5) * 14, 1.5, 1.5);
    }
    // 火球本身
    const r = 4 + f.glow * 6;
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r * 4);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.15, 'rgba(190, 250, 255, 0.95)');
    g.addColorStop(0.4, 'rgba(60, 190, 255, 0.5)');
    g.addColorStop(1, 'rgba(40, 120, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(head.x, head.y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  },
  over(ctx, w, h, t) {
    const f = fireball(w, h, t);
    const after = f.local - FIREBALL_SECONDS;
    // 天空被照亮的程度與中心：落下時跟著火球；沒入地平線之後不是一下子熄掉，
    // 光從落點那裡繼續照著，好幾秒才慢慢退掉（落地那一刻的亮度就是 s = 1 時的亮度，接得上）
    let lit = 0;
    let center = f.end;
    if (f.s >= 0 && f.s <= 1) {
      lit = Math.min(1.4, f.glow * 0.62);
      center = f.at(f.s);
    } else if (after > 0) {
      lit = Math.min(1.4, fireGlow(1) * 0.62) * Math.exp(-after * 0.45);
    }
    if (lit > 0.005) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(30, 110, 200, ${(0.45 * lit).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(w, h) * 0.8);
      g.addColorStop(0, `rgba(150, 235, 255, ${(0.55 * lit).toFixed(3)})`);
      g.addColorStop(1, 'rgba(150, 235, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // 地平線後面透出來的光（只亮在天空那一側），沿著地平線描一道：淡入、再慢慢熄掉
    if (after > 0 && after < 6) {
      const q = after / 6;
      const fade = Math.min(1, after / 0.5) * (1 - q) * (1 - q);
      const { cx, cy, r } = planet(w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(f.end.x, f.end.y, 0, f.end.x, f.end.y, 90 + q * 70);
      g.addColorStop(0, `rgba(160, 235, 255, ${(0.7 * fade).toFixed(3)})`);
      g.addColorStop(1, 'rgba(160, 235, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const span = 0.12 + q * 0.12;
      const mid = Math.atan2(f.end.y - cy, f.end.x - cx);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(170, 240, 255, ${(0.8 * fade).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, mid - span, mid + span);
      ctx.stroke();
      ctx.restore();
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
