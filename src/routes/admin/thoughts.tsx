import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 碎念：寫一則、從同步進來的紀錄附上作品、改與刪。維持 lazy()：後台的頁面各自一個 chunk。
const Page = lazy(() => import('../../components/admin/ThoughtsManager'));

export const Route = createFileRoute('/admin/thoughts')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
