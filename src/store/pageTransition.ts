// 換頁轉場（layout/TransitionLayer）與各頁之間的約定。
//
// 每一頁都從一個點出發、收回一個點，而且是一筆連下去的：
//   收：舊的那一頁「本身」收進一個點（首頁的土星收進點下去的那顆衛星、碎念的彗尾縮回彗核），
//       換頁要等它收完才真的發生
//   飛：鏡頭追著那個點；最後一段順著下一頁自己的線（星軌、彗尾…）落到錨點，身後的彗尾自己散掉
//   長：下一頁從錨點長出來
// 這裡是兩邊交換資訊的地方：頁面報上自己的錨點、怎麼收、點最後沿哪條線進來、長的時候要做什麼；
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
  /** 收的時候那一點自己在動（例如手記的星軌被拉成文章的軌道，那顆星跟著移）：點跟著它畫 */
  follow?: () => Pt;
  /**
   * follow 從收開始算還會動多久（ms）。比 done 長的話，換頁之後點照樣跟著它，
   * 動完才落地（手記推近到一半就換頁，新的一頁跟後半段的推近疊在一起）
   */
  followMs?: number;
  /**
   * 收完之後留在畫面上的線（例如被拉成文章軌道的那道星軌）：舊的一頁藏起來之後由轉場接著畫，
   * 下一頁長出來時才淡掉——兩頁之間那條線不會斷一下
   */
  residue?: (ctx: CanvasRenderingContext2D) => void;
}

export interface LeaveContext {
  /** 點下去的位置；上一頁、下一頁、點導覽列時是 null */
  from: Pt | null;
  /** 點下去的東西自己報的名字（例如首頁衛星的序號） */
  source: string | null;
  /** 要去哪一頁（去掉語系前綴、不含開頭的 /，例如 'blog'、'blog/frigate'） */
  to: string;
}

/** 點要怎麼落進這一頁 */
export interface Arrival {
  /**
   * 最後一段要沿著走的路（視窗座標），終點是錨點。要是頁面自己的線的一段（碎念的彗尾、手記的星軌）：
   * 點順著它進來，落地時彗尾散掉，留下的就是頁面自己的線
   */
  approach?: Pt[];
  /** 沒有 approach 時，點抵達時的方向（單位向量） */
  tangent?: Pt;
  /** 鏡頭不動、頁面不滑進來（點已經在錨點上，例如手記的星軌直接被拉成文章的軌道） */
  still?: boolean;
}

export interface GrowContext {
  /** 出發的點、抵達的點（視窗座標） */
  from: Pt;
  to: Pt;
  /** 點飛過的路線（彗尾由轉場自己散掉，頁面要拿來定位可以用） */
  trail: Pt[];
}

export interface PageTransitionHandle {
  /** 這一頁的錨點（視窗座標）：換進來時點落在這裡，上一頁、下一頁時從這裡出發 */
  anchor?: () => Pt | null;
  /**
   * 點要怎麼落進來：給的是鏡頭停下那一刻點在畫面上的位置（正中間）與速度 px/ms，頁面從那裡挑一條順路的；
   * 不給就由轉場自己挑
   */
  arrive?: (dot: { pos: Pt; vel: Pt }) => Arrival | null;
  /** 這一頁自己收進一個點；不給的話轉場用一圈遮罩把整頁收進錨點 */
  leave?: (ctx: LeaveContext) => Departure | null;
  /** 點落地、頁面露出來的那一刻（頁面的進場本來就等 isArriving() 變 false，多數頁面用不到它） */
  onGrow?: (ctx: GrowContext) => void;
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

/**
 * 新的一頁還在等點落地（html[data-pt] 是 out 或 fly）：頁面自己的進場（星軌長出來、土星撐開…）
 * 要等點落地才開始。飛的時候頁面已經看得到、正跟著鏡頭滑進來，但還不該開始長
 */
export const isArriving = () => {
  const pt = document.documentElement.dataset.pt;
  return pt === 'out' || pt === 'fly';
};
