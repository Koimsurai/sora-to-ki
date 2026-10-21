import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Friends from '@/components/about/Friends';
export const Route = createFileRoute('/friends')({
  ...localePage('friends'),
  component: localeWrap(Friends),
});
