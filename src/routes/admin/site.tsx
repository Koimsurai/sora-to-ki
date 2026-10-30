import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 站台設定：站名、語系、要開的頁面（跟初次設定的精靈同一組欄位）
const Page = lazy(() => import('../../components/admin/site/SiteSettings'));

export const Route = createFileRoute('/admin/site')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
