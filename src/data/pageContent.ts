import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import type {
  AboutContent,
  AboutQuote,
  AboutSkillGroup,
  LogContent,
  QaContent,
  QaItem,
  WorkItem,
  WorksContent,
} from '@koimsurai/api-types';
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

/** 航行日誌。start 一定有值：後端沒填時補上第一篇文章那天 */
export interface Log {
  start: string;
  milestones: NonNullable<LogContent['milestones']>;
}

export function normalizeLog(raw: LogContent): Log {
  return { start: raw.start ?? '', milestones: raw.milestones ?? [] };
}

export const logContentQueryOptions = queryOptions({
  queryKey: ['pages', 'log'],
  queryFn: async (): Promise<Log> => {
    const res = await fetch(apiUrl('/api/pages/log'));
    if (!res.ok) throw new Error(`GET /api/pages/log ${res.status}`);
    return normalizeLog((await res.json()) as LogContent);
  },
  staleTime: 5 * 60 * 1000,
});

export function useLogContent(): Log | undefined {
  return useQuery(logContentQueryOptions).data;
}

/** 作品頁的清單 */
export const worksContentQueryOptions = queryOptions({
  queryKey: ['pages', 'works'],
  queryFn: async (): Promise<WorkItem[]> => {
    const res = await fetch(apiUrl('/api/pages/works'));
    if (!res.ok) throw new Error(`GET /api/pages/works ${res.status}`);
    return ((await res.json()) as WorksContent).items ?? [];
  },
  staleTime: 5 * 60 * 1000,
});

const NO_WORKS: WorkItem[] = [];

/** 此站點的問答：題目上面那一句介紹、每一題 */
export interface Qa {
  intro: NonNullable<QaContent['intro']>;
  items: QaItem[];
}

export const normalizeQa = (raw: QaContent): Qa => ({ intro: raw.intro ?? {}, items: raw.items ?? [] });

export const qaContentQueryOptions = queryOptions({
  queryKey: ['pages', 'qa'],
  queryFn: async (): Promise<Qa> => {
    const res = await fetch(apiUrl('/api/pages/qa'));
    if (!res.ok) throw new Error(`GET /api/pages/qa ${res.status}`);
    return normalizeQa((await res.json()) as QaContent);
  },
  staleTime: 5 * 60 * 1000,
});

const NO_QA: Qa = { intro: {}, items: [] };

export function useQaContent(): Qa {
  return useQuery(qaContentQueryOptions).data ?? NO_QA;
}

export function useWorksContent(enabled = true): WorkItem[] {
  return useQuery({ ...worksContentQueryOptions, enabled }).data ?? NO_WORKS;
}

/** 頁面（無前綴的邏輯路徑）→ 它要先抓好的內容。頁面守門用。
 *  首頁也要關於頁與作品：土星的軌道寫著「從某年往下掉到現在」「最新的三件作品」；
 *  此站點的「由數據長出來」那個小玩具用的也是作品 */
const CONTENT_OF: Record<string, (qc: QueryClient) => Promise<unknown>> = {
  '': (qc) => Promise.all([qc.query(aboutContentQueryOptions), qc.query(worksContentQueryOptions)]),
  about: (qc) => qc.query(aboutContentQueryOptions),
  history: (qc) => qc.query(logContentQueryOptions),
  portfolio: (qc) => qc.query(worksContentQueryOptions),
  'about-site': (qc) => Promise.all([qc.query(worksContentQueryOptions), qc.query(qaContentQueryOptions)]),
};

/** 這一頁有站長填的內容就先抓好；抓失敗不擋頁（照空狀態畫） */
export async function prefetchPageContent(queryClient: QueryClient, basePath: string): Promise<void> {
  await CONTENT_OF[basePath]?.(queryClient).catch(() => undefined);
}
