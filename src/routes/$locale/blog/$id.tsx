import { ClientOnly, createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { LocaleProvider, buildAlternateLinks, localeFromPrefix, toLocales } from '../../../start-i18n';
import { BlogPostPage, type PostData } from '../../../pages/BlogPostPage';
import { apiUrl } from '../../../api';
import { articleMeta } from '../../../seoMeta';

const FullBlogPost = lazy(() => import('../../../components/BlogPost'));

// 帶前綴文章頁:/$locale/blog/:id(/en/blog/39 等)。loader 依 locale 抓翻譯版內容。
export const Route = createFileRoute('/$locale/blog/$id')({
  loader: async ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    const res = await fetch(apiUrl(`/api/posts/${params.id}?lang=${locale}`));
    if (!res.ok) throw notFound();
    return { post: (await res.json()) as PostData, locale };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { post, locale } = loaderData;
    return {
      // og/twitter 也在這裡出（理由同 /blog/$id）
      meta: articleMeta(post, `/${params.locale}/blog/${post.id}`, locale),
      links: buildAlternateLinks(`blog/${post.id}`, locale, toLocales(post.available_locales)),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { post, locale } = Route.useLoaderData();
  return (
    <LocaleProvider locale={locale}>
      <ClientOnly fallback={<BlogPostPage post={post} />}>
        <Suspense fallback={<BlogPostPage post={post} />}>
          <FullBlogPost />
        </Suspense>
      </ClientOnly>
    </LocaleProvider>
  );
}
