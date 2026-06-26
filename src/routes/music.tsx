import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Music from '../components/Music';

export const Route = createFileRoute('/music')(localePage('music', Music));
