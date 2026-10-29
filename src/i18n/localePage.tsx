import { ClientOnly, notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Suspense, lazy, type ComponentType, type ReactElement } from 'react';
import { buildAlternateLinks, localeFromPrefix } from './start-i18n';
import { LocaleProvider } from './LocaleProvider';
import { defaultLocale } from '@/lib/locales';
import { useLocale } from '@/hooks/useLocale';
import KoimLoader from '@/components/common/KoimLoader';
import { seoMetaFor } from '@/seo/pageSeo';
import { blogListJsonLd } from '@/seo/seoMeta';
import { isPageDisabled } from '@/data/siteConfig';
import { prefetchPageContent } from '@/data/pageContent';

interface PageGateContext {
  context: { queryClient: QueryClient };
}

/** 站台設定把這一頁關掉了 → 404（跟打錯網址一樣，不透露這裡曾經有一頁）；
 *  開著的話順便把站長填的內容抓好（關於、作品…），SSR 首幀就是填好的樣子 */
async function gate({ context }: PageGateContext, basePath: string) {
  if (await isPageDisabled(context.queryClient, basePath)) throw notFound();
  await prefetchPageContent(context.queryClient, basePath);
}

// 共用:把現有頁面元件包成 Start 路由 options(LocaleProvider 包覆 + 逐 locale hreflang)。
// component 用 useLocale() 從 URL 推 locale,所以 default 與 $locale 路由共用同一個 wrapper。
export function localeWrap(Comp: ComponentType): () => ReactElement {
  return function Wrapped() {
    const locale = useLocale();
    return (
      <LocaleProvider locale={locale}>
        <Comp />
      </LocaleProvider>
    );
  };
}

/** 預設語言(zh-TW)無前綴頁的 route options（只有 head）。basePath = 無前綴邏輯路徑(如 'bookshelf')。
 *
 * ⚠️ `component` 刻意不在這裡給，要在路由檔自己寫 `component: localeWrap(Page)`。
 * TanStack 的自動 code splitting 只認得路由物件上**直接寫出來**的 `component`：藏在
 * `...localePage('music', Music)` 的展開裡它看不到，於是 14 個頁面全被打進入口 chunk
 * （300 KB gzip，/setup 實測 62% 用不到）。 */
export function localePage(basePath: string) {
  return {
    beforeLoad: (ctx: PageGateContext) => gate(ctx, basePath),
    // meta 走 head() 而非元件內的 <SEOHead>：SEOHead 是 helmet，hydrate 後才掛，爬蟲看不到
    // → 過去每頁 SSR 的 <title> 全是同一個預設值、且無 description。詳見 pageSeo.ts。
    head: () => ({
      meta: seoMetaFor(basePath, defaultLocale(), `/${basePath}`),
      links: buildAlternateLinks(basePath, defaultLocale()),
      // 文章列表宣告成 Blog（CollectionPage 的專用型別），爬蟲才知道這頁是集合而非普通頁
      ...(basePath === 'blog' ? { scripts: [blogListJsonLd(defaultLocale())] } : {}),
    }),
  };
}

// 純瀏覽器頁(masonic / three / monaco / swiper 等不該 SSR 的重元件):
// 整頁 lazy + ClientOnly,server 端只出 loader shell + SEO head(hreflang/canonical),client 才載入真正元件。
function clientOnlyComp(factory: () => Promise<{ default: ComponentType }>): ComponentType {
  const Lazy = lazy(factory);
  return function ClientOnlyPage() {
    return (
      <ClientOnly fallback={<KoimLoader fullscreen size="lg" />}>
        <Suspense fallback={<KoimLoader fullscreen size="lg" />}>
          <Lazy />
        </Suspense>
      </ClientOnly>
    );
  };
}

/** 預設語言 client-only 頁。元件本來就是動態 import，所以 component 可以在這裡給。 */
export function localePageClient(basePath: string, factory: () => Promise<{ default: ComponentType }>) {
  return { ...localePage(basePath), component: localeWrap(clientOnlyComp(factory)) };
}

/** 帶前綴 client-only 頁。 */
export function localePageClientPrefixed(basePath: string, factory: () => Promise<{ default: ComponentType }>) {
  return { ...localePagePrefixed(basePath), component: localeWrap(clientOnlyComp(factory)) };
}

/** 帶前綴 /$locale/... 頁的 route options（head + 前綴守門 loader）；component 同 localePage 的說明。 */
export function localePagePrefixed(basePath: string) {
  return {
    beforeLoad: (ctx: PageGateContext) => gate(ctx, basePath),
    head: ({ params }: { params: { locale: string } }) => {
      const locale = localeFromPrefix(params.locale) ?? defaultLocale();
      return {
        meta: seoMetaFor(basePath, locale, `/${params.locale}/${basePath}`),
        links: buildAlternateLinks(basePath, locale),
        ...(basePath === 'blog' ? { scripts: [blogListJsonLd(locale)] } : {}),
      };
    },
    loader: ({ params }: { params: { locale: string } }) => {
      const locale = localeFromPrefix(params.locale);
      if (!locale || locale === defaultLocale()) throw notFound();
    },
  };
}
