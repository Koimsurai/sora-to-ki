import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 收藏：在看、在聽要不要出現在前台，與最愛那一排。維持 lazy()：後台的頁面各自一個 chunk。
const Page = lazy(() => import('../../components/admin/CollectionManager'));

export const Route = createFileRoute('/admin/collection')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
