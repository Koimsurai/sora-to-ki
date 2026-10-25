import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 編輯既有文章。`$id` 是動態段，PostEditor 用 Route.useParams() 取。
const Page = lazy(() => import('../../../components/admin/PostEditor'));

export const Route = createFileRoute('/admin/posts/edit/$id')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
