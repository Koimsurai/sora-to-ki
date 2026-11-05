import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 收藏：在看、在聽要不要出現在前台，與最愛那一排。維持 lazy()：後台的頁面各自一個 chunk。
const Page = lazy(() => import('../../components/admin/CollectionManager'));

/** 開哪一個分頁放在網址上：總覽的「巴哈的 cookie 失效了」直接連到來源設定。選用屬性的理由同 PostsSearch */
export interface CollectionSearch {
  tab?: 'sources';
}

export const Route = createFileRoute('/admin/collection')({
  validateSearch: (search: Record<string, unknown>): CollectionSearch => ({
    tab: search.tab === 'sources' ? 'sources' : undefined,
  }),
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
