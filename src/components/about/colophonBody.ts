// 此站點遊樂場的「首頁」：把首頁那顆主星（主題，lib/theme）拆成一步一步畫出來。
// 數字（雲帶、斑點、環的結構、俯角、光的方向、軌道）跟 3D 版共用 lib/saturnSpec 的 PLANETS；
// 畫法照 3D 版的著色器（lib/starfieldGpu 的 buildSaturn）在畫布上逐像素重做一次。四顆各六步：
//   土星    球與光 → 刷痕 → 雲帶 → 環與影子 → 衛星 → 星軌
//   海王星  球與光 → 細密的刷痕 → 暗斑與卷雲 → 細環與弧 → 衛星（崔頓倒著繞）→ 星軌
//   黑洞    陰影與光子環 → 吸積盤 → 都卜勒增亮 → 被彎過來的盤影 → S 星 → 星軌
//   參宿四  自己發光 → 水平的刻線 → 對流胞與塵埃 → 脹縮與外層大氣 → 伴星與塵埃殼 → 星軌
// 第五步起有軌道，可以點一顆；第六步加上背景的星軌（手記頁）。
// 這裡只有畫圖，不碰 React。首頁的分享圖（backend 的 og/scenes/body.rs）是這裡逐行移植的，改畫法兩邊一起改。
import {
  DISK_COVER,
  DISK_SHEAR,
  ORBITS,
  PLANETS,
  RING_COVER,
  RING_ROWS,
  ROLL,
  satellitePhase,
  satelliteSpeed,
  SUN,
  TILT,
  type PlanetSpec,
  type StarOrbit,
} from '@/lib/saturnSpec';
import { channels, onPalette, palette } from '@/lib/palette';
import type { Theme } from '@/lib/theme';

const TAU = Math.PI * 2;
const COLORS = palette();
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => Object.assign(COLORS, p));

/** 每一顆的六步（0 起算）。說明在 colophon.steps.<主題>.<步> */
export const BODY_STEPS: Record<Theme, readonly string[]> = {
  saturn: ['light', 'strokes', 'bands', 'rings', 'satellites', 'trails'],
  neptune: ['light', 'strokes', 'clouds', 'rings', 'satellites', 'trails'],
  blackhole: ['shadow', 'disk', 'doppler', 'lens', 'satellites', 'trails'],
  betelgeuse: ['light', 'strokes', 'cells', 'breath', 'satellites', 'trails'],
};
/** 第幾步起有軌道（整組縮小、可以點一顆）、有背景的星軌；四顆都一樣 */
export const ORBIT_STEP = 4;
export const TRAIL_STEP = 5;
/** 參宿四第幾步起會脹縮 */
const BREATH_STEP = 3;

