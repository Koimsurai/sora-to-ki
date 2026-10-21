// 文章 API base:prerender/SSR(無 window)直連後端(BACKEND_URL env),不繞 koimsurai.com
// (經 nginx→CrowdSec,大量 SSR 請求會觸發自我封鎖 ECONNRESET);client 走相對 /api。
const SSR_API_BASE =
  // 左側可為 false（process undefined）→ 必須用 ||（?? 會保留 false），非漏改
  // typeof 防護不能改成 process?.env：process 未宣告時 optional chain 一樣 ReferenceError
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, typescript/prefer-optional-chain
  (typeof process !== 'undefined' && process.env.BACKEND_URL) || 'https://koimsurai.com';

export function apiUrl(path: string): string {
  return typeof window === 'undefined' ? `${SSR_API_BASE}${path}` : path;
}

/** 外站圖片改走後端 image-proxy：① http 升 https ② 變成同源，CSP 的 img-src 不必放行各家書店。
 *  圖片是瀏覽器抓的，所以一律用相對路徑——不能走 apiUrl()，SSR 會吐絕對網址，src 跟 client 對不上。 */
export function proxiedImage(url?: string | null): string {
  return url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : '';
}
