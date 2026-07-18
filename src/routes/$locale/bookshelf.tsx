import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Bookshelf from '../../components/Bookshelf';
import { booksQueryOptions, bookStatsQueryOptions } from '../../bookshelfData';
import { localeFromPrefix } from '../../start-i18n';

export const Route = createFileRoute('/$locale/bookshelf')({
  ...localePagePrefixed('bookshelf', Bookshelf),
  // 覆蓋 localePagePrefixed 的守門 loader：保留前綴驗證，再預取書單（書目本身不分語系）。
  loader: async ({ context, params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    await Promise.all([
      context.queryClient.prefetchQuery(booksQueryOptions),
      context.queryClient.prefetchQuery(bookStatsQueryOptions),
    ]);
  },
});
