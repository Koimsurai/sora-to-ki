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

/**
 * 要人去翻的譯文：英、日、韓。简中不算——它是由繁中轉出來的（編輯器的「從繁中產生」），
 * 缺了也不需要人動手寫。
 */
export const missingTranslations = (post: LocalePost) =>
  localeCoverage(post).filter((l) => !l.has && (l.code === 'en' || l.code === 'ja' || l.code === 'ko'));
