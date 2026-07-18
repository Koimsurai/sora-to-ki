import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Watch from '../../components/Watch';
import { animeHistoryQueryOptions, filmsQueryOptions, seriesQueryOptions, watchStatsQueryOptions } from '../../watchData';

export const Route = createFileRoute('/watch/')({
  ...localePage('watch', Watch),
  // 預取觀看紀錄（不含 liveNow 即時 / favorites 依語系）→ SSR baked。
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(animeHistoryQueryOptions),
      context.queryClient.prefetchQuery(filmsQueryOptions),
      context.queryClient.prefetchQuery(seriesQueryOptions),
      context.queryClient.prefetchQuery(watchStatsQueryOptions),
    ]);
  },
});
