import type { SiteConfig } from '@koimsurai/api-types';

import { PAGES } from '../src/data/siteSections';

// sitemap、llms.txt 用：後端的站台設定（/api/site/config）。
// 後端不通就回 null，呼叫端各自決定退路。

export async function backendSiteConfig(backendUrl: string): Promise<Partial<SiteConfig> | null> {
  try {
    const res = await fetch(`${backendUrl}/api/site/config`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as Partial<SiteConfig>;
  } catch {
    return null;
  }
}

/** 關掉了哪些頁面，換成無前綴的路徑。
 *  後端不通就當全部開著：sitemap 多列一頁頂多被爬到 404，少列一頁卻沒人會發現 */
export function disabledPathsOf(config: Partial<SiteConfig> | null): Set<string> {
  const off = config?.disabled_pages ?? [];
  return new Set(PAGES.filter((s) => off.includes(s.key)).map((s) => s.to));
}
