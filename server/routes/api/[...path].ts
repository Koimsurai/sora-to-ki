import { defineEventHandler, proxyRequest } from 'nitro/h3';

// 只給本機 dev 用：瀏覽器端的相對 /api 轉給 BACKEND_URL（SSR 本來就直連它）。
// 正式環境的 /api 由 nginx 直接送到後端，根本到不了這裡；保險起見非 dev 一律 404。
export default defineEventHandler((event) => {
  const backend = process.env.BACKEND_URL;
  if (process.env.NODE_ENV === 'production' || !backend) return new Response('Not Found', { status: 404 });
  return proxyRequest(event, `${backend}${event.url.pathname}${event.url.search}`);
});
