import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Notes from '@/components/blog/Notes';
import { blogCategoriesQueryOptions, postsListQueryOptions } from '@/data/blogList';
import { DEFAULT_LOCALE } from '../../lib/locales';

export const Route = createFileRoute('/blog/')({
  ...localePage('blog'),
  component: localeWrap(Notes),
  /* 預取首屏要用到的兩份資料（文章、分類）→ SSR baked。prefetchQuery 吞錯不擋頁。
   * 分類那一排是條件渲染在資料上，沒預取的話 client 抓到才插進來、把整個列表往下推（CLS）。
   *
   * ⚠️ locale 必須跟元件端 useLocale() 得到的值一致（本路由無前綴 → zh-TW = DEFAULT_LOCALE），
   * 否則 queryKey 對不上，prefetch 白做、元件照樣自己再 fetch 一次。 */
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(postsListQueryOptions(DEFAULT_LOCALE, 'newest')),
      context.queryClient.prefetchQuery(blogCategoriesQueryOptions(DEFAULT_LOCALE)),
    ]);
  },
});
