import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Thinking from '../../components/Thinking';
import { loadThinking } from '../../thinkingData';

export const Route = createFileRoute('/thinking/')({
  ...localePage('thinking', Thinking),
  loader: () => loadThinking(),
});
