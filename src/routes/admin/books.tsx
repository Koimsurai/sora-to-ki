import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';

// 書籍管理。維持 lazy()：後台的重元件（monaco 等）要留在自己的 chunk，不進主 bundle。
const Page = lazy(() => import('../../components/admin/BooksManager'));

export const Route = createFileRoute('/admin/books')({
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
