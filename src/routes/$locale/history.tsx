import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Log from '@/components/about/Log';
export const Route = createFileRoute('/$locale/history')({
  ...localePagePrefixed('history'),
  component: localeWrap(Log),
});
