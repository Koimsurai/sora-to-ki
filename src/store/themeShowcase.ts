// 在首頁以外換主題時，新的主星「出場」一下（layout/ThemeSwitchDot 排時間，backdrop/StarfieldGpu 叫 3D 長與收）。
// 3D 的主星平常只在首頁顯示；出場的這幾秒例外，讓讀者在哪一頁換都看得到換成了什麼。
/** collapse：首頁換主題時舊的主星先收成一點（收完才換色、換星）；其餘三個只在首頁以外有用 */
export type ShowcaseCommand = 'collapse' | 'show' | 'hide' | 'abort';

type Listener = (cmd: ShowcaseCommand) => void;
const listeners = new Set<Listener>();

export function showcase(cmd: ShowcaseCommand) {
  for (const fn of listeners) fn(cmd);
}

export function onShowcase(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let ready = false;

/** 3D 在跑、而且是會畫主星的那一種（手機的精簡版不畫）：StarfieldGpu 回報 */
export function setShowcaseReady(value: boolean) {
  ready = value;
}

export const showcaseReady = () => ready;
