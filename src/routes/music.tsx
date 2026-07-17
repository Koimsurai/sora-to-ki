import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Music from '../components/Music';
import { loadMusic } from '../musicData';

export const Route = createFileRoute('/music')({
  ...localePage('music', Music),
  loader: () => loadMusic(),
});
