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
    nonExplicitSupportedLngs: true, // 'zh' / 'en-US' 等也能匹配到 'zh-TW' / 'en'
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React 自己防 XSS
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'koim_locale',
      caches: ['localStorage'],
    },
  });

export default i18n;
