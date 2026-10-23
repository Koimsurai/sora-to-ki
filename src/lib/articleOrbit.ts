// 文章頁右邊那道軌道（blog/OrbitToc）的幾何。手記列表是一圈一圈的星軌，點進一篇等於鏡頭拉近到
// 其中一道：極點在畫面右邊很遠的地方，看到的是一段幾乎直立的弧。這道弧同時是目錄。
//
// 手記列表（blog/Notes）換到文章時要把那篇的星軌拉成這道弧，所以兩邊共用這份幾何：
// 位置只由視窗大小決定，換頁前後算出來的會一模一樣。

/** 軌道半徑：大到看起來幾乎是直的 */
const ORBIT_RB = 1500;
/** 窄於這個寬度沒有放軌道的空間（目錄改走別的地方） */
const ORBIT_MIN_W = 1100;
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
}

/** 內文欄的左緣（跟 CSS 的 max(56px, calc(50% - 560px)) 一樣） */
const articleLeft = (w: number) => Math.max(56, w / 2 - 560);

export function orbitGeometry(w: number, h: number): OrbitGeom | null {
  if (w < ORBIT_MIN_W) return null;
  const railX = articleLeft(w) + ARTICLE_COL + RAIL_GAP;
  const topY = 136;
  const H = Math.max(200, h - topY - 130);
  const RB = ORBIT_RB;
  return {
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
