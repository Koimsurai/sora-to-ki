import { ABOUT_SECTIONS, MAIN_SECTIONS, MORE_SECTIONS } from '../src/data/siteSections';

// sitemap、llms.txt 用：站台設定關掉了哪些頁面（後端 /api/site/config），換成無前綴的路徑。
// 後端不通就當全部開著：sitemap 多列一頁頂多被爬到 404，少列一頁卻沒人會發現。

const ALL = [...MAIN_SECTIONS, ...ABOUT_SECTIONS, ...MORE_SECTIONS];

export async function disabledPaths(backendUrl: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${backendUrl}/api/site/config`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return new Set();
    const { disabled_pages: off = [] } = (await res.json()) as { disabled_pages?: string[] };
    return new Set(ALL.filter((s) => off.includes(s.key)).map((s) => s.to));
  } catch {
    return new Set();
  }
}
