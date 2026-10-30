// 主題預設（天體）：配色、主星、轉場的畫法綁在一起，站長選的是一整組。
//
// 主題掛在 <html data-theme>，由 head 裡那段腳本在畫面出現前掛上（__root.tsx），不寫進 SSR 的 HTML：
// ISR 快取的是同一份頁面，混到讀者的選擇就錯了。土星不掛 data-theme（index.css 的 :root 就是土星）。
//
// 配色在 index.css（:root[data-theme] 只換原始層，語意層照著算）；主星在 lib/saturnSpec 的 PLANETS；
// 轉場的畫法在 layout/TransitionLayer 與 index.css 的 #boot。
//
// 讀者在頂欄的天體選單（layout/ThemeMenu）選的記在這個瀏覽器（localStorage）。網址帶 ?theme=neptune
// 只換這一次打開的那一頁、不記下來：分享出去的連結不會把對方之後每一次進站都換掉。
// 兩者都沒有就是站長的預設（站台設定的 theme，後台或 MCP 改）；站長之後換預設，沒選過的讀者跟著換。
//
// 頁面開著時也能換（setTheme）：首頁的主星先收成一點、在點的那一刻換成新的、再長出來（lib/starfieldGpu），
// 字與線在同一段時間淡到新的顏色（index.css 的 html.theme-switching）；在模組頂層讀過顏色的畫布
// 由 lib/palette 的 onPalette 通知重讀。
import { hex, paletteChanged, palette } from './palette';

export const THEMES = ['saturn', 'neptune', 'blackhole', 'betelgeuse'] as const;
export type Theme = (typeof THEMES)[number];

const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

let ownerDefault: Theme = 'saturn';
/** 站長的預設（站台設定的 theme）：router.tsx 一拿到站台設定就寫進來（伺服器與瀏覽器各一份） */
export function setDefaultTheme(theme: string) {
  if (isTheme(theme)) ownerDefault = theme;
}
/** 站長的預設。伺服器渲染與 hydration 那一次用它：沒選過的讀者看到的就是這顆 */
export const defaultTheme = (): Theme => ownerDefault;

/** 現在的主題。讀的是 <html data-theme>（SSR、worker 讀不到，退回站長的預設） */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return ownerDefault;
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : 'saturn';
}

/**
 * head 裡的那段（在 paint 之前同步跑）：網址的 ?theme= 優先（不記下來），再來是讀者上次選的，
 * 都沒有（或讀不到 localStorage）就是站長的預設。只認白名單裡的字，不是白名單就當沒有
 */
export function themeScript(fallback: Theme): string {
  return `(function(){var T=${JSON.stringify(THEMES)},d=document.documentElement,t=null;
try{var q=new URLSearchParams(location.search).get('theme');t=q&&T.indexOf(q)>=0?q:localStorage.getItem('koim-theme');}catch(e){}
if(!t||T.indexOf(t)<0)t=${JSON.stringify(fallback)};if(t!=='saturn')d.setAttribute('data-theme',t);})()`;
}

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

/**
 * 換主題：記下來、換 <html data-theme>，通知畫布、3D 與轉場。
 * pageHidden：換色這一刻這一頁收在點裡（layout/ThemeSwitchDot 首頁以外的換主題）——
 * 頁面裡的東西不跟著淡（index.css 的 html.theme-switching-offstage），底色與導覽列照常淡
 */
export function setTheme(next: Theme, { pageHidden = false }: { pageHidden?: boolean } = {}) {
  if (next === currentTheme()) return;
  const root = document.documentElement;
  try {
    localStorage.setItem('koim-theme', next);
  } catch {
    // 存不了（無痕、被擋）就只換這一次
  }
  root.classList.add('theme-switching');
  root.classList.toggle('theme-switching-offstage', pageHidden);
  window.clearTimeout(fadeTimer);
  fadeTimer = window.setTimeout(
    () => root.classList.remove('theme-switching', 'theme-switching-offstage'),
    SWITCH_FADE_MS + 100,
  );
  if (next === 'saturn') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex(palette().ground));
  paletteChanged();
  for (const fn of listeners) fn(next);
}

/**
 * 讀者按下換主題（頂欄的天體選單，layout/ThemeMenu）。有人接手排動畫（layout/ThemeSwitchDot）的話交給它：
 * 舊的東西先收（首頁的主星、或這一頁收進一點），收完那一刻才 setTheme（點在那時才換色）、新的主星接著長出來。
 * 沒有人接手（還沒掛上）就直接換
 */
let director: ((next: Theme) => void) | null = null;
export function setThemeDirector(fn: ((next: Theme) => void) | null) {
  director = fn;
}
const requestListeners = new Set<(next: Theme) => void>();
/** 有人按了換主題（還沒換，動畫正要開始）：頂欄的選單在這時就收起來 */
export function onThemeRequest(fn: (next: Theme) => void): () => void {
  requestListeners.add(fn);
  return () => requestListeners.delete(fn);
}
export function requestTheme(next: Theme) {
  if (next === currentTheme()) return;
  for (const fn of requestListeners) fn(next);
  if (director) director(next);
  else setTheme(next);
}
