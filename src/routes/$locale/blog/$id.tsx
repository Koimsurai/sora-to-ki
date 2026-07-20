import { createFileRoute, notFound } from '@tanstack/react-router';
import { LocaleProvider, buildAlternateLinks, localeFromPrefix, toLocales } from '../../../start-i18n';
import FullBlogPost from '../../../components/BlogPost';
import { postDetailQueryOptions } from '../../../blogList';
import { articleJsonLd, articleMeta } from '../../../seoMeta';

// 帶前綴文章頁:/$locale/blog/:id(/en/blog/39 等)。loader 依 locale 抓翻譯版內容。
// Tier-2：同 /blog/$id —— BlogPost 直接 SSR（不再 ClientOnly + BlogPostPage fallback），消除雙渲染。
export const Route = createFileRoute('/$locale/blog/$id')({
  loader: async ({ context, params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    try {
      const post = await context.queryClient.ensureQueryData(postDetailQueryOptions(params.id, locale));
      return { post, locale };
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
  const { locale } = Route.useLoaderData();
  return (
    <LocaleProvider locale={locale}>
      <FullBlogPost />
    </LocaleProvider>
  );
}
