import { createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';
import { PAGE_TABS, type PageTab } from '@/components/admin/pageTabs';

// 頁面內容：關於、作品…前台那幾頁由站長填的資料。?tab= 是哪一頁（前台空頁的「去填內容」直接帶過來）
const Page = lazy(() => import('../../components/admin/PagesManager'));

export const Route = createFileRoute('/admin/pages')({
  validateSearch: (search: Record<string, unknown>): { tab?: PageTab } => {
    const tab = PAGE_TABS.find((t) => t.key === search.tab)?.key;
    return tab ? { tab } : {};
  },
  component: () => (
    <Suspense fallback={<AdminLoading page />}>
      <Page />
    </Suspense>
  ),
});
