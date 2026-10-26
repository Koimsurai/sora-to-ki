import { queryOptions } from '@tanstack/react-query';
import type {
  AnalyticsResponse,
  AdminTagRow,
  AdminCategoryRow,
  AdminUserRow,
  AdminUsersResponse,
  BookRow,
  BooksListResponse,
  BlacklistRow,
  BlacklistResponse,
  KeywordFilterRow,
  KeywordFiltersResponse,
  SubscribersResponse,
  SubscriberRow,
  AdminPostsResponse,
  AdminCommentsResponse,
  AdminPostDetailResponse,
  AdminFriendsResponse,
  AdminPhotosResponse,
  AdminCollectionResponse,
  MetricStat,
} from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';
import { authHeaders } from '@/lib/authToken';

// admin 管理頁的 TanStack Query 選項。全 behind auth（ClientOnly）——queryFn 用
// lib/authToken 的 authHeaders 帶 Authorization。列表讀進 query 快取，CRUD mutation
// 由各 manager invalidateQueries 重抓，消掉 useEffect+fetch 混用。全吃 specta 生成型別。
async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return (await res.json()) as T;
}

const STALE = 60 * 1000;

export const adminTagsQueryOptions = queryOptions({
  queryKey: ['admin', 'tags'],
  queryFn: () => adminGet<AdminTagRow[]>('/api/admin/tags'),
  staleTime: STALE,
});

export const adminCategoriesQueryOptions = queryOptions({
  queryKey: ['admin', 'categories'],
  queryFn: () => adminGet<AdminCategoryRow[]>('/api/admin/categories'),
  staleTime: STALE,
});

export const adminUsersQueryOptions = queryOptions({
  queryKey: ['admin', 'users'],
  queryFn: async (): Promise<AdminUserRow[]> => (await adminGet<AdminUsersResponse>('/api/admin/users')).users,
  staleTime: STALE,
});

export const adminBooksQueryOptions = queryOptions({
  queryKey: ['admin', 'books'],
  queryFn: async (): Promise<BookRow[]> => (await adminGet<BooksListResponse>('/api/books')).books,
  staleTime: STALE,
});

export const adminBlacklistQueryOptions = queryOptions({
  queryKey: ['admin', 'blacklist'],
  queryFn: async (): Promise<BlacklistRow[]> => (await adminGet<BlacklistResponse>('/api/admin/blacklist')).blacklist,
  staleTime: STALE,
});

export const adminKeywordFiltersQueryOptions = queryOptions({
  queryKey: ['admin', 'keyword-filters'],
  queryFn: async (): Promise<KeywordFilterRow[]> =>
    (await adminGet<KeywordFiltersResponse>('/api/admin/keyword-filters')).filters,
  staleTime: STALE,
});

// 分頁/篩選的用 factory（queryKey 帶參數 → 換頁自動 refetch）
export const adminSubscribersByStatusQueryOptions = (status: string) =>
  queryOptions({
    queryKey: ['admin', 'subscribers', status],
    queryFn: async (): Promise<SubscriberRow[]> =>
      (await adminGet<SubscribersResponse>(`/api/newsletter/subscribers?status=${status}&limit=100`)).subscribers,
    staleTime: STALE,
  });

export const adminPostsQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ['admin', 'posts', query],
    queryFn: () => adminGet<AdminPostsResponse>(`/api/admin/posts${query ? `?${query}` : ''}`),
    staleTime: 30 * 1000,
  });

export const adminCommentsQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ['admin', 'comments', query],
    queryFn: () => adminGet<AdminCommentsResponse>(`/api/admin/comments${query ? `?${query}` : ''}`),
    staleTime: 30 * 1000,
  });

// /api/admin/stats 非 specta 端點（visitors=SUM(view_count) 等動態）→ 型別手寫小葉。
export interface AdminStats {
  totalPosts?: number;
  publishedPosts?: number;
  draftPosts?: number;
  scheduledPosts?: number;
  trashedPosts?: number;
  /** 最早一篇排程的發佈時間（UTC 的 DB 時間）；沒有排程是 null */
  nextScheduledAt?: string | null;
  postsThisMonth?: number;
  comments?: number;
  commentsThisWeek?: number;
  thoughts?: number;
  thoughtsThisMonth?: number;
  visitors?: number;
}
/** 收藏：在看（含不公開的）、在聽、不公開清單 */
export const adminCollectionQueryOptions = queryOptions({
  queryKey: ['admin', 'collection'],
  queryFn: () => adminGet<AdminCollectionResponse>('/api/admin/collection'),
  staleTime: 30 * 1000,
});

/** 照片：manifest 疊上後台設定，含藏起來的（後台照片頁） */
export const adminPhotosQueryOptions = queryOptions({
  queryKey: ['admin', 'photos'],
  queryFn: () => adminGet<AdminPhotosResponse>('/api/admin/gallery/photos'),
  staleTime: 60 * 1000,
});

/** 友鏈：申請與朋友都在同一張表，前端照 status 分頁 */
export const adminFriendsQueryOptions = queryOptions({
  queryKey: ['admin', 'friends'],
  queryFn: () => adminGet<AdminFriendsResponse>('/api/admin/friends'),
  staleTime: 30 * 1000,
});

export type AnalyticsPeriod = '7d' | '30d' | '6mo';

/**
 * 流量（後端代理自架 Plausible）。Plausible 拒絕時後端回 502 帶 `error`（key 錯、site_id 錯），
 * 那句話要原樣顯示給站長看，所以不走 adminGet 那個只報狀態碼的錯誤。
 */
export const adminAnalyticsQueryOptions = (period: AnalyticsPeriod) =>
  queryOptions({
    queryKey: ['admin', 'analytics', period],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/admin/analytics?period=${period}`), { headers: authHeaders() });
      const body = (await res.json().catch(() => ({}))) as AnalyticsResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      return body;
    },
    staleTime: STALE,
    // 上游是別的服務，壞了重試也多半一樣壞；讓錯誤訊息早點出來
    retry: false,
  });

export const adminStatsQueryOptions = queryOptions({
  queryKey: ['admin', 'stats'],
  queryFn: () => adminGet<AdminStats>('/api/admin/stats'),
  staleTime: STALE,
});

// 巴哈姆特動畫瘋的 cookie／JWT 狀態（收藏頁「在看」的來源）。非 specta 端點 → 型別手寫。
export interface BahamutStatus {
  ok: boolean;
  missing: string[];
  jwtExpiresAt: string | null;
  daysLeft: number | null;
}
export const adminBahamutStatusQueryOptions = queryOptions({
  queryKey: ['admin', 'bahamut-status'],
  queryFn: () => adminGet<BahamutStatus>('/api/admin/bahamut/status'),
  staleTime: STALE,
});

// Web Vitals 的聚合（p75 與好／待改善／差的分佈）。端點是公開的，SQL 本身就排除了 /admin，
// 所以不用再自己過濾後台的資料。
export interface VitalsStats {
  days: number;
  metrics: MetricStat[];
}
export const vitalsStatsQueryOptions = (days: number) =>
  queryOptions({
    queryKey: ['admin', 'vitals', days],
    queryFn: () => adminGet<VitalsStats>(`/api/vitals/stats?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });

export const adminPostDetailQueryOptions = (id: string | number) =>
  queryOptions({
    queryKey: ['admin', 'post-detail', String(id)],
    queryFn: () => adminGet<AdminPostDetailResponse>(`/api/admin/posts/${id}`),
    staleTime: 30 * 1000,
  });
