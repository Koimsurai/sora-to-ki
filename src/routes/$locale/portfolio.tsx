import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Works from '@/components/about/Works';
export const Route = createFileRoute('/$locale/portfolio')({
  ...localePagePrefixed('portfolio'),
  component: localeWrap(Works),
});
