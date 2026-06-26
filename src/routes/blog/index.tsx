import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Blog from '../../components/Blog';
export const Route = createFileRoute('/blog/')(localePage('blog', Blog));
