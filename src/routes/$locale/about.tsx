import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import AboutPage from '../../components/AboutPage';
export const Route = createFileRoute('/$locale/about')(localePagePrefixed('about', AboutPage));
