import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhTW from './locales/zh-TW/common.json';
import zhCN from './locales/zh-CN/common.json';
import en from './locales/en/common.json';
import ja from './locales/ja/common.json';
import ko from './locales/ko/common.json';

/* ──────────────────────────────────────────────────────────────
   全站 UI i18n
   - 預設繁中（zh-TW）
   - 偵測順序：localStorage('koim_locale') → navigator.language → fallback zh-TW
   - 切語系時：i18n.changeLanguage() → useEffect 同步 <html lang>
     CSS :lang() 規則隨之套用對應 CJK 字體
─────────────────────────────────────────────────────────────── */
export const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];

export const LOCALE_LABELS = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
};

// 把 detector 拿到的字串對應到我們支援的 5 個 locale。
// 例如 'zh-HK' / 'zh-Hant' → 'zh-TW'；'en-US' → 'en'；'ja-JP' → 'ja'。
// 不用 i18next 的 nonExplicitSupportedLngs（會把 'zh-TW' 倒過來砍成 'zh' 害 resource 找不到）。
function normalizeLocale(detected) {
  if (!detected) return 'zh-TW';
  const s = String(detected);
  // 完全 match
  if (SUPPORTED_LOCALES.includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.startsWith('zh')) {
    if (lower.includes('hant') || lower.includes('tw') || lower.includes('hk') || lower.includes('mo')) return 'zh-TW';
    if (lower.includes('hans') || lower.includes('cn') || lower.includes('sg')) return 'zh-CN';
    return 'zh-TW'; // 純 'zh' → 預設繁中
  }
  if (lower.startsWith('en')) return 'en';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('ko')) return 'ko';
  return 'zh-TW';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-TW': { common: zhTW },
      'zh-CN': { common: zhCN },
      en: { common: en },
      ja: { common: ja },
      ko: { common: ko },
    },
    fallbackLng: 'zh-TW',
    supportedLngs: SUPPORTED_LOCALES,
    load: 'currentOnly', // 別自動載 'zh' / 'en' base，我們用顯式 normalize
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React 自己防 XSS
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'koim_locale',
      caches: ['localStorage'],
      convertDetectedLanguage: normalizeLocale,
    },
  });

export default i18n;
