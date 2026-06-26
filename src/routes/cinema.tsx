import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Cinema from '../components/Cinema';

export const Route = createFileRoute('/cinema')(localePage('cinema', Cinema));
