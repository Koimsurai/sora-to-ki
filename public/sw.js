/*
 * 自寫的輕量 Service Worker。
 *
 * 核心原則:**絕不快取 HTML**。
 *   HTML 的快取由 Nitro 的 ISR/routeRules(swr)全權管理。若 SW 也 precache HTML(vite-plugin-pwa
 *   的 generateSW 預設行為),使用者會拿到 SW 裡的舊頁面,而 Nitro 那邊還以為自己在管快取 ——
 *   兩套快取互相打架,且發文後怎麼重整都不會更新。所以這裡導覽請求一律走網路。
 *
 * 只做兩件事:
 *   1. /assets/* 走 cache-first —— 那些檔名帶內容雜湊,檔名沒變就是同一份,快取永遠安全。
 *   2. 斷網時導覽請求回 /offline.html。
 *
 * 前一版的 /sw.js 是「自毀 SW」(清快取 + unregister,用來清掉更早的 SPA PWA 殘留)。回訪者的
 * 瀏覽器會抓到這份新的取代它 —— 自毀版已完成任務,可以退休。
 */

const CACHE = 'koimsurai-v2'; // 改版就換名 → activate 時會清掉舊快取
// 純靜態 HTML,不是 TanStack 路由 —— SPA 文件當 fallback 會被 client router 依網址重新導向而失效。
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉舊版本快取(含更早 SPA 時代 vite-plugin-pwa 留下的)
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部資源不碰

  // 導覽(HTML):一律走網路,交給 Nitro 的 ISR 決定新舊。斷網才回 /offline。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? new Response('離線中', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }),
    );
    return;
  }

  // 內容雜湊過的靜態資產:cache-first。/api/* 等其餘請求不攔,直接走網路。
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          void cache.put(req, res.clone());
        }
        return res;
      })(),
    );
  }
});
