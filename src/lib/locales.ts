// 語系：站上支援哪幾個、預設是哪個、網址前綴怎麼組。
//
// 為什麼獨立成一支：Nitro 的 server route（server/routes/sitemap.xml.ts）也需要這組對應表，
// 但 start-i18n.tsx 在 top-level import 了 React、i18next 與五份語系 JSON——server route 只是
// 要組幾個網址，不該為此把整個 i18n runtime 拉進 bundle。
//
// 預設語系與有開的語系是站台設定（後端 /api/site/config 的 default_locale、locales）：
// router.tsx 盯著那個查詢的快取，一有資料就寫進來（伺服器與瀏覽器各一份），sitemap 這類 server route
// 自己從後端讀。寫進來之前是繁中、全開——原站一直以來的樣子。

export const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** 不是預設語系時的網址前綴（一律小寫）。預設語系不帶前綴，它的前綴當作不存在（404） */
const PREFIX: Record<Locale, string> = {
  'zh-TW': 'zh-tw',
  'zh-CN': 'zh-cn',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
};

let current: { default: Locale; enabled: readonly Locale[] } = { default: 'zh-TW', enabled: SUPPORTED_LOCALES };

export const isLocale = (l: string): l is Locale => (SUPPORTED_LOCALES as readonly string[]).includes(l);

/** 站台設定寫進來：認不得的略過；有開的照 SUPPORTED_LOCALES 排，一定含預設語系 */
export function setLocaleConfig(defaultLocale: string | undefined, enabled: readonly string[] | undefined): void {
  const d = defaultLocale && isLocale(defaultLocale) ? defaultLocale : 'zh-TW';
  const on = enabled && enabled.length > 0 ? enabled : SUPPORTED_LOCALES;
  current = { default: d, enabled: SUPPORTED_LOCALES.filter((l) => l === d || on.includes(l)) };
}

/** 預設語系：不帶前綴的網址、文章的原文、沒翻譯時退回的語言 */
export const defaultLocale = (): Locale => current.default;
/** 有開的語系（語系選單的順序） */
export const enabledLocales = (): readonly Locale[] => current.enabled;
export const isEnabled = (l: Locale): boolean => current.enabled.includes(l);

/** 某個語系的網址前綴；預設語系是空字串 */
export const prefixOf = (locale: Locale): string => (locale === current.default ? '' : PREFIX[locale]);

/** 網址前綴 → 語系；認不得、是預設語系自己的前綴、或那個語系沒開，都是 null（讓路由 404） */
export function localeOfPrefix(prefix: string): Locale | null {
  const l = SUPPORTED_LOCALES.find((x) => PREFIX[x] === prefix.toLowerCase());
  return l && l !== current.default && isEnabled(l) ? l : null;
}

/** 某 locale 下、某邏輯路徑(無前綴,如 '' 或 'blog/39')的絕對路徑(開頭有 /)。 */
export function localePathname(locale: Locale, basePath = ''): string {
  const segs = [prefixOf(locale), basePath.replace(/^\/+/, '')].filter(Boolean).join('/');
  return segs ? `/${segs}` : '/';
}
