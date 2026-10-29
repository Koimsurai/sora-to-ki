// 主題預設（天體）：配色、主星、轉場的畫法綁在一起，站長選的是一整組。
//
// 主題掛在 <html data-theme>，由 head 裡那段腳本在畫面出現前掛上（__root.tsx），不寫進 SSR 的 HTML：
// ISR 快取的是同一份頁面，混到讀者的選擇就錯了。土星是預設，不掛 data-theme。
//
// 配色在 index.css（:root[data-theme] 只換原始層，語意層照著算）；主星在 lib/saturnSpec 的 PLANETS；
// 轉場的畫法在 layout/TransitionLayer 與 index.css 的 #boot。
//
// 目前選主題只有預覽用的入口：網址帶 ?theme=neptune 會記在這個瀏覽器（localStorage），?theme=saturn 換回來。
// 站長設定與讀者切換是另一條線（站台設定），接上之後這裡只剩讀值。

export const THEMES = ['saturn', 'neptune'] as const;
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
