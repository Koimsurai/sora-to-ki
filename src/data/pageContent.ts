import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import type { AboutContent, AboutQuote, AboutSkillGroup } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

// 頁面內容：關於、作品…這幾頁由站長在後台或 MCP 填的資料（後端 handlers/page_content）。
// 頁面守門（i18n/localePage 的 beforeLoad）會先抓好，SSR 首幀就是填好的樣子，不會先空一下再長出來。

/** 關於頁，陣列一定在（後端的型別因為讀舊資料要寬鬆，欄位都標成可選） */
export interface About {
  chapters: NonNullable<AboutContent['chapters']>;
  skills: (AboutSkillGroup & { items: string[] })[];
  jobs: NonNullable<AboutContent['jobs']>;
  quote: AboutQuote | null;
}

const EMPTY_ABOUT: About = { chapters: [], skills: [], jobs: [], quote: null };

export function normalizeAbout(raw: AboutContent): About {
  return {
    chapters: raw.chapters ?? [],
    skills: (raw.skills ?? []).map((g) => ({ ...g, items: g.items ?? [] })),
    jobs: raw.jobs ?? [],
    quote: raw.quote ?? null,
  };
}

export const aboutContentQueryOptions = queryOptions({
  queryKey: ['pages', 'about'],
  queryFn: async (): Promise<About> => {
    const res = await fetch(apiUrl('/api/pages/about'));
    if (!res.ok) throw new Error(`GET /api/pages/about ${res.status}`);
    return normalizeAbout((await res.json()) as AboutContent);
  },
  // 跟站台設定一樣：後台改了，切回分頁或換頁時跟上
  staleTime: 5 * 60 * 1000,
});

export function useAboutContent(): About {
  return useQuery(aboutContentQueryOptions).data ?? EMPTY_ABOUT;
}

/** 頁面（無前綴的邏輯路徑）→ 它要先抓好的內容。頁面守門用。
 *  首頁也要關於頁的：土星那條軌道寫著「從某年往下掉到現在」 */
const CONTENT_OF: Record<string, (qc: QueryClient) => Promise<unknown>> = {
  '': (qc) => qc.query(aboutContentQueryOptions),
  about: (qc) => qc.query(aboutContentQueryOptions),
};

/** 這一頁有站長填的內容就先抓好；抓失敗不擋頁（照空狀態畫） */
export async function prefetchPageContent(queryClient: QueryClient, basePath: string): Promise<void> {
  await CONTENT_OF[basePath]?.(queryClient).catch(() => undefined);
}
