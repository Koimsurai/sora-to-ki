import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Portfolio from '../components/Portfolio';
export const Route = createFileRoute('/portfolio')(localePage('portfolio', Portfolio));
