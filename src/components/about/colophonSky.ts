// 此站點的場景：一具六分儀對著星空。這個站的材料、規則、天空與授權各是一顆星；
// 點一顆星，六分儀轉過去對準它，望遠鏡拉出一條虛線視線，目鏡裡就是那一條的說明（頁面疊的 DOM）。
// 這裡只畫六分儀、星點與視線，星的名字是疊在上面的按鈕。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
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
export const STAR_KEYS = ['material', 'type', 'sky', 'rule1', 'rule2', 'rule3', 'license'] as const;
export type StarKey = (typeof STAR_KEYS)[number];
const WIDE: Record<StarKey, [number, number]> = {
  material: [0.42, 0.22],
  type: [0.55, 0.12],
  sky: [0.69, 0.2],
  rule1: [0.82, 0.11],
  rule2: [0.5, 0.33],
  rule3: [0.57, 0.42],
  license: [0.9, 0.24],
};
const NARROW: Record<StarKey, [number, number]> = {
  material: [0.14, 0.37],
  type: [0.44, 0.34],
  sky: [0.78, 0.36],
  rule1: [0.26, 0.47],
  rule2: [0.6, 0.45],
  rule3: [0.88, 0.51],
  license: [0.46, 0.56],
};
const NARROW_PX = 760;

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
  img: HTMLImageElement | null;
}

export function starAt(key: StarKey, w: number, h: number) {
  const [x, y] = (w < NARROW_PX ? NARROW : WIDE)[key];
  return { x: x * w, y: y * h };
}

/** 六分儀擺在哪、多大：寬螢幕在左下，窄螢幕在下半部 */
function placeOf(w: number, h: number) {
  const narrow = w < NARROW_PX;
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
    ctx.globalAlpha = 0.92 * appear;
    ctx.translate(cx, cy);
    ctx.rotate(turn);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, (-size * SEXTANT.ratio) / 2, size, size * SEXTANT.ratio);
    ctx.restore();
  }
}
