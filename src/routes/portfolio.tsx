import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Works from '@/components/about/Works';
export const Route = createFileRoute('/portfolio')({
  ...localePage('portfolio'),
  component: localeWrap(Works),
});
