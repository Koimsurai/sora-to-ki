import { ClientOnly, createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { LocaleProvider, buildAlternateLinks, localeFromPrefix, toLocales } from '../../../start-i18n';
import { BlogPostPage } from '../../../pages/BlogPostPage';
import { postDetailQueryOptions } from '../../../blogList';
import { extractHeadings } from '../../../lib/blogContent';
import { articleJsonLd, articleMeta } from '../../../seoMeta';

const FullBlogPost = lazy(() => import('../../../components/BlogPost'));

// 帶前綴文章頁:/$locale/blog/:id(/en/blog/39 等)。loader 依 locale 抓翻譯版內容。
export const Route = createFileRoute('/$locale/blog/$id')({
  loader: async ({ context, params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    try {
      const post = await context.queryClient.ensureQueryData(postDetailQueryOptions(params.id, locale));
      // TOC 在 loader（SSR）就從內文切好 → fallback 首幀即渲染真目錄。
      const toc = extractHeadings(post.content);
      return { post, locale, toc };
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { post, locale } = loaderData;
    return {
      // og/twitter 也在這裡出（理由同 /blog/$id）
      meta: articleMeta(post, `/${params.locale}/blog/${post.id}`, locale),
      links: buildAlternateLinks(`blog/${post.id}`, locale, toLocales(post.available_locales)),
      scripts: [articleJsonLd(post, `/${params.locale}/blog/${post.id}`)],
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { post, locale, toc } = Route.useLoaderData();
  return (
    <LocaleProvider locale={locale}>
      <ClientOnly fallback={<BlogPostPage post={post} toc={toc} />}>
        <Suspense fallback={<BlogPostPage post={post} toc={toc} />}>
          <FullBlogPost />
        </Suspense>
      </ClientOnly>
    </LocaleProvider>
  );
}
