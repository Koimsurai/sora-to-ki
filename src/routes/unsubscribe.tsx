import { createFileRoute } from '@tanstack/react-router';
import { localePage, localeWrap } from '@/i18n/localePage';
import Unsubscribe from '@/components/account/Unsubscribe';
export const Route = createFileRoute('/unsubscribe')({
  ...localePage('unsubscribe'),
  component: localeWrap(Unsubscribe),
});
