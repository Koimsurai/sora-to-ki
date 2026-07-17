import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import Thinking from '../../../components/Thinking';
import { loadThinking } from '../../../thinkingData';
import { localeFromPrefix } from '../../../start-i18n';

export const Route = createFileRoute('/$locale/thinking/')({
  ...localePagePrefixed('thinking', Thinking),
  // 覆蓋守門 loader：保留前綴驗證，再多抓碎念（碎念本身不分語系）
  loader: ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    return loadThinking();
  },
});
