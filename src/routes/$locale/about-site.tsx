import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import AboutSite from '@/components/about/AboutSite';
export const Route = createFileRoute('/$locale/about-site')({
  ...localePagePrefixed('about-site'),
  component: localeWrap(AboutSite),
});
