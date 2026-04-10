/**
 * serve.cjs — 輕量 Express 伺服器取代 `serve -s dist`
 *
 * 功能：
 * 1. 靜態檔案服務 (dist/)
 * 2. 爬蟲/社交 bot 偵測 → 動態注入 OG meta tags
 * 3. 動態 sitemap.xml（含所有已發佈文章）
 * 4. SPA fallback (所有路由最終回傳 index.html)
 */
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const http = require('http');
let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const app = express();
app.use(compression());
const PORT = parseInt(process.env.PORT || '13579', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';
const SITE_URL = process.env.SITE_URL || 'https://koimsurai.com';

const DIST_DIR = path.join(__dirname, 'dist');
const INDEX_HTML_PATH = path.join(DIST_DIR, 'index.html');

// 讀取 index.html 模板
let indexHtml = '';
try {
  indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
} catch (e) {
  console.error('[SERVE] Failed to read index.html:', e.message);
  process.exit(1);
}

/* ── Bot / Crawler detection ── */
const BOT_AGENTS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'sogou', 'facebookexternalhit', 'facebot',
  'twitterbot', 'rogerbot', 'linkedinbot', 'embedly', 'quora link preview',
  'showyoubot', 'outbrain', 'pinterestbot', 'slackbot',
  'vkshare', 'w3c_validator', 'whatsapp', 'redditbot',
  'applebot', 'flipboard', 'tumblr', 'bitlybot', 'skypeuripreview',
  'nuzzel', 'discordbot', 'google-structured-data-testing-tool',
  'telegrambot', 'google-inspectiontool', 'petalbot',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some((bot) => ua.includes(bot));
}

