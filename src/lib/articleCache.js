// 共用文章資料快取：preview card 跟 BlogPost route 共享同一份 fetch promise，
// 確保 hover preview 跟 commit 後的 BlogPost 渲染拿到同一份資料、不必重打 API。
//
// API：
//   import { getArticle, prefetchArticle, clearArticleCache } from '../lib/articleCache';
//   const data = await getArticle(id, lang);

const cache = new Map();

function buildKey(id, lang) {
  return `${id}::${lang || 'src'}`;
}

function buildUrl(id, lang) {
  return `/api/posts/${id}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
}

/**
 * 取得文章資料，多次呼叫共用同一個 promise。
 * 若 fetch 失敗會自動 evict cache key，下次重新嘗試。
 */
export function getArticle(id, lang) {
  if (!id) return Promise.reject(new Error('article id required'));
  const key = buildKey(id, lang);
  if (cache.has(key)) return cache.get(key);

  const promise = fetch(buildUrl(id, lang), { credentials: 'same-origin' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      if (!data || data.message !== 'success') throw new Error('article not found');
      return data;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, promise);
  return promise;
}

/**
 * 預抓：呼叫但不關心結果，純粹熱身 cache。
 * Hover preview 場景用這個比 getArticle 更省（不需要 .then 鏈）。
 */
export function prefetchArticle(id, lang) {
  if (!id) return;
  getArticle(id, lang).catch(() => {});
}

/**
 * 手動清除 cache（管理端編輯文章後可呼叫，避免顯示 stale 資料）。
 */
export function clearArticleCache(id, lang) {
  if (id) {
    cache.delete(buildKey(id, lang));
  } else {
    cache.clear();
  }
}
