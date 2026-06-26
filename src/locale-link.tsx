import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { LOCALE_PREFIX, localeFromPathname, type Locale } from './start-i18n';

/** 目前路由的 locale(由 URL pathname 推得)。 */
export function useLocale(): Locale {
  return useRouterState({ select: (s) => localeFromPathname(s.location.pathname) });
}

/** 把「無前綴邏輯路徑」(如 '/about')加上目前 locale 前綴 → '/en/about';預設語言不加。 */
export function localizedPath(to: string, locale: Locale): string {
  const prefix = LOCALE_PREFIX[locale];
  if (!prefix) return to; // 預設 zh-TW 無前綴
  return to === '/' ? `/${prefix}` : `/${prefix}${to}`;
}

/**
 * 內部導覽連結:自動帶上「目前 locale」前綴,讓使用者在 /en 下點連結還是留在 /en/*。
 * to 用無前綴邏輯路徑(如 '/'、'/about'、'/blog/39')。
 */
export function LocaleLink({
  to,
  children,
  className,
}: {
  to: string;
  children?: ReactNode;
  className?: string;
}) {
  const locale = useLocale();
  // 動態 locale 前綴 ↔ TanStack 型別安全路由的邊界:此處單一轉型(非散落各處的 as any)
  return (
    <Link to={localizedPath(to, locale) as '/'} className={className}>
      {children}
    </Link>
  );
}
