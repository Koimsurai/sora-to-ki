import { createFileRoute, notFound } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Music from '../../components/Music';
import { loadMusic } from '../../musicData';
import { localeFromPrefix } from '../../start-i18n';

export const Route = createFileRoute('/$locale/music')({
  ...localePagePrefixed('music', Music),
  // 覆蓋守門 loader：保留前綴驗證，再多抓音樂資料（Spotify 資料不分語系）
  loader: ({ params }) => {
    const locale = localeFromPrefix(params.locale);
    if (!locale || locale === 'zh-TW') throw notFound();
    return loadMusic();
  },
});
