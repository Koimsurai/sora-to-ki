// 文章 API base:prerender/SSR(無 window)直連後端(BACKEND_URL env),不繞對外網址
// (經 nginx→CrowdSec,大量 SSR 請求會觸發自我封鎖 ECONNRESET);client 走相對 /api。
const SSR_API_BASE =
  // 左側可為 false（process undefined）→ 必須用 ||（?? 會保留 false），非漏改
  // typeof 防護不能改成 process?.env：process 未宣告時 optional chain 一樣 ReferenceError
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, typescript/prefer-optional-chain
  (typeof process !== 'undefined' && process.env.BACKEND_URL) || 'http://backend-rs:3002';

export function apiUrl(path: string): string {
  return typeof window === 'undefined' ? `${SSR_API_BASE}${path}` : path;
}

/** image-proxy 開放的縮圖寬度（同後端 gallery.rs 的 THUMB_WIDTHS，其他值會被當成沒帶）。 */
export type ThumbWidth = 128 | 256 | 384 | 512;

/** 外站圖片改走後端 image-proxy：① http 升 https ② 變成同源，CSP 的 img-src 不必放行各家書店。
 *  圖片是瀏覽器抓的，所以一律用相對路徑——不能走 apiUrl()，SSR 會吐絕對網址，src 跟 client 對不上。
 *  `w` 帶了就由後端縮成那個寬度的 webp：書封原圖 350–700px，畫面上常常只有 36px。 */
export function proxiedImage(url?: string | null, w?: ThumbWidth): string {
  if (!url) return '';
  return `/api/image-proxy?url=${encodeURIComponent(url)}${w ? `&w=${w}` : ''}`;
}
