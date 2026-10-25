import type { AdminPostFull } from '@koimsurai/api-types';
import { format } from 'date-fns';

// 後台各頁共用的純函式（不是元件，所以跟 AdminPage.tsx 分開放——同一個檔混著元件與函式，
// fast refresh 就不能只換元件）。

/**
 * 時間戳 → 等寬的短日期。壞掉的值回空字串：date-fns 的 format 遇到 Invalid Date 會直接丟錯，
 * 一筆壞資料不該讓整頁白掉（煙霧測試也會抓畫面上漏出來的「Invalid Date」）。
 */
export function formatWhen(value: string | Date | null | undefined, pattern = 'MM.dd HH:mm'): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : format(d, pattern);
}

export const STATUS_LABEL: Record<string, string> = {
  published: '已發佈',
  draft: '草稿',
  archived: '封存',
};

export type LocalePost = Pick<
  AdminPostFull,
  'title' | 'title_en' | 'title_zh_cn' | 'title_ja' | 'title_ko' | 'source_language'
>;

/** 五個語系。原稿寫在 `title`（哪一種語言看 source_language），其他語系各有自己的欄 */
const LOCALES = [
  { code: 'zh-TW', label: '繁', field: null },
  { code: 'en', label: 'EN', field: 'title_en' },
  { code: 'zh-CN', label: '简', field: 'title_zh_cn' },
  { code: 'ja', label: '日', field: 'title_ja' },
  { code: 'ko', label: '韓', field: 'title_ko' },
] as const;

export interface LocaleCoverage {
  code: string;
  label: string;
  has: boolean;
}

export function localeCoverage(post: LocalePost): LocaleCoverage[] {
  const source = post.source_language ?? 'zh-TW';
  return LOCALES.map(({ code, label, field }) => {
    const text = code === source ? post.title : field ? post[field] : null;
    return { code, label, has: Boolean(text?.trim()) };
  });
}

/** 分類、標籤這種「名稱＋各語系譯名」的資料：原名就是繁中，其他語系看各自的 name_* 欄 */
export interface LocaleNamed {
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_ko: string | null;
  name_zh_cn: string | null;
}

export function nameCoverage(row: LocaleNamed): LocaleCoverage[] {
  const value: Record<string, string | null> = {
    'zh-TW': row.name,
    en: row.name_en,
    'zh-CN': row.name_zh_cn,
    ja: row.name_ja,
    ko: row.name_ko,
  };
  return LOCALES.map(({ code, label }) => ({ code, label, has: Boolean(value[code]?.trim()) }));
}

/** 表單裡的四個譯名欄（新增語系時只要改這裡，表單自動長出欄位） */
export const LOCALE_NAME_FIELDS = [
  { key: 'name_en', label: 'English' },
  { key: 'name_ja', label: '日本語' },
  { key: 'name_ko', label: '한국어' },
  { key: 'name_zh_cn', label: '简体中文' },
] as const;

/**
 * 要人去翻的譯文：英、日、韓。简中不算——它是由繁中轉出來的（編輯器的「從繁中產生」），
 * 缺了也不需要人動手寫。
 */
export const missingTranslations = (post: LocalePost) =>
  localeCoverage(post).filter((l) => !l.has && (l.code === 'en' || l.code === 'ja' || l.code === 'ko'));
