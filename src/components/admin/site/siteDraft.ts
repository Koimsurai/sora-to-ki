import type { SiteConfig } from '@koimsurai/api-types';
import { ABOUT_SECTIONS, MAIN_SECTIONS, MORE_SECTIONS } from '@/data/siteSections';

// 站台設定的草稿：初次設定的精靈（admin/init）與後台的站台設定頁（SiteSettings）共用。
// 欄位就是 PUT /api/admin/site/config 收的那幾個，存的時候整份送出去。

export interface Draft {
  default_locale: string;
  locales: string[];
  name: string;
  author: string;
  description: string;
  email: string;
  github: string;
  disabled_pages: string[];
  /** 介紹文字：哪一頁 → 語系 → 字（站台設定頁的「介紹文字」那段） */
  page_descriptions: Record<string, Record<string, string>>;
}

/** 介紹文字的格子，照前台的位置排：首頁、「關於」選單開頭那一句、各頁 */
export const DESCRIBABLE = [
  'home',
  'aboutLead',
  'notes',
  'moments',
  'works',
  'collection',
  'about',
  'setup',
  'log',
  'messages',
  'photos',
  'friends',
  'colophon',
] as const;

/** 頁面開關分三組，照它們在前台出現的位置：首頁的軌道、「關於」選單、「更多」選單 */
export const TOGGLE_GROUPS = [
  { key: 'groupOrbit', items: MAIN_SECTIONS.filter((s) => s.toggleable) },
  { key: 'groupAbout', items: ABOUT_SECTIONS.filter((s) => s.toggleable) },
  { key: 'groupMore', items: MORE_SECTIONS.filter((s) => s.toggleable) },
] as const;

/** 現在的站台設定 → 草稿。作者跟站名一樣代表沒另外設（後端回應會把空的作者填成站名） */
export function draftOf(config: SiteConfig, defaultLocale = config.default_locale): Draft {
  return {
    default_locale: defaultLocale,
    locales: Array.from(new Set([defaultLocale, ...config.locales])),
    name: config.name,
    author: config.author === config.name ? '' : config.author,
    description: config.description,
    email: config.email,
    github: config.github,
    disabled_pages: config.disabled_pages,
    page_descriptions: config.page_descriptions,
  };
}

/** 站台設定的欄位上限，跟後端 handlers/site_config.rs 一致 */
const LIMITS = { name: 60, description: 300, email: 120, github: 39 } as const;

export type SiteProblem =
  | { field: 'name'; key: 'nameRequired' | 'nameTooLong'; max?: number }
  | { field: 'author'; key: 'authorTooLong'; max: number }
  | { field: 'description'; key: 'descriptionTooLong'; max: number }
  | { field: 'email'; key: 'email' }
  | { field: 'github'; key: 'github' };

/** 站台身分擋得住的錯，規則照後端的 `apply`（那邊一樣會擋，這裡只是早一點說） */
export function siteProblems(d: Draft): SiteProblem[] {
  const out: SiteProblem[] = [];
  const len = (s: string) => Array.from(s.trim()).length;
  if (!d.name.trim()) out.push({ field: 'name', key: 'nameRequired' });
  else if (len(d.name) > LIMITS.name) out.push({ field: 'name', key: 'nameTooLong', max: LIMITS.name });
  if (len(d.author) > LIMITS.name) out.push({ field: 'author', key: 'authorTooLong', max: LIMITS.name });
  if (len(d.description) > LIMITS.description)
    out.push({ field: 'description', key: 'descriptionTooLong', max: LIMITS.description });
  const email = d.email.trim();
  if (email && (!email.includes('@') || len(email) > LIMITS.email)) out.push({ field: 'email', key: 'email' });
  const github = d.github
    .trim()
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
  if (github && (!/^[A-Za-z0-9-]+$/.test(github) || github.length > LIMITS.github))
    out.push({ field: 'github', key: 'github' });
  return out;
}
