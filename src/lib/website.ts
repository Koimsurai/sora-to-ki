/**
 * 留言者填的網站 → 能放進 href 的絕對網址；不像網址就回 null（只顯示名字、不給連結）。
 *
 * 讀者常常只填網域（`ikuka.blog`），原樣放進 href 會被當成相對路徑，變成 `/blog/ikuka.blog`。
 * 沒寫協定的補 https://；其他協定（`javascript:` 之類）一律不給連結。
 * 後端存檔時也做同一件事（handlers/comments.rs 的 normalize_website），這裡管的是更早存進去的舊資料
 */
export function websiteHref(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:/]+:\d/.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  // 沒有點的主機名（`foo`、`localhost`）不是讀者的網站
  if (!url.hostname.includes('.')) return null;
  return url.href;
}