const smoothstep = (e0: number, e1: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const fract = (x: number) => x - Math.floor(x);
const DEG = 180 / Math.PI;

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
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), u), mix(c(0, 1, 0), c(1, 1, 0), u), v),
    mix(mix(c(0, 0, 1), c(1, 0, 1), u), mix(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

const cosR = Math.cos(ROLL);
const sinR = Math.sin(ROLL);
const cosT = Math.cos(TILT);
const sinT = Math.sin(TILT);

type Vec = [number, number, number];

/** 畫面（x 往右、y 往上、z 朝向看的人）→ 星球自己的座標（環與軌道的平面是 y = 0）：先轉回側傾、再轉回俯角 */
function toPlanet(x: number, y: number, z: number): Vec {
  const x1 = x * cosR + y * sinR;
  const y1 = -x * sinR + y * cosR;
  return [x1, y1 * cosT + z * sinT, -y1 * sinT + z * cosT];
}

/** 反過來：星球座標的一點在畫面上的位置（x 往右、y 往上）與深度 */
function toView([px, py, pz]: Vec): Vec {
  const y1 = py * cosT - pz * sinT;
  return [px * cosR - y1 * sinR, px * sinR + y1 * cosR, py * sinT + pz * cosT];
}

const SUN_N = (() => {
  const l = Math.hypot(...SUN);
  return toPlanet(SUN[0] / l, SUN[1] / l, SUN[2] / l);
})();

/** 環在半徑 r 的亮度（規格裡的 segments，挖掉 gaps） */
function ringTone(spec: PlanetSpec, r: number) {
  let tone = 0;
  for (const [inner, outer, value] of spec.ring.segments)
    tone += smoothstep(inner - 0.004, inner + 0.004, r) * smoothstep(outer + 0.004, outer - 0.004, r) * value;
  for (const [at, half] of spec.ring.gaps) tone *= smoothstep(half * 0.4, half, Math.abs(r - at));
  return tone * spec.ring.gain;
}

/** 一列一列的刷痕：row 是列的座標，ink 是濃度，fw 是 row 每個像素變多少（反鋸齒用）；回傳這個像素有多少墨 */
function strokes(row: number, ink: number, cover: number, fw: number) {
  const f = Math.abs(fract(row) - 0.5);
  const half = (ink * cover) / 2;
  const aa = Math.max(0.001, fw * 0.75);
  return smoothstep(half + aa, half - aa, f) * clamp01(half / aa);
}

/** 至少一個像素寬的髮絲（海王星的細環、黑洞的光子環）：比一個像素細的照比例變淡 */
function hairline(d: number, at: number, half: number, px: number) {
  const reach = Math.max(px * 0.5, half);
  return clamp01((reach + px * 0.5 - Math.abs(d - at)) / px) * Math.min(1, (half * 2) / px);
}

/** 星球表面的亮度底子：雲帶、斑點、極區變暗、北極六角形（土星） */
function surfaceTone(spec: PlanetSpec, n: Vec, lat: number) {
  let tone = spec.base;
  for (const [c, w, d] of spec.bands) tone += Math.exp(-(((lat - c) / w) ** 2)) * d * 1.6;
  if (spec.spots.length) {
    const lon = Math.atan2(n[0], n[2]);
    for (const [lo, la, wLon, wLat, d] of spec.spots) {
      const dl = (fract((lon - lo) / TAU + 0.5) - 0.5) * 360 * Math.cos(la / DEG);
      tone += Math.exp(-((dl / wLon) ** 2 + ((lat - la) / wLat) ** 2)) * d;
    }
  }
  tone *= smoothstep(spec.pole[0], spec.pole[1], Math.abs(lat));
  if (spec.hexagon) {
    const hex = spec.hexagon;
    const colat = 90 - lat;
    const seg = (fract((Math.atan2(n[2], n[0]) * DEG + 360) / 60) * 60 - 30) / DEG;
    const edge = (hex.colat * Math.cos(Math.PI / 6)) / Math.cos(seg);
    tone +=
      Math.exp(-(((colat - edge) / hex.width) ** 2)) * hex.delta +
      smoothstep(edge + hex.width, edge - hex.width, colat) * 0.2 +
      Math.exp(-(((colat - 1.6) / 0.7) ** 2)) * 0.45;
  }
  return tone;
}

/**
 * 行星（土星、海王星）表面一點的墨（0–1）：n 是星球座標的法線，fwN 是 n 的 y 每個像素變多少、fwLat 是緯度（°）
 */
function planetInk(spec: PlanetSpec, step: number, n: Vec, fwN: number, fwLat: number) {
  const lit = smoothstep(-0.12, 0.4, n[0] * SUN_N[0] + n[1] * SUN_N[1] + n[2] * SUN_N[2]);
  if (step === 0) return Math.pow(lit, 0.8) * 0.85;
  if (step === 1) return strokes(n[1] * spec.rows, Math.pow(lit * 0.85, 0.8), spec.cover, spec.rows * fwN);
  const lat = Math.asin(Math.max(-1, Math.min(1, n[1]))) * DEG;
  const tone = surfaceTone(spec, n, lat);
  // 六角形裡面不到一列緯度刻線，改成以極點為中心、每 1.1° 一圈（3D 版同一個做法）
  const polar = spec.hexagon !== undefined && lat > 90 - spec.hexagon.colat * 1.25;
  const wave = noise(n[0] * 1.1, n[1] * 6, n[2] * 1.1);
  const row = polar ? (90 - lat) / 1.1 : n[1] * spec.rows + wave * spec.stroke.wave;
  const swell = noise(n[0] * 2.2, n[1] * 36, n[2] * 2.2) * spec.stroke.swell + 1;
  const brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48, n[2] * 2.4));
  // 環落在星球上的影子：從這一點往太陽看，視線穿過環的平面時落在環上
  let shade = 1;
  if (step >= 3) {
    const t = -n[1] / SUN_N[1];
    if (t > 0) shade = 1 - ringTone(spec, Math.hypot(n[0] + SUN_N[0] * t, n[2] + SUN_N[2] * t)) * 0.8;
  }
  const ink = Math.pow(clamp01(lit * tone * swell * mix(spec.stroke.floor, 1, brush) * shade), 0.8);
  return strokes(row, ink, spec.cover, polar ? fwLat / 1.1 : spec.rows * fwN);
}

