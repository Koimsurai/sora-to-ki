// 預抓 BlogPost 路由 chunk + 單篇文章 JSON，降低點擊後的感知延遲。
// 以 id 為 key 做 dedupe，重複呼叫只會執行一次。

const prefetched = new Set();
let chunkPromise = null;

function prefetchChunk() {
  if (chunkPromise) return chunkPromise;
  chunkPromise = import('../components/BlogPost').catch(() => { chunkPromise = null; });
  return chunkPromise;
}

export function prefetchPost(id, lang) {
  if (!id) return;
  prefetchChunk();

  const key = `${id}::${lang || 'src'}`;
  if (prefetched.has(key)) return;
  prefetched.add(key);

  const url = `/api/posts/${id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  // 用 low-priority fetch 預熱瀏覽器 HTTP 快取；失敗就算了，不影響主要流程。
  try {
    fetch(url, { credentials: 'same-origin', priority: 'low' }).catch(() => {});
  } catch {
    // 某些 Firefox 版本不支援 priority 選項，退回一般 fetch
    fetch(url, { credentials: 'same-origin' }).catch(() => {});
  }
}
