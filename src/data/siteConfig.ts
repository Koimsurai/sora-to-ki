import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import type { SiteConfig } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';
import { PAGES, type SiteSection } from './siteSections';

// 站台設定（站名、哪幾頁關掉了），後台與 MCP 改的那份（後端 handlers/site_config）。
// root 的 beforeLoad 先抓一次，SSR 時就有、跟著 dehydrate 進頁面，元件裡直接讀不用等。

/** 後端連不上時的退路：所有頁面都開著。寧可多一頁點進去是空的，也不要整個選單消失 */
const FALLBACK: SiteConfig = {
  url: '',
  name: '',
  author: '',
  description: '',
  disabled_pages: [],
  email: '',
  github: '',
  default_locale: 'zh-TW',
  locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
  theme: 'saturn',
  page_descriptions: {},
};

export const siteConfigQueryOptions = queryOptions({
  queryKey: ['site', 'config'],
  queryFn: async (): Promise<SiteConfig> => {
    try {
      const res = await fetch(apiUrl('/api/site/config'));
      if (!res.ok) throw new Error(`GET /api/site/config ${res.status}`);
      return (await res.json()) as SiteConfig;
    } catch {
      return FALLBACK;
    }
  },
  // 一分鐘：站台設定改了（後台、MCP），開著的分頁站內換頁或切回分頁時一分鐘內就跟上（切回分頁時，
  // 過期的資料會自己重抓——react-query 預設的 refetchOnWindowFocus）
  staleTime: 5 * 60 * 1000,
});

export function useSiteConfig(): SiteConfig {
  return useQuery(siteConfigQueryOptions).data ?? FALLBACK;
}

/** 濾掉關掉的頁面（選單、命令面板用） */
export function enabledSections(sections: SiteSection[], config: SiteConfig): SiteSection[] {
  return sections.filter((s) => !config.disabled_pages.includes(s.key));
}

export function useEnabledSections(sections: SiteSection[]): SiteSection[] {
  return enabledSections(sections, useSiteConfig());
}

/** 無前綴的路徑（`setup`、`about-site`）屬於哪一個分區 */
export function sectionOfPath(basePath: string): SiteSection | undefined {
  return PAGES.find((s) => s.to === `/${basePath}`);
}

/** 路由的 beforeLoad 用：這一頁被關掉了就回 true（呼叫端丟 notFound） */
export async function isPageDisabled(queryClient: QueryClient, basePath: string): Promise<boolean> {
  const section = sectionOfPath(basePath);
  if (!section) return false;
  const config = await queryClient.query(siteConfigQueryOptions);
  return config.disabled_pages.includes(section.key);
}
