import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Collection from '@/components/media/Collection';
import { booksQueryOptions } from '@/data/bookshelfData';
import { topTracksQueryOptions } from '@/data/musicData';
import { watchStatsQueryOptions } from '@/data/watchData';

// 收藏（看過的、讀過的、常聽的）。網址沿用 /watch：舊的 /bookshelf、/music、/watch/library 都轉到這裡的那一區
export const Route = createFileRoute('/watch/')({
  ...localePage('watch'),
  component: localeWrap(Collection),
  // 預取小的那幾份（數字、書、最常聽的二十首）→ SSR baked。全部的觀看紀錄很大（一集一筆），
  // 正在看／正在聽是輪詢的即時狀態，都留給 client 自己抓
  loader: async ({ context }) => {
    // 天空跟資料無關的那一半趁空檔先算（滑過連結的預載、換頁開始收的時候就會跑到這裡）：
    // 不然掛上去的那一刻才算，正好卡在換頁轉場的點還在飛的時候
    if (typeof window !== 'undefined') void import('@/components/media/signalSky').then((m) => m.prewarmSignalSky());
    await Promise.all([
      context.queryClient.prefetchQuery(watchStatsQueryOptions),
      context.queryClient.prefetchQuery(booksQueryOptions),
      context.queryClient.prefetchQuery(topTracksQueryOptions('medium_term')),
    ]);
  },
});
