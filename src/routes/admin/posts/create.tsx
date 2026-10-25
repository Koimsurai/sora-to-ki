import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import KoimLoader from '@/components/common/KoimLoader';

// 新增文章。維持 lazy()：PostEditor 帶著 monaco，要留在後台自己的 chunk。
const Page = lazy(() => import('../../../components/admin/PostEditor'));

export const Route = createFileRoute('/admin/posts/create')({
  component: () => (
    <Suspense fallback={<KoimLoader inline size="sm" />}>
      <Page />
    </Suspense>
  ),
});
