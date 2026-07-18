import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Music from '../components/Music';
import { recentlyPlayedQueryOptions, topGenresQueryOptions, topTracksQueryOptions } from '../musicData';

export const Route = createFileRoute('/music')({
  ...localePage('music', Music),
  // 預取穩定資料（不含 now-playing 即時狀態）→ SSR baked。
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(recentlyPlayedQueryOptions),
      context.queryClient.prefetchQuery(topGenresQueryOptions),
      context.queryClient.prefetchQuery(topTracksQueryOptions('medium_term')),
    ]);
  },
});
