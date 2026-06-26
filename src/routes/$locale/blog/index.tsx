import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import Blog from '../../../components/Blog';
export const Route = createFileRoute('/$locale/blog/')(localePagePrefixed('blog', Blog));
