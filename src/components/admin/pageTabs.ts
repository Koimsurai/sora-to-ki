import { at } from '@/i18n/admin-i18n';
import { defaultLocale, enabledLocales } from '@/lib/locales';

// 後台「頁面」的分頁：一頁一個。路由（validateSearch）與管理頁共用，所以單獨一個檔。
// 分頁名在 admin/pages.json 的 `tab.<key>`
export const PAGE_TABS = [{ key: 'about' }, { key: 'works' }, { key: 'log' }, { key: 'qa' }, { key: 'setup' }] as const;

export type PageTab = (typeof PAGE_TABS)[number]['key'];

export const pageTabLabel = (key: PageTab) => at(`pages.tab.${key}`);

export const localeLabel = (key: string) => at(`pages.localeName.${key}`, { defaultValue: key });

/** 編輯時切換的語系：站上有開的那幾個，第一個是預設語系（必填），其他留空就顯示預設語系 */
export function editLocales(): { key: string; label: string }[] {
  const first = defaultLocale();
  return [first, ...enabledLocales().filter((l) => l !== first)].map((key) => ({ key, label: localeLabel(key) }));
}
