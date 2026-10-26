// 摘要裡「哪幾句連到哪一章」（posts.excerpt_links）的純邏輯：後台的逐句對應與草稿預覽共用。
// 章節編號的規則見 lib/mdx/blogContent 的 chapterIds（第幾個 `##` 兩位數，底下第幾個 `###` 接 `.N`）。
import type { ExcerptLink } from '@koimsurai/api-types';
import { extractHeadings } from '@/lib/mdx/blogContent';

/** 同後端 handlers/excerpt_links.rs：一個語系最多幾句、一句最多幾個字 */
export const MAX_LINKS_PER_LOCALE = 24;
export const MAX_LINK_CHARS = 120;

export interface ChapterOption {
  /** `05`、`05.4` */
  num: string;
  text: string;
  level: 2 | 3;
}

/** 內文的章節（只算 `##` 與 `###`，跟文章頁左邊印的編號一樣） */
export function chapterOptions(content: string): ChapterOption[] {
  const out: ChapterOption[] = [];
  let major = 0;
  let minor = 0;
  for (const h of extractHeadings(content)) {
    if (h.level === 2) {
      major += 1;
      minor = 0;
      out.push({ num: String(major).padStart(2, '0'), text: h.text, level: 2 });
    } else if (h.level === 3 && major > 0) {
      minor += 1;
      out.push({ num: `${String(major).padStart(2, '0')}.${minor}`, text: h.text, level: 3 });
    }
  }
  return out;
}

export interface ExcerptSegment {
  /** 在摘要裡從第幾個字開始（也拿來當 key） */
  at: number;
  /** 原樣（含前後空白），拼回去就是整段摘要 */
  raw: string;
  /** 去掉前後空白：存進 excerpt_links 的就是這個 */
  text: string;
  /** 已經連到的章節編號 */
  to?: string;
}

/**
 * 一句：非貪婪地吃到句尾為止。句尾是中日文的句號、問號、驚嘆號、分號；英文的同一批要後面接空白或結尾
 * （句子內容不能直接排除「.」，不然 `v1.2.3`、網址會被切斷）
 */
const SENTENCE = /[\s\S]*?(?:[。！？；]|[!?;.](?=\s|$)|$)/g;

/**
 * 摘要切成一段一段給後台逐句對應：已經連過的句子原樣保留成一段（不一定剛好是一整句，
 * 以前用 MCP 寫的可能是半句），其餘照句尾切。空白不單獨成段
 */
export function excerptSegments(excerpt: string, links: readonly ExcerptLink[]): ExcerptSegment[] {
  const spans = links
    .map((l) => ({ at: excerpt.indexOf(l.text), len: l.text.length, to: l.to }))
    .filter((s) => s.at >= 0 && s.len > 0)
    .sort((a, b) => a.at - b.at);
  const out: ExcerptSegment[] = [];
  const plain = (from: number, to: number) => {
    const part = excerpt.slice(from, to);
    for (const m of part.matchAll(SENTENCE)) {
      if (!m[0].trim()) continue;
      out.push({ at: from + m.index, raw: m[0], text: m[0].trim() });
    }
  };
  let i = 0;
  for (const s of spans) {
    if (s.at < i) continue;
    plain(i, s.at);
    const raw = excerpt.slice(s.at, s.at + s.len);
    out.push({ at: s.at, raw, text: raw.trim(), to: s.to });
    i = s.at + s.len;
  }
  plain(i, excerpt.length);
  return out;
}

/** 連到的句子在摘要裡已經找不到（摘要改過）——後台列出來讓人刪 */
export const orphanLinks = (excerpt: string, links: readonly ExcerptLink[]) =>
  links.filter((l) => !excerpt.includes(l.text));

/** 把一句連到 `to`（`null` 是取消連結）；同一句只留一筆 */
export function setLink(links: readonly ExcerptLink[], text: string, to: string | null): ExcerptLink[] {
  const rest = links.filter((l) => l.text !== text);
  return to ? [...rest, { text, to }] : rest;
}
