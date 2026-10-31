// 換頁轉場的數學與路線幾何（layout/TransitionLayer 的那一趟，lib/transition 的場景）。純函式，不碰 DOM：
// 主執行緒與轉場的 worker 用的是同一份，兩邊算出來的位置才會一樣。
import type { Pt } from '@/store/pageTransition';

/** 海王星的彈弓（flyby）：路線被那顆星彎了多少（rad）、近拱點到出口是直飛那段的幾倍長 */
const SLING_DEFLECT = (110 * Math.PI) / 180;
const SLING_ARM = 0.75;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number) => t * t * t;
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const lerp = (p: Pt, q: Pt, k: number): Pt => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
export const len = (p: Pt) => Math.hypot(p.x, p.y);
export const unit = (p: Pt): Pt => {
  const l = len(p) || 1;
  return { x: p.x / l, y: p.y / l };
};

/**
 * 時間膨脹：越靠近黑洞時間走得越慢。點是從黑洞旁邊逃出去的：起步那段幾乎停住（速度照 τ³ 長），
 * 越離越遠越快，後段照常減速落地。回傳 0–1 的路程
 */
export const escape = (tau: number) => 1 - (1 - Math.cos(Math.PI * (1 - tau ** 2))) / 2;

/** 一條路：點列與每一點從起點量起的路長 */
export interface Path {
  points: Pt[];
  cum: number[];
}

/** 一趟飛行（新的一頁報到之後排好的） */
export interface Flight extends Path {
  total: number;
  at: number;
  dur: number;
  /** 對焦（鏡頭移到點上）要多久；這段時間點停在 start */
  acquire: number;
  start: Pt;
  /** 鏡頭在路長的這一段裡煞停（點快接上頁面的線的時候） */
  brakeFrom: number;
  brakeTo: number;
}

/**
 * 海王星的重力彈弓：航海家 2 號 1989 年飛掠海王星，軌道被它拉彎——那是一條雙曲線，焦點就是那顆星。
 * 直直進來、在離星最近的地方急轉、再直直出去，偏折 SLING_DEFLECT。
 * 照真的雙曲線算（焦點在原點、p = 1：r = 1 / (1 + e cos ν)，偏折 δ 對應 e = 1 / sin(δ/2)），
 * 轉到出去的方向是 outDir、縮放到近拱點離出口 SLING_ARM × L，再把入口挪到 start。
 * side 決定往哪邊繞。回傳路上的點與那顆星（焦點）的位置
 */
export function flyby(start: Pt, outDir: Pt, L: number, side: number): { points: Pt[]; focus: Pt } {
  const e = 1 / Math.sin(SLING_DEFLECT / 2);
  const nuMax = Math.acos(-1 / e) * 0.86;
  const n = 64;
  const raw = Array.from({ length: n + 1 }, (_, i) => {
    const nu = -nuMax + (2 * nuMax * i) / n;
    const radius = 1 / (1 + e * Math.cos(nu));
    return { x: radius * Math.cos(nu), y: side * radius * Math.sin(nu) };
  });
  const last = raw[n];
  const before = raw[n - 1];
  const peri = raw[n / 2];
  const turn = Math.atan2(outDir.y, outDir.x) - Math.atan2(last.y - before.y, last.x - before.x);
  const k = (SLING_ARM * L) / Math.hypot(last.x - peri.x, last.y - peri.y);
  const c = Math.cos(turn) * k;
  const sn = Math.sin(turn) * k;
  const place = (p: Pt): Pt => ({ x: p.x * c - p.y * sn, y: p.x * sn + p.y * c });
  const first = place(raw[0]);
  const move = { x: start.x - first.x, y: start.y - first.y };
  return {
    points: raw.map((p) => {
      const q = place(p);
      return { x: q.x + move.x, y: q.y + move.y };
    }),
    focus: move,
  };
}

/** 三次 Hermite：從 p0（切向 m0）到 p1（切向 m1） */
export function hermite(p0: Pt, m0: Pt, p1: Pt, m1: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return {
      x: h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
      y: h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
    };
  });
}

/** 沿著路走 s 的長度落在哪 */
export function pointAt(f: Path, s: number): Pt {
  const { points, cum } = f;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const k = clamp((s - cum[i - 1]) / span);
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * k,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * k,
  };
}

/** 點列的累積路長 */
export function cumulative(points: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + len({ x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }));
  return cum;
}
