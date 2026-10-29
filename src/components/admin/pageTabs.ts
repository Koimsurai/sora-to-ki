// 後台「頁面」的分頁：一頁一個。路由（validateSearch）與管理頁共用，所以單獨一個檔
export const PAGE_TABS = [{ key: 'about', label: '關於' }] as const;

export type PageTab = (typeof PAGE_TABS)[number]['key'];

/** 編輯時切換的語系：第一個是預設語系（必填），其他留空就顯示預設語系 */
export const EDIT_LOCALES = [
  { key: 'zh-TW', label: '繁中' },
  { key: 'en', label: 'English' },
  { key: 'ja', label: '日本語' },
  { key: 'ko', label: '한국어' },
  { key: 'zh-CN', label: '简中' },
] as const;
