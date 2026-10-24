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
    await Promise.all([
      context.queryClient.prefetchQuery(watchStatsQueryOptions),
      context.queryClient.prefetchQuery(booksQueryOptions),
      context.queryClient.prefetchQuery(topTracksQueryOptions('medium_term')),
    ]);
  },
});
