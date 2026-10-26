import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 流量（Plausible）。維持 lazy()：後台的頁面各自一個 chunk，不進主 bundle。
const Page = lazy(() => import('../../components/admin/AdminAnalytics'));

export const Route = createFileRoute('/admin/analytics')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
