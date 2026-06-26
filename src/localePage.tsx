import { notFound } from '@tanstack/react-router';
import type { ComponentType, ReactElement } from 'react';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks, localeFromPrefix } from './start-i18n';
import { useLocale } from './locale-link';

// 共用:把現有頁面元件包成 Start 路由 options(LocaleProvider 包覆 + 逐 locale hreflang)。
// component 用 useLocale() 從 URL 推 locale,所以 default 與 $locale 路由共用同一個 wrapper。
function localeWrap(Comp: ComponentType): () => ReactElement {
  return function Wrapped() {
    const locale = useLocale();
    return (
      <LocaleProvider locale={locale}>
        <Comp />
      </LocaleProvider>
    );
  };
}

/** 預設語言(zh-TW)無前綴頁的 route options。basePath = 無前綴邏輯路徑(如 'bookshelf')。 */
export function localePage(basePath: string, Comp: ComponentType) {
  return {
    head: () => ({ links: buildAlternateLinks(basePath, DEFAULT_LOCALE) }),
    component: localeWrap(Comp),
  };
}

/** 帶前綴 /$locale/... 頁的 route options。 */
export function localePagePrefixed(basePath: string, Comp: ComponentType) {
  return {
    head: ({ params }: { params: { locale: string } }) => ({
      links: buildAlternateLinks(basePath, localeFromPrefix(params.locale) ?? DEFAULT_LOCALE),
    }),
    loader: ({ params }: { params: { locale: string } }) => {
      const locale = localeFromPrefix(params.locale);
      if (!locale || locale === 'zh-TW') throw notFound();
    },
    component: localeWrap(Comp),
  };
}
