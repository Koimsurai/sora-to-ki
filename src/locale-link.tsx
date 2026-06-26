import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { LOCALE_PREFIX, localeFromPathname, type Locale } from './start-i18n';

/** 目前路由的 locale(由 URL pathname 推得)。 */
export function useLocale(): Locale {
  return useRouterState({ select: (s) => localeFromPathname(s.location.pathname) });
}

/** locale-aware 程式化導航:navigate('/thinking') 會帶上目前 locale 前綴。 */
export function useLocaleNavigate() {
  const navigate = useNavigate();
  const locale = useLocale();
  return (to: string) => navigate({ to: localizedPath(to, locale) as '/' });
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
// 轉發所有底層 Link 的 props(className / children / onMouseEnter / onFocus / viewTransition / preload …),
// 只把 `to` 換成「無前綴邏輯路徑」並加上目前 locale 前綴。
type LocaleLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & { to: string };

export function LocaleLink({ to, ...rest }: LocaleLinkProps) {
  const locale = useLocale();
  return <Link to={localizedPath(to, locale)} {...rest} />;
}
