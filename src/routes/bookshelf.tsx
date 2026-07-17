import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import { loadBookshelf } from '../bookshelfData';
import Bookshelf from '../components/Bookshelf';

export const Route = createFileRoute('/bookshelf')({
  ...localePage('bookshelf', Bookshelf),
  loader: () => loadBookshelf(),
});
