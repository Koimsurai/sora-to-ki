import { createFileRoute, notFound } from '@tanstack/react-router';
import { buildAlternateLinks, DEFAULT_LOCALE, localeFromPrefix, LocaleProvider } from '../../start-i18n';
import Setup from '../../components/Setup';

// 2d:帶前綴的 /$locale/setup(/en/setup 等)。
export const Route = createFileRoute('/$locale/setup')({
  head: ({ params }) => ({
    links: buildAlternateLinks('setup', localeFromPrefix(params.locale) ?? DEFAULT_LOCALE),
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
      <Setup />
    </LocaleProvider>
  );
}
