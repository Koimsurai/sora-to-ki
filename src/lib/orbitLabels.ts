// 首頁衛星旁的字卡與常駐小標註擺在哪、什麼時候出來。DOM 版（home/HomeOrbit）與畫進 3D 的版本
// （lib/labelOverlay，在 worker 裡）用同一套，兩邊才不會各算各的。純函式，不碰 DOM。
import { saturnFrame } from './saturnSpec';
import type { Fold } from './viewportFold';
import { isTallMedium } from './viewportShape';

/** 軌道在畫面上是扁的（寬約是高的 2.5 倍）：算「往外」的方向前先把縱向拉回圓的 */
const ORBIT_FLAT = 2.5;
/** 字離衛星多遠 */
const GAP_X = 18;
const GAP_Y = 12;
/** 常駐小標註離衛星多遠 */
const TAG_GAP_X = 10;
const TAG_GAP_Y = 7;
/** 比這窄的畫面，浮出來的那張字卡放在土星下方的空白，不貼著衛星（手機上貼著會壓到軌道） */
const NARROW_PX = 640;
/** 字卡與小標註淡入淡出的時間（跟 HomeOrbit.css 的 --dur-300 與 ease 一樣） */
export const LABEL_FADE_MS = 300;

/** 這一幀的版面：視窗多大、摺沒摺、字往外長的中心、是不是窄畫面 */
export interface OrbitFrame {
  w: number;
  h: number;
  /** 字往外長的方向以這一點為中心。攤平時照原本的畫面中心（土星在 46% 時差一點，看不出來） */
  cx: number;
  cy: number;
  /**
   * 窄畫面：字卡放到土星下方那片空白、置中。摺疊機直拿（中等寬度的直式）也照窄畫面排：
   * 土星提到摺痕以上，字卡放到下面那片空白
   */
  narrow: boolean;
  /** 摺起來了：字卡換成另一半的目錄，不出來 */
  folded: boolean;
  /** 土星的中心在畫面上的高度（窄畫面的字卡照它往下放） */
  saturnY: number;
}

export function orbitFrame(w: number, h: number, fold: Fold | null): OrbitFrame {
  const sat = fold ? saturnFrame(w, h, fold) : null;
  return {
    w,
    h,
    cx: sat ? sat.x : w / 2,
    cy: sat ? sat.y : h / 2,
    narrow: fold !== null || w < NARROW_PX || isTallMedium(w, h),
    folded: fold !== null,
    saturnY: saturnFrame(w, h, fold).y,
  };
}

/** 字卡該多顯眼（glow 是靠近、閒置提示給的亮度）：衛星轉到星球後面、換頁正在收、摺起來時不出來 */
export function cardShow(glow: number, hidden: boolean, leaving: boolean, o: OrbitFrame) {
  return hidden || leaving || o.folded ? 0 : glow;
}

/**
 * 常駐小標註出不出來：字卡一開始浮出，它就整個讓位（它自己有 0.3 秒的淡出）。照字卡亮度按比例退的話，
 * 閒置提示的字卡只亮到一半，標註還剩兩成，兩個疊在一起。窄畫面的字卡不貼著衛星，不必讓
 */
export function tagShow(card: number, hidden: boolean, leaving: boolean, o: OrbitFrame) {
  return hidden || leaving || (!o.narrow && card > 0.01) ? 0 : 1;
}

interface Outward {
  ux: number;
  uy: number;
  /** 字有幾成落在點的左邊（上面）：0 是整個在右（下），1 是整個在左（上） */
  fx: number;
  fy: number;
}

/**
 * 字往「遠離土星」的方向長，不壓在軌道與土星上。錨點跟著衛星繞土星的角度連續地變：
 * 在右邊時字從點的右側開始、在左邊時字結束在點的左側、在正下方時字置中在點下面——
 * 衛星怎麼走字就怎麼跟，不會在某個位置突然被推到另一邊
 */
function outward(p: { x: number; y: number }, o: OrbitFrame): Outward {
  const dx = p.x - o.cx;
  const dy = (p.y - o.cy) * ORBIT_FLAT;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { ux, uy, fx: o.narrow ? 0.5 : 0.5 - 0.5 * ux, fy: 0.5 - 0.5 * uy };
}

/**
 * 字卡的左上角（視窗座標）與每一行對齊的比例 fx：每一行照同一個比例對齊
 * （在右邊靠左、在左邊靠右、在下面置中），一行往右挪 (字卡寬 − 那一行寬) × fx
 */
export function cardAt(p: { x: number; y: number }, size: { w: number; h: number }, o: OrbitFrame) {
  const { ux, uy, fx, fy } = outward(p, o);
  const { w, h } = size;
  let x = p.x + ux * GAP_X - w * fx;
  let y = p.y + uy * GAP_Y - h * fy;
  // 窄畫面：軌道幾乎佔滿寬度，貼著衛星一定壓到軌道。字卡放到土星下方那片空白、置中，
  // 是哪一顆由 3D 那邊亮起來的衛星與軌道指出來
  if (o.narrow) {
    x = o.cx - w / 2;
    y = o.saturnY + Math.min(o.h * 0.24, 220);
  }
  x = Math.max(16, Math.min(o.w - w - 16, x));
  y = Math.max(72, Math.min(o.h - h - 16, y));
  return { x, y, fx };
}

/** 常駐小標註的左上角（視窗座標；含 margin 的那個框，跟 DOM 版的 translate 同一個點） */
export function tagAt(p: { x: number; y: number }, size: { w: number; h: number }, o: OrbitFrame) {
  const { ux, uy, fy } = outward(p, o);
  return {
    x: Math.max(8, Math.min(o.w - size.w - 8, p.x + ux * TAG_GAP_X - size.w * (0.5 - 0.5 * ux))),
    y: Math.max(64, Math.min(o.h - size.h - 8, p.y + uy * TAG_GAP_Y - size.h * fy)),
  };
}
