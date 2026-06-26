import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks } from '../start-i18n';
import { AboutDemo } from '../pages/AboutDemo';

// 預設語言(zh-TW)無前綴 /about。
export const Route = createFileRoute('/about')({
  head: () => ({ links: buildAlternateLinks('about', DEFAULT_LOCALE) }),
  component: () => (
    <LocaleProvider locale={DEFAULT_LOCALE}>
      <AboutDemo />
    </LocaleProvider>
  ),
});
