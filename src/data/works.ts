// 作品頁（about/Works）的清單與數據。
//
// 清單是站長在後台「頁面」或 MCP 填的（後端 page_content 的 works）：順序就是螺旋的順序（第一件是中心的起點，
// 越後面越外圈）。每一件長什麼樣子全由 GitHub 的數據決定（語言組成、commit 數、星數、最後推送時間），
// 清單裡只放數據給不了的：顯示的名字、一句介紹，以及最後量到的數字（GitHub 拿不到時的備用值）。
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { WorkRepo, WorksResponse } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';
import { useWorksContent } from './pageContent';

export interface WorkEntry {
  repo: string;
  name: string;
  /** 一句話：這是什麼 */
  what: Record<string, string>;
  /** 螺旋的起點（清單的第一件） */
  origin: boolean;
  /** GitHub 拿不到數據時用的值（私有 repo 在 token 沒權限時、沒設 token、GitHub 掛了） */
  fallback: Omit<WorkRepo, 'repo'>;
}

const EMPTY_STATS: Omit<WorkRepo, 'repo'> = {
  url: null,
  created_at: '1970-01-01T00:00:00Z',
  pushed_at: '1970-01-01T00:00:00Z',
  stars: 0,
  commits: 0,
  languages: [],
};

/** 作品清單（站長填的），形狀跟 WorkEntry 一樣；enabled = false 時不抓（選單還沒展開） */
export function useWorkEntries(enabled = true): WorkEntry[] {
  const items = useWorksContent(enabled);
  return items.map((w, i) => ({
    repo: w.repo,
    name: w.name === '' || w.name === undefined ? (w.repo.split('/')[1] ?? w.repo) : w.name,
    what: w.what ?? {},
    origin: i === 0,
    fallback: w.snapshot ? { ...EMPTY_STATS, ...w.snapshot, url: w.snapshot.url ?? null } : EMPTY_STATS,
  }));
}

/** repo 清單的指紋：放進網址當快取鍵。後端的回應快取是照「路徑加查詢字串」存的，
 *  清單一改網址就變，不必等快取過期（6 小時）才看得到新加的作品 */
function fingerprint(repos: string[]): string {
  let h = 2166136261;
  for (const c of repos.join(',')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** GitHub 上的即時數據（後端照站長填的清單抓） */
const worksQueryOptions = (entries: { repo: string }[]) => {
  const v = fingerprint(entries.map((e) => e.repo));
  return queryOptions({
    queryKey: ['github', 'works', v],
    queryFn: async (): Promise<WorkRepo[]> => {
      const res = await fetch(apiUrl(`/api/github/works?v=${v}`));
      if (!res.ok) return [];
      const data = (await res.json()) as WorksResponse;
      return data.works;
    },
    staleTime: 60 * 60 * 1000,
  });
};

/** 一件作品的數據：GitHub 有就用 GitHub 的，沒有就用最後量到的 */
export function statsOf(entry: WorkEntry, live: WorkRepo[]): WorkRepo {
  return live.find((r) => r.repo.toLowerCase() === entry.repo.toLowerCase()) ?? { repo: entry.repo, ...entry.fallback };
}

export function useWorkStats(entries: WorkEntry[], enabled = true): WorkRepo[] {
  const { data: live = [] } = useQuery({ ...worksQueryOptions(entries), enabled: enabled && entries.length > 0 });
  return live;
}
