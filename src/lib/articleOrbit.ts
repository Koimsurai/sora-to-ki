// 文章頁右邊那道軌道（blog/OrbitToc）的幾何。手記列表是一圈一圈的星軌，點進一篇等於鏡頭拉近到
// 其中一道：極點在畫面右邊很遠的地方，看到的是一段幾乎直立的弧。這道弧同時是目錄。
//
// 手記列表（blog/Notes）換到文章時要把那篇的星軌拉成這道弧，所以兩邊共用這份幾何：
// 位置只由視窗大小（與摺疊機摺起來的兩半）決定，換頁前後算出來的會一模一樣。

import { currentFold, type Fold } from './viewportFold';

/** 軌道半徑：大到看起來幾乎是直的 */
const ORBIT_RB = 1500;
/** 窄於這個寬度，內文欄旁邊沒有空間：軌道貼到右邊緣，章節名收進底部的清單 */
const ORBIT_MIN_W = 1100;
/** 貼邊的軌道半徑更大：邊上只有十來 px，弧要直到兩端不跑出畫面（拱起約 H²/8RB，844 高時約 9px） */
const NARROW_RB = 8000;
/** 貼邊時軌道中段離右緣多遠（內文右邊留白約 18px，刻度往內 5px 不壓到字） */
const NARROW_EDGE = 10;
/** 內文欄寬與它離軌道多遠（跟 BlogPost.css 的 --ar-col / --ar-gap 一樣） */
const ARTICLE_COL = 680;
const RAIL_GAP = 120;

export interface OrbitGeom {
  railX: number;
  topY: number;
  H: number;
  cx: number;
  cy: number;
  aTop: number;
  aBot: number;
  RB: number;
  /** 貼在右邊緣的窄螢幕版（章節名不放在刻度旁，收進底部的清單） */
  narrow: boolean;
  /** 筆電式摺起來：軌道只在上半，底部的清單一直開著、佔滿下半 */
  docked: boolean;
}

/** 內文欄的左緣（跟 CSS 的 max(56px, calc(50% - 560px)) 一樣） */
const articleLeft = (w: number) => Math.max(56, w / 2 - 560);

/** 書本式摺起來時軌道離摺痕多遠：其他文章的軌道畫在它左邊 50px 內，不能越過摺痕壓到內文 */
const FOLD_RAIL_GAP = 64;

export function orbitGeometry(w: number, h: number, fold: Fold | null = currentFold()): OrbitGeom {
  // 書本式摺起來：內文在左半，右半是寬螢幕那種帶章節名的軌道
  const book = fold?.pose === 'book';
  const narrow = !book && w < ORBIT_MIN_W;
  // 窄螢幕：頂端在頁首（56–60px）底下，底端貼近畫面下緣
  const railX = book
    ? fold.second.x + FOLD_RAIL_GAP
    : narrow
      ? w - NARROW_EDGE
      : articleLeft(w) + ARTICLE_COL + RAIL_GAP;
  const topY = narrow ? 84 : 136;
  const docked = fold?.pose === 'laptop';
  const bottom = docked ? fold.first.y + fold.first.height - 16 : h - (narrow ? 36 : 130);
  const H = Math.max(200, bottom - topY);
  const RB = narrow ? NARROW_RB : ORBIT_RB;
  return {
    narrow,
    docked,
    railX,
    topY,
    H,
    cx: railX + RB,
    cy: topY + H / 2,
    aTop: Math.PI + H / (2 * RB),
    aBot: Math.PI - H / (2 * RB),
    RB,
  };
}

/** u：0 是軌道頂端（文章開頭）、1 是底端 */
export const orbitAngle = (g: OrbitGeom, u: number) => g.aTop + (g.aBot - g.aTop) * u;

export function orbitPoint(g: OrbitGeom, u: number, r = g.RB) {
  const a = orbitAngle(g, u);
  return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
}

// ── 換頁時兩邊交棒 ──
// 手記把某一篇的星軌拉成這道軌道之後，文章頁一出來就直接把軌道畫滿（不再從頂端長下來）；
// 文章頁離開回到手記時反過來：手記一出來，那一篇的星軌已經在原位、亮著
let handoff: { to: 'article' | 'notes'; postId: number; at: number } | null = null;

export function setOrbitHandoff(to: 'article' | 'notes', postId: number) {
  handoff = { to, postId, at: performance.now() };
}

/** 取走交棒：只認兩秒內、交給自己的 */
export function takeOrbitHandoff(to: 'article' | 'notes'): number | null {
  const h = handoff;
  if (!h || h.to !== to || performance.now() - h.at > 2000) return null;
  handoff = null;
  return h.postId;
}
