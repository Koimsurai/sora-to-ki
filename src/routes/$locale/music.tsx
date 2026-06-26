import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Music from '../../components/Music';

export const Route = createFileRoute('/$locale/music')(localePagePrefixed('music', Music));
