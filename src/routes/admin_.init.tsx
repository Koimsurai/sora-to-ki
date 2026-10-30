import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import AdminLoading from '@/components/admin/AdminLoading';
import { loadAdminI18n } from '@/i18n/admin-i18n';

// /admin/init：初次設定的精靈（還沒有站長的站，拿 log 裡的設定碼認領）。
// 檔名的 `admin_` 讓它不掛在 /admin 的版面底下：那一層會先檢查是不是站長，而來這裡的人還不是。
// 跟後台一樣整段 ClientOnly、字串跟元件一起等（見 routes/admin/route.tsx）。
const InitWizard = lazy(() =>
  Promise.all([import('../components/admin/init/InitWizard'), loadAdminI18n()]).then(([m]) => m),
);

export const Route = createFileRoute('/admin_/init')({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === 'string' ? { code: search.code } : {},
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={<AdminLoading page />}>
        <InitWizard />
      </Suspense>
    </ClientOnly>
  ),
});
