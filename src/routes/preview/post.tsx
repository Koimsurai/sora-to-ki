import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import { siteName } from '@/lib/siteIdentity';

// 草稿的前台預覽：後台文章編輯器按「在前台預覽」開的分頁（components/admin/DraftPreview）。
// 內容只在作者這台電腦的瀏覽器裡，伺服器沒東西可以渲染：整頁 ClientOnly，也不給搜尋引擎收
const DraftPreview = lazy(() => import('@/components/admin/DraftPreview'));

export const Route = createFileRoute('/preview/post')({
  head: () => ({
    // 繁中只是伺服器那一輪的預設；DraftPreview 載好後台字串後換成站長的語言
    meta: [{ title: `草稿預覽 · ${siteName()}` }, { name: 'robots', content: 'noindex, nofollow' }], // i18n-ignore
  }),
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={null}>
        <DraftPreview />
      </Suspense>
    </ClientOnly>
  ),
});
