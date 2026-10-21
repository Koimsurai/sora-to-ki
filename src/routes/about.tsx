import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import AboutPage from '@/components/about/AboutPage';
export const Route = createFileRoute('/about')({
  ...localePage('about'),
  component: localeWrap(AboutPage),
});
