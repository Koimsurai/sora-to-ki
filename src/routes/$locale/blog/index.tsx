import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import Blog from '../../../components/Blog';
import { postsListQueryOptions } from '../../../blogList';
import { localeFromPrefix } from '../../../start-i18n';

export const Route = createFileRoute('/$locale/blog/')({
  ...localePagePrefixed('blog', Blog),
  // 覆蓋 localePagePrefixed 的守門 loader:保留前綴驗證,再預取「該語系」的文章清單
  // (列表 API 吃 lang;不帶會 SSR 出 zh-TW 內容到 /en/blog 之類的頁面)
  loader: async ({ context, params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    await context.queryClient.prefetchQuery(postsListQueryOptions(locale, 'newest'));
  },
});
