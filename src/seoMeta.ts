import type { PostData } from './pages/BlogPostPage';

// 文章頁的完整 SEO meta，放在路由 head() —— 那是唯一會進 SSR HTML 的地方。
//
// 為什麼不用元件裡的 <SEOHead>：SEOHead 走 react-helmet-async，只在 client hydrate 後才把標籤掛上，
// 而 Facebook / Twitter / LINE / Discord 的爬蟲不執行 JS，看到的永遠是 SSR HTML。
// 實測（含遷移前的正式站 serve.mjs 版本）SSR HTML 裡 og:* / twitter:* 全部缺席 → 社群分享預覽一直是壞的。
// 文章頁更特殊：SSR 走的是 <ClientOnly> 的 fallback `BlogPostPage`，它根本沒掛 SEOHead，
// 真正有 SEOHead 的 `BlogPost` 是 client-only 元件。
//
// 其餘 21 個用 SEOHead 的頁面有同樣問題（og 進不了 SSR），屬既有缺陷，未在此次一併處理。

const BASE_URL = 'https://koimsurai.com';
const SITE_NAME = '宙と木 · Koimsurai';

// 對齊 SEOHead 的既有對應表
const LOCALE_TO_OG: Record<string, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
};

interface MetaTag {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}

// 後端存的是 SQLite `datetime('now')` → UTC、格式 'YYYY-MM-DD HH:MM:SS'，不是 ISO 8601。
// og 的 article:published_time / modified_time 規格要 ISO 8601，直接塞原字串爬蟲會解析失敗。
const toIso = (s?: string): string | undefined => {
  if (!s) return undefined;
  if (s.includes('T')) return s; // 已是 ISO 就不動
  return `${s.replace(' ', 'T')}Z`;
};

/** 一般頁面（非文章）head() 用的 meta。canonicalPath 例:/music、/en/music */
export function pageMeta(
  title: string | null,
  description: string,
  canonicalPath: string,
  locale: string,
): MetaTag[] {
  const url = `${BASE_URL}${canonicalPath}`;
  const image = `${BASE_URL}/og-default-v2.png`;
  // 對齊 SEOHead 既有的標題格式
  const fullTitle = title ? `${title} - 宙と木` : SITE_NAME;

  return [
    { title: fullTitle },
    { name: 'description', content: description },

    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:locale', content: LOCALE_TO_OG[locale] ?? 'zh_TW' },

    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:url', content: url },
  ];
}

/** 文章頁 head() 用的 meta。canonicalPath 例:/blog/39、/en/blog/39 */
export function articleMeta(post: PostData, canonicalPath: string, locale: string): MetaTag[] {
  const description = post.excerpt ?? '';
  const url = `${BASE_URL}${canonicalPath}`;
  // OG 圖由後端 resvg 生成（CJK 已驗）。舊的前端 /og-image/:id（sharp）隨 serve.mjs 一起退役。
  const image = `${BASE_URL}/api/og/${post.id}.png`;

  return [
    { title: `${post.title} - 宙と木` },
    { name: 'description', content: description },

    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: post.title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:locale', content: LOCALE_TO_OG[locale] ?? 'zh_TW' },

    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: post.title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:url', content: url },

    ...(toIso(post.created_at) ? [{ property: 'article:published_time', content: toIso(post.created_at)! }] : []),
    ...(toIso(post.updated_at) ? [{ property: 'article:modified_time', content: toIso(post.updated_at)! }] : []),
    ...(post.author ? [{ property: 'article:author', content: post.author }] : []),
  ];
}
