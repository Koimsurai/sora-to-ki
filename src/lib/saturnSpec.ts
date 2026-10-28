// 首頁那顆土星的設定：3D 版（lib/starfieldGpu）與此站點遊樂場的平面版（about/colophonSaturn）共用這一份，
// 兩邊畫出來的才是同一顆。只有數字，不碰 three。
import type { Fold } from './viewportFold';
import { focusY } from './viewportShape';

/** 俯角與側傾，跟提案的示意一樣：從上方 24° 往下看，整組往右下斜 11° */
export const TILT = 0.42;
export const ROLL = -0.2;

/** 光從左上前方來（世界座標，只取方向） */
export const SUN: [number, number, number] = [-0.75, 0.45, 0.5];

/**
 * 真實土星的雲帶（Cassini 的影像）：[緯度°, 寬度°, 亮度增減]。赤道帶最亮最寬，兩側的赤道帶狀雲（NEB/SEB）
 * 最暗，往兩極一亮一暗越來越窄，極區整片暗下去；北緯 78° 那條是北極六角形的邊。
 * 正緯度只寫北半球，南半球用 mirror 標記照抄（南北不完全對稱，所以有幾條只寫一邊）
 */
const SATURN_BANDS: [lat: number, width: number, delta: number, mirror: boolean][] = [
  [0, 9, 0.26, false],
  [17, 4, -0.3, true],
  [22.5, 2.5, 0.08, true],
  [28, 2, -0.14, true],
  [33, 2.5, 0.06, true],
  [38, 1.6, -0.12, true],
  [43, 2.4, 0.05, true],
  [48, 1.5, -0.13, true],
  [53, 2, 0.03, true],
  [58, 1.8, -0.1, true],
  [-63, 2.5, -0.08, false],
  [64, 2, -0.06, false],
  [72, 5, -0.2, true],
  [78, 0.9, 0.16, false],
  [86, 6, -0.3, true],
];

/** 雲帶展開成南北兩半各一條（mirror 的那些） */
export const SATURN_BANDS_FULL: [lat: number, width: number, delta: number][] = SATURN_BANDS.flatMap(([c, w, d, m]) =>
  m
    ? [
        [c, w, d],
        [-c, w, d],
      ]
    : [[c, w, d]],
);

/**
 * 真實土星環的徑向結構（Cassini 的掩星量測，單位是土星赤道半徑）：[內緣, 外緣, 亮度]。
 * 由內到外 D、C、B（分四段，B 環中段最亮最密）、卡西尼縫、A、F；A 環裡的恩克縫、基勒縫另外挖掉
 */
export const RING_SEGMENTS: [inner: number, outer: number, tone: number][] = [
  [1.11, 1.236, 0.08],
  [1.239, 1.527, 0.26],
  [1.527, 1.64, 0.62],
  [1.64, 1.75, 0.88],
  [1.75, 1.88, 1],
  [1.88, 1.951, 0.8],
  [1.951, 2.025, 0.1],
  [2.025, 2.267, 0.62],
  [2.322, 2.33, 0.4],
];
/** A 環裡的縫（恩克縫、基勒縫）與 C 環的麥斯威爾縫：[位置, 半寬] */
export const RING_GAPS: [at: number, half: number][] = [
  [2.214, 0.006],
  [2.265, 0.003],
  [1.45, 0.006],
];
export const RING_INNER = 1.11;
export const RING_OUTER = 2.34;

/** 五顆衛星的軌道半徑（星球半徑是 1），由內到外對應首頁的五個分區（data/siteSections） */
export const ORBITS = [2.9, 3.55, 4.25, 4.95, 5.7];
/** 第 i 顆衛星起始的角度（錯開）與角速度（越外圈越慢，克卜勒的味道就好） */
export const satellitePhase = (i: number) => 0.7 + i * 1.37;
export const satelliteSpeed = (r: number) => 0.16 / Math.sqrt(r);

/** 星球每列刷痕的密度：星球半徑 1 上有幾列；環是每單位半徑幾圈 */
export const PLANET_ROWS = 22;
export const RING_ROWS = 34;
/** 最濃的地方線也只佔一列的幾成：線與線之間永遠留一道黑縫 */
export const PLANET_COVER = 0.76;
export const RING_COVER = 0.64;

/**
 * 首頁土星佔的那一塊（CSS 像素）：中心與可用的寬高。3D 背景與換頁的錨點都照這個。
 * 橫的畫面置中；直的手機提到 46%，下面留給手指；摺疊機直拿與直式平板再往上提到摺痕以上（lib/viewportShape）。
 * 摺起來時整組放進畫面那一半（書本式左半、筆電式上半），另一半留給字卡
 */
export function saturnFrame(w: number, h: number, fold: Fold | null) {
  if (fold) {
    const b = fold.first;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height };
  }
  return { x: w / 2, y: h * (h > w ? focusY(w, h, 0.46) : 0.5), width: w, height: h };
}
