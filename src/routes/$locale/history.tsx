import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import History from '../../components/History';
export const Route = createFileRoute('/$locale/history')(localePagePrefixed('history', History));
