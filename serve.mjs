/**
 * serve.mjs — P2 (TanStack Start SSG/SSR) 生產伺服器,取代舊的 serve.cjs(SPA 版)。
 *
 * 職責:
 *  1. 靜態服務 dist/client(prerender 的 HTML + hash 資產),帶長期快取
 *  2. 動態 OG 圖 /og-image/:id(sharp 生成社交卡;無 sharp 則回 SVG)
 *  3. 動態 sitemap.xml、robots.txt
 *  4. 其餘(/、/admin、動態頁、404、Accept-Language 導向)→ TanStack SSR handler(dist/server/server.js)
 *
 * gzip 交給前面的 nginx;/api 也由 nginx 直接 proxy 到 backend(本服務不碰)。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '13579', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';
const SITE_URL = process.env.SITE_URL || 'https://koimsurai.com';
const CLIENT = join(__dirname, 'dist', 'client');

let sharp = null;
try { ({ default: sharp } = await import('sharp')); } catch { sharp = null; }

// SSR handler(ESM,bare import 外部依賴 → 執行時需要 node_modules)
const { default: ssr } = await import('./dist/server/server.js');

const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.avif': 'image/avif', '.map': 'application/json',
};

const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function fetchFromBackend(apiPath) {
  return new Promise((resolve, reject) => {
    const url = `${BACKEND_URL}${apiPath}`;
    (url.startsWith('https') ? https : http).get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); } });
    }).on('error', reject);
  });
}

async function tryFile(p) {
  try { const s = await stat(p); if (s.isFile()) return await readFile(p); } catch { /* miss */ }
  return null;
}

function cacheHeaders(filePath) {
  if (filePath.endsWith('.html')) return 'public, max-age=3600, must-revalidate';
  // Vite 把所有 content-hash 資產放在 /assets/(hash 含大小寫,故不能只配小寫 hex)→ 一律 immutable 長快取
  if (filePath.includes('/assets/') || /[.\-][A-Za-z0-9_-]{8}\.\w+$/.test(filePath)) return 'public, max-age=31536000, immutable';
  if (/\.(woff2?|ttf|otf|webp|png|jpe?g|svg|ico|avif)$/.test(filePath)) return 'public, max-age=86400, must-revalidate';
  return 'public, max-age=3600';
}

