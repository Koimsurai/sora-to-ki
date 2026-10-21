import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed, localeWrap } from '@/i18n/localePage';
import Messages from '@/components/about/Messages';

export const Route = createFileRoute('/$locale/messages')({
  ...localePagePrefixed('messages'),
  component: localeWrap(Messages),
});
