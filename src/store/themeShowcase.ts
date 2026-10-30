// 在首頁以外換主題時，新的主星「出場」一下（layout/ThemeSwitchDot 排時間，backdrop/StarfieldGpu 叫 3D 長與收）。
// 3D 的主星平常只在首頁顯示；出場的這幾秒例外，讓讀者在哪一頁換都看得到換成了什麼。
/** collapse：首頁換主題時舊的主星先收成一點（收完才換色、換星）；其餘三個只在首頁以外有用 */
export type ShowcaseCommand = 'collapse' | 'show' | 'hide' | 'abort';

type Listener = (cmd: ShowcaseCommand) => void;
const listeners = new Set<Listener>();

let showing = false;

export function showcase(cmd: ShowcaseCommand) {
  if (cmd === 'show') showing = true;
  else if (cmd !== 'collapse') showing = false;
  for (const fn of listeners) fn(cmd);
}

/** 首頁以外的主星正在出場（show 之後、hide 或 abort 之前）：3D 比出場的指令晚就緒時照這個補上 */
export const showcaseShowing = () => showing;

export function onShowcase(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let ready = false;

/** 3D 在跑：StarfieldGpu 回報 */
export function setShowcaseReady(value: boolean) {
  ready = value;
}

export const showcaseReady = () => ready;

/**
 * 手機的 3D 只在首頁掛（backdrop/SpaceBackdropShell），其他頁沒有可以出場的主星。
 * 出場那幾秒把 3D 借回來：borrowable 是這一頁借得到（手機、首頁以外、有 GPU），borrowSky 掛上／還回去
 */
let borrowable = false;
let borrowed = false;
const borrowListeners = new Set<() => void>();

export function setSkyBorrowable(value: boolean) {
  borrowable = value;
}
export const skyBorrowable = () => borrowable;

export function borrowSky(on: boolean) {
  if (borrowed === on) return;
  borrowed = on;
  for (const fn of borrowListeners) fn();
}
export const skyBorrowed = () => borrowed;
export function onBorrowSky(fn: () => void): () => void {
  borrowListeners.add(fn);
  return () => borrowListeners.delete(fn);
}
