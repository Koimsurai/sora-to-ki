import { ClientOnly, createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks, toLocales } from '../../start-i18n';
import { BlogPostPage, type PostData } from '../../pages/BlogPostPage';
import { apiUrl } from '../../api';

// 完整互動文章(mermaid / zoom / TOC / 留言 / reactions / 字體 / link 卡):純 client 元件(自抓資料、render 讀 localStorage、eager mermaid)。
// lazy + ClientOnly → 模組與 mermaid 副作用只在 client 載入;SSR 用 BlogPostPage 把內文 + SEO baked 進 HTML。
const FullBlogPost = lazy(() => import('../../components/BlogPost'));

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
      <ClientOnly fallback={<BlogPostPage post={post} />}>
        <Suspense fallback={<BlogPostPage post={post} />}>
          <FullBlogPost />
        </Suspense>
      </ClientOnly>
    </LocaleProvider>
  );
}
