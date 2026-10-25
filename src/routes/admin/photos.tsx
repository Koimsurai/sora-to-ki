import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 照片的標題、標籤、精選與隱藏。維持 lazy()：後台的頁面各自一個 chunk，不進主 bundle。
const Page = lazy(() => import('../../components/admin/PhotosManager'));

export const Route = createFileRoute('/admin/photos')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
