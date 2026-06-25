import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://koimsurai.com';

const LOCALE_TO_OG: Record<string, string> = {
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
  'en': 'en_US',
  'ja': 'ja_JP',
};
const LOCALE_TO_HREFLANG: Record<string, string> = {
  'zh-TW': 'zh-Hant',
  'zh-CN': 'zh-Hans',
  'en': 'en',
  'ja': 'ja',
};

interface ArticleMeta {
  author?: string;
  datePublished?: string;
  dateModified?: string;
  tags?: string[];
}

interface Alternate {
  locale: string;
  path: string;
}

interface SEOHeadProps {
  title?: string | null;
  description?: string;
  path?: string;
  image?: string;
  type?: string;
  article?: ArticleMeta | null;
  /** 當前頁面的 locale（zh-TW/zh-CN/en/ja），控制 <html lang> 與 og:locale */
  locale?: string;
  /** 其他語言的對應 URL，用於產生 hreflang */
  alternates?: Alternate[] | null;
  /** x-default 的路徑（通常是原文） */
  xDefaultPath?: string | null;
}

/**
 * SEO Head 元件 — 為每個路由頁面設定獨立的 title / description / OG tags
 */
const SEOHead = ({
  title,
  description,
  path = '/',
  image = '/og-default-v2.png',
  type = 'website',
  article = null,
  locale,
  alternates = null,
  xDefaultPath = null,
}: SEOHeadProps) => {
  const fullTitle = title
    ? `${title} - 宙と木`
    : '宙と木 · Koimsurai';
  const fullUrl = `${BASE_URL}${path}`;
  const fullImage = image.startsWith('http') ? image : `${BASE_URL}${image}`;

  // JSON-LD 結構化資料
  const jsonLd = article ? {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: description,
    url: fullUrl,
    image: fullImage,
    author: {
      '@type': 'Person',
      name: article.author ?? 'Koimsurai',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Person',
      name: 'Koimsurai',
      url: BASE_URL,
    },
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    ...((article.tags?.length ?? 0) > 0 && { keywords: article.tags?.join(', ') }),
    mainEntityOfPage: { '@type': 'WebPage', '@id': fullUrl },
  } : null;

  const htmlLang = locale ? LOCALE_TO_HREFLANG[locale] ?? locale : 'zh-Hant';
  const ogLocale = locale ? LOCALE_TO_OG[locale] ?? 'zh_TW' : 'zh_TW';

  return (
    <Helmet>
      <html lang={htmlLang} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />

      {/* hreflang alternates */}
      {alternates?.map(a => (
        <link
          key={a.locale}
          rel="alternate"
          hrefLang={LOCALE_TO_HREFLANG[a.locale] ?? a.locale}
          href={`${BASE_URL}${a.path}`}
        />
      ))}
      {xDefaultPath && (
        <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}${xDefaultPath}`} />
      )}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Koimsurai" />
      <meta property="og:locale" content={ogLocale} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* Article meta */}
      {article && (
        <>
          <meta property="article:published_time" content={article.datePublished} />
          {article.dateModified && <meta property="article:modified_time" content={article.dateModified} />}
          <meta property="article:author" content={article.author ?? 'Koimsurai'} />
          {article.tags?.map((tag) => (
            <meta key={tag} property="article:tag" content={tag} />
          ))}
        </>
      )}

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;
