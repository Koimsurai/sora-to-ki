// 此站點的場景：一具六分儀對著星空。這個站的材料、規則、天空與授權各是一顆星；
// 點一顆星，六分儀轉過去對準它，望遠鏡拉出一條虛線視線，目鏡裡就是那一條的說明（頁面疊的 DOM）。
// 這裡只畫六分儀、星點與視線，星的名字是疊在上面的按鈕。

import { onPalette, palette } from '@/lib/palette';
import { currentFold } from '@/lib/viewportFold';

let { paper: INK, amber: AMBER } = palette();
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => {
  ({ paper: INK, amber: AMBER } = p);
});
const TAU = Math.PI * 2;

/** 六分儀線稿（public/illustrations/sextant.webp，880×775）：左右翻過來畫，望遠鏡才朝右上方。
 *  翻過來之後目鏡在 eye、鏡筒前端在 front（原圖比例） */
const SEXTANT = {
  src: '/illustrations/sextant.webp',
  ratio: 775 / 880,
  eye: [0.034, 0.523],
  front: [0.381, 0.377],
} as const;
export const SEXTANT_SRC = SEXTANT.src;
/** 望遠鏡本來的方向（翻過來之後，從目鏡指向鏡筒前端） */
const AXIS = Math.atan2((SEXTANT.front[1] - SEXTANT.eye[1]) * SEXTANT.ratio, SEXTANT.front[0] - SEXTANT.eye[0]);
/** 六分儀最多轉多少（弧度）：再多就不像拿在手上 */
const TURN_MIN = -0.55;
const TURN_MAX = 0.4;

/** 星的位置（場景寬高的比例）：寬螢幕在右上方散開，窄螢幕擠在上半部 */
export const STAR_KEYS = ['material', 'type', 'sky', 'rule1', 'rule2', 'rule3', 'license', 'qa'] as const;
export type StarKey = (typeof STAR_KEYS)[number];
const WIDE: Record<StarKey, [number, number]> = {
  material: [0.42, 0.22],
  type: [0.55, 0.12],
  sky: [0.69, 0.2],
  rule1: [0.82, 0.11],
  rule2: [0.5, 0.33],
  rule3: [0.57, 0.42],
  license: [0.9, 0.24],
  // 問答：原本在頁面最下面要往下捲，現在是天上的一顆星，對準它目鏡裡就是問答
  qa: [0.68, 0.08],
};
const NARROW: Record<StarKey, [number, number]> = {
  material: [0.14, 0.37],
  type: [0.44, 0.34],
  sky: [0.78, 0.36],
  rule1: [0.26, 0.47],
  rule2: [0.6, 0.45],
  rule3: [0.88, 0.51],
  license: [0.46, 0.56],
  qa: [0.16, 0.58],
};
/** 摺疊機筆電式：天空只剩摺痕以上那塊橫的（669 × 390），標題佔掉左上：星散在標題右邊與下方，六分儀在左下 */
const LAPTOP: Record<StarKey, [number, number]> = {
  material: [0.52, 0.42],
  type: [0.66, 0.3],
  sky: [0.8, 0.38],
  rule1: [0.92, 0.27],
  rule2: [0.58, 0.62],
  rule3: [0.74, 0.7],
  license: [0.9, 0.56],
  qa: [0.84, 0.86],
};
const NARROW_PX = 760;
/** 窄螢幕的星圖（擠在上半、六分儀在下半）。筆電式的天空是橫的，六分儀照寬螢幕擺在左下 */
const isNarrow = (w: number) => w < NARROW_PX && currentFold()?.pose !== 'laptop';
const layoutOf = (w: number) => (currentFold()?.pose === 'laptop' ? LAPTOP : isNarrow(w) ? NARROW : WIDE);

export interface ColophonFrame {
  w: number;
  h: number;
  t: number;
  /** 六分儀現在轉了多少（頁面平滑地帶向目標） */
  turn: number;
  /** 正在測的那顆 */
  target: StarKey;
  /** 視線拉出來的進度（0–1）：換一顆星時從望遠鏡重新拉一次 */
  sight: number;
  /** 滑到的那顆（沒有是 null） */
  hover: StarKey | null;
  /** 換頁進來的淡入、離開的淡出（0–1） */
  appear: number;
  /** 六分儀自己的淡入（不給就跟 appear 一樣）：點畫星座進來時星已經亮著，只有六分儀要淡進來 */
  sextant?: number;
  img: HTMLImageElement | null;
}

export function starAt(key: StarKey, w: number, h: number) {
  const [x, y] = layoutOf(w)[key];
  return { x: x * w, y: y * h };
}

/** 六分儀擺在哪、多大：寬螢幕在左下，窄螢幕在下半部 */
function placeOf(w: number, h: number) {
  const narrow = isNarrow(w);
  // 筆電式的天空只有 390 高：六分儀小一點、低一點，讓出標題底下那行提示
  if (currentFold()?.pose === 'laptop') return { cx: w * 0.2, cy: h * 0.72, size: Math.min(w * 0.32, h * 0.5) };
  const size = narrow ? Math.min(w * 0.7, h * 0.42) : Math.min(w * 0.36, h * 0.56);
  return { cx: narrow ? w * 0.42 : w * 0.22, cy: narrow ? h * 0.78 : h * 0.66, size };
}

/** 六分儀轉了 turn 之後，翻過來的圖上 (u, v) 那一點在畫面上的位置 */
function pointOn(w: number, h: number, turn: number, u: number, v: number) {
  const { cx, cy, size } = placeOf(w, h);
  const dx = (u - 0.5) * size;
  const dy = (v - 0.5) * size * SEXTANT.ratio;
  return { x: cx + dx * Math.cos(turn) - dy * Math.sin(turn), y: cy + dx * Math.sin(turn) + dy * Math.cos(turn) };
}

