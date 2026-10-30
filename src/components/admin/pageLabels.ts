import { at } from '@/i18n/admin-i18n';
import { defaultLocale, enabledLocales } from '@/lib/locales';
import type { PageTab } from './pageTabs';

// 後台「頁面」分頁與語系列的名字（跟著後台語言）。跟 pageTabs.ts 分開的原因寫在那支檔案裡

export const pageTabLabel = (key: PageTab) => at(`pages.tab.${key}`);

export const localeLabel = (key: string) => at(`pages.localeName.${key}`, { defaultValue: key });

/** 編輯時切換的語系：站上有開的那幾個，第一個是預設語系（必填），其他留空就顯示預設語系 */
export function editLocales(): { key: string; label: string }[] {
  const first = defaultLocale();
  return [first, ...enabledLocales().filter((l) => l !== first)].map((key) => ({ key, label: localeLabel(key) }));
}
