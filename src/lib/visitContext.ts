// 按愛心、表情、留言的讚、碎念的喜歡時帶給後端的讀者脈絡（後端 handlers/reaction_log.rs 記進 reaction_events）。
//
// 只有兩樣，都不是身分：
//   - X-Visit-Referrer：讀者這次是從哪個網站連進來的（只有主機名）。站內換頁不會改 document.referrer，
//     但重新整理之後它會變成自己的網域，所以第一次看到外部來源就記進 sessionStorage，同一個分頁一直用它
//   - X-Visit-Locale：讀者當時在哪個語系
// 國家由 Cloudflare 的標頭判斷、手機或電腦由後端看 User-Agent，都不從這裡送。

import { localeFromPathname } from '@/i18n/start-i18n';

const KEY = 'koim-ref';

/**
 * 這次造訪是從哪個網站連進來的；直接打網址、書籤、或站內來的是空字串。
 * 第一次呼叫時記下來：AppShell 一掛上就呼叫一次，之後重新整理也沿用
 */
export function landingReferrer(): string {
  try {
    const kept = sessionStorage.getItem(KEY);
    if (kept !== null) return kept;
    let host = '';
    try {
      const r = document.referrer ? new URL(document.referrer).hostname : '';
      if (r && r !== location.hostname) host = r;
    } catch {
      /* referrer 不是合法網址就當沒有 */
    }
    sessionStorage.setItem(KEY, host);
    return host;
  } catch {
    return '';
  }
}

/** 要加在互動請求上的標頭 */
export function visitHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'X-Visit-Locale': localeFromPathname(location.pathname) };
  const ref = landingReferrer();
  if (ref) headers['X-Visit-Referrer'] = ref;
  return headers;
}
