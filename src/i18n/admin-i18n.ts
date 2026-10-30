import { createInstance } from 'i18next';
import { useTranslation } from 'react-i18next';

import { isLocale, SUPPORTED_LOCALES, type Locale } from '@/lib/locales';
import { pickSupported } from './start-i18n';

// 後台的介面語言。跟前台分開：前台的語系跟著網址走（讀者看的是哪一版），後台跟著站長自己——
// 英文站的站長可能是日本人。所以是另一個 i18next instance、另一組字串檔，只有進後台才載入，
// 前台的 bundle 裡沒有它。
//
// 字串檔一區一支：locales/<語系>/admin/<區>.json，檔名就是 key 的第一段（layout.json 裡的
// logout 是 `layout.logout`）。拆開是為了每一頁各改各的，不會全擠在同一支大檔裡。
//
// 語言：站長在側欄選過就用那個（存在這個瀏覽器），沒選過看瀏覽器的語言，再不行用站台的預設語系。
// 字串以繁中為原稿；每一區的 key 五個語言一樣多（adminI18n.test.ts 會擋），退回繁中只是保險。

const STORAGE_KEY = 'koimsurai_admin_lang';

type Messages = Record<string, unknown>;
const FILES = import.meta.glob<Messages>('../locales/*/admin/*.json', { import: 'default' });

async function loadMessages(locale: Locale): Promise<Messages> {
  const prefix = `../locales/${locale}/admin/`;
  const entries = await Promise.all(
    Object.entries(FILES)
      .filter(([path]) => path.startsWith(prefix))
      .map(async ([path, load]) => [path.slice(prefix.length, -'.json'.length), await load()] as const),
  );
  return Object.fromEntries(entries);
}

const adminI18n = createInstance();
void adminI18n.init({
  resources: {},
  lng: 'zh-TW',
  fallbackLng: 'zh-TW',
  supportedLngs: [...SUPPORTED_LOCALES],
  ns: ['admin'],
  defaultNS: 'admin',
  interpolation: { escapeValue: false }, // React 自己防 XSS
});

async function ensureLoaded(locale: Locale) {
  if (adminI18n.hasResourceBundle(locale, 'admin')) return;
  adminI18n.addResourceBundle(locale, 'admin', await loadMessages(locale));
}

function storedLang(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && isLocale(v) ? v : null;
  } catch {
    return null; // 隱私模式或封鎖儲存
  }
}

/** 這個瀏覽器的後台該用哪個語言 */
function initialAdminLang(): Locale {
  return storedLang() ?? pickSupported(navigator.languages.join(','));
}

/** 進後台之前載好字串（路由的 lazy 載入一起等，畫出來的第一格就是對的語言） */
export async function loadAdminI18n(): Promise<void> {
  const lang = initialAdminLang();
  await Promise.all([ensureLoaded('zh-TW'), ensureLoaded(lang)]);
  await adminI18n.changeLanguage(lang);
}

/** 側欄的語言切換：載好、換掉、記住 */
export async function setAdminLang(lang: Locale): Promise<void> {
  await ensureLoaded(lang);
  await adminI18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 記不住就只是這次有效
  }
}

/** 字串載好了沒（載好之前 t() 只會吐出 key） */
export const adminReady = () => adminI18n.hasResourceBundle(adminLang(), 'admin');

/** 現在的後台語言（日期、數字的格式也跟著它） */
export const adminLang = (): Locale => {
  const l = adminI18n.language;
  return isLocale(l) ? l : 'zh-TW';
};

/** 元件外（toast、格式化函式）用的翻譯 */
export const at: typeof adminI18n.t = adminI18n.t.bind(adminI18n);

/** 後台元件用這個，不要直接 useTranslation：那會拿到前台的 instance */
export function useAdminT() {
  return useTranslation('admin', { i18n: adminI18n });
}
