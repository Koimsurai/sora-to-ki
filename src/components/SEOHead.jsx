import React from 'react';
import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://koimsurai.com';

/**
 * SEO Head 元件 — 為每個路由頁面設定獨立的 title / description / OG tags
 * @param {string} title - 頁面標題
 * @param {string} description - 頁面描述
 * @param {string} path - 路由路徑 e.g. '/blog'
 * @param {string} [image] - OG 圖片 URL
 * @param {string} [type] - og:type，預設 'website'
 * @param {object} [article] - 文章結構化資料 { author, datePublished, dateModified, tags }
 */
const SEOHead = ({
  title,
  description,
  path = '/',
  image = '/logo.svg',
  type = 'website',
  article = null,
}) => {
  const fullTitle = title
    ? `${title} | Koimsurai`
    : 'Koimsurai — 楊泰和 | 全端工程師 · AI 系統開發';
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
      name: article.author || 'Koimsurai',
      url: BASE_URL,
    },
    publisher: {
      '@type': 'Person',
      name: 'Koimsurai',
      url: BASE_URL,
    },
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    ...(article.tags?.length > 0 && { keywords: article.tags.join(', ') }),
    mainEntityOfPage: { '@type': 'WebPage', '@id': fullUrl },
  } : null;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:site_name" content="Koimsurai" />
      <meta property="og:locale" content="zh_TW" />

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
          <meta property="article:author" content={article.author || 'Koimsurai'} />
          {article.tags?.map((tag, i) => (
            <meta key={i} property="article:tag" content={tag} />
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
