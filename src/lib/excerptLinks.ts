// 摘要裡「哪幾句連到哪一章」（posts.excerpt_links）的純邏輯：後台的逐句對應與草稿預覽共用。
// 章節編號的規則見 mdx-core 的 chapterNumbers（第幾個 `##` 兩位數，底下第幾個 `###` 接 `.N`）。
import type { ExcerptLink } from '@koimsurai/api-types';
import { chapterNumbers, scanHeadings } from '@koimsurai/mdx-core/headings';

/** 同後端 handlers/excerpt_links.rs：一個語系最多幾段、一段最多幾個字 */
export const MAX_LINKS_PER_LOCALE = 24;
const MAX_LINK_CHARS = 120;

export interface ChapterOption {
  /** `05`、`05.4` */
  num: string;
  text: string;
  level: 2 | 3;
}

/** 內文的章節（只算 `##` 與 `###`，跟文章頁左邊印的編號一樣） */
export function chapterOptions(content: string): ChapterOption[] {
  const headings = scanHeadings(content);
  return chapterNumbers(headings).flatMap((num, i) =>
    num ? [{ num, text: headings[i].text, level: headings[i].level as 2 | 3 }] : [],
  );
}

export interface ExcerptPiece {
  /** 在摘要裡從第幾個字開始（也拿來當 key） */
  at: number;
  text: string;
  /** 連到的章節編號；沒連的那幾段沒有 */
  to?: string;
}

/**
 * 摘要切成一段一段：連過的那幾段單獨一段，其餘原樣（拼回去就是整段摘要）。
 * 跟文章頁（blog/ArticleSummary）同一個規則：找的是第一次出現的位置，重疊的只留先出現的
 */
export function excerptPieces(excerpt: string, links: readonly ExcerptLink[]): ExcerptPiece[] {
  const spans = links
    .map((l) => ({ at: excerpt.indexOf(l.text), len: l.text.length, to: l.to }))
    .filter((s) => s.at >= 0 && s.len > 0)
    .sort((a, b) => a.at - b.at);
  const out: ExcerptPiece[] = [];
  let i = 0;
  for (const s of spans) {
    if (s.at < i) continue;
    if (s.at > i) out.push({ at: i, text: excerpt.slice(i, s.at) });
    out.push({ at: s.at, text: excerpt.slice(s.at, s.at + s.len), to: s.to });
    i = s.at + s.len;
  }
  if (i < excerpt.length) out.push({ at: i, text: excerpt.slice(i) });
  return out;
}

/**
 * 反白的那段能不能拿來連：可以的話回 null，不行的話回一句說明。
 * 已經連過的同一段可以（那是換章節），跟別段重疊的不行（文章頁只會畫先出現的那段，另一段會靜靜不見）
 */
export function checkSelection(excerpt: string, links: readonly ExcerptLink[], text: string): SelectionProblem | null {
  if (!text) return { key: 'empty' };
  if (text.length > MAX_LINK_CHARS) return { key: 'tooLong', params: { max: MAX_LINK_CHARS, n: text.length } };
  const at = excerpt.indexOf(text);
  if (at < 0) return { key: 'outside' };
  const existing = links.some((l) => l.text === text);
  if (!existing && links.length >= MAX_LINKS_PER_LOCALE) return { key: 'full', params: { max: MAX_LINKS_PER_LOCALE } };
  const clash = links.find((l) => {
    if (l.text === text) return false;
    const from = excerpt.indexOf(l.text);
    return from >= 0 && from < at + text.length && at < from + l.text.length;
  });
  return clash ? { key: 'overlap', params: { text: clash.text } } : null;
}

/**
 * 為什麼不能連。這支前台也會載（excerptPieces），所以不在這裡翻成句子：
 * 後台拿 `editor.links.problem.<key>` 自己翻
 */
export interface SelectionProblem {
  key: 'empty' | 'tooLong' | 'outside' | 'full' | 'overlap';
  params?: Record<string, string | number>;
}

/** 連到的句子在摘要裡已經找不到（摘要改過）——後台列出來讓人刪 */
export const orphanLinks = (excerpt: string, links: readonly ExcerptLink[]) =>
  links.filter((l) => !excerpt.includes(l.text));

/** 把一句連到 `to`（`null` 是取消連結）；同一句只留一筆 */
export function setLink(links: readonly ExcerptLink[], text: string, to: string | null): ExcerptLink[] {
  const rest = links.filter((l) => l.text !== text);
  return to ? [...rest, { text, to }] : rest;
}
