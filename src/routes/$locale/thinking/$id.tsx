import { createFileRoute, notFound } from '@tanstack/react-router';
import { localeWrap } from '../../../localePage';
import ThinkingDetail from '../../../components/ThinkingDetail';
import { loadThought, thoughtTitle } from '../../../thoughtData';
import { pageMeta } from '../../../seoMeta';
import { DEFAULT_LOCALE, localeFromPrefix } from '../../../start-i18n';

export const Route = createFileRoute('/$locale/thinking/$id')({
  loader: async ({ params }) => {
    // 保留 localeGuardedPage 原本的前綴守門
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    const data = await loadThought(params.id);
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { thought } = loaderData;
    const locale = localeFromPrefix(params.locale) ?? DEFAULT_LOCALE;
    // 碎念本身不分語系（內容就一份），但 canonical/og:locale 要跟著路由
    return {
      meta: pageMeta(thoughtTitle(thought.content), thought.content, `/${params.locale}/thinking/${thought.id}`, locale),
    };
  },
  component: localeWrap(ThinkingDetail),
});
