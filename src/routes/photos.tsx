import { createFileRoute } from '@tanstack/react-router';
import { localePageClient } from '../localePage';
export const Route = createFileRoute('/photos')(localePageClient('photos', () => import('../components/PhotoGallery')));