/**
 * 恆星（參宿四）表面一點的墨：自己發光，沒有晨昏線，亮度照邊緣變暗。刻線是畫面上水平的平行直線（版畫的刻法），
 * Y 是畫面上的高度（星球半徑 1）、z 是朝向看的人的那個分量、light 是脹縮時的亮度倍數
 */
function starInk(spec: PlanetSpec, step: number, n: Vec, Y: number, z: number, fw: number, light: number) {
  const lit = Math.pow(Math.max(z, 0), 0.45);
  if (step === 0) return Math.pow(lit, 0.8) * 0.85;
  if (step === 1) return strokes(Y * spec.rows, Math.pow(lit * 0.85, 0.8), spec.cover, fw);
  const lat = Math.asin(Math.max(-1, Math.min(1, n[1]))) * DEG;
  // 幾個巨大的對流胞：很低頻的雜訊，一塊亮一塊暗
  const cells = noise(n[0] * 1.6, n[1] * 1.6, n[2] * 1.6);
  const tone =
    surfaceTone(spec, n, lat) *
    mix(0.3, 1.35, smoothstep(-0.4, 0.4, cells)) *
    mix(0.6, 1.1, smoothstep(-0.5, 0.5, noise(n[0] * 7, n[1] * 7, n[2] * 7))) *
    light;
  const row =
    Y * spec.rows + cells * spec.stroke.wave + noise(n[0] * 4.5, n[1] * 4.5, n[2] * 4.5) * spec.stroke.wave * 0.35;
  const swell = noise(n[0] * 2.2, n[1] * 36, n[2] * 2.2) * spec.stroke.swell + 1;
  const brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48, n[2] * 2.4));
  return strokes(row, Math.pow(clamp01(lit * tone * swell * mix(spec.stroke.floor, 1, brush)), 0.8), spec.cover, fw);
}

/** 行星的環上 (x, z) 那一點的墨（0–1）；fw 是半徑每個像素變多少 */
function ringInk(spec: PlanetSpec, x: number, z: number, fw: number) {
  const r = Math.hypot(x, z);
  const ring = spec.ring;
  if (r < ring.inner - 0.01 || r > ring.outer + 0.01) return 0;
  // 星球的影子：從環上這一點往太陽看會不會被星球擋住
  const along = -(x * SUN_N[0] + z * SUN_N[2]);
  const shade = along > 0 && Math.hypot(x + SUN_N[0] * along, SUN_N[1] * along, z + SUN_N[2] * along) < 1 ? 0.12 : 1;
  if (!ring.brushed) {
    // 細環（海王星）：每一道畫成髮絲；Adams 環上的弧比環亮、也寬一點
    let thin = 0;
    for (const [inner, outer, value] of ring.segments)
      thin += hairline(r, (inner + outer) / 2, (outer - inner) / 2, fw) * value;
    const a = Math.atan2(z, x);
    for (const [at, from, to, value] of ring.arcs)
      thin +=
        smoothstep(from - 0.02, from + 0.02, a) *
        smoothstep(to + 0.02, to - 0.02, a) *
        hairline(r, at, 0.012, fw) *
        value;
    return clamp01(thin * ring.gain * shade);
  }
  const ringlets = noise(r * 60, 0, 0) * 0.22 + 0.9;
  const brush = smoothstep(-0.55, 0.15, noise(x * 2.4, r * 40, z * 2.4));
  const ink = clamp01(ringTone(spec, r) * ringlets * (0.4 + 0.6 * brush) * shade);
  return strokes(r * RING_ROWS, Math.pow(ink, 0.75), RING_COVER, fw * RING_ROWS);
}

/**
 * 黑洞的吸積盤上 (x, z) 那一點：[墨, 不透明度]。盤是又密又亮、擋得住後面的一層氣體，刻線之間塗夜色；
 * 內圈比外圈轉得快很多，物質被拉成螺旋條紋；doppler 時朝我們轉來的那一側（左邊）亮
 */
