import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Cinema from '../../components/Cinema';

export const Route = createFileRoute('/$locale/cinema')(localePagePrefixed('cinema', Cinema));
