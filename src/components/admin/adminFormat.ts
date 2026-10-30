import type { AdminPostFull } from '@koimsurai/api-types';
import { format, isValid, parse } from 'date-fns';
import { at } from '@/i18n/admin-i18n';
import { defaultLocale, isEnabled } from '@/lib/locales';

// 後台各頁共用的純函式（不是元件，所以跟 AdminPage.tsx 分開放——同一個檔混著元件與函式，
// fast refresh 就不能只換元件）。

/**
 * 時間戳 → 等寬的短日期。壞掉的值回空字串：date-fns 的 format 遇到 Invalid Date 會直接丟錯，
 * 一筆壞資料不該讓整頁白掉（煙霧測試也會抓畫面上漏出來的「Invalid Date」）。
 */
export function formatWhen(value: string | Date | null | undefined, pattern = 'MM.dd HH:mm'): string {
  if (!value) return '';
  const d = value instanceof Date ? value : parseDbTime(value);
  return Number.isNaN(d.getTime()) ? '' : format(d, pattern);
}

/** SQLite `datetime('now')` 的寫法：UTC，但沒有時區記號 */
const DB_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

/**
 * 後端的時間戳 → Date。DB 存的是 UTC 的 `YYYY-MM-DD HH:MM:SS`（沒有時區記號），
 * `new Date()` 會把這種寫法當成**本地時間**，在台灣就差八小時——排程時間尤其不能差。
 * 其他寫法（ISO 8601、只有日期）照 `new Date()` 的規則。
 */
export function parseDbTime(value: string): Date {
  return new Date(DB_TIME.test(value) ? `${value.replace(' ', 'T')}Z` : value);
}

/** UTC 的 DB 時間 → `<input type="datetime-local">` 要的本地字串（`yyyy-MM-ddTHH:mm`） */
export function toLocalInput(value: string | null | undefined): string {
  return formatWhen(value, "yyyy-MM-dd'T'HH:mm");
}

/** `<input type="datetime-local">` 的本地字串 → 帶時區的 ISO 8601（後端照它帶的時區換成 UTC） */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 日期欄位打字時接受的寫法：2026-10-26、2026.10.26、2026/10/26（月日可以不補零） */
const DATE_FORMATS = ['yyyy-MM-dd', 'yyyy.MM.dd', 'yyyy/MM/dd', 'yyyy-M-d', 'yyyy.M.d', 'yyyy/M/d'];

/** 日期欄位打進來的字 → `yyyy-MM-dd`；認不得回 null，空的回空字串 */
export function normalizeDate(text: string): string | null {
  const t = text.trim();
  if (!t) return '';
  for (const f of DATE_FORMATS) {
    const d = parse(t, f, new Date());
    if (isValid(d) && d.getFullYear() >= 1000) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

/** 時間欄位打進來的字 → `HH:mm`（930、9:30、09:30 都收）；認不得回 null，空的回空字串 */
export function normalizeTime(text: string): string | null {
  const t = text.trim();
  if (!t) return '';
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  // 分鐘那組是選填的（「9」就是九點整），沒對到時是 undefined
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** 回收桶放多久（跟後端 post_lifecycle::TRASH_KEEP_DAYS 一致） */
export const TRASH_KEEP_DAYS = 30;

/**
 * 回收裡的文章還剩幾天會被清掉，夾在 0 到 30 之間。
 * `now` 是頁面打開時記下的，比剛丟進回收的那一刻還早——不夾住的話會算出「還剩 31 天」。
 */
export function trashDaysLeft(trashedAt: string | null | undefined, now: Date): number {
  if (!trashedAt) return TRASH_KEEP_DAYS;
  const elapsed = (now.getTime() - parseDbTime(trashedAt).getTime()) / 86_400_000;
  return Math.min(TRASH_KEEP_DAYS, Math.max(0, Math.ceil(TRASH_KEEP_DAYS - elapsed)));
}

const STATUSES = new Set(['published', 'draft', 'scheduled', 'trashed']);

/** 文章狀態的名字；認不得的照原樣 */
export const statusLabel = (status: string): string => (STATUSES.has(status) ? at(`common.status.${status}`) : status);

export type LocalePost = Pick<
  AdminPostFull,
  'title' | 'title_en' | 'title_zh_cn' | 'title_zh_tw' | 'title_ja' | 'title_ko' | 'source_language'
>;

/** 五個語系。原稿寫在 `title`（哪一種語言看 source_language），其他語系各有自己的欄 */
const LOCALES = [
  { code: 'zh-TW', field: 'title_zh_tw' },
  { code: 'en', field: 'title_en' },
  { code: 'zh-CN', field: 'title_zh_cn' },
  { code: 'ja', field: 'title_ja' },
  { code: 'ko', field: 'title_ko' },
] as const;

/** 語系點旁邊的短名（繁、EN…），跟著後台語言 */
const shortName = (code: string) => at(`common.localeShort.${code}`);

export interface LocaleCoverage {
  code: string;
  label: string;
  has: boolean;
}

/** 站上有開的語系才列 */
const enabledLocaleRows = () => LOCALES.filter((l) => isEnabled(l.code));

export function localeCoverage(post: LocalePost): LocaleCoverage[] {
  const source = post.source_language ?? defaultLocale();
  return enabledLocaleRows().map(({ code, field }) => {
    const text = code === source ? post.title : post[field];
    return { code, label: shortName(code), has: Boolean(text?.trim()) };
  });
}

/** 分類、標籤這種「名稱＋各語系譯名」的資料：原名是預設語系，其他語系看各自的 name_* 欄 */
export interface LocaleNamed {
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_ko: string | null;
  name_zh_cn: string | null;
  name_zh_tw: string | null;
}

export function nameCoverage(row: LocaleNamed): LocaleCoverage[] {
  const value: Record<string, string | null> = {
    'zh-TW': row.name_zh_tw,
    en: row.name_en,
    'zh-CN': row.name_zh_cn,
    ja: row.name_ja,
    ko: row.name_ko,
    [defaultLocale()]: row.name,
  };
  return enabledLocaleRows().map(({ code }) => ({ code, label: shortName(code), has: Boolean(value[code]?.trim()) }));
}

/**
 * 表單裡的譯名欄（新增語系時只要改這裡，表單自動長出欄位）。
 * 欄位名稱是那個語言自己的寫法，不跟著後台語言翻：填日文譯名的人看「日本語」最直覺
 */
const LOCALE_NAME_FIELDS = [
  { code: 'zh-TW', key: 'name_zh_tw', label: '繁體中文' }, // i18n-ignore
  { code: 'en', key: 'name_en', label: 'English' },
  { code: 'ja', key: 'name_ja', label: '日本語' }, // i18n-ignore
  { code: 'ko', key: 'name_ko', label: '한국어' }, // i18n-ignore
  { code: 'zh-CN', key: 'name_zh_cn', label: '简体中文' }, // i18n-ignore
] as const;

/** 要填的譯名欄：站上有開的語系，扣掉預設語系（原名就是它） */
export const localeNameFields = () => LOCALE_NAME_FIELDS.filter((f) => f.code !== defaultLocale() && isEnabled(f.code));

/**
 * 要人去翻的譯文：站上有開、還沒有的。简中不算——它是由繁中轉出來的（編輯器的「從繁中產生」），
 * 缺了也不需要人動手寫。
 */
export const missingTranslations = (post: LocalePost) =>
  localeCoverage(post).filter((l) => !l.has && l.code !== 'zh-CN');
