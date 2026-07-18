import { queryOptions } from '@tanstack/react-query';
import type { PostsListResponse } from '@koimsurai/api-types';
import { apiUrl } from './api';
import type { Post, Tag, Category } from './components/Blog';

// 列表頁資料改由 TanStack Query 管理。loader 用 prefetchQuery 預取 → SSR baked。
// posts query 依 (locale, sortBy) 參數化：切換排序 = 換 queryKey 自動 refetch，
// 且**帶著 locale**（舊的 client refetch 漏了 lang，/en/blog 切排序會抓成 zh-TW）。
const STALE = 5 * 60 * 1000;

export const postsListQueryOptions = (locale: string, sortBy: string) =>
  queryOptions({
    queryKey: ['posts', 'list', locale, sortBy],
    queryFn: async (): Promise<Post[]> => {
      const res = await fetch(apiUrl(`/api/posts?sortBy=${sortBy}&limit=100&lang=${locale}`));
      if (!res.ok) throw new Error(`GET /api/posts ${res.status}`);
      const data = (await res.json()) as PostsListResponse;
      return data.posts;
    },
    staleTime: STALE,
  });

export const blogTagsQueryOptions = queryOptions({
  queryKey: ['tags'],
  queryFn: async (): Promise<Tag[]> => {
    const res = await fetch(apiUrl('/api/tags'));
    if (!res.ok) throw new Error(`GET /api/tags ${res.status}`);
    const data = (await res.json()) as { tags?: Tag[] };
    return data.tags ?? [];
  },
  staleTime: STALE,
});

export const blogCategoriesQueryOptions = queryOptions({
  queryKey: ['categories'],
  queryFn: async (): Promise<Category[]> => {
    const res = await fetch(apiUrl('/api/categories'));
    if (!res.ok) throw new Error(`GET /api/categories ${res.status}`);
    const data = (await res.json()) as { categories?: Category[] };
    return data.categories ?? [];
  },
  staleTime: STALE,
});
