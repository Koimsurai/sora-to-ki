import { ClientOnly, createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks, toLocales } from '../../start-i18n';
import { BlogPostPage, type PostData } from '../../pages/BlogPostPage';
import { apiUrl } from '../../api';
import { articleJsonLd, articleMeta } from '../../seoMeta';

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
      // og/twitter 也在這裡出 —— head() 是唯一會進 SSR HTML 的地方,而社群爬蟲不執行 JS。
      // (元件內的 <SEOHead> 走 helmet,hydrate 後才掛,爬蟲永遠看不到)
      meta: articleMeta(post, `/blog/${post.id}`, DEFAULT_LOCALE),
      // hreflang 逐篇照 available_locales —— 只連這篇真的有的語言,不造假 alternate。
      links: buildAlternateLinks(`blog/${post.id}`, DEFAULT_LOCALE, toLocales(post.available_locales)),
      // BlogPosting 結構化資料進 SSR（取代退休的 SEOHead JSON-LD）。
      scripts: [articleJsonLd(post, `/blog/${post.id}`)],
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
