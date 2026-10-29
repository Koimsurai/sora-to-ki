// 配色原始層（index.css 的 --ground / --paper / --amber / --flare）在 JS 這邊的唯一入口。
//
// canvas、three.js、Monaco 這些不吃 CSS 的地方，顏色一律從這裡拿，不要在檔案裡再寫一次 RGB：
// 站台換配色時（:root 的 -rgb 變數被蓋掉）它們才會跟著換。
//
// 值是 `r, g, b` 字串，跟 CSS 的 `--x-rgb` 同一個格式，canvas 直接 `rgba(${p.amber}, 0.4)`。

export interface Palette {
  /** 底色（紙） */
  ground: string;
  /** 字與線（墨） */
  paper: string;
  /** 訊號：只出現在一個點上 */
  amber: string;
  /** 壞了、會刪東西 */
  flare: string;
}

/** index.css 的預設值。讀不到 CSS 時（SSR、worker、測試環境）退回這組 */
export const DEFAULT_PALETTE: Palette = {
  ground: '10, 10, 12',
  paper: '241, 236, 227',
  amber: '233, 193, 122',
  flare: '227, 134, 108',
};

/**
 * 從 `:root` 讀目前的配色。
 *
 * 讀的是**呼叫當下**的值。模組頂層呼叫的話，就是那個模組在瀏覽器裡第一次載入時的值——
 * 配色由 SSR 寫在 <head> 裡、比任何腳本都早，所以這樣就夠了；要在頁面開著時即時換色
 * （後台預覽）的話得在畫的時候才呼叫。
 */
export function palette(): Palette {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return DEFAULT_PALETTE;
  const css = getComputedStyle(document.documentElement);
  const read = (key: keyof Palette) => css.getPropertyValue(`--${key}-rgb`).trim() || DEFAULT_PALETTE[key];
  return { ground: read('ground'), paper: read('paper'), amber: read('amber'), flare: read('flare') };
}

/** `r, g, b` → 三個 0–255 的數字 */
export function channels(rgb: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = rgb.split(',').map((n) => Number(n.trim()));
  return [r, g, b];
}

/** `r, g, b` → `#rrggbb`（Monaco、<meta theme-color> 這類只收 hex 的地方） */
export function hex(rgb: string): string {
  return `#${channels(rgb)
    .map((n) => Math.round(n).toString(16).padStart(2, '0'))
    .join('')}`;
}
