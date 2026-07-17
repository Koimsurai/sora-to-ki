import { createError, defineEventHandler, getHeader } from 'nitro/h3';
import { useStorage } from 'nitro/storage';

// 發文/改文後由後端打這支 → 立刻清掉 ISR 快取,不用等 TTL(文章頁 1h)。
//
// 路徑刻意不放 /api/*:正式環境 nginx 把 /api/ 全導向 Rust 後端,前端收不到。
// 而 nginx 把 / 導到本服務 → 這支是公開可達的,所以一定要密鑰。
//
// 清「全部」route-rules 快取而非精準清單一路徑:key 形如
//   nitro:route-rules:blog:**:**:blog39.<不透明hash>.json
// 那段 hash 從外部算不出來,靠 slug 前綴比對則會綁死 nitro 內部格式。
// 全清的代價只是幾次背景重生(每頁約 70ms,且只有真被訪問的頁才會重生),換來不依賴內部實作。
export default defineEventHandler(async (event) => {
  const secret = process.env.REVALIDATE_SECRET;
  // 沒設密鑰 = 這個功能沒啟用,直接關閉(而不是變成無認證的公開清快取端點)
  if (!secret) throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  if (getHeader(event, 'x-revalidate-secret') !== secret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const storage = useStorage('cache');
  const keys = await storage.getKeys('nitro:route-rules');
  await Promise.all(keys.map((k) => storage.removeItem(k)));
  return { cleared: keys.length };
});
