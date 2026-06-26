import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Bookshelf from '../../components/Bookshelf';

export const Route = createFileRoute('/$locale/bookshelf')(localePagePrefixed('bookshelf', Bookshelf));
