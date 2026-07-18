import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Thinking from '../../components/Thinking';
import { thoughtsListQueryOptions } from '../../thinkingData';

export const Route = createFileRoute('/thinking/')({
  ...localePage('thinking', Thinking),
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(thoughtsListQueryOptions);
  },
});
