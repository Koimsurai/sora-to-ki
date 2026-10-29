// 此站點遊樂場的「首頁」：把首頁那顆刻線土星拆成一步一步畫出來。
// 數字（雲帶、環的結構、俯角、光的方向、衛星軌道）跟 3D 版共用 lib/saturnSpec；
// 畫法照 3D 版的著色器（lib/starfieldGpu 的 buildSaturn）在畫布上逐像素重做一次：
//   1 球與光        背光那面暗下去
//   2 刷痕          不塗色，改成一列一列的橫線，線的粗細就是亮度
//   3 雲帶          亮暗照真實土星的緯度排，雜訊讓線起伏、斷成筆觸
//   4 環            同心的刷痕，照真實環的結構；星球與環互相投下影子
//   5 衛星          五條軌道各一顆，一次只亮一顆
//   6 星軌          背景的星繞著天極拖出弧（手記頁）
// 這裡只有畫圖，不碰 React。
import {
  ORBITS,
  PLANET_COVER,
  PLANET_ROWS,
  RING_COVER,
  RING_GAPS,
  RING_INNER,
  RING_OUTER,
  RING_ROWS,
  RING_SEGMENTS,
  ROLL,
  SATURN_BANDS_FULL,
  satellitePhase,
  satelliteSpeed,
  SUN,
  TILT,
} from '@/lib/saturnSpec';
import { channels, onPalette, palette } from '@/lib/palette';

const TAU = Math.PI * 2;
const COLORS = palette();
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => Object.assign(COLORS, p));
/** 逐像素混色用的三個數字；畫線與點用下面的字串 */
const INK = channels(COLORS.paper);
const GROUND = channels(COLORS.ground);
const INK_RGB = COLORS.paper;
const AMBER = COLORS.amber;

/** 拆開的步驟（0 起算）：球與光、刷痕、雲帶、環、衛星、星軌 */
export const SATURN_STEPS = ['light', 'strokes', 'bands', 'rings', 'satellites', 'trails'] as const;

