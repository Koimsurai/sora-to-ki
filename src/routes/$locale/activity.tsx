import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Activity from '../../components/Activity';

export const Route = createFileRoute('/$locale/activity')(localePagePrefixed('activity', Activity));
