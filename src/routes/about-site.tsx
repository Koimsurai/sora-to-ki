import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import AboutSite from '../components/AboutSite';
export const Route = createFileRoute('/about-site')(localePage('about-site', AboutSite));