const smoothstep = (e0: number, e1: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 三維的值雜訊（-1–1）：3D 版用的是 mx_noise_float，這裡要的只是「拉長、起伏、斷開」的效果 */
function hash3(x: number, y: number, z: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

const cosR = Math.cos(ROLL);
const sinR = Math.sin(ROLL);
const cosT = Math.cos(TILT);
const sinT = Math.sin(TILT);

/** 畫面（x 往右、y 往上、z 朝向看的人）→ 星球自己的座標：先轉回側傾、再轉回俯角 */
function toPlanet(x: number, y: number, z: number): [number, number, number] {
  const x1 = x * cosR + y * sinR;
  const y1 = -x * sinR + y * cosR;
  return [x1, y1 * cosT + z * sinT, -y1 * sinT + z * cosT];
}

/** 環的平面上 (x, z) 那一點在畫面上的位置（x 往右、y 往上）與深度 */
function planeToView(x: number, z: number): [number, number, number] {
  return [x * cosR + z * sinT * sinR, x * sinR - z * sinT * cosR, z * cosT];
}

const SUN_N = (() => {
  const l = Math.hypot(...SUN);
  return toPlanet(SUN[0] / l, SUN[1] / l, SUN[2] / l);
})();

/** 環在半徑 r 的亮度（照真實環的結構，挖掉幾道縫） */
function ringTone(r: number) {
  let tone = 0;
  for (const [inner, outer, value] of RING_SEGMENTS)
    tone += smoothstep(inner - 0.004, inner + 0.004, r) * smoothstep(outer + 0.004, outer - 0.004, r) * value;
  for (const [at, half] of RING_GAPS) tone *= smoothstep(half * 0.4, half, Math.abs(r - at));
  return tone;
}

/** 一列一列的刷痕：row 是列的座標，ink 是濃度，fw 是 row 每個像素變多少（反鋸齒用）；回傳這個像素有多少墨 */
function strokes(row: number, ink: number, cover: number, fw: number) {
  const f = Math.abs(row - Math.floor(row) - 0.5);
  const half = (ink * cover) / 2;
  const aa = Math.max(0.001, fw * 0.75);
  return smoothstep(half + aa, half - aa, f) * clamp01(half / aa);
}

/** 星球上一點的墨（0–1）；n 是星球座標的法線 */
function planetInk(step: number, n: [number, number, number], fw: number) {
  const lit = smoothstep(-0.12, 0.4, n[0] * SUN_N[0] + n[1] * SUN_N[1] + n[2] * SUN_N[2]);
  if (step === 0) return Math.pow(lit, 0.8) * 0.85;
  if (step === 1) return strokes(n[1] * PLANET_ROWS, Math.pow(lit * 0.85, 0.8), PLANET_COVER, fw);
  const lat = (Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI;
  let tone = 0.52;
  for (const [c, w, d] of SATURN_BANDS_FULL) tone += Math.exp(-(((lat - c) / w) ** 2)) * d * 1.6;
  tone *= smoothstep(80, 48, Math.abs(lat));
  const wave = noise(n[0] * 1.1, n[1] * 6, n[2] * 1.1);
  const row = n[1] * PLANET_ROWS + wave * 0.8;
  const swell = noise(n[0] * 2.2, n[1] * 36, n[2] * 2.2) * 0.45 + 1;
  const brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48, n[2] * 2.4));
  // 環落在星球上的影子：從這一點往太陽看，視線穿過環的平面時落在環上
  let shade = 1;
  if (step >= 3) {
    const t = -n[1] / SUN_N[1];
    if (t > 0) shade = 1 - ringTone(Math.hypot(n[0] + SUN_N[0] * t, n[2] + SUN_N[2] * t)) * 0.8;
  }
  const ink = Math.pow(clamp01(lit * tone * swell * (0.05 + 0.95 * brush) * shade), 0.8);
  return strokes(row, ink, PLANET_COVER, fw);
}

/** 環上 (x, z) 那一點的墨（0–1） */
function ringInk(x: number, z: number, fw: number) {
  const r = Math.hypot(x, z);
  if (r < RING_INNER - 0.01 || r > RING_OUTER + 0.01) return 0;
  const ringlets = noise(r * 60, 0, 0) * 0.22 + 0.9;
  const brush = smoothstep(-0.55, 0.15, noise(x * 2.4, r * 40, z * 2.4));
  // 星球的影子：從環上這一點往太陽看會不會被星球擋住
  const along = -(x * SUN_N[0] + z * SUN_N[2]);
  const cx = x + SUN_N[0] * along;
  const cy = SUN_N[1] * along;
  const cz = z + SUN_N[2] * along;
  const shade = along > 0 && Math.hypot(cx, cy, cz) < 1 ? 0.12 : 1;
  const ink = clamp01(ringTone(r) * ringlets * (0.4 + 0.6 * brush) * shade);
  return strokes(r * RING_ROWS, Math.pow(ink, 0.75), RING_COVER, fw);
}

/**
 * 畫到第 step 步的星球與環（不含衛星、星軌），像素大小 size×size、星球半徑 R 像素、中心在正中間。
 * 逐像素算，一步只算一次，之後每幀直接貼這張圖
 */
export function renderSaturn(step: number, size: number, R: number) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const img = g.createImageData(size, size);
  const px = img.data;
  const c = size / 2;
  const withRing = step >= 3;
  const reach = Math.ceil((withRing ? RING_OUTER + 0.05 : 1.05) * R);
  const y0 = Math.max(0, Math.floor(c - reach));
  const y1 = Math.min(size, Math.ceil(c + reach));
  for (let py = y0; py < y1; py++) {
    for (let qx = Math.max(0, Math.floor(c - reach)); qx < Math.min(size, Math.ceil(c + reach)); qx++) {
      const X = (qx + 0.5 - c) / R;
      const Y = -(py + 0.5 - c) / R;
      const d = Math.hypot(X, Y);
      // 星球：不透明的黑球，邊緣反鋸齒
      let baseA = 0;
      let base = 0;
      if (d < 1 + 1 / R) {
        baseA = clamp01((1 - d) * R + 0.5);
        const dd = Math.min(d, 0.9999);
        const k = dd > 0 ? dd / d : 1;
        const n = toPlanet(X * k, Y * k, Math.sqrt(1 - dd * dd));
        // 列的座標每個像素變多少：往右與往下各量一個像素
        const nx = toPlanet((X + 1 / R) * k, Y * k, Math.sqrt(Math.max(0, 1 - (X + 1 / R) ** 2 - Y ** 2)));
        const ny = toPlanet(X * k, (Y - 1 / R) * k, Math.sqrt(Math.max(0, 1 - X ** 2 - (Y - 1 / R) ** 2)));
        const fw = PLANET_ROWS * (Math.abs(nx[1] - n[1]) + Math.abs(ny[1] - n[1]));
        base = planetInk(step, n, fw);
      }
      // 環：這個像素落在環平面上的哪一點；在星球後面的被擋掉
      let ringA = 0;
      if (withRing) {
        const rx = X * cosR + Y * sinR;
        const rz = (X * sinR - Y * cosR) / sinT;
        const depth = rz * cosT;
        if (!(d < 1 && depth < 0)) {
          const r0 = Math.hypot(rx, rz);
          const r1 = Math.hypot(rx + cosR / R, rz + sinR / R / sinT);
          const r2 = Math.hypot(rx - sinR / R, rz + cosR / R / sinT);
          ringA = ringInk(rx, rz, RING_ROWS * (Math.abs(r1 - r0) + Math.abs(r2 - r0)));
        }
      }
      const a = ringA + baseA * (1 - ringA);
      if (a <= 0) continue;
      // 星球的顏色：紙色到墨色之間；環疊在上面
      const i = (py * size + qx) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const planetC = GROUND[ch] + (INK[ch] - GROUND[ch]) * base;
        px[i + ch] = Math.round((INK[ch] * ringA + planetC * baseA * (1 - ringA)) / a);
      }
      px[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** 第 i 顆衛星在畫面上的位置（中心 cx, cy、星球半徑 R 像素、第 t 秒） */
export function satelliteAt(i: number, cx: number, cy: number, R: number, t: number) {
  const r = ORBITS[i];
  const a = satellitePhase(i) + t * satelliteSpeed(r);
  const [x, y] = planeToView(Math.cos(a) * r, Math.sin(a) * r);
  return { x: cx + x * R, y: cy - y * R };
}

/** 五條軌道與衛星：亮著的那一顆（on）是琥珀色、外面一圈光暈，它的軌道也亮一點 */
export function drawOrbits(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number, on: number) {
  ctx.lineWidth = 1;
  ORBITS.forEach((r, i) => {
    ctx.strokeStyle = `rgba(${INK_RGB}, ${i === on ? 0.4 : 0.14})`;
    ctx.beginPath();
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * TAU;
      const [x, y] = planeToView(Math.cos(a) * r, Math.sin(a) * r);
      if (k) ctx.lineTo(cx + x * R, cy - y * R);
      else ctx.moveTo(cx + x * R, cy - y * R);
    }
    ctx.stroke();
  });
  ORBITS.forEach((_, i) => {
    const s = satelliteAt(i, cx, cy, R, t);
    if (i === on) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 12);
      glow.addColorStop(0, `rgba(${AMBER}, 0.55)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${AMBER})`;
    } else ctx.fillStyle = `rgba(${INK_RGB}, 0.8)`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, i === on ? 3 : 2.2, 0, TAU);
    ctx.fill();
  });
}

