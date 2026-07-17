import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Bookshelf from '../../components/Bookshelf';
import { loadBookshelf } from '../../bookshelfData';
import { localeFromPrefix } from '../../start-i18n';

export const Route = createFileRoute('/$locale/bookshelf')({
  ...localePagePrefixed('bookshelf', Bookshelf),
  // 覆蓋 localePagePrefixed 的守門 loader：保留前綴驗證，再多抓書單（書目本身不分語系）
  loader: ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    return loadBookshelf();
  },
});