/* ── Internal API fetch helper ── */
function fetchFromBackend(apiPath) {
  return new Promise((resolve, reject) => {
    const url = `${BACKEND_URL}${apiPath}`;
    const client = url.startsWith('https') ? require('https') : http;
    client.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON from backend'));
        }
      });
    }).on('error', reject);
  });
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ── Generate meta tag injected HTML ── */
function injectMeta(html, meta) {
  const {
    title = 'Koimsurai — 楊泰和 | 全端工程師 · AI 系統開發',
    description = '全端工程師楊泰和的個人品牌網站。展示作品集、技術筆記、攝影作品與個人配備。',
    url = SITE_URL,
    image = `${SITE_URL}/og-default.png`,
    type = 'website',
    article = null,
  } = meta;

  const fullTitle = escHtml(title);
  const fullDesc = escHtml(description);
  const fullUrl = escHtml(url);
  const fullImage = escHtml(image.startsWith('http') ? image : `${SITE_URL}${image}`);

  // 建構要注入的 meta tags
  let metaTags = `
    <title>${fullTitle}</title>
    <meta name="description" content="${fullDesc}" />
    <link rel="canonical" href="${fullUrl}" />
    <meta property="og:type" content="${escHtml(type)}" />
    <meta property="og:url" content="${fullUrl}" />
    <meta property="og:title" content="${fullTitle}" />
    <meta property="og:description" content="${fullDesc}" />
    <meta property="og:image" content="${fullImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Koimsurai" />
    <meta property="og:locale" content="zh_TW" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${fullUrl}" />
    <meta name="twitter:title" content="${fullTitle}" />
    <meta name="twitter:description" content="${fullDesc}" />
    <meta name="twitter:image" content="${fullImage}" />`;

  if (article) {
    metaTags += `
    <meta property="article:published_time" content="${escHtml(article.datePublished)}" />`;
    if (article.dateModified) {
      metaTags += `
    <meta property="article:modified_time" content="${escHtml(article.dateModified)}" />`;
    }
    metaTags += `
    <meta property="article:author" content="${escHtml(article.author || 'Koimsurai')}" />`;
    if (article.tags?.length) {
      article.tags.forEach((tag) => {
        metaTags += `
    <meta property="article:tag" content="${escHtml(tag)}" />`;
      });
    }

    // JSON-LD
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      description: description,
      url: url,
      image: image.startsWith('http') ? image : `${SITE_URL}${image}`,
      author: { '@type': 'Person', name: article.author || 'Koimsurai', url: SITE_URL },
      publisher: { '@type': 'Person', name: 'Koimsurai', url: SITE_URL },
      datePublished: article.datePublished,
      dateModified: article.dateModified || article.datePublished,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    };
    if (article.tags?.length) jsonLd.keywords = article.tags.join(', ');
    metaTags += `
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  }

  // 替換掉 index.html 的 <head> 內既有 meta
  // 策略: 移除原有的 title / meta description / og / twitter tags，然後在 </head> 前注入新的
  let result = html;

  // 移除原有的重複 tags
  result = result
    .replace(/<title>[^<]*<\/title>/g, '')
    .replace(/<meta\s+name="title"[^>]*>/g, '')
    .replace(/<meta\s+name="description"[^>]*>/g, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/g, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>/g, '')
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

  // 注入新的 meta tags
  result = result.replace('</head>', `${metaTags}\n  </head>`);

  return result;
}

/* ── Dynamic OG Image endpoint ── */
app.get('/og-image/:id', async (req, res) => {
  try {
    const post = await fetchFromBackend(`/api/posts/${req.params.id}`);
    if (!post || post.message !== 'success') {
      return res.redirect('/og-default.png');
    }

    const title = post.title || '';
    const author = post.author || 'Koimsurai';
    const category = post.category || '';
    const date = post.created_at
      ? new Date(post.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const tags = Array.isArray(post.tags)
      ? post.tags.slice(0, 3).map(t => typeof t === 'string' ? t : t.name).join(' · ')
      : '';

    // 將標題分行（每行最多 16 個字元）
    const maxCharsPerLine = 16;
    const titleLines = [];
    let remaining = title;
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        titleLines.push(remaining);
        break;
      }
      titleLines.push(remaining.substring(0, maxCharsPerLine));
      remaining = remaining.substring(maxCharsPerLine);
      if (titleLines.length >= 3) {
        if (remaining) titleLines[2] = titleLines[2].substring(0, maxCharsPerLine - 1) + '…';
        break;
      }
    }

    const titleSvg = titleLines
      .map((line, i) => `<text x="80" y="${210 + i * 64}" font-size="48" font-weight="700" fill="#fff" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">${escXml(line)}</text>`)
      .join('\n      ');

    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a1a"/>
      <stop offset="50%" stop-color="#12122a"/>
      <stop offset="100%" stop-color="#1a0a2e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7f5af0"/>
      <stop offset="100%" stop-color="#2cb67d"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Decorative elements -->
  <circle cx="1050" cy="120" r="200" fill="#7f5af0" opacity="0.06"/>
  <circle cx="150" cy="500" r="150" fill="#2cb67d" opacity="0.05"/>
  <rect x="0" y="0" width="6" height="630" fill="url(#accent)"/>
  
  <!-- Subtle grid pattern -->
  <line x1="80" y1="160" x2="1120" y2="160" stroke="rgba(127,90,240,0.12)" stroke-width="1"/>
  <line x1="80" y1="450" x2="1120" y2="450" stroke="rgba(127,90,240,0.12)" stroke-width="1"/>
  
  <!-- Category badge -->
  ${category ? `<rect x="80" y="80" width="${category.length * 22 + 32}" height="36" rx="18" fill="rgba(127,90,240,0.2)" stroke="#7f5af0" stroke-width="1" opacity="0.8"/>
  <text x="${80 + (category.length * 22 + 32) / 2}" y="104" font-size="16" fill="#a78bfa" text-anchor="middle" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">${escXml(category)}</text>` : ''}
  
  <!-- Title -->
  ${titleSvg}
  
  <!-- Meta info -->
  <text x="80" y="480" font-size="20" fill="rgba(255,255,255,0.5)" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">✦ ${escXml(author)}${date ? `  ·  ${escXml(date)}` : ''}</text>
  ${tags ? `<text x="80" y="515" font-size="16" fill="rgba(127,90,240,0.6)" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">${escXml(tags)}</text>` : ''}
  
  <!-- Brand -->
  <text x="80" y="585" font-size="22" font-weight="600" fill="url(#accent)" filter="url(#glow)" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">Koimsurai</text>
  <text x="240" y="585" font-size="16" fill="rgba(255,255,255,0.3)" font-family="'Noto Sans SC','Noto Sans TC',system-ui,sans-serif">koimsurai.com</text>
</svg>`;

    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');

    // 如果有 sharp，轉成 PNG（社交平台不支援 SVG）
    if (sharp) {
      try {
        const pngBuffer = await sharp(Buffer.from(svg))
          .resize(1200, 630)
          .png({ quality: 90 })
          .toBuffer();
        res.set('Content-Type', 'image/png');
        return res.send(pngBuffer);
      } catch (sharpErr) {
        console.warn('[OG-IMAGE] Sharp conversion failed, falling back to SVG:', sharpErr.message);
      }
    }

    // Fallback: 直接送 SVG
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    console.error('[OG-IMAGE] Error:', err.message);
    res.redirect('/og-default.png');
  }
});

/* ── Dynamic Sitemap ── */
app.get('/sitemap.xml', async (req, res) => {
  try {
    const data = await fetchFromBackend('/api/posts?limit=500');
    const posts = Array.isArray(data) ? data : (data.posts || []);

    // 固定頁面
    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'weekly' },
      { loc: '/blog', priority: '0.9', changefreq: 'daily' },
      { loc: '/photos', priority: '0.7', changefreq: 'weekly' },
      { loc: '/bookshelf', priority: '0.6', changefreq: 'monthly' },
      { loc: '/music', priority: '0.5', changefreq: 'weekly' },
      { loc: '/now', priority: '0.7', changefreq: 'weekly' },
      { loc: '/setup', priority: '0.5', changefreq: 'monthly' },
      { loc: '/journey', priority: '0.6', changefreq: 'monthly' },
      { loc: '/activity', priority: '0.5', changefreq: 'daily' },
    ];

    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

    // 靜態頁面
    for (const page of staticPages) {
      xml += `  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>\n`;
    }

    // 動態文章頁面
    for (const post of posts) {
      const lastmod = (post.updated_at || post.created_at || '').split('T')[0] || today;
      xml += `  <url>
    <loc>${SITE_URL}/blog/${post.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }

    xml += '</urlset>\n';

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
    res.send(xml);
  } catch (err) {
    console.error('[SITEMAP] Error generating dynamic sitemap:', err.message);
    // Fallback 到靜態 sitemap
    const staticSitemap = path.join(DIST_DIR, 'sitemap.xml');
    if (fs.existsSync(staticSitemap)) {
      res.sendFile(staticSitemap);
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});

