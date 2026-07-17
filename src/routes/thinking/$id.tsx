import { createFileRoute, notFound } from '@tanstack/react-router';
import { localeWrap } from '../../localePage';
import ThinkingDetail from '../../components/ThinkingDetail';
import { loadThought, thoughtTitle } from '../../thoughtData';
import { pageMeta } from '../../seoMeta';
import { DEFAULT_LOCALE } from '../../start-i18n';

export const Route = createFileRoute('/thinking/$id')({
  loader: async ({ params }) => {
    const data = await loadThought(params.id);
    if (!data) throw notFound();
    return data;
  },
  // 這條路由原本沒有 head()：每則碎念的標題都是站台預設值、也沒有描述。
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { thought } = loaderData;
    return { meta: pageMeta(thoughtTitle(thought.content), thought.content, `/thinking/${thought.id}`, DEFAULT_LOCALE) };
  },
  component: localeWrap(ThinkingDetail),
});
