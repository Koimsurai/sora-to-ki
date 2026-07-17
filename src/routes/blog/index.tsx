import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Blog from '../../components/Blog';
import { loadBlogPosts } from '../../blogList';
import { DEFAULT_LOCALE } from '../../start-i18n';

export const Route = createFileRoute('/blog/')({
  ...localePage('blog', Blog),
  loader: () => loadBlogPosts(DEFAULT_LOCALE),
});
