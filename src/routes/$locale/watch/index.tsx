import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../../localePage';
import Watch from '../../../components/Watch';
import { loadWatch } from '../../../watchData';
import { localeFromPrefix } from '../../../start-i18n';

export const Route = createFileRoute('/$locale/watch/')({
  ...localePagePrefixed('watch', Watch),
  // 覆蓋守門 loader：保留前綴驗證，再多抓觀看紀錄（紀錄本身不分語系）
  loader: ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    return loadWatch();
  },
});
