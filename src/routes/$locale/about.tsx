import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import AboutFall from '@/components/about/AboutFall';
export const Route = createFileRoute('/$locale/about')({
  ...localePagePrefixed('about'),
  component: localeWrap(AboutFall),
});
