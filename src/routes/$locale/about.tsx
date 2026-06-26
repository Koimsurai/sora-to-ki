import { createFileRoute, notFound } from '@tanstack/react-router';
import { buildAlternateLinks, DEFAULT_LOCALE, localeFromPrefix, LocaleProvider } from '../../start-i18n';
import { AboutDemo } from '../../pages/AboutDemo';

// 帶前綴的 /$locale/about(/en/about 等)。
export const Route = createFileRoute('/$locale/about')({
  head: ({ params }) => ({
    links: buildAlternateLinks('about', localeFromPrefix(params.locale) ?? DEFAULT_LOCALE),
  }),
  loader: ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
  },
  component: RouteComponent,
});

function RouteComponent() {
  const locale = localeFromPrefix(Route.useParams().locale) ?? DEFAULT_LOCALE;
  return (
    <LocaleProvider locale={locale}>
      <AboutDemo />
    </LocaleProvider>
  );
}
