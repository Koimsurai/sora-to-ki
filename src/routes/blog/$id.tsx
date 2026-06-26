import { createFileRoute, notFound } from '@tanstack/react-router';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks, toLocales } from '../../start-i18n';
import { BlogPostPage, type PostData } from '../../pages/BlogPostPage';
import { apiUrl } from '../../api';

// 預設語言(zh-TW)文章頁:/blog/:id。loader 在 prerender 時抓內容並 baked。
export const Route = createFileRoute('/blog/$id')({
  loader: async ({ params }) => {
    const res = await fetch(apiUrl(`/api/posts/${params.id}?lang=zh-TW`));
    if (!res.ok) throw notFound();
    return { post: (await res.json()) as PostData };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { post } = loaderData;
    return {
      meta: [{ title: post.title }, { name: 'description', content: post.excerpt ?? '' }],
      // hreflang 逐篇照 available_locales —— 只連這篇真的有的語言,不造假 alternate。
      links: buildAlternateLinks(`blog/${post.id}`, DEFAULT_LOCALE, toLocales(post.available_locales)),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { post } = Route.useLoaderData();
  return (
    <LocaleProvider locale={DEFAULT_LOCALE}>
      <BlogPostPage post={post} />
    </LocaleProvider>
  );
}
