import { createFileRoute, notFound } from '@tanstack/react-router';
import { buildAlternateLinks, localeFromPrefix } from '@/i18n/start-i18n';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { defaultLocale } from '../../lib/locales';
import MainPage from '@/components/home/MainPage';
import { prefetchPageContent } from '@/data/pageContent';
import { siteJsonLd } from '@/seo/seoMeta';
import { seoMetaFor } from '@/seo/pageSeo';

// 帶前綴的 locale 首頁:/en、/ja、/ko、/zh-cn。
// 非支援前綴 → notFound;預設 zh-TW → notFound(走無前綴的 routes/index)。
export const Route = createFileRoute('/$locale/')({
  head: ({ params }) => {
    const locale = localeFromPrefix(params.locale) ?? defaultLocale();
    return {
      meta: seoMetaFor('', locale, `/${params.locale}`),
      scripts: [siteJsonLd(locale)],
      links: buildAlternateLinks('', locale),
    };
  },
  loader: async ({ params, context }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === defaultLocale()) throw notFound();
    // 土星的「關於」那條軌道寫著第一章的年份
    await prefetchPageContent(context.queryClient, '');
  },
  component: RouteComponent,
});

function RouteComponent() {
  const locale = localeFromPrefix(Route.useParams().locale) ?? defaultLocale();
  return (
    <LocaleProvider locale={locale}>
      <MainPage />
    </LocaleProvider>
  );
}
