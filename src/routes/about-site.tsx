import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Colophon from '@/components/about/Colophon';
export const Route = createFileRoute('/about-site')({
  ...localePage('about-site'),
  component: localeWrap(Colophon),
});
