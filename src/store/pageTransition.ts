// 換頁轉場（layout/TransitionLayer）與各頁之間的約定。
//
// 每一頁都從一個點出發、收回一個點，而且是一筆連下去的：
//   收：舊的那一頁「本身」收進一個點（首頁的土星收進點下去的那顆衛星、碎念的彗尾縮回彗核），
//       換頁要等它收完才真的發生
//   飛：那個點帶著收進去時的方向飛出去，沿一條順的曲線落到下一頁的錨點，身後拉著線
//   長：下一頁從錨點長出來；頁面可以接手，連那條線一起變成自己的第一筆
// 這裡是兩邊交換資訊的地方：頁面報上自己的錨點、怎麼收、要點從哪個方向進來、長的時候接不接手；
// 連結報上「這次是從哪個點出發」（data-tx / data-ty / data-pt-source，或 markTransitionFrom）。

export interface Pt {
  x: number;
  y: number;
}

/** 頁面收完之後交給轉場的東西 */
export interface Departure {
  /** 收進去的那一點（視窗座標）：點從這裡飛出去 */
  point: Pt;
  /** 飛出去的初速（px/ms）。沒有就從靜止起步 */
  velocity?: Pt;
  /** 收完的時候。換頁會等它 */
  done: Promise<void>;
}

export interface LeaveContext {
  /** 點下去的位置；上一頁、下一頁、點導覽列時是 null */
  from: Pt | null;
  /** 點下去的東西自己報的名字（例如首頁衛星的序號） */
  source: string | null;
}

/** 點要怎麼落進這一頁 */
export interface Arrival {
  /** 最後一段要沿著走的路（視窗座標），終點是錨點：碎念是沿著彗尾往上飛進彗核 */
  approach?: Pt[];
  /** 沒有 approach 時，點抵達時的方向（單位向量） */
  tangent?: Pt;
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
  /** 這一頁的錨點（視窗座標）：換進來時點落在這裡，上一頁、下一頁時從這裡出發 */
  anchor?: () => Pt | null;
  /** 點要怎麼落進來；不給就由轉場自己挑一條順的路 */
  arrive?: () => Arrival | null;
  /** 這一頁自己收進一個點；不給的話轉場用一圈遮罩把整頁收進錨點 */
  leave?: (ctx: LeaveContext) => Departure | null;
  /**
   * 點抵達之後頁面自己長出來。回傳接手了什麼：
   *   'self'  頁面自己長，那條線由轉場收回點裡
   *   'trail' 頁面自己長，而且那條線由頁面接著畫（變成它的第一筆），轉場這邊直接收掉
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

interface Mark {
  pt: Pt | null;
  source: string | null;
}
let pending: (Mark & { at: number }) | null = null;

/** 連結被點下去時記住出發點；不是點連結觸發的換頁（上一頁、程式導覽）就用不到它 */
export function markTransitionFrom(pt: Pt | null, source: string | null = null) {
  pending = { pt, source, at: performance.now() };
}

/** 取走出發點：只認一秒內記下的，太舊的代表跟這次換頁無關 */
export function takeTransitionFrom(): Mark | null {
  const p = pending;
  pending = null;
  return p && performance.now() - p.at < 1000 ? { pt: p.pt, source: p.source } : null;
}

/** 頁面的「收」用的計時：時間到就算收完 */
export const after = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
