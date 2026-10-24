// 首頁的五顆衛星：3D 背景與首頁之間的兩條線。
//
// 衛星是 3D 場景裡的東西（lib/starfieldGpu 的 buildSaturn），但名字、最新一則這些字是一般的連結
// （home/HomeOrbit）：鍵盤、螢幕閱讀器、搜尋引擎都要看得到。所以
//   3D → 首頁：每畫一幀，把衛星投影到螢幕上的位置送過來，字跟著它走
//   首頁 → 3D：滑鼠靠近哪一顆、鍵盤停在哪一顆，就把它的亮度送回去，那條軌道與那顆衛星亮起來

export interface SatelliteScreen {
  /** 視窗座標（CSS 像素） */
  x: number;
  y: number;
  /** 轉到土星後面、被擋住了 */
  hidden: boolean;
}

type Listener<T> = (value: T) => void;

let positions: SatelliteScreen[] = [];
const positionListeners = new Set<Listener<SatelliteScreen[]>>();

export function publishSatellites(next: SatelliteScreen[]) {
  positions = next;
  for (const fn of positionListeners) fn(next);
}

export function subscribeSatellites(fn: Listener<SatelliteScreen[]>): () => void {
  positionListeners.add(fn);
  if (positions.length) fn(positions);
  return () => {
    positionListeners.delete(fn);
  };
}

let glow: number[] = [];
const glowListeners = new Set<Listener<number[]>>();

/** 每顆衛星該有多亮（0 到 1）；3D 那邊自己會慢慢靠過去，不必每幀送 */
export function setSatelliteGlow(next: number[]) {
  if (next.length === glow.length && next.every((v, i) => v === glow[i])) return;
  glow = next;
  for (const fn of glowListeners) fn(next);
}

export function subscribeSatelliteGlow(fn: Listener<number[]>): () => void {
  glowListeners.add(fn);
  fn(glow);
  return () => {
    glowListeners.delete(fn);
  };
}

const collapseListeners = new Set<Listener<number>>();

/** 換頁轉場的「收」：土星整組收進第 index 顆衛星（-1 是收進中心），見 home/HomeOrbit */
export function collapseSaturnTo(index: number) {
  for (const fn of collapseListeners) fn(index);
}

export function subscribeSaturnCollapse(fn: Listener<number>): () => void {
  collapseListeners.add(fn);
  return () => {
    collapseListeners.delete(fn);
  };
}
