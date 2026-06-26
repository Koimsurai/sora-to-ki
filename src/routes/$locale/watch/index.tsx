import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import Watch from '../../../components/Watch';
export const Route = createFileRoute('/$locale/watch/')(localePagePrefixed('watch', Watch));
