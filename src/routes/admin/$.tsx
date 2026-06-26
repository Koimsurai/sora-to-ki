import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

// /admin/* 全部交給 client-only 的 react-router island(AdminApp)。不 prerender、不 SSR(私有後台 + monaco)。
const AdminApp = lazy(() => import('../../components/AdminApp'));

export const Route = createFileRoute('/admin/$')({
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={null}><AdminApp /></Suspense>
    </ClientOnly>
  ),
});
