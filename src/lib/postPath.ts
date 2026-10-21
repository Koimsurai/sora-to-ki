// 文章網址的單一組法。
//
// 網址用英文 slug（`/blog/blog-post-rendering-strategy`）——比編號有辨識度、分享出去看得懂。
// 沒有 slug 的舊資料自動退回用 id，仍然進得去（後端 get_post 兩種都認）。
// 舊網址（數字 id、或改名前的舊 slug）也永遠有效：後端解析得到文章，
// 路由再依 canonical slug 做 301（見 routes/blog/$id.tsx）。

import { localePathname, type Locale } from '@/lib/locales';

/** 有 slug 就用 slug，否則退回 id。 */
export function postIdent(p: { slug?: string | null; id: number | string }): string {
  return String(p.slug ?? '') || String(p.id);
}

/** 文章的站內路徑（不含 locale 前綴；LocaleLink 會自己補）。 */
export function postPath(p: { slug?: string | null; id: number | string }): string {
  return `/blog/${postIdent(p)}`;
}

/**
 * 分享出去的完整網址：canonical 的 slug 網址，帶目前語系的前綴。
 * 以前列表與文章頁各自組 `${origin}/blog/${id}`——別人點開先被 301 一次，英文版分享出去也變回中文版。
 */
export function postShareUrl(p: { slug?: string | null; id: number | string }, locale: Locale, origin: string): string {
  return `${origin}${localePathname(locale, postPath(p))}`;
}