/* ── Dynamic robots.txt ── */
app.get('/robots.txt', (req, res) => {
  const robotsTxt = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/*
Disallow: /api/

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml

# Crawl-delay
Crawl-delay: 1
`;
  res.set('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

/* ── Static files (highest priority, excluding index.html for SPA fallback) ── */
app.use(express.static(DIST_DIR, {
  index: false, // 不自動送 index.html，我們要自己處理 SPA routing
  maxAge: '7d',
  immutable: true,
  setHeaders(res, filePath) {
    // HTML 檔案不快取
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    // JS/CSS 帶 hash 的可以長期快取
    if (/\.(js|css)$/.test(filePath) && /[\.\-][a-f0-9]{6,}\./.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

/* ── SPA fallback with bot-aware meta injection ── */
app.get('*', async (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const requestPath = req.path;

  // 文章頁面 — 為 bot 注入動態 meta tags
  const blogMatch = requestPath.match(/^\/blog\/(\d+|[a-zA-Z0-9_-]+)$/);
  if (blogMatch) {
    const postId = blogMatch[1];

    if (isBot(ua)) {
      try {
        const post = await fetchFromBackend(`/api/posts/${postId}`);
        if (post && post.message === 'success') {
          const description = post.excerpt
            || (post.content || '').replace(/<[^>]+>/g, '').replace(/[#*`>\-\n]/g, '').trim().substring(0, 160);
          const tags = Array.isArray(post.tags)
            ? post.tags.map((t) => (typeof t === 'string' ? t : t.name))
            : [];

          const html = injectMeta(indexHtml, {
            title: `${post.title} | Koimsurai`,
            description,
            url: `${SITE_URL}/blog/${postId}`,
            image: `/og-image/${postId}`,
            type: 'article',
            article: {
              author: post.author || 'Koimsurai',
              datePublished: post.created_at,
              dateModified: post.updated_at || post.created_at,
              tags,
            },
          });
          return res.send(html);
        }
      } catch (err) {
        console.error(`[SEO] Failed to fetch post ${postId}:`, err.message);
      }
    }
    // 即使對一般使用者，也注入基本 meta（瀏覽器分享時快取會用到）
    // 但不阻塞 — 直接送 index.html 讓 react-helmet 處理
  }

  // Blog 列表頁面
  if (requestPath === '/blog' && isBot(ua)) {
    const html = injectMeta(indexHtml, {
      title: '手記 · Notes | Koimsurai',
      description: '楊泰和的技術手記、學習筆記與生活隨筆。涵蓋前端架構、Rust、AI 系統開發等主題。',
      url: `${SITE_URL}/blog`,
      image: '/og-default.png',
    });
    return res.send(html);
  }

  // 其他已知頁面的 bot meta
  if (isBot(ua)) {
    const pageMeta = {
      '/': {
        title: 'Koimsurai — 楊泰和 | 全端工程師 · AI 系統開發',
        description: '全端工程師楊泰和的個人品牌網站。展示作品集、技術筆記、攝影作品與個人配備。',
      },
      '/photos': {
        title: '攝影作品集 | Koimsurai',
        description: '楊泰和的攝影作品集，記錄旅途中的光影故事。',
      },
      '/now': {
        title: '現在 | Koimsurai',
        description: '了解楊泰和目前正在進行的事情、專注的項目和最近的動態。',
      },
      '/setup': {
        title: '裝備清單 | Koimsurai',
        description: '楊泰和的開發環境、硬體設備與日常工具分享。',
      },
      '/journey': {
        title: '旅程 | Koimsurai',
        description: '楊泰和的職業成長與學習旅程時間線。',
      },
      '/bookshelf': {
        title: '書架 | Koimsurai',
        description: '楊泰和的閱讀書單與讀書筆記。',
      },
      '/music': {
        title: '音樂 | Koimsurai',
        description: '楊泰和的音樂品味與 Spotify 即時收聽紀錄。',
      },
      '/cinema': {
        title: '電影 | Koimsurai',
        description: '楊泰和的電影推薦與評論回顧。',
      },
      '/anime': {
        title: '動漫 | Koimsurai',
        description: '楊泰和的動漫推薦清單與觀後感。',
      },
      '/activity': {
        title: '動態儀表板 | Koimsurai',
        description: '楊泰和的即時活動儀表板。',
      },
    };

    const meta = pageMeta[requestPath];
    if (meta) {
      const html = injectMeta(indexHtml, {
        ...meta,
        url: `${SITE_URL}${requestPath}`,
        image: '/og-default.png',
      });
      return res.send(html);
    }
  }

  // 默認 — 直接送 index.html (SPA fallback)
  res.set('Cache-Control', 'no-cache');
  res.send(indexHtml);
});

/* ── Start ── */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVE] Frontend server running on port ${PORT}`);
  console.log(`[SERVE] Backend URL: ${BACKEND_URL}`);
  console.log(`[SERVE] Site URL: ${SITE_URL}`);
});
