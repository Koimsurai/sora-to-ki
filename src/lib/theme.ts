// 主題預設（天體）：配色、主星、轉場的畫法綁在一起，站長選的是一整組。
//
// 主題掛在 <html data-theme>，由 head 裡那段腳本在畫面出現前掛上（__root.tsx），不寫進 SSR 的 HTML：
// ISR 快取的是同一份頁面，混到讀者的選擇就錯了。土星是預設，不掛 data-theme。
//
// 配色在 index.css（:root[data-theme] 只換原始層，語意層照著算）；主星在 lib/saturnSpec 的 PLANETS；
// 轉場的畫法在 layout/TransitionLayer 與 index.css 的 #boot。
//
// 目前選主題只有預覽用的入口：網址帶 ?theme=neptune 會記在這個瀏覽器（localStorage），?theme=saturn 換回來，
// dev 左下角也有切換鈕（layout/ThemePreviewSwitch）。站長設定與讀者切換是另一條線（站台設定）。
//
// 頁面開著時也能換（setTheme）：首頁的主星先收成一點、在點的那一刻換成新的、再長出來（lib/starfieldGpu），
// 字與線在同一段時間淡到新的顏色（index.css 的 html.theme-switching）；在模組頂層讀過顏色的畫布
// 由 lib/palette 的 onPalette 通知重讀。
import { hex, paletteChanged, palette } from './palette';

export const THEMES = ['saturn', 'neptune', 'blackhole'] as const;
export type Theme = (typeof THEMES)[number];

const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

/** 現在的主題。讀的是 <html data-theme>（SSR、worker 讀不到，退回土星） */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'saturn';
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : 'saturn';
}

/**
 * head 裡的那段（在 paint 之前同步跑）：網址的 ?theme= 優先並記下來，否則讀上次記的。
 * 只認白名單裡的字，不是白名單就當沒有
 */
export const THEME_SCRIPT = `(function(){try{var T=${JSON.stringify(THEMES)},d=document.documentElement,s=localStorage,q=new URLSearchParams(location.search).get('theme');
if(q&&T.indexOf(q)>=0)s.setItem('koim-theme',q);var t=s.getItem('koim-theme');
if(t&&t!=='saturn'&&T.indexOf(t)>=0)d.setAttribute('data-theme',t);}catch(e){}})()`;

type ThemeListener = (theme: Theme) => void;
const listeners = new Set<ThemeListener>();

/** 主題在頁面開著時換了就呼叫 fn（3D 換主星、轉場換畫法）。回傳取消訂閱 */
export function onTheme(fn: ThemeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 字與線淡到新顏色要多久（跟 index.css 的 html.theme-switching 一樣） */
const SWITCH_FADE_MS = 700;
let fadeTimer = 0;

/** 換主題：記下來、換 <html data-theme>，通知畫布、3D 與轉場 */
export function setTheme(next: Theme) {
  if (next === currentTheme()) return;
  const root = document.documentElement;
  try {
    localStorage.setItem('koim-theme', next);
  } catch {
    // 存不了（無痕、被擋）就只換這一次
  }
  root.classList.add('theme-switching');
  window.clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(() => root.classList.remove('theme-switching'), SWITCH_FADE_MS + 100);
  if (next === 'saturn') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex(palette().ground));
  paletteChanged();
  for (const fn of listeners) fn(next);
}
