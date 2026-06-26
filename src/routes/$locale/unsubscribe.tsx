import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Unsubscribe from '../../components/Unsubscribe';
export const Route = createFileRoute('/$locale/unsubscribe')(localePagePrefixed('unsubscribe', Unsubscribe));
