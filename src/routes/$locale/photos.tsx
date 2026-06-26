import { createFileRoute } from '@tanstack/react-router';
import { localePageClientPrefixed } from '../../localePage';
export const Route = createFileRoute('/$locale/photos')(localePageClientPrefixed('photos', () => import('../../components/PhotoGallery')));
