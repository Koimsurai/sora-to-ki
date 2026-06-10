import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 只有預設語系（zh-TW）打進主 bundle（首屏零閃爍）；
// 其餘 4 個語系改成切換時動態載入（各 ~13KB，省下主 chunk ~50KB）。
import zhTW from './locales/zh-TW/common.json';

const LOCALE_LOADERS = {
  'zh-CN': () => import('./locales/zh-CN/common.json'),
  en: () => import('./locales/en/common.json'),
  ja: () => import('./locales/ja/common.json'),
  ko: () => import('./locales/ko/common.json'),
};

/** 確保某語系的 bundle 已載入（zh-TW 內建；已載入則 no-op）。 */
async function ensureLocale(lng) {
  if (!lng || lng === 'zh-TW' || i18n.hasResourceBundle(lng, 'common')) return;
  const loader = LOCALE_LOADERS[lng];
  if (!loader) return;
  try {
    const mod = await loader();
    i18n.addResourceBundle(lng, 'common', mod.default, true, true);
  } catch {
    /* 載入失敗 → fallbackLng(zh-TW) 撐住 */
  }
}

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
    },
    fallbackLng: 'zh-TW',
    supportedLngs: SUPPORTED_LOCALES,
    load: 'currentOnly', // 別自動載 'zh' / 'en' base，我們用顯式 normalize
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React 自己防 XSS
    react: {
      // bundle 動態載入完成（addResourceBundle）時也觸發 re-render，
      // 處理「初次進站偵測到非 zh-TW」的非同步補載
      bindI18nStore: 'added',
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'koim_locale',
      caches: ['localStorage'],
      convertDetectedLanguage: normalizeLocale,
    },
  });

// 手動切語系：先載 bundle 再切，切換瞬間不會閃 fallback
const origChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (lng, ...args) => {
  await ensureLocale(lng);
  return origChangeLanguage(lng, ...args);
};

// 初次進站：偵測到的語系若非 zh-TW，立刻補載（bindI18nStore: 'added' 會讓畫面跟著更新）
ensureLocale(i18n.resolvedLanguage || i18n.language);

export default i18n;
