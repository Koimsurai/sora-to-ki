import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Anime from '../components/Anime';

export const Route = createFileRoute('/anime')(localePage('anime', Anime));
