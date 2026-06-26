import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Friends from '../../components/Friends';
export const Route = createFileRoute('/$locale/friends')(localePagePrefixed('friends', Friends));
