import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Portfolio from '@/components/about/Portfolio';
export const Route = createFileRoute('/$locale/portfolio')({
  ...localePagePrefixed('portfolio'),
  component: localeWrap(Portfolio),
});
