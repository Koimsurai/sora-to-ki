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
/** 衛星的位置，與它是哪個時間點的位置（performance.timeOrigin + performance.now()，主執行緒與 worker 共用的時基） */
type PositionListener = (positions: SatelliteScreen[], at: number) => void;

/** 現在的絕對時間（毫秒）。worker 的 performance.now() 從 worker 建立時起算，加上 timeOrigin 才跟主執行緒對得上 */
export const absNow = () => performance.timeOrigin + performance.now();

let positions: SatelliteScreen[] = [];
let positionsAt = 0;
const positionListeners = new Set<PositionListener>();

/**
 * 3D 那邊每畫一幀送一次。at 是算出這些位置的時間：3D 在 worker 裡畫，訊息到主執行緒時已經晚了一點，
 * 而且跟主執行緒的幀不同步（有的幀收到兩筆、有的一筆也沒有），字照收到的時間走會一停一跳。
 * 首頁的字照 at 推算到自己這一幀的時間（home/HomeOrbit）
 */
export function publishSatellites(next: SatelliteScreen[], at = absNow()) {
  positions = next;
  positionsAt = at;
  for (const fn of positionListeners) fn(next, at);
}

export function subscribeSatellites(fn: PositionListener): () => void {
  positionListeners.add(fn);
  if (positions.length) fn(positions, positionsAt);
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
