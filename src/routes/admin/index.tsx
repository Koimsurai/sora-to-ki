import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 後台首頁＝儀表板。維持 lazy()：後台的重元件（monaco 等）要留在自己的 chunk，不進主 bundle。
const Page = lazy(() => import('../../components/admin/AdminDashboard'));

export const Route = createFileRoute('/admin/')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
