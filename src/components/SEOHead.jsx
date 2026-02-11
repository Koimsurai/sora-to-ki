import React from 'react';
import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://koimsurai.blogsyte.com';

/**
 * SEO Head 元件 — 為每個路由頁面設定獨立的 title / description / OG tags
 * @param {string} title - 頁面標題
 * @param {string} description - 頁面描述
 * @param {string} path - 路由路徑 e.g. '/blog'
 * @param {string} [image] - OG 圖片 URL
 * @param {string} [type] - og:type，預設 'website'
 */
const SEOHead = ({
  title,
  description,
  path = '/',
  image = '/logo.svg',
  type = 'website',
}) => {
  const fullTitle = title
    ? `${title} | Koimsurai`
    : 'Koimsurai — 楊泰和 | 全端工程師 · AI 系統開發';
  const fullUrl = `${BASE_URL}${path}`;
  const fullImage = image.startsWith('http') ? image : `${BASE_URL}${image}`;

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

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />
    </Helmet>
  );
};

export default SEOHead;
