import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Colophon from '@/components/about/Colophon';
export const Route = createFileRoute('/$locale/about-site')({
  ...localePagePrefixed('about-site'),
  component: localeWrap(Colophon),
});
