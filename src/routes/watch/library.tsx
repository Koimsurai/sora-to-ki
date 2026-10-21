import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import WatchLibrary from '@/components/media/WatchLibrary';
export const Route = createFileRoute('/watch/library')({
  ...localePage('watch/library'),
  component: localeWrap(WatchLibrary),
});