/** 一道星軌分幾段畫（越靠近星越亮） */
const TRAIL_PIECES = 6;

/** 背景的星軌：每顆星繞著天極轉，快門開著，弧隨曝光時間拉長（最長約 1.1 弧度） */
export function createTrails(count: number) {
  const stars = Array.from({ length: count }, (_, i) => {
    const k = (i * 0.618034) % 1;
    return { r: 0.06 + Math.sqrt(k) * 1.1, a: ((i * 2.399963) % TAU) - Math.PI, b: 0.2 + ((i * 0.381966) % 1) * 0.6 };
  });
  return (ctx: CanvasRenderingContext2D, w: number, h: number, exposure: number, t: number) => {
    // 天極在右上（跟手記頁一樣）
    const px = w * 0.78;
    const py = h * 0.18;
    const span = Math.max(w, h);
    const arc = Math.min(1.1, exposure * 0.35);
    ctx.lineWidth = 1;
    for (const s of stars) {
      const head = s.a + t * 0.035;
      const r = s.r * span;
      // 弧的尾巴淡、頭亮：分成幾段畫，越靠近星越亮
      for (let k = 0; k < TRAIL_PIECES; k++) {
        ctx.strokeStyle = `rgba(${INK_RGB}, ${((0.04 + 0.16 * s.b) * (k + 1)) / TRAIL_PIECES})`;
        ctx.beginPath();
        ctx.arc(px, py, r, head - arc * (1 - k / TRAIL_PIECES), head - arc * (1 - (k + 1) / TRAIL_PIECES));
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${INK_RGB}, ${0.4 + 0.5 * s.b})`;
      ctx.fillRect(px + Math.cos(head) * r - 0.6, py + Math.sin(head) * r - 0.6, 1.2, 1.2);
    }
  };
}