function diskInk(spec: PlanetSpec, x: number, z: number, fw: number, doppler: boolean): [number, number] {
  const r = Math.hypot(x, z);
  const ring = spec.ring;
  const band = smoothstep(ring.inner, ring.inner + 0.06, r) * smoothstep(ring.outer, ring.outer - 0.35, r);
  if (band <= 0) return [0, 0];
  const ang = Math.atan2(z, x) + Math.log(r) * DISK_SHEAR;
  const streak = noise(Math.cos(ang) * 2.4, Math.sin(ang) * 2.4, r * 9);
  const heat = smoothstep(ring.outer, ring.inner, r) * 0.5 + 0.6;
  const texture = mix(0.2, 1, smoothstep(-0.4, 0.5, streak)) * heat;
  const beam = doppler ? 1 - (x / r) * ring.doppler : 1;
  const ink = clamp01(ringTone(spec, r) * texture * beam);
  return [strokes(r * RING_ROWS, Math.pow(ink, 0.75), DISK_COVER, fw * RING_ROWS), band];
}

/**
 * 黑洞正對著我們的那一層（畫面座標 X, Y，陰影半徑 1）：光子環，第 lens 步起加上被重力彎到陰影上下的盤影
 * （上方最亮，盤的背面被彎過陰影頂上）
 */
function lensInk(spec: PlanetSpec, X: number, Y: number, px: number, doppler: boolean, lens: boolean) {
  const d = Math.hypot(X, Y);
  const beam = doppler ? 1 - (X / d) * spec.ring.doppler : 1;
  let ink = hairline(d, 1.04, 0.012, px) * beam * 0.9;
  if (lens) {
    const above = smoothstep(-0.3, 0.85, Y / d);
    const band = smoothstep(1.08, 1.16, d) * smoothstep(1.75, 1.45, d);
    ink += strokes(d * RING_ROWS, clamp01(band * mix(0.25, 0.9, above) * beam), RING_COVER, px * RING_ROWS);
  }
  return clamp01(ink);
}

/** 參宿四外面那層延伸很遠的大氣：一圈圈很淡的同心刻線，南邊那團（大暗化時噴出來的物質）多一點 */
function haloInk(X: number, Y: number, px: number, light: number) {
  const d = Math.hypot(X, Y);
  const glow = smoothstep(1.75, 1.0, d) * smoothstep(0.98, 1.02, d);
  if (glow <= 0) return 0;
  const plume = smoothstep(-0.2, -0.9, Y / d) * 0.35 + 1;
  const breakup = smoothstep(-0.5, 0.4, noise(X * 3, Y * 3, d * 6));
  return strokes(
    d * RING_ROWS * 0.8,
    clamp01(glow * plume * mix(0.35, 1, breakup) * 0.55 * light),
    0.5,
    px * RING_ROWS * 0.8,
  );
}

/**
 * 畫到第 step 步的主星（不含軌道、星軌），像素大小 size×size、星球半徑 R 像素、中心在正中間。
 * 逐像素算，一步只算一次，之後每幀直接貼這張圖。light 是參宿四脹縮時的亮度倍數
 */
