import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Messages from '../../components/Messages';

export const Route = createFileRoute('/$locale/messages')(localePagePrefixed('messages', Messages));