/* ── /og-image/:id — 動態社交卡(沿用舊 serve.cjs 視覺) ── */
async function ogImage(id, res) {
  try {
    const post = await fetchFromBackend(`/api/posts/${id}`);
    if (!post || post.message !== 'success') { res.writeHead(302, { location: '/og-default-v2.png' }); return res.end(); }
    const title = post.title || '';
    const author = post.author || 'Koimsurai';
    const category = post.category || '';
    const date = post.created_at ? new Date(post.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 3).map((t) => (typeof t === 'string' ? t : t.name)).join(' · ') : '';

    const maxChars = 16; const lines = []; let rem = title;
    while (rem.length > 0) {
      if (rem.length <= maxChars) { lines.push(rem); break; }
      lines.push(rem.substring(0, maxChars)); rem = rem.substring(maxChars);
      if (lines.length >= 3) { if (rem) lines[2] = lines[2].substring(0, maxChars - 1) + '…'; break; }
    }
    const titleSvg = lines.map((l, i) => `<text x="80" y="${210 + i * 64}" font-size="48" font-weight="700" fill="#f4f4f5" font-family="'Noto Sans CJK JP','Noto Sans CJK TC','Noto Sans CJK SC',sans-serif">${escXml(l)}</text>`).join('\n      ');
    const cBadgeW = category ? category.length * 20 + 28 : 0;
    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg-glow" cx="78%" cy="22%" r="70%"><stop offset="0%" stop-color="#7f5af0" stop-opacity="0.18"/><stop offset="50%" stop-color="#1a0a2e" stop-opacity="0.4"/><stop offset="100%" stop-color="#0a0a1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#7f5af0"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0a1a"/><rect width="1200" height="630" fill="url(#bg-glow)"/>
  <g transform="translate(1010, 480)" opacity="0.85"><ellipse cx="0" cy="0" rx="180" ry="32" fill="none" stroke="#7f5af0" stroke-opacity="0.2" stroke-width="1.2"/><ellipse cx="0" cy="0" rx="150" ry="27" fill="none" stroke="#a78bfa" stroke-opacity="0.12" stroke-width="0.8"/><circle cx="0" cy="0" r="46" fill="#7f5af0" fill-opacity="0.08"/><circle cx="0" cy="0" r="46" fill="none" stroke="#d8b4fe" stroke-opacity="0.22" stroke-width="0.8"/></g>
  <rect x="0" y="0" width="4" height="630" fill="url(#accent)"/>
  ${category ? `<rect x="80" y="80" width="${cBadgeW}" height="32" rx="16" fill="rgba(127,90,240,0.16)" stroke="#a78bfa" stroke-opacity="0.45" stroke-width="1"/><text x="${80 + cBadgeW / 2}" y="102" font-size="14" fill="#d8b4fe" text-anchor="middle" font-family="'Noto Sans CJK TC','Noto Sans CJK SC',sans-serif" letter-spacing="1">${escXml(category)}</text>` : ''}
  ${titleSvg}
  <text x="80" y="475" font-size="20" fill="rgba(255,255,255,0.55)" font-family="'Noto Sans CJK TC',sans-serif">✦ ${escXml(author)}${date ? `  ·  ${escXml(date)}` : ''}</text>
  ${tags ? `<text x="80" y="505" font-size="15" fill="rgba(216,180,254,0.55)" font-family="'Noto Sans CJK TC',sans-serif">${escXml(tags)}</text>` : ''}
  <text x="80" y="585" font-size="28" font-weight="600" fill="url(#accent)" font-family="'Noto Sans CJK JP','Noto Sans CJK TC',sans-serif" letter-spacing="2">宙と木</text>
  <text x="200" y="583" font-size="15" fill="rgba(255,255,255,0.35)" font-family="'Noto Sans CJK TC',sans-serif" letter-spacing="0.5">koimsurai.com</text>
</svg>`;
    if (sharp) {
      try {
        const png = await sharp(Buffer.from(svg)).resize(1200, 630).png({ quality: 90 }).toBuffer();
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400, s-maxage=604800' });
        return res.end(png);
      } catch { /* fall through to svg */ }
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' });
    res.end(svg);
  } catch {
    res.writeHead(302, { location: '/og-default-v2.png' }); res.end();
  }
}

/* ── /sitemap.xml ── */
async function sitemap(res) {
  try {
    const data = await fetchFromBackend('/api/posts?limit=500');
    const posts = Array.isArray(data) ? data : (data.posts || []);
    const today = new Date().toISOString().slice(0, 10);
    const staticPages = [
      ['/', '1.0', 'weekly'], ['/blog', '0.9', 'daily'], ['/photos', '0.7', 'weekly'], ['/bookshelf', '0.6', 'monthly'],
      ['/music', '0.5', 'weekly'], ['/setup', '0.5', 'monthly'], ['/activity', '0.5', 'daily'], ['/about', '0.7', 'monthly'],
    ];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const [loc, pr, cf] of staticPages) xml += `  <url><loc>${SITE_URL}${loc}</loc><lastmod>${today}</lastmod><changefreq>${cf}</changefreq><priority>${pr}</priority></url>\n`;
    for (const p of posts) {
      const lastmod = (p.updated_at || p.created_at || '').slice(0, 10) || today;
      xml += `  <url><loc>${SITE_URL}/blog/${p.id}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    }
    xml += '</urlset>\n';
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end(xml);
  } catch {
    const f = await tryFile(join(CLIENT, 'sitemap.xml'));
    if (f) { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(f); }
    else { res.writeHead(500); res.end('err'); }
  }
}

const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/*\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

const server = createServer(async (req, res) => {
  try {
    const u = new URL(`http://x${req.url}`);
    const pathname = decodeURIComponent(u.pathname);

    // 1) 自訂端點
    const og = pathname.match(/^\/og-image\/([\w-]+)$/);
    if (og) return await ogImage(og[1], res);
    if (pathname === '/sitemap.xml') return await sitemap(res);
    if (pathname === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(ROBOTS); }

    // 2) 靜態檔(資產 or prerender 的 index.html)
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    if (extname(safe)) {
      const buf = await tryFile(join(CLIENT, safe));
      if (buf) { res.writeHead(200, { 'content-type': MIME[extname(safe)] ?? 'application/octet-stream', 'cache-control': cacheHeaders(safe) }); return res.end(buf); }
    } else {
      const html = await tryFile(join(CLIENT, safe, 'index.html'));
      if (html) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, must-revalidate' }); return res.end(html); }
    }

    // 3) SSR handler(/、/admin、動態頁、404、導向)
    const request = new Request(`${SITE_URL}${req.url}`, { method: req.method, headers: req.headers, redirect: 'manual' });
    const response = await ssr.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => { try { res.setHeader(k, v); } catch { /* */ } });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.statusCode = 500;
    res.end('SERVER_ERROR');
    console.error('[SERVE]', e?.stack || e);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVE] P2 server on :${PORT} | backend=${BACKEND_URL} | site=${SITE_URL} | sharp=${!!sharp}`);
});
