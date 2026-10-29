import { defaultLocale, enabledLocales } from '@/lib/locales';

// 後台「頁面」的分頁：一頁一個。路由（validateSearch）與管理頁共用，所以單獨一個檔
export const PAGE_TABS = [
  { key: 'about', label: '關於' },
  { key: 'works', label: '作品' },
  { key: 'log', label: '航行日誌' },
  { key: 'qa', label: '此站點的問答' },
  { key: 'setup', label: '設備' },
] as const;

export type PageTab = (typeof PAGE_TABS)[number]['key'];

const LOCALE_LABELS: Record<string, string> = {
  'zh-TW': '繁中',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简中',
};

export const localeLabel = (key: string) => LOCALE_LABELS[key] ?? key;

/** 編輯時切換的語系：站上有開的那幾個，第一個是預設語系（必填），其他留空就顯示預設語系 */
export function editLocales(): { key: string; label: string }[] {
  const first = defaultLocale();
  return [first, ...enabledLocales().filter((l) => l !== first)].map((key) => ({ key, label: localeLabel(key) }));
}
