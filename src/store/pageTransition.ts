// 換頁轉場（layout/TransitionLayer）與各頁之間的約定。
//
// 每一頁都從一個點出發、收回一個點：換頁時，琥珀點從你點的那個點出發，沿弧線飛到下一頁的錨點，
// 身後拉出一條線，新的一頁從錨點長出來。這裡是兩邊交換資訊的地方：
//   - 頁面報上自己的錨點，與「長」的時候要不要自己接手（usePageTransition）
//   - 連結報上「這次是從哪個點出發」（data-tx / data-ty，或 markTransitionFrom）

export interface Pt {
  x: number;
  y: number;
}

export interface GrowContext {
  /** 出發的點、抵達的點（視窗座標） */
  from: Pt;
  to: Pt;
  /** 點飛過的路線。頁面要接手的話，這條線就是它的第一筆 */
  trail: Pt[];
}

export type GrowTakeover = 'self' | 'trail';

export interface PageTransitionHandle {
  /** 這一頁的錨點（視窗座標）：換進來時點飛到這裡，換出去時（上一頁、下一頁）從這裡出發 */
  anchor?: () => Pt | null;
  /**
   * 點抵達之後頁面自己長出來。回傳接手了什麼：
   *   'self'  頁面自己長，轉場不做預設的圓形遮罩，那條線由轉場淡掉
   *   'trail' 頁面自己長，而且那條線由頁面接著畫下去（變成它的第一筆），轉場這邊直接收掉
   *   不回傳  沒接手，走預設：從錨點擴開一圈遮罩把頁面揭開
   */
  onGrow?: (ctx: GrowContext) => GrowTakeover | undefined;
}

let current: PageTransitionHandle | null = null;
let generation = 0;

/** 頁面掛載時報到，卸載時取消。回傳的函式就是取消 */
export function registerPage(handle: PageTransitionHandle): () => void {
  current = handle;
  generation += 1;
  const mine = generation;
  return () => {
    if (generation === mine) current = null;
  };
}

/** 現在登記著的頁面，以及它是第幾次登記（用來分辨「新的一頁已經報到了沒」） */
export function currentPage(): { handle: PageTransitionHandle | null; generation: number } {
  return { handle: current, generation };
}

let pendingFrom: { pt: Pt; at: number } | null = null;

/** 連結被點下去時記住出發點；不是點連結觸發的換頁（上一頁、程式導覽）就用不到它 */
export function markTransitionFrom(pt: Pt) {
  pendingFrom = { pt, at: performance.now() };
}

/** 取走出發點：只認一秒內記下的，太舊的代表跟這次換頁無關 */
export function takeTransitionFrom(): Pt | null {
  const p = pendingFrom;
  pendingFrom = null;
  return p && performance.now() - p.at < 1000 ? p.pt : null;
}
