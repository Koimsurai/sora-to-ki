import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

// 草稿的前台預覽：後台文章編輯器按「在前台預覽」開的分頁（components/admin/DraftPreview）。
// 內容只在作者這台電腦的瀏覽器裡，伺服器沒東西可以渲染：整頁 ClientOnly，也不給搜尋引擎收
const DraftPreview = lazy(() => import('@/components/admin/DraftPreview'));

export const Route = createFileRoute('/preview/post')({
  head: () => ({
    meta: [{ title: '草稿預覽 · Koimsurai' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={null}>
        <DraftPreview />
      </Suspense>
    </ClientOnly>
  ),
});
