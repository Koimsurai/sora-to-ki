import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Log from '@/components/about/Log';
export const Route = createFileRoute('/history')({
  ...localePage('history'),
  component: localeWrap(Log),
});
