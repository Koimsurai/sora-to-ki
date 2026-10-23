import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Collection from '@/components/media/Collection';
import { booksQueryOptions } from '@/data/bookshelfData';
import { topGenresQueryOptions, topTracksQueryOptions } from '@/data/musicData';
import { watchStatsQueryOptions } from '@/data/watchData';
import { localeFromPrefix } from '@/i18n/start-i18n';

export const Route = createFileRoute('/$locale/watch/')({
  ...localePagePrefixed('watch'),
  component: localeWrap(Collection),
  // 覆蓋守門 loader：保留前綴驗證，再預取（同無前綴版，資料本身不分語系）
  loader: async ({ context, params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    await Promise.all([
      context.queryClient.prefetchQuery(watchStatsQueryOptions),
      context.queryClient.prefetchQuery(booksQueryOptions),
      context.queryClient.prefetchQuery(topTracksQueryOptions('medium_term')),
      context.queryClient.prefetchQuery(topGenresQueryOptions),
    ]);
  },
});