/** 鏡筒前端在畫面上的位置（視線從這裡出去；換頁的點落在這裡） */
export function frontOf(w: number, h: number, turn: number) {
  return pointOn(w, h, turn, SEXTANT.front[0], SEXTANT.front[1]);
}

/** 要對準這顆星，六分儀該轉多少 */
export function turnFor(key: StarKey, w: number, h: number) {
  const s = starAt(key, w, h);
  // 鏡筒前端會跟著轉，所以迭代兩次就夠準
  let turn = 0;
  for (let k = 0; k < 3; k++) {
    const f = frontOf(w, h, turn);
    turn = Math.atan2(s.y - f.y, s.x - f.x) - AXIS;
  }
  return Math.max(TURN_MIN, Math.min(TURN_MAX, turn));
}

/**
 * 換頁進來時點畫的星座：從畫面最右邊那顆星進來，由右往左把天上的星一顆顆掃過去，最後一顆是正在測的那顆，
 * 再接到鏡筒前端——最後那一段就是視線，星座收掉之後留下的正好是它。
 * 星與星之間用平滑的曲線（Catmull–Rom）接，點飛起來有一點弧度、不是硬折。
 * 回傳取好點的曲線，與正在測的那顆星在曲線上的第幾點
 */
export function planConstellation(target: StarKey, front: { x: number; y: number }, w: number, h: number) {
  const others = STAR_KEYS.filter((k) => k !== target)
    .map((k) => starAt(k, w, h))
    .sort((a, b) => b.x - a.x);
  const knots = [...others, starAt(target, w, h), front];
  const STEPS = 14;
  const path: { x: number; y: number }[] = [knots[0]];
  let targetAt = 0;
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)];
    const p1 = knots[i];
    const p2 = knots[i + 1];
    const p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      path.push({ x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) });
    }
    if (i + 1 === knots.length - 2) targetAt = path.length - 1;
  }
  return { path, targetAt };
}

/** 折線上每一點到起點的累計長度 */
export function cumulative(path: { x: number; y: number }[]) {
  const out = [0];
  for (let i = 1; i < path.length; i++)
    out.push(out[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  return out;
}

/** 點 p 落在折線上的哪裡（從起點量的長度）：找最近的那一段、投影上去 */
export function progressOn(path: { x: number; y: number }[], cum: number[], p: { x: number; y: number }) {
  let best = Infinity;
  let at = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(a.x + dx * u - p.x, a.y + dy * u - p.y);
    if (d < best) {
      best = d;
      at = cum[i - 1] + (cum[i] - cum[i - 1]) * u;
    }
  }
  return at;
}

/** 畫折線上 [d0, d1] 那一段（長度從起點量） */
export function strokeSpan(
  ctx: CanvasRenderingContext2D,
  path: { x: number; y: number }[],
  cum: number[],
  d0: number,
  d1: number,
) {
  const point = (d: number) => {
    let i = 1;
    while (i < path.length - 1 && cum[i] < d) i++;
    const u = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * u, y: path[i - 1].y + (path[i].y - path[i - 1].y) * u };
  };
  if (d1 <= d0) return;
  ctx.beginPath();
  const s = point(d0);
  ctx.moveTo(s.x, s.y);
  for (let i = 1; i < path.length; i++) if (cum[i] > d0 && cum[i] < d1) ctx.lineTo(path[i].x, path[i].y);
  const e = point(d1);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
}

export function drawColophon(ctx: CanvasRenderingContext2D, f: ColophonFrame) {
  const { w, h, t, turn, target, sight, hover, appear, img } = f;
  ctx.clearRect(0, 0, w, h);

  // 視線：從鏡筒前端拉到那顆星的一條點線，點慢慢往星那邊流
  const from = frontOf(w, h, turn);
  const to = starAt(target, w, h);
  const ex = from.x + (to.x - from.x) * sight;
  const ey = from.y + (to.y - from.y) * sight;
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.lineDashOffset = -t * 18;
  ctx.strokeStyle = `rgba(${INK}, ${0.45 * appear})`;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();

  // 星：測著的那顆是琥珀色，其餘是白點，微微閃
  STAR_KEYS.forEach((key, i) => {
    const s = starAt(key, w, h);
    const on = key === target && sight >= 1;
    const near = key === hover;
    const tw = 0.75 + 0.25 * Math.sin(t * 1.7 + i * 2.1);
    if (on) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 22);
      g.addColorStop(0, `rgba(${AMBER}, ${0.55 * appear})`);
      g.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = on ? `rgba(${AMBER}, ${appear})` : `rgba(${INK}, ${(near ? 1 : 0.8 * tw) * appear})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, on ? 3.6 : near ? 3.2 : 2.4, 0, TAU);
    ctx.fill();
    if (near && !on) {
      ctx.strokeStyle = `rgba(${INK}, ${0.5 * appear})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, TAU);
      ctx.stroke();
    }
  });

  // 六分儀：翻過來、繞著中心轉到對準的角度
  if (img?.complete && img.naturalWidth) {
    const { cx, cy, size } = placeOf(w, h);
    ctx.save();
    ctx.globalAlpha = 0.92 * (f.sextant ?? appear);
    ctx.translate(cx, cy);
    ctx.rotate(turn);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, (-size * SEXTANT.ratio) / 2, size, size * SEXTANT.ratio);
    ctx.restore();
  }
}
