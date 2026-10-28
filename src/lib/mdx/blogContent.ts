// 文章內容的純函式工具——BlogPost（完整版）與 BlogPostPage（SSR fallback）共用，
// 確保兩邊的標題 anchor id / TOC「同一份邏輯」→ fallback 的 TOC 與完整版逐字對得上，
// swap 時右側目錄不需替換、連結也對得到（在 server 端就算好，SEO 拿到目錄結構）。
import { chapterNumbers, scanHeadings } from '@koimsurai/mdx-core/headings';

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/**
 * anchor id 允許保留的字元：ASCII 詞字元、連字號，以及漢字／假名／諺文。
 *
 * ⚠ 原本只寫了 `一-龥`（CJK 統一漢字基本區），而站上有 ja / ko 版本，於是：
 *   - **日文**的假名整段被吃掉：「まず請求書を見る」→ `請求書見`
 *   - **韓文**一個漢字都沒有，整個標題塌成一個 `-`。線上 ko 版的
 *     `/ko/blog/why-i-switched-to-zed` 25 個標題裡有 14 個 id 是 `-`，
 *     TOC 每一條連結都跳到同一個地方。
 *
 * 這裡只「加」字元、不「減」，所以既有的 zh-TW / en anchor 逐字不變。
 * 各區段：々(3005)／平假名／片假名（跳過 ・30FB，那是分隔符）／CJK 統一漢字
 * （順手補到 9FFF，原本停在 9FA5）／諺文字母與相容字母／諺文音節。
 */
const SLUG_STRIP = /[^\w\-々ぁ-ゟァ-ヺー-ヿ一-鿿ᄀ-ᇿㄱ-ㆎ가-힣]+/g;

/// 標題 → anchor id（與 heading 元素的 id 用同一個 → TOC 連結對得到）。
export const slugify = (text: string): string =>
  text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(SLUG_STRIP, '').replace(/--+/g, '-');

/** 從 markdown 內文抽 h1~h4，code block 裡的 `#` 不算（掃描規則見 mdx-core 的 scanHeadings）。 */
export function extractHeadings(content: string): TocHeading[] {
  return scanHeadings(content).map(({ text, level }) => ({ id: slugify(text), text, level }));
}

/** 章節編號 → 標題 id（編號規則見 mdx-core 的 chapterNumbers，MCP 的大綱用的是同一份）。 */
export function chapterIds(headings: readonly TocHeading[]): Map<string, string> {
  const out = new Map<string, string>();
  chapterNumbers(headings).forEach((num, i) => {
    if (num) out.set(num, headings[i].id);
  });
  return out;
}
