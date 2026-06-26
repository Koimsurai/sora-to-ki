// 文章 API base:prerender/SSR(無 window)用絕對網址打線上 API;client 端走相對 /api(經 nginx proxy)。
// 真實部署可改用 BACKEND_URL 之類直連後端。
const PRERENDER_API_BASE = 'https://koimsurai.com';

export function apiUrl(path: string): string {
  return typeof window === 'undefined' ? `${PRERENDER_API_BASE}${path}` : path;
}
