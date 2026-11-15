/**
 * 把一段純文字切成「字」與「網址」兩種片段，給留言這類不經 markdown 的地方自動加連結。
 * 只認 http(s)：`javascript:` 之類的永遠不會變成 href。
 */

/** `at` 是片段在原文裡的起點（同一段文字裡不會重複，可以當 React key） */
export type TextPart = { text: string; at: number } | { text: string; at: number; href: string };

// 網址遇到空白、中文標點或括號就停；英文標點只在結尾時當成句子的標點剝掉
const URL_RE = /https?:\/\/[^\s<>"'`（）「」『』【】《》，。！？、；：]+/giu;
const TRAILING = /[.,;:!?)\]}'"*_~]+$/u;

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // 網址本身帶括號（維基百科的 `_(電影)`）時，結尾那個 `)` 是網址的
    let trail = TRAILING.exec(url)?.[0] ?? '';
    const count = (s: string, c: string) => s.split(c).length - 1;
    if (trail.startsWith(')') && count(url, '(') > count(url.slice(0, url.length - trail.length), ')')) {
      trail = trail.slice(1);
    }
    url = url.slice(0, url.length - trail.length);
    if (!/^https?:\/\/[^/?#]+/iu.test(url)) continue;
    const start = m.index;
    if (start > last) parts.push({ text: text.slice(last, start), at: last });
    parts.push({ text: url, at: start, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), at: last });
  return parts;
}
