import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import WatchLibrary from '../../../components/WatchLibrary';
export const Route = createFileRoute('/$locale/watch/library')(localePagePrefixed('watch/library', WatchLibrary));
