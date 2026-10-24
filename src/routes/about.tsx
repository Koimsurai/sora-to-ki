import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import AboutFall from '@/components/about/AboutFall';
export const Route = createFileRoute('/about')({
  ...localePage('about'),
  component: localeWrap(AboutFall),
});
