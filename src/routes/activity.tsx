import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Activity from '@/components/media/Activity';

export const Route = createFileRoute('/activity')({
  ...localePage('activity'),
  component: localeWrap(Activity),
});
