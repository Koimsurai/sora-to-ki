// 首訪首頁的開場（超空間跳躍）時間軸——純函式，不碰 three，所以能單獨測。
//
// 開場畫在 WebGPU 背景同一張 canvas、同一條渲染迴圈裡（lib/hyperspace.ts 畫星芒與疊圖，
// lib/starfieldGpu.ts 決定每幀畫什麼）。這裡只回答「第 t 毫秒時，每個東西該是什麼樣子」。
// 時間以開場第一幀為 0，單位 ms。
//
// 數值與曲線是照 2D canvas + CSS 時代的版本逐項搬過來的（CSS keyframes 的緩動是「每一段各自
// 套一次」，這裡照同樣的語意算），所以畫面與時序跟以前一致。

export const INTRO = {
  /** 星芒從靜止加速到全速 */
  rampEnd: 400,
  /** 全速結束、開始減速 */
  peakEnd: 1900,
  /** 解開內容。內容在開場前已先畫好（見 index.css 的 html.intro-pending） */
  preReveal: 1800,
  flashStart: 2200,
  flashDuration: 1100,
  /** 星芒清空、星空與土星現身 */
  explosion: 2900,
  /** 爆炸後多久土星開始放大 */
  saturnDelay: 200,
  /** 開場層開始淡出 */
  endStart: 3200,
  fadeDuration: 300,
  /** 星芒層的淡入＋往前推進 */
  entryDuration: 2400,
  /** 星空在爆炸後淡入的時間（在閃光底下發生） */
  sceneFade: 600,
} as const;

/** 跳過時：多久後開始淡出（以前是點擊後 80ms 才開始 fade） */
const SKIP_FADE_DELAY = 80;

export type IntroPhase = 'started' | 'preReveal' | 'explosion' | 'ending' | 'done';

/** CSS cubic-bezier()：給 x（時間進度）求 y。牛頓法，不收斂就退二分法 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

// index.css 的 --easing-standard / --easing-out，以及 CSS 關鍵字 ease-out
const easeStandard = cubicBezier(0.4, 0, 0.2, 1);
const easeOutToken = cubicBezier(0.22, 1, 0.36, 1);
const easeOutKeyword = cubicBezier(0, 0, 0.58, 1);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Frame = readonly [offset: number, a: number, b: number];

/** CSS keyframes 的語意：先找所在的段，緩動套在段內進度上 */
function keyframes(p: number, frames: readonly Frame[], ease: (x: number) => number): [number, number] {
  let a = frames[0];
  if (p <= a[0]) return [a[1], a[2]];
  for (const b of frames.slice(1)) {
    if (p <= b[0]) {
      const k = ease((p - a[0]) / (b[0] - a[0]));
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    a = b;
  }
  return [a[1], a[2]];
}

// [進度, opacity, scale]
const ENTRY_FRAMES: readonly Frame[] = [
  [0, 0, 0.94],
  [0.09, 1, 0.96],
  [1, 1, 1.1],
];
const FLASH_FRAMES: readonly Frame[] = [
  [0, 0, 0.3],
  [0.37, 1, 1.6],
  [1, 0, 3.4],
];

/** 星芒速度倍率：從靜止加速 → 全速 → 減速到停 */
function speedMult(t: number): number {
  if (t < INTRO.rampEnd) return Math.pow(t / INTRO.rampEnd, 1.4);
  if (t < INTRO.peakEnd) return 1;
  if (t < INTRO.explosion) return 1 - easeOutCubic((t - INTRO.peakEnd) / (INTRO.explosion - INTRO.peakEnd));
  return 0;
}

/** 各階段實際發生的時間。跳過會把後面的階段整批提前 */
export function phaseTimes(skippedAt: number | null) {
  const explosion = skippedAt === null ? INTRO.explosion : Math.min(INTRO.explosion, skippedAt);
  const endStart = skippedAt === null ? INTRO.endStart : Math.min(INTRO.endStart, skippedAt + SKIP_FADE_DELAY);
  return {
    started: 0,
    preReveal: skippedAt === null ? INTRO.preReveal : Math.min(INTRO.preReveal, skippedAt),
    explosion,
    ending: endStart,
    done: endStart + INTRO.fadeDuration,
    saturnZoom: explosion + INTRO.saturnDelay,
  };
}

const PHASE_ORDER: readonly IntroPhase[] = ['started', 'preReveal', 'explosion', 'ending', 'done'];

/** (prev, now] 之間跨過的階段，依序。prev < 0 表示還沒開始（第一幀會得到 started） */
export function phasesCrossed(prev: number, now: number, skippedAt: number | null): IntroPhase[] {
  const times = phaseTimes(skippedAt);
  return PHASE_ORDER.filter((p) => times[p] > prev && times[p] <= now);
}

export interface IntroFrameState {
  speedMult: number;
  /** 星芒還要不要畫／更新（爆炸時清空） */
  streaks: boolean;
  /** 以 60Hz 為基準的每幀殘影淡出量（全速期 0.12、減速期 0.28） */
  trailFade60: number;
  /** 星芒層的淡入與推進縮放 */
  entryOpacity: number;
  entryScale: number;
  flashOpacity: number;
  flashScale: number;
  /** 整個開場層（底色＋星芒＋閃光）的不透明度，結尾淡出 */
  stageOpacity: number;
  /** 星空與土星的不透明度：爆炸前 0（被開場層蓋住），爆炸後淡入 */
  sceneOpacity: number;
  saturnAnimate: boolean;
}

export function introFrame(t: number, skippedAt: number | null): IntroFrameState {
  const times = phaseTimes(skippedAt);
  const [entryOpacity, entryScale] = keyframes(t / INTRO.entryDuration, ENTRY_FRAMES, easeStandard);
  const [flashOpacity, flashScale] =
    t < INTRO.flashStart
      ? [0, 0.3]
      : keyframes((t - INTRO.flashStart) / INTRO.flashDuration, FLASH_FRAMES, easeOutToken);
  return {
    speedMult: speedMult(t),
    streaks: t < times.explosion,
    trailFade60: t > INTRO.peakEnd ? 0.28 : 0.12,
    entryOpacity,
    entryScale,
    flashOpacity,
    flashScale,
    stageOpacity: 1 - easeOutKeyword(clamp01((t - times.ending) / INTRO.fadeDuration)),
    sceneOpacity: t < times.explosion ? 0 : easeOutKeyword(clamp01((t - times.explosion) / INTRO.sceneFade)),
    saturnAnimate: t >= times.saturnZoom,
  };
}

/**
 * 殘影的淡出量換算到實際的幀間隔。
 *
 * 以前是每幀蓋一層固定 alpha 的底色，所以殘影長度跟著更新率走：180Hz 螢幕上每秒蓋 3 倍次數，
 * 殘影只剩 60Hz 的 1/3。這裡換算成「每 16.7ms 淡掉 a」，任何更新率看起來都跟 60Hz 設計時一樣。
 */
export function trailFadeFor(a60: number, dtMs: number): number {
  return 1 - Math.pow(1 - a60, dtMs / (1000 / 60));
}
