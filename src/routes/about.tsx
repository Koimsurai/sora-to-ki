import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import AboutPage from '../components/AboutPage';
export const Route = createFileRoute('/about')(localePage('about', AboutPage));
