import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import History from '../components/History';
export const Route = createFileRoute('/history')(localePage('history', History));
