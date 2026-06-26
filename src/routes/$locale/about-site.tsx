import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import AboutSite from '../../components/AboutSite';
export const Route = createFileRoute('/$locale/about-site')(localePagePrefixed('about-site', AboutSite));
