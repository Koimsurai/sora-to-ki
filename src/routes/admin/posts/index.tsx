import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 文章列表。維持 lazy()：後台的重元件（monaco 等）要留在自己的 chunk，不進主 bundle。
const Page = lazy(() => import('../../../components/admin/PostsList'));

const STATUSES = ['published', 'draft', 'scheduled', 'trashed'] as const;
export type PostsStatusFilter = (typeof STATUSES)[number];

/**
 * 篩選放在網址上：總覽的「等你處理」可以直接連到「草稿」或「缺譯文」，重新整理也不會掉。
 *
 * 回傳型別要寫成**選用屬性**（`status?:`）而不是讓它推成 `status: … | undefined`：
 * 後者對 TanStack 來說是「一定要有這個 key」，於是每一個連到本頁的 <Link> 都會被要求傳 search。
 */
export interface PostsSearch {
  status?: PostsStatusFilter;
  missing?: boolean;
}

export const Route = createFileRoute('/admin/posts/')({
  validateSearch: (search: Record<string, unknown>): PostsSearch => ({
    status: STATUSES.find((s) => s === search.status),
    missing: search.missing === true || search.missing === 'true' ? true : undefined,
  }),
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
