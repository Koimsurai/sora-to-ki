import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Anime from '../../components/Anime';

export const Route = createFileRoute('/$locale/anime')(localePagePrefixed('anime', Anime));
