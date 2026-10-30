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

interface LeaveContext {
  /** 點下去的位置；上一頁、下一頁、點導覽列時是 null */
  from: Pt | null;
  /** 點下去的東西自己報的名字（例如首頁衛星的序號） */
  source: string | null;
  /** 要去哪一頁（去掉語系前綴、不含開頭的 /，例如 'blog'、'blog/frigate'） */
  to: string;
}

/** 點要怎麼落進這一頁 */
interface Arrival {
  /**
   * 最後一段要沿著走的路（視窗座標），終點是錨點。要是頁面自己的線的一段（碎念的彗尾、手記的星軌）：
   * 點順著它進來，落地時彗尾散掉，留下的就是頁面自己的線
   */
  approach?: Pt[];
  /**
   * approach 的前面幾點可以在畫面外（例如沿著星軌往回延伸的那段）：點在那一段時鏡頭還跟著它，
   * 到第 join 點時鏡頭剛好停下，之後才是畫在畫面上的那段。不給就是 0（鏡頭在 approach 的起點停）
   */
  join?: number;
  /** 飛的速度倍率：小於 1 是慢慢來（關於頁的下墜） */
  pace?: number;
  /** 沒有 approach 時，點抵達時的方向（單位向量） */
  tangent?: Pt;
  /** 鏡頭不動、頁面不滑進來（點已經在錨點上，例如手記的星軌直接被拉成文章的軌道） */
  still?: boolean;
}

interface GrowContext {
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
  /**
   * 這一頁沒換、只是換了主題之後接回來（arriveFrom 的 quiet）：點要沿著走的那條線（視窗座標），
   * 終點是這一頁「現在」的那一點（火箭的機鼻、天線、最新的那顆月亮）。換頁進來時線還沒畫，點落在起點（anchor）；
   * 接回來時線早就畫好了，點順著它走到現在的位置才對。每一幀都會重讀，線在動也跟得上。不給就直直飛到 anchor
   */
  rejoin?: () => Pt[] | null;
  /**
   * 給了的話，點走那條線另外用這個速度（px/ms），而且先停在線的起點再走：飛過去、沿著線走是兩拍。
   * 關於頁的線（高度計）很短、又是重點（讀數一路往下數），跟飛過去混成一段會一下就滑完
   */
  rejoinPace?: number;
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

/**
 * 轉場的點此刻在畫面上的哪裡（視窗座標）；沒有在飛就是 null。轉場每一幀寫進來，
 * 頁面要「跟著點畫線」時讀（例如此站點的點穿過幾顆星、身後留下星座線——彗尾會散，星座線不會）
 */
let dotNow: Pt | null = null;
export const setTransitionDot = (p: Pt | null) => {
  dotNow = p;
};
export const transitionDot = (): Pt | null => dotNow;

/** 一趟站內換頁的順暢度：從點下去到轉場跑完，轉場那條迴圈每一幀之間隔了多久（lib/reportWebVitals 上報成 TX） */
export interface TransitionReport {
  from: string;
  to: string;
  /** 從點下去到轉場跑完（毫秒） */
  ms: number;
  frames: number;
  /** 最長那一幀（毫秒） */
  maxFrame: number;
  /** 超過 50ms 的幀數 */
  long: number;
}
const transitionListeners = new Set<(r: TransitionReport) => void>();
export function reportTransition(r: TransitionReport) {
  for (const fn of transitionListeners) fn(r);
}
export function subscribeTransitions(fn: (r: TransitionReport) => void): () => void {
  transitionListeners.add(fn);
  return () => {
    transitionListeners.delete(fn);
  };
}

/**
 * 開場退場（夜色開始淡掉、讀者看得到頁面）的那一刻（lib/reportWebVitals 上報成 BOOT）。
 * 上報那邊可能比開場晚掛上，所以記住最後一次，訂閱時補送
 */
export interface BootReport {
  /** performance.now()：從這次載入開始算 */
  at: number;
  /** ring：首頁交棒給 3D 土星；collapse：環收回點裡 */
  end: 'ring' | 'collapse';
  /** 開場的程式開始跑的時間（JS 到了、React 接手）；從這裡起最多等 3.5 秒 */
  startedAt: number;
  /** 等完（或等到上限）的時間；之後是最短停留與收場動畫 */
  waitedAt: number;
  /** 最後等到的那一項：load（整頁含圖片）、fonts、paint、sky（首頁的 3D）；cap 是等到上限 */
  waitedFor: string;
}
let lastBoot: BootReport | null = null;
const bootListeners = new Set<(r: BootReport) => void>();
export function reportBoot(r: BootReport) {
  lastBoot = r;
  for (const fn of bootListeners) fn(r);
}
export function subscribeBoot(fn: (r: BootReport) => void): () => void {
  bootListeners.add(fn);
  if (lastBoot) fn(lastBoot);
  return () => {
    bootListeners.delete(fn);
  };
}

/** 頁面的「收」用的計時：時間到就算收完 */
export const after = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * 新的一頁還在等點落地（html[data-pt] 是 out 或 fly）：頁面自己的進場（星軌長出來、土星撐開…）
 * 要等點落地才開始。飛的時候頁面已經看得到、正跟著鏡頭滑進來，但還不該開始長
 */
export const isArriving = () => {
  const root = document.documentElement;
  const pt = root.dataset.pt;
  // 開場時（html[data-boot]，見 __root.tsx）頁面藏在夜色後面，也還不該開始長：等那顆點飛進來。
  // 首頁交棒（data-boot-ring="go"）時夜色已經在淡、開場那道環正在長大：土星就從這一刻開始長，兩道環才接得上
  const booting = root.hasAttribute('data-boot') && root.dataset.bootRing !== 'go';
  return pt === 'out' || pt === 'fly' || booting;
};

/**
 * 「從這一點飛回這一頁」：點從 from（畫面座標）出發、落在這一頁的錨點，這一頁接手自己的進場——
 * 跟開場一樣的動作（layout/TransitionLayer 註冊）。首頁以外換主題、新主星出場完之後用它接回這一頁
 * （layout/ThemeSwitchDot）。轉場沒載到、或已經有一趟在跑，回傳 false，呼叫端自己收尾
 */
type Arrive = (from: Pt, opts?: { quiet?: boolean }) => boolean;
let arrive: Arrive | null = null;
export function setArrive(fn: Arrive | null) {
  arrive = fn;
}
/**
 * quiet：這一頁其實沒換（換主題之後接回來），不重演它自己的進場與那段路——點直直飛回錨點、
 * 這一頁原樣淡回來。重演的話有些頁（關於的整段下墜）要好幾秒
 */
export const arriveFrom: Arrive = (from, opts) => arrive?.(from, opts) ?? false;

/**
 * 正在 quiet 地接回這一頁（上面的 arriveFrom）：isArriving() 這時也是 true，但頁面沒換、捲動位置也是真的，
 * 只是點還在飛（例如關於頁照常用捲動位置畫，只把高度計交給那顆點）。由 layout/TransitionLayer 設
 */
let rejoining = false;
export const setRejoining = (value: boolean) => {
  rejoining = value;
};
export const isRejoining = () => rejoining;