export function renderBody(theme: Theme, step: number, size: number, R: number, light = 1) {
  const spec = PLANETS[theme];
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const INK = channels(COLORS.paper);
  const GROUND = channels(COLORS.ground);
  const img = g.createImageData(size, size);
  const px = img.data;
  const c = size / 2;
  const hole = spec.kind === 'blackhole';
  const star = spec.kind === 'star';
  const withRing = hole ? step >= 1 : spec.kind === 'planet' && step >= 3;
  const withHalo = star && step >= BREATH_STEP;
  const reach = Math.ceil((withRing ? spec.ring.outer + 0.05 : withHalo ? 1.8 : 1.1) * R);
  const lo = Math.max(0, Math.floor(c - reach));
  const hi = Math.min(size, Math.ceil(c + reach));
  const p = 1 / R;
  for (let py = lo; py < hi; py++) {
    for (let qx = lo; qx < hi; qx++) {
      const X = (qx + 0.5 - c) / R;
      const Y = -(py + 0.5 - c) / R;
      const d = Math.hypot(X, Y);
      // 由下往上疊：後半圈的環 → 星球 → 正對著我們的那層（光子環、盤影、大氣）→ 前半圈的環。
      // 顏色記成「紙到墨之間的幾成」，乘上不透明度累加
      let ink = 0;
      let alpha = 0;
      const over = (v: number, a: number) => {
        ink = ink * (1 - a) + v * a;
        alpha = alpha * (1 - a) + a;
      };
      // 環：這個像素落在環平面上的哪一點；半徑每個像素變多少（往右與往下各量一個像素）
      let ring: [number, number] = [0, 0];
      let front = true;
      if (withRing) {
        const rx = X * cosR + Y * sinR;
        const rz = (X * sinR - Y * cosR) / sinT;
        front = rz * cosT >= 0;
        const r0 = Math.hypot(rx, rz);
        const fw =
          Math.abs(Math.hypot(rx + cosR * p, rz + (sinR * p) / sinT) - r0) +
          Math.abs(Math.hypot(rx - sinR * p, rz + (cosR * p) / sinT) - r0);
        ring = hole ? diskInk(spec, rx, rz, fw, step >= 2) : [1, ringInk(spec, rx, rz, fw)];
      }
      if (!front && ring[1] > 0) over(ring[0], ring[1]);
      // 星球：不透明的球，邊緣反鋸齒。黑洞是一片跟夜色同色的陰影
      if (d < 1 + p) {
        const dd = Math.min(d, 0.9999);
        const k = dd > 0 ? dd / d : 1;
        const z = Math.sqrt(1 - dd * dd);
        let v = 0;
        if (!hole) {
          const n = toPlanet(X * k, Y * k, z);
          if (star) v = starInk(spec, step, n, Y, z, spec.rows * p, light);
          else {
            const nx = toPlanet((X + p) * k, Y * k, Math.sqrt(Math.max(0, 1 - (X + p) ** 2 - Y ** 2)));
            const ny = toPlanet(X * k, (Y - p) * k, Math.sqrt(Math.max(0, 1 - X ** 2 - (Y - p) ** 2)));
            const fwN = Math.abs(nx[1] - n[1]) + Math.abs(ny[1] - n[1]);
            const fwLat =
              Math.abs(Math.asin(Math.min(1, nx[1])) - Math.asin(Math.min(1, n[1]))) * DEG +
              Math.abs(Math.asin(Math.min(1, ny[1])) - Math.asin(Math.min(1, n[1]))) * DEG;
            v = planetInk(spec, step, n, fwN, fwLat);
          }
        }
        over(v, clamp01((1 - d) * R + 0.5));
      }
      if (hole) over(1, lensInk(spec, X, Y, p, step >= 2, step >= 3));
      else if (withHalo) over(1, haloInk(X, Y, p, light));
      if (front && ring[1] > 0) over(ring[0], ring[1]);
      if (alpha <= 0) continue;
      const i = (py * size + qx) * 4;
      for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(GROUND[ch] + (INK[ch] - GROUND[ch]) * (ink / alpha));
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** 參宿四此刻脹縮到哪：半徑倍數與亮度的兩端之間走到幾成（0–1）。其他主星與前幾步不動 */
export function breathAt(theme: Theme, step: number, t: number) {
  const pulse = PLANETS[theme].pulse;
  if (!pulse || step < BREATH_STEP) return null;
  const wave = Math.sin((TAU * t) / pulse.period);
  return { scale: 1 + pulse.amp * wave, mixK: (wave + 1) / 2, light: pulse.light };
}

/** 軌道上的一點（apsis 座標）→ 星球座標：近點方向（加上進動）、傾角、升交點，照 3D 版的旋轉順序 */
function orbitToPlanet(st: StarOrbit | undefined, x: number, z: number, t: number): Vec {
  if (!st) return [x, 0, z];
  const peri = (st.peri + t * st.precession) / DEG;
  const x1 = x * Math.cos(peri) + z * Math.sin(peri);
  const z1 = -x * Math.sin(peri) + z * Math.cos(peri);
  const incl = st.incl / DEG;
  const y2 = -z1 * Math.sin(incl);
  const z2 = z1 * Math.cos(incl);
  const node = st.node / DEG;
  return [x1 * Math.cos(node) + z2 * Math.sin(node), y2, -x1 * Math.sin(node) + z2 * Math.cos(node)];
}

/** 軌道上真近點角 nu 的那一點（apsis 座標）。沒有自己形狀的是正圓 */
function orbitPoint(st: StarOrbit | undefined, i: number, nu: number): [number, number] {
  const radius = st ? (st.a * (1 - st.e * st.e)) / (1 + st.e * Math.cos(nu)) : ORBITS[i];
  return [Math.cos(nu) * radius, Math.sin(nu) * radius];
}

/** 第 i 顆此刻的真近點角：圓軌道等速轉；橢圓照克卜勒定律走（近點快、遠點慢），同 3D 版的 anomaly */
function anomaly(spec: PlanetSpec, i: number, t: number) {
  const st = spec.stars?.[i];
  const dir = spec.retrograde.includes(i) ? -1 : 1;
  const mean = satellitePhase(i) + t * satelliteSpeed(st?.a ?? ORBITS[i]) * dir;
  if (!st) return mean;
  let e = mean;
  for (let k = 0; k < 5; k++) e -= (e - st.e * Math.sin(e) - mean) / (1 - st.e * Math.cos(e));
  return 2 * Math.atan2(Math.sqrt(1 + st.e) * Math.sin(e / 2), Math.sqrt(1 - st.e) * Math.cos(e / 2));
}

/**
 * 五條軌道與上面的五顆（中心 cx, cy、星球半徑 R 像素、第 t 秒）：亮著的那一顆（on）是訊號色、外面一圈光暈，
 * 它的軌道也亮一點。參宿四的軌道是點線（拋出去的塵埃殼）。回傳五顆在畫面上的位置（給點選用）
 */
export function drawOrbits(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  cx: number,
  cy: number,
  R: number,
  t: number,
  on: number,
) {
  const spec = PLANETS[theme];
  const ink = COLORS.paper;
  const signal = COLORS.amber;
  const screen = (v: Vec) => {
    const [x, y] = toView(v);
    return { x: cx + x * R, y: cy - y * R };
  };
  ctx.lineWidth = 1;
  ctx.setLineDash(spec.kind === 'star' ? [Math.max(1.5, 0.05 * R), Math.max(2.5, 0.09 * R)] : []);
  ORBITS.forEach((_, i) => {
    const st = spec.stars?.[i];
    ctx.strokeStyle = `rgba(${ink}, ${i === on ? 0.4 : 0.14})`;
    ctx.beginPath();
    for (let k = 0; k <= 128; k++) {
      const s = screen(orbitToPlanet(st, ...orbitPoint(st, i, (k / 128) * TAU), t));
      if (k) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    }
    ctx.stroke();
  });
  ctx.setLineDash([]);
  return ORBITS.map((_, i) => {
    const st = spec.stars?.[i];
    const s = screen(orbitToPlanet(st, ...orbitPoint(st, i, anomaly(spec, i, t)), t));
    if (i === on) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 12);
      glow.addColorStop(0, `rgba(${signal}, 0.55)`);
      glow.addColorStop(1, `rgba(${signal}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${signal})`;
    } else ctx.fillStyle = `rgba(${ink}, 0.8)`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, i === on ? 3 : 2.2, 0, TAU);
    ctx.fill();
    return s;
  });
}

/**
 * 伴星（參宿四的 Siwarha）：很小、很暗的一個點，貼著主星繞。front 是要畫在主星前面（false 的時候先畫、被主星擋住）。
 * 沒有伴星的主星什麼都不畫
 */
export function drawCompanion(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  cx: number,
  cy: number,
  R: number,
  t: number,
  front: boolean,
) {
  const companion = PLANETS[theme].companion;
  if (!companion) return;
  const a = (TAU * t) / companion.period;
  const [x, y, z] = toView([Math.cos(a) * companion.a, 0, Math.sin(a) * companion.a]);
  if (z >= 0 !== front) return;
  ctx.fillStyle = `rgba(${COLORS.paper}, 0.7)`;
  ctx.beginPath();
  ctx.arc(cx + x * R, cy - y * R, Math.max(1.4, companion.size * 0.4 * R), 0, TAU);
  ctx.fill();
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
    const ink = COLORS.paper;
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
        ctx.strokeStyle = `rgba(${ink}, ${((0.04 + 0.16 * s.b) * (k + 1)) / TRAIL_PIECES})`;
        ctx.beginPath();
        ctx.arc(px, py, r, head - arc * (1 - k / TRAIL_PIECES), head - arc * (1 - (k + 1) / TRAIL_PIECES));
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${ink}, ${0.4 + 0.5 * s.b})`;
      ctx.fillRect(px + Math.cos(head) * r - 0.6, py + Math.sin(head) * r - 0.6, 1.2, 1.2);
    }
  };
}
