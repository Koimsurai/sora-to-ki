import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import AboutSite from '@/components/about/AboutSite';
export const Route = createFileRoute('/about-site')({
  ...localePage('about-site'),
  component: localeWrap(AboutSite),
});
