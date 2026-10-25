import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 友鏈申請與朋友名單。維持 lazy()：後台的頁面各自一個 chunk，不進主 bundle。
const Page = lazy(() => import('../../components/admin/FriendsReview'));

export const Route = createFileRoute('/admin/friends')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
