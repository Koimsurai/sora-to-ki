// 收藏頁（media/Collection）看過的那面封面牆：動畫與影集兩個來源的去重。
//
// 失敗模式是「去掉了不該去的」——畫面上仍然是一面看起來正常的牆，沒有任何錯誤訊息，
// 只有真的去數才會發現少了一部。

/* ══════════════ 片庫 ══════════════ */

export interface WatchLike {
  title: string;
  tmdbId?: number | string | null;
  epCount?: number | null;
  isoDate?: string | null;
}

/**
 * 跨「動畫（Bahamut）／影集（Netflix、Simkl）」去重：同一個 tmdbId 視為同一部，
 * 只保留**集數最多**的那筆。
 *
 * ⚠ 沒有 tmdbId 的一律不去重。用標題比對會誤殺——劇場版與本篇、同名不同季、
 * 不同語系的譯名都會撞在一起，而那種誤殺是「某部作品從清單上消失」，
 * 比留下重複難發現得多。
 *
 * 集數相同時保留**先出現**的（比較用 `>` 而不是 `>=`），所以結果只跟輸入順序有關，
 * 是確定性的。
 */
export function dedupeWatchItems<T extends WatchLike>(anime: readonly T[], tv: readonly T[]): { anime: T[]; tv: T[] } {
  const winner = new Map<number | string, T>();
  for (const it of [...anime, ...tv]) {
    if (it.tmdbId == null) continue;
    const cur = winner.get(it.tmdbId);
    if (!cur || (it.epCount ?? 0) > (cur.epCount ?? 0)) winner.set(it.tmdbId, it);
  }
  const keep = (it: T) => it.tmdbId == null || winner.get(it.tmdbId) === it;
  return { anime: anime.filter(keep), tv: tv.filter(keep) };
}
