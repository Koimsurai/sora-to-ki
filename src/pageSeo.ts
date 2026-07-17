import { createI18n, type Locale } from './start-i18n';
import { pageMeta } from './seoMeta';

// 各頁的 SEO 標題／描述，以 localePage 的 basePath 為 key 集中管理。
//
// 為什麼要有這張表：這些頁的 title/description 原本只寫在元件裡的 <SEOHead>，而 SEOHead 走
// react-helmet-async —— hydrate 後才掛標籤，爬蟲不執行 JS 就看不到。結果是 SSR HTML 裡
// **每一頁的 <title> 都是同一個 "宙と木 · Koimsurai"、且完全沒有 meta description**，
// Google 無從分辨頁面、也沒有描述文字可讀。head() 是唯一會進 SSR 的地方，但它不能用 React
// hook（取不到 useTranslation），所以改由這張表 + createI18n(locale).t() 在 head() 內同步取值。
//
// key 用 basePath（localePage/localePagePrefixed 都已經帶著它）→ 20 幾個路由檔一行都不用改。

interface SeoEntry {
  /** i18n key（優先）；沒有對應翻譯的頁面才用 title/description 寫死 */
  titleKey?: string;
  descKey?: string;
  title?: string;
  description?: string;
}

export const PAGE_SEO: Record<string, SeoEntry> = {
  // 有 i18n 翻譯的
  blog: { titleKey: 'blog.metaTitle', descKey: 'blog.description' },
  music: { titleKey: 'music.title', descKey: 'music.description' },
  bookshelf: { titleKey: 'bookshelf.title', descKey: 'bookshelf.description' },
  activity: { titleKey: 'activity.title', descKey: 'activity.description' },
  setup: { titleKey: 'setup.title', descKey: 'setup.description' },
  thinking: { titleKey: 'thinking.title', descKey: 'thinking.subtitle' },
  watch: { titleKey: 'watch.title', descKey: 'watch.metaDescription' },
  'watch/library': { titleKey: 'watch.library.title', descKey: 'watch.library.subtitle' },

  // 沿用元件內原本寫死的字串（i18n 沒有對應 key）。維持現況＝這幾頁的標題在各語系都是中文；
  // 要正確在地化得先補 locales/*/common.json 的 key，屬另一件事。
  anime: { title: '動漫', description: 'Koimsurai 的動漫推薦清單與觀後感。' },
  cinema: { title: '電影', description: 'Koimsurai 的電影推薦與評論回顧。' },
  photos: { title: '攝影作品集', description: 'Koimsurai 的攝影作品集，記錄旅途中的光影故事。' },
  portfolio: { title: '作品', description: '做過的、正在做的——專題、工具與自架服務。' },
  about: { title: '關於我', description: 'Koimsurai — 一個工程師的閱讀筆記、作品紀錄與系統實驗。' },
};

// createI18n 每次呼叫都會建新實例；head() 每次 render 都會跑，所以以 locale 快取。
// 實例是唯讀用途（只 t()，不 changeLanguage），跨請求共用安全。
const cache = new Map<string, ReturnType<typeof createI18n>>();
function i18nFor(locale: Locale) {
  let inst = cache.get(locale);
  if (!inst) {
    inst = createI18n(locale);
    cache.set(locale, inst);
  }
  return inst;
}

/** 依 basePath 產出該頁的 SSR meta；沒登記的頁回 undefined（維持現有行為，不強加預設）。 */
export function seoMetaFor(basePath: string, locale: Locale, canonicalPath: string) {
  const entry = PAGE_SEO[basePath];
  if (!entry) return undefined;
  const t = i18nFor(locale).t;
  const title = entry.titleKey ? t(entry.titleKey) : (entry.title ?? null);
  const description = entry.descKey ? t(entry.descKey) : (entry.description ?? '');
  return pageMeta(title, description, canonicalPath, locale);
}
