require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const axios = require('axios');
const { initializeDatabase, db } = require('./database.js');
const { createRequireAdmin, createRequireOwner, basicAuth, JWT_SECRET } = require('./auth');
const { isMailerConfigured, generateToken: genUnsubToken, sendNewsletter } = require('./mailer');

// Fire-and-forget newsletter dispatch — used by both admin POST/PUT post
// endpoints when `send_newsletter` flag is set. Errors are logged but never
// block the HTTP response (the post is what the admin cares about; mail
// delivery is a side effect).
function dispatchNewsletterForPost(postId) {
  if (!isMailerConfigured()) {
    console.warn(`[newsletter] RESEND_API_KEY missing — skipping send for post ${postId}`);
    return;
  }
  db.get(
    'SELECT id, title, excerpt, status FROM posts WHERE id = ?',
    [postId],
    (err, post) => {
      if (err || !post) {
        console.error(`[newsletter] post lookup failed for ${postId}:`, err);
        return;
      }
      if (post.status !== 'published') return;
      db.all(
        'SELECT email, name, unsubscribe_token FROM newsletter_subscribers WHERE status = ? AND unsubscribe_token IS NOT NULL',
        ['active'],
        async (subErr, subscribers) => {
          if (subErr) {
            console.error('[newsletter] subscriber lookup failed:', subErr);
            return;
          }
          if (!subscribers.length) {
            console.log(`[newsletter] post ${postId} ready but 0 active subscribers`);
            return;
          }
          try {
            const result = await sendNewsletter({ post, subscribers });
            console.log(`[newsletter] post ${postId} → sent=${result.sent} failed=${result.failed}`);
            if (result.errors.length) {
              console.warn('[newsletter] errors:', result.errors);
            }
          } catch (e) {
            console.error('[newsletter] dispatch error:', e);
          }
        }
      );
    }
  );
}

// 建立需要 DB 的 middleware
const requireAdmin = createRequireAdmin(db);
const requireOwner = createRequireOwner(db);

const app = express();
app.set('trust proxy', 1);
app.use(cors());
// JSON body limit 預設 100KB → 撞 413（長文/英韓多 byte 句長或夾雜 base64 圖會爆）。
// 拉到 10MB 容下整篇 markdown + 中等量 inline image；urlencoded 也順手放寬。
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const PORT = process.env.PORT || 3001;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

// 初始化資料庫
initializeDatabase();

// ─── In-memory cache for frequently accessed data ───
let _keywordFiltersCache = null;
let _keywordFiltersCacheTime = 0;
const KEYWORD_FILTERS_TTL = 5 * 60 * 1000; // 5 minutes

function getKeywordFilters() {
  return new Promise((resolve, reject) => {
    if (_keywordFiltersCache && Date.now() - _keywordFiltersCacheTime < KEYWORD_FILTERS_TTL) {
      return resolve(_keywordFiltersCache);
    }
    db.all("SELECT keyword, action FROM keyword_filters", [], (err, filters) => {
      if (err) return reject(err);
      _keywordFiltersCache = filters || [];
      _keywordFiltersCacheTime = Date.now();
      resolve(_keywordFiltersCache);
    });
  });
}
function invalidateKeywordFiltersCache() { _keywordFiltersCache = null; }

const fs = require('fs');
const path = require('path');
const multer = require('multer');
let sharp = null;
try {
  sharp = require('sharp');
} catch (_err) {
  // Keep server bootable even if sharp is missing; sync endpoint will report dependency error.
}

// thumbhash is ESM-only; load lazily via dynamic import to use from CommonJS.
let _thumbhashLib = null;
let _thumbhashLoading = null;
function loadThumbhashLib() {
  if (_thumbhashLib) return Promise.resolve(_thumbhashLib);
  if (!_thumbhashLoading) {
    _thumbhashLoading = import('thumbhash')
      .then((mod) => { _thumbhashLib = mod; return mod; })
      .catch((err) => { console.error('[thumbhash] load failed:', err.message); return null; });
  }
  return _thumbhashLoading;
}

// Resize image to ≤100px on longest side, get raw RGBA, encode with thumbhash.
// Returns base64url string (no padding) suitable for use as URL fragment value, or null on failure.
async function computeThumbHashBase64(filePath) {
  if (!sharp) return null;
  try {
    const lib = await loadThumbhashLib();
    if (!lib?.rgbaToThumbHash) return null;
    const { data, info } = await sharp(filePath)
      .resize({ width: 100, height: 100, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hash = lib.rgbaToThumbHash(info.width, info.height, data);
    return Buffer.from(hash).toString('base64url');
  } catch (err) {
    console.error('[thumbhash] compute failed for', filePath, '-', err.message);
    return null;
  }
}

const GALLERY_SOURCE_PATH = process.env.GALLERY_SOURCE_PATH || path.join(__dirname, 'storage', 'Blog_Source');
const GALLERY_OUTPUT_DIR = path.join(__dirname, 'storage', 'gallery');
const GALLERY_MANIFEST_PATH = path.join(GALLERY_OUTPUT_DIR, 'manifest.json');
const SUPPORTED_GALLERY_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
let gallerySyncInProgress = false;

function isSupportedGalleryImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_GALLERY_EXTENSIONS.has(ext);
}

async function scanGallerySourceFiles(dir, output = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Keep parity with existing builder's exclude rules.
      if (/(@eaDir|\.DS_Store|thumbs|cache|gallery)/i.test(entry.name)) {
        continue;
      }
      await scanGallerySourceFiles(fullPath, output);
      continue;
    }

    if (entry.isFile() && isSupportedGalleryImage(fullPath)) {
      output.push(fullPath);
    }
  }

  return output;
}

async function readGalleryManifestSafe() {
  try {
    const raw = await fs.promises.readFile(GALLERY_MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const photos = Array.isArray(parsed.photos) ? parsed.photos : [];
    return {
      version: parsed.version || '1.0',
      photos,
    };
  } catch (_err) {
    return { version: '1.0', photos: [] };
  }
}

async function processSingleGalleryImage(sourcePath, fullOutputPath, thumbOutputPath) {
  const image = sharp(sourcePath, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();

  await image
    .clone()
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(fullOutputPath);

  await image
    .clone()
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbOutputPath);

  const fullStat = await fs.promises.stat(fullOutputPath);
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: fullStat.size,
    format: (metadata.format || path.extname(sourcePath).replace('.', '') || 'jpg').toLowerCase(),
  };
}

async function syncGalleryManifest() {
  if (!sharp) {
    const error = new Error('sharp module is not installed in backend runtime');
    error.code = 'MISSING_SHARP';
    throw error;
  }

  await fs.promises.access(GALLERY_SOURCE_PATH);
  await fs.promises.mkdir(GALLERY_OUTPUT_DIR, { recursive: true });

  const { version, photos: existingPhotos } = await readGalleryManifestSafe();
  const existingById = new Map(existingPhotos.map((photo) => [photo.id, photo]));
  const sourceFiles = await scanGallerySourceFiles(GALLERY_SOURCE_PATH);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const nextPhotos = [];

  for (const sourcePath of sourceFiles) {
    const fileName = path.basename(sourcePath);
    const id = path.basename(sourcePath, path.extname(sourcePath));
    const existing = existingById.get(id);

    const fullFileName = `${id}.webp`;
    const thumbFileName = `${id}-thumb.webp`;
    const fullOutputPath = path.join(GALLERY_OUTPUT_DIR, fullFileName);
    const thumbOutputPath = path.join(GALLERY_OUTPUT_DIR, thumbFileName);

    let needRebuild = true;
    if (existing) {
      try {
        await fs.promises.access(fullOutputPath);
        await fs.promises.access(thumbOutputPath);
        needRebuild = false;
      } catch (_err) {
        needRebuild = true;
      }
    }

    if (!needRebuild) {
      nextPhotos.push(existing);
      skipped += 1;
      continue;
    }

    try {
      const { width, height, size, format } = await processSingleGalleryImage(
        sourcePath,
        fullOutputPath,
        thumbOutputPath
      );
      const sourceStat = await fs.promises.stat(sourcePath);

      const nextPhoto = {
        ...existing,
        id,
        title: fileName,
        description: existing?.description || '',
        urls: {
          full: `/nas-images/${fullFileName}`,
          regular: `/nas-images/${fullFileName}`,
          small: `/nas-images/${thumbFileName}`,
          thumb: `/nas-images/${thumbFileName}`,
        },
        originalUrl: `/nas-images/${fullFileName}`,
        thumbnailUrl: `/nas-images/${thumbFileName}`,
        width,
        height,
        aspectRatio: height ? width / height : 1,
        size,
        format,
        shootTime: existing?.shootTime || sourceStat.mtimeMs,
        tags: Array.isArray(existing?.tags) ? existing.tags : [],
      };

      nextPhotos.push(nextPhoto);
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[Gallery Sync] Failed processing ${fileName}:`, err.message || err);
    }
  }

  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    totalPhotos: nextPhotos.length,
    photos: nextPhotos,
  };

  await fs.promises.writeFile(GALLERY_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    total: sourceFiles.length,
    processed,
    skipped,
    failed,
    totalPhotos: manifest.totalPhotos,
    generatedAt: manifest.generatedAt,
  };
}

// --- Multer Storage Config ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 儲存路徑: storage/uploads/YYYY/MM/
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const uploadDir = path.join(__dirname, 'storage', 'uploads', String(year), month);

    // 確保目錄存在
    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 檔名: timestamp-originalname (避免衝突)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- API Routes ---

const apiRouter = express.Router();

// Upload Endpoint
apiRouter.post('/admin/upload', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // 建構回傳 URL: /uploads/YYYY/MM/filename
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  let fileUrl = `/uploads/${year}/${month}/${req.file.filename}`;

  // 圖片：計算 thumbhash 並附加為 URL fragment（#th=xxx）。
  // 用 fragment 的好處是 markdown link 一份到底，瀏覽器發 HTTP 不會送 fragment 出去，
  // 前端 JS 可以從 src 字串解析出來做模糊佔位。
  let thumbhash = null;
  if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
    thumbhash = await computeThumbHashBase64(req.file.path);
    if (thumbhash) fileUrl += `#th=${thumbhash}`;
  }

  res.json({
    message: 'success',
    url: fileUrl,
    filename: req.file.filename,
    thumbhash
  });
});

// Gallery API Endpoint
apiRouter.get('/gallery/photos', async (req, res) => {
  const manifestPath = GALLERY_MANIFEST_PATH;

  try {
    const data = await fs.promises.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(data);
    res.json(manifest); // 回傳完整結構 (包含 version, photos 等)
  } catch (err) {
    if (err.code === 'ENOENT') {
      // 若無 manifest，回傳空結構以免前端錯誤
      res.json({
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        totalPhotos: 0,
        photos: []
      });
    } else {
      console.error('Error reading gallery manifest:', err);
      res.status(500).json({ error: 'Failed to read gallery manifest' });
    }
  }
});

// Gallery sync endpoint (manual trigger from admin UI)
apiRouter.post('/admin/gallery/sync', requireAdmin, async (req, res) => {
  if (gallerySyncInProgress) {
    return res.status(409).json({ error: 'Gallery sync is already running' });
  }

  gallerySyncInProgress = true;
  try {
    const result = await syncGalleryManifest();
    res.json({
      message: 'Gallery sync completed',
      ...result,
    });
  } catch (err) {
    const message = err?.message || 'Gallery sync failed';
    console.error('[Gallery Sync] Error:', message);
    res.status(500).json({ error: message });
  } finally {
    gallerySyncInProgress = false;
  }
});

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// 圖片代理端點 - 解決 CORS 問題
apiRouter.get('/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).send('Missing image URL');
  }

  try {
    // 使用 axios 向圖片伺服器請求圖片
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      timeout: 10000, // 10 秒超時
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // 設定正確的 Content-Type 和 CORS headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 快取 24 小時

    // 將圖片流直接傳回給前端
    response.data.pipe(res);

  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(500).send('Failed to fetch image');
  }
});

// 登入端點
apiRouter.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '請提供用戶名和密碼' });
  }

  try {
    db.get(
      "SELECT * FROM users WHERE username = ?",
      [username],
      async (err, user) => {
        if (err) {
          console.error('資料庫查詢錯誤:', err);
          return res.status(500).json({ message: '伺服器錯誤' });
        }

        if (!user) {
          return res.status(401).json({ message: '用戶名或密碼錯誤' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
          return res.status(401).json({ message: '用戶名或密碼錯誤' });
        }

        // 生成 JWT token
        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role
          },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          message: '登入成功',
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    console.error('登入錯誤:', error);
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

// ─── i18n helpers ──────────────────────────────────────
// 支援的 locale 與對應的 DB 欄位後綴 / HTML hreflang / html lang
const I18N_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
const LOCALE_COLUMN_SUFFIX = { 'zh-CN': 'zh_cn', 'en': 'en', 'ja': 'ja' };
const LOCALE_HREFLANG = { 'zh-TW': 'zh-Hant', 'zh-CN': 'zh-Hans', 'en': 'en', 'ja': 'ja' };
const LOCALE_URL_PREFIX = { 'zh-TW': '', 'zh-CN': '/zh-cn', 'en': '/en', 'ja': '/ja' };

// OpenCC 繁→簡 轉換器（lazy load）
let _openccT2S = null;
async function getOpenCCT2S() {
  if (_openccT2S) return _openccT2S;
  const OpenCC = require('opencc-js');
  _openccT2S = OpenCC.Converter({ from: 'tw', to: 'cn' });
  return _openccT2S;
}

function parseLocale(raw) {
  if (!raw) return null;
  const lower = String(raw).toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hant') return 'zh-TW';
  if (lower === 'zh-cn' || lower === 'zh-hans') return 'zh-CN';
  if (lower === 'en') return 'en';
  if (lower === 'ja') return 'ja';
  return null;
}

// 從 row 取得指定 locale 的 title/content/excerpt，若該 locale 無內容回 null
function getLocaleContent(row, locale) {
  const source = row.source_language || 'zh-TW';
  if (locale === source) {
    return { title: row.title, content: row.content, excerpt: row.excerpt || '' };
  }
  const sfx = LOCALE_COLUMN_SUFFIX[locale];
  if (!sfx) return null;
  const t = row[`title_${sfx}`];
  const c = row[`content_${sfx}`];
  if (!t || !c) return null;
  return { title: t, content: c, excerpt: row[`excerpt_${sfx}`] || '' };
}

// 列出該文實際有內容的所有 locale
function availableLocales(row) {
  const source = row.source_language || 'zh-TW';
  const list = [source];
  I18N_LOCALES.forEach(loc => {
    if (loc === source) return;
    const sfx = LOCALE_COLUMN_SUFFIX[loc];
    if (sfx && row[`title_${sfx}`] && row[`content_${sfx}`]) list.push(loc);
  });
  return list;
}

function postUrlForLocale(siteUrl, postId, locale, sourceLang) {
  // source locale 永遠走不帶 prefix 的規範 URL
  if (locale === sourceLang) return `${siteUrl}/blog/${postId}`;
  return `${siteUrl}${LOCALE_URL_PREFIX[locale]}/blog/${postId}`;
}

// 站點統計（給 navbar mega-menu 顯示「文 / 字 / 日」用）
// days 用站點建立日期 2025-04-01 計算（跟前端 Activity 頁的 getUptime 對齊）
const SITE_START_AT = new Date('2025-04-01T00:00:00+08:00').getTime();
apiRouter.get('/stats', (req, res) => {
  const sql = `
    SELECT
      COUNT(*) AS total_posts,
      COALESCE(SUM(LENGTH(content)), 0) AS total_chars
    FROM posts
    WHERE status = 'published'
  `;
  db.get(sql, [], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const days = Math.max(1, Math.floor((Date.now() - SITE_START_AT) / 86400000));
    res.json({
      message: 'success',
      total_posts: row.total_posts || 0,
      total_chars: row.total_chars || 0,
      days,
    });
  });
});

// GET all posts (公開)
apiRouter.get('/posts', (req, res) => {
  const { page = 1, limit = 10, search, tag, category, status = 'published', sortBy = 'newest' } = req.query;
  const offset = (page - 1) * limit;

  let sql = `
    SELECT p.*, GROUP_CONCAT(t.name) as tags 
    FROM posts p 
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.status = ?
  `;
  const params = [status];

  if (search) {
    sql += ` AND (p.title LIKE ? OR p.content LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (tag) {
    sql += ` AND t.name = ?`;
    params.push(tag);
  }

  if (category) {
    sql += ` AND p.category = ?`;
    params.push(category);
  }

  sql += ` GROUP BY p.id`;

  // 根據排序參數排序
  switch (sortBy) {
    case 'oldest':
      sql += ` ORDER BY p.created_at ASC`;
      break;
    case 'popular':
      sql += ` ORDER BY p.view_count DESC, p.created_at DESC`;
      break;
    case 'newest':
    default:
      sql += ` ORDER BY p.created_at DESC`;
      break;
  }

  sql += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查詢文章錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    // 計算總數
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total 
      FROM posts p 
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.status = ?
      ${search ? ` AND (p.title LIKE ? OR p.content LIKE ?)` : ''}
      ${tag ? ` AND t.name = ?` : ''}
      ${category ? ` AND p.category = ?` : ''}
    `;
    const countParams = [status];
    if (search) {
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (tag) {
      countParams.push(tag);
    }
    if (category) {
      countParams.push(category);
    }

    db.get(countSql, countParams, (countErr, countRow) => {
      if (countErr) {
        console.error('計算文章總數錯誤:', countErr);
        res.status(500).json({ error: countErr.message });
        return;
      }

      const total = countRow.total;
      const totalPages = Math.ceil(total / limit);

      // 若指定 lang，只列出該語言有內容的文章，並以該語言的 title/excerpt 回傳
      const requestedLocale = parseLocale(req.query.lang);
      const mapped = [];
      for (const row of rows) {
        const content = requestedLocale
          ? getLocaleContent(row, requestedLocale)
          : { title: row.title, content: row.content, excerpt: row.excerpt || '' };
        if (!content) continue; // 該語言無翻譯 → 不出現在列表
        mapped.push({
          id: row.id,
          title: content.title,
          excerpt: content.excerpt,
          category: row.category,
          status: row.status,
          author: row.author,
          view_count: row.view_count,
          likes: row.likes,
          layout_type: row.layout_type,
          created_at: row.created_at,
          updated_at: row.updated_at,
          source_language: row.source_language || 'zh-TW',
          available_locales: availableLocales(row),
          tags: row.tags ? row.tags.split(',') : [],
        });
      }

      res.json({
        message: "success",
        posts: mapped,
        locale: requestedLocale,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: requestedLocale ? mapped.length : total,
          totalPages: requestedLocale ? Math.ceil(mapped.length / limit) : totalPages,
        }
      });
    });
  });
});

// GET all posts for admin (需要認證)
apiRouter.get('/admin/posts', requireAdmin, (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const offset = (page - 1) * limit;

  let sql = `
    SELECT p.*, GROUP_CONCAT(t.name) as tags 
    FROM posts p 
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ` AND p.status = ?`;
    params.push(status);
  }

  if (search) {
    sql += ` AND (p.title LIKE ? OR p.content LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查詢管理員文章錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    // 計算總數
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total 
      FROM posts p 
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE 1=1
      ${status ? ` AND p.status = ?` : ''}
      ${search ? ` AND (p.title LIKE ? OR p.content LIKE ?)` : ''}
    `;
    const countParams = [];
    if (status) {
      countParams.push(status);
    }
    if (search) {
      countParams.push(`%${search}%`, `%${search}%`);
    }

    db.get(countSql, countParams, (countErr, countRow) => {
      if (countErr) {
        console.error('計算管理員文章總數錯誤:', countErr);
        res.status(500).json({ error: countErr.message });
        return;
      }

      const total = countRow.total;
      const totalPages = Math.ceil(total / limit);

      res.json({
        posts: rows.map(row => ({
          ...row,
          tags: row.tags ? row.tags.split(',') : [],
          excerpt: row.excerpt || (row.content.substring(0, 150) + '...')
        })),
        totalPages,
        currentPage: parseInt(page),
        total
      });
    });
  });
});

// GET a single post by id for admin (需要認證)
// 回傳所有 locale 欄位，供編輯器使用
apiRouter.get('/admin/posts/:id', requireAdmin, (req, res) => {
  const sql = `
    SELECT p.*, GROUP_CONCAT(t.name) as tags
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.id = ?
    GROUP BY p.id
  `;

  db.get(sql, [req.params.id], (err, row) => {
    if (err) {
      console.error('查詢文章錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    if (!row) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    res.json({
      message: 'success',
      ...row,
      source_language: row.source_language || 'zh-TW',
      available_locales: availableLocales(row),
      tags: row.tags ? row.tags.split(',') : []
    });
  });
});

// GET admin statistics
apiRouter.get('/admin/stats', requireAdmin, (req, res) => {
  // 獲取文章統計
  const postsStatsQuery = `
    SELECT 
      COUNT(*) as totalPosts,
      COUNT(CASE WHEN status = 'published' THEN 1 END) as publishedPosts,
      COUNT(CASE WHEN status = 'draft' THEN 1 END) as draftPosts,
      COUNT(CASE WHEN created_at >= date('now', '-30 days') THEN 1 END) as postsThisMonth
    FROM posts
  `;

  // 獲取留言統計
  const commentsStatsQuery = `
    SELECT 
      COUNT(*) as totalComments,
      COUNT(CASE WHEN created_at >= date('now', '-7 days') THEN 1 END) as commentsThisWeek
    FROM comments
  `;

  // 執行查詢
  db.get(postsStatsQuery, (err, postsStats) => {
    if (err) {
      console.error('獲取文章統計錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    db.get(commentsStatsQuery, (err, commentsStats) => {
      if (err) {
        console.error('獲取留言統計錯誤:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      // 模擬訪客數據（在實際應用中，您可能會從其他來源獲取這些數據）
      const visitors = Math.floor(Math.random() * 1000) + 1000; // 模擬數據

      res.json({
        totalPosts: postsStats.totalPosts,
        publishedPosts: postsStats.publishedPosts,
        draftPosts: postsStats.draftPosts,
        postsThisMonth: postsStats.postsThisMonth,
        comments: commentsStats.totalComments,
        commentsThisWeek: commentsStats.commentsThisWeek,
        visitors: visitors, // 模擬數據
        message: 'success'
      });
    });
  });
});

// GET a single post by id
apiRouter.get('/posts/:id', (req, res) => {
  const sql = `
    SELECT p.*, GROUP_CONCAT(t.name) as tags
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.id = ?
    GROUP BY p.id
  `;
  const params = [req.params.id];

  db.get(sql, params, (err, row) => {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ "message": "Post not found" });
      return;
    }

    const sourceLang = row.source_language || 'zh-TW';
    const requestedLocale = parseLocale(req.query.lang) || sourceLang;
    const content = getLocaleContent(row, requestedLocale);

    if (!content) {
      // 明確 404，不做靜默 fallback（hreflang 集合不可污染）
      res.status(404).json({ message: 'Post not available in requested locale', locale: requestedLocale, available_locales: availableLocales(row) });
      return;
    }

    res.json({
      message: 'success',
      id: row.id,
      title: content.title,
      content: content.content,
      excerpt: content.excerpt,
      category: row.category,
      status: row.status,
      author: row.author,
      view_count: row.view_count,
      likes: row.likes,
      layout_type: row.layout_type,
      series_name: row.series_name || null,
      series_order: row.series_order ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      locale: requestedLocale,
      source_language: sourceLang,
      is_source: requestedLocale === sourceLang,
      available_locales: availableLocales(row),
      tags: row.tags ? row.tags.split(',') : [],
    });
  });
});

// 自動 OG 圖：依文章內容動態生成（SVG → PNG via sharp）
const _ogCache = new Map(); // postId → { png: Buffer, etag, key }
function _escXml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _wrapTitle(title, maxCharsPerLine = 18, maxLines = 3) {
  const t = String(title || '').trim();
  const out = [];
  let line = '';
  for (const ch of t) {
    if (line.length >= maxCharsPerLine) { out.push(line); line = ''; if (out.length >= maxLines) break; }
    line += ch;
  }
  if (line && out.length < maxLines) out.push(line);
  if (out.length === maxLines && t.length > out.join('').length) {
    out[maxLines - 1] = out[maxLines - 1].slice(0, maxCharsPerLine - 1) + '…';
  }
  return out;
}
apiRouter.get('/og/:id.png', (req, res) => {
  if (!sharp) return res.status(500).send('sharp unavailable');
  const id = req.params.id;
  db.get('SELECT id, title, category, created_at, updated_at FROM posts WHERE id = ?', [id], async (err, row) => {
    if (err || !row) return res.status(404).send('not found');
    const cacheKey = `${row.id}::${row.updated_at || row.created_at}::${row.title}`;
    const cached = _ogCache.get(row.id);
    if (cached && cached.key === cacheKey && req.headers['if-none-match'] === cached.etag) {
      res.status(304).end();
      return;
    }
    if (cached && cached.key === cacheKey) {
      res.set('Content-Type', 'image/png');
      res.set('ETag', cached.etag);
      res.set('Cache-Control', 'public, max-age=300, s-maxage=86400');
      return res.send(cached.png);
    }

    const lines = _wrapTitle(row.title, 16, 3);
    const date = (row.created_at || '').slice(0, 10);
    const cat = row.category || '手記';
    const titleSvg = lines.map((l, i) =>
      `<text x="80" y="${250 + i * 90}" font-family="Noto Sans CJK TC, HarmonyOS Sans SC, sans-serif" font-size="76" font-weight="700" fill="#ffffff">${_escXml(l)}</text>`
    ).join('');
    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a1a"/>
      <stop offset="50%" stop-color="#11102a"/>
      <stop offset="100%" stop-color="#1a0a2e"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e0c3fc"/>
      <stop offset="50%" stop-color="#7f5af0"/>
      <stop offset="100%" stop-color="#dc3278"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.2" r="0.45">
      <stop offset="0%" stop-color="#7f5af0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#7f5af0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="80" y="84" width="120" height="4" fill="url(#brand)" rx="2"/>
  <text x="80" y="140" font-family="Noto Sans CJK TC, HarmonyOS Sans SC, sans-serif" font-size="28" font-weight="600" fill="#c4b5fd" letter-spacing="2">${_escXml(cat).toUpperCase()}</text>
  ${titleSvg}
  <text x="80" y="560" font-family="Noto Sans CJK TC, HarmonyOS Sans SC, sans-serif" font-size="26" font-weight="400" fill="rgba(255,255,255,0.55)">${_escXml(date)} · koimsurai.com</text>
  <text x="1120" y="560" text-anchor="end" font-family="Noto Sans CJK TC, HarmonyOS Sans SC, sans-serif" font-size="32" font-weight="700" fill="url(#brand)">Koimsurai</text>
</svg>`;
    try {
      const png = await sharp(Buffer.from(svg)).resize(1200, 630).png({ quality: 90 }).toBuffer();
      const etag = `"og-${row.id}-${Buffer.from(cacheKey).toString('base64').slice(0, 12)}"`;
      _ogCache.set(row.id, { png, etag, key: cacheKey });
      res.set('Content-Type', 'image/png');
      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=300, s-maxage=86400');
      res.send(png);
    } catch (e) {
      console.error('OG generation failed:', e.message);
      res.status(500).send('og generation failed');
    }
  });
});

// Emoji 反應：取得文章的所有 reaction 統計
apiRouter.get('/posts/:id/reactions', (req, res) => {
  db.all(
    'SELECT emoji, count FROM post_reactions WHERE post_id = ? AND count > 0 ORDER BY count DESC',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ reactions: rows || [] });
    }
  );
});

// Emoji 反應：新增或減少（delta = +1 或 -1）
apiRouter.post('/posts/:id/reactions', (req, res) => {
  const { emoji, delta = 1 } = req.body || {};
  const ALLOWED = ['👍', '❤️', '🎉', '🚀', '🤔', '😂'];
  if (!ALLOWED.includes(emoji)) {
    return res.status(400).json({ error: 'invalid emoji' });
  }
  const d = delta === -1 ? -1 : 1;
  const postId = req.params.id;
  // upsert + clamp 到 0
  db.run(
    `INSERT INTO post_reactions (post_id, emoji, count, updated_at)
     VALUES (?, ?, MAX(0, ?), datetime('now'))
     ON CONFLICT(post_id, emoji) DO UPDATE SET
       count = MAX(0, count + ?),
       updated_at = datetime('now')`,
    [postId, emoji, d, d],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get(
        'SELECT count FROM post_reactions WHERE post_id = ? AND emoji = ?',
        [postId, emoji],
        (err2, row) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ emoji, count: row ? row.count : 0 });
        }
      );
    }
  );
});

// 系列文：列出所有系列
apiRouter.get('/series', (req, res) => {
  const sql = `
    SELECT series_name AS name, COUNT(*) AS count, MIN(created_at) AS first_at, MAX(created_at) AS last_at
    FROM posts
    WHERE series_name IS NOT NULL AND series_name <> '' AND status = 'published'
    GROUP BY series_name
    ORDER BY last_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ series: rows || [] });
  });
});

// 系列文：取得某個系列的所有文章（按 series_order 排序，後備 created_at）
apiRouter.get('/series/:name', (req, res) => {
  const sql = `
    SELECT id, title, excerpt, series_name, series_order, created_at
    FROM posts
    WHERE series_name = ? AND status = 'published'
    ORDER BY
      CASE WHEN series_order IS NULL THEN 1 ELSE 0 END,
      series_order ASC,
      created_at ASC
  `;
  db.all(sql, [req.params.name], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ name: req.params.name, posts: rows || [] });
  });
});

// POST increment view count
apiRouter.post('/posts/:id/view', (req, res) => {
  const sql = 'UPDATE posts SET view_count = view_count + 1 WHERE id = ?';
  db.run(sql, [req.params.id], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Post not found" });
      return;
    }
    res.json({
      "message": "success",
      "view_count_incremented": true
    });
  });
});

// POST like a post
apiRouter.post('/posts/:id/like', (req, res) => {
  const sql = 'UPDATE posts SET likes = likes + 1 WHERE id = ?';
  db.run(sql, [req.params.id], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Post not found" });
      return;
    }

    // 回傳更新後的按讚數
    db.get('SELECT likes FROM posts WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        res.status(500).json({ "error": err.message });
        return;
      }
      res.json({
        "message": "success",
        "likes": row.likes
      });
    });
  });
});

// POST unlike a post
apiRouter.post('/posts/:id/unlike', (req, res) => {
  const sql = 'UPDATE posts SET likes = likes - 1 WHERE id = ? AND likes > 0';
  db.run(sql, [req.params.id], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Post not found or cannot unlike" });
      return;
    }

    // 回傳更新後的按讚數
    db.get('SELECT likes FROM posts WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        res.status(500).json({ "error": err.message });
        return;
      }
      res.json({
        "message": "success",
        "likes": row.likes
      });
    });
  });
});

// GET all tags (只計算已發佈文章的標籤數量)
apiRouter.get('/tags', (req, res) => {
  const sql = `
    SELECT t.id, t.name, t.created_at,
      COUNT(CASE WHEN p.status = 'published' THEN 1 END) as post_count 
    FROM tags t
    LEFT JOIN post_tags pt ON t.id = pt.tag_id
    LEFT JOIN posts p ON pt.post_id = p.id
    GROUP BY t.id
    HAVING post_count > 0
    ORDER BY post_count DESC, t.name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: "success",
      tags: rows
    });
  });
});

// GET all tags for admin (需要認證)
apiRouter.get('/admin/tags', requireAdmin, (req, res) => {
  const sql = `
    SELECT t.id, t.name, t.created_at, COUNT(pt.post_id) as post_count 
    FROM tags t
    LEFT JOIN post_tags pt ON t.id = pt.tag_id
    GROUP BY t.id, t.name, t.created_at
    ORDER BY t.name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// POST create new tag
apiRouter.post('/admin/tags', requireAdmin, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: '標籤名稱為必填' });
  }

  db.run(
    `INSERT INTO tags (name, created_at) VALUES (?, datetime('now'))`,
    [name],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '標籤已存在' });
        }
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: this.lastID,
        name: name,
        post_count: 0
      });
    }
  );
});

// PUT update tag
apiRouter.put('/admin/tags/:id', requireAdmin, (req, res) => {
  const tagId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: '標籤名稱為必填' });
  }

  db.run(
    `UPDATE tags SET name = ? WHERE id = ?`,
    [name, tagId],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '標籤名稱已存在' });
        }
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '標籤不存在' });
      }

      res.json({
        id: tagId,
        name: name,
        updated: this.changes
      });
    }
  );
});

// DELETE tag
apiRouter.delete('/admin/tags/:id', requireAdmin, (req, res) => {
  const tagId = req.params.id;

  // 先刪除關聯
  db.run('DELETE FROM post_tags WHERE tag_id = ?', [tagId], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // 再刪除標籤
    db.run('DELETE FROM tags WHERE id = ?', [tagId], function (deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ error: deleteErr.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '標籤不存在' });
      }

      res.json({
        message: '標籤已刪除'
      });
    });
  });
});

// GET all categories (公開 API)
apiRouter.get('/categories', (req, res) => {
  const sql = `
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.short_description,
      c.updated_at,
      COUNT(p.id) as post_count
    FROM categories c
    LEFT JOIN posts p ON p.category = c.name AND p.status = 'published'
    GROUP BY c.id, c.name, c.slug, c.description, c.short_description, c.updated_at
    ORDER BY post_count DESC, c.name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: "success",
      categories: rows
    });
  });
});

// GET all categories for admin (需要認證)
apiRouter.get('/admin/categories', requireAdmin, (req, res) => {
  const sql = `
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.short_description,
      c.created_at,
      c.updated_at,
      COUNT(p.id) as post_count
    FROM categories c
    LEFT JOIN posts p ON p.category = c.name
    GROUP BY c.id, c.name, c.slug, c.description, c.short_description, c.created_at, c.updated_at
    ORDER BY c.name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// POST create new category
apiRouter.post('/admin/categories', requireAdmin, (req, res) => {
  const { name, description, slug, short_description } = req.body;

  if (!name) {
    return res.status(400).json({ error: '分類名稱為必填' });
  }

  // 生成 slug（如果沒有提供）
  const categorySlug = slug || name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '');

  // 插入新分類
  db.run(
    `INSERT INTO categories (name, slug, description, short_description, created_at, updated_at) 
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [name, categorySlug, description || '', short_description || ''],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: '分類名稱或 slug 已存在' });
        }
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: this.lastID,
        name: name,
        slug: categorySlug,
        description: description || '',
        short_description: short_description || '',
        post_count: 0
      });
    }
  );
});

// PUT update category
apiRouter.put('/admin/categories/:id', requireAdmin, (req, res) => {
  const categoryId = req.params.id;
  const { name, description, slug, short_description } = req.body;

  if (!name) {
    return res.status(400).json({ error: '分類名稱為必填' });
  }

  // 先獲取舊的分類名稱
  db.get('SELECT name FROM categories WHERE id = ?', [categoryId], (err, oldCategory) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!oldCategory) {
      return res.status(404).json({ error: '分類不存在' });
    }

    const categorySlug = slug || name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-\u4e00-\u9fa5]+/g, '');

    // 更新分類表
    db.run(
      `UPDATE categories 
       SET name = ?, slug = ?, description = ?, short_description = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [name, categorySlug, description || '', short_description || '', categoryId],
      function (updateErr) {
        if (updateErr) {
          if (updateErr.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: '分類名稱或 slug 已存在' });
          }
          return res.status(500).json({ error: updateErr.message });
        }

        // 如果分類名稱改變了，同步更新所有使用此分類的文章
        if (oldCategory.name !== name) {
          db.run(
            'UPDATE posts SET category = ? WHERE category = ?',
            [name, oldCategory.name],
            (postsUpdateErr) => {
              if (postsUpdateErr) {
                console.error('更新文章分類失敗:', postsUpdateErr);
              }
            }
          );
        }

        res.json({
          id: categoryId,
          name: name,
          slug: categorySlug,
          description: description || '',
          updated: this.changes
        });
      }
    );
  });
});

// DELETE category
apiRouter.delete('/admin/categories/:id', requireAdmin, (req, res) => {
  const categoryId = req.params.id;

  // 先獲取分類名稱
  db.get('SELECT name FROM categories WHERE id = ?', [categoryId], (err, category) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!category) {
      return res.status(404).json({ error: '分類不存在' });
    }

    // 將使用此分類的文章的分類欄位設為 NULL
    db.run(
      'UPDATE posts SET category = NULL WHERE category = ?',
      [category.name],
      function (updateErr) {
        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        const affectedPosts = this.changes;

        // 刪除分類
        db.run(
          'DELETE FROM categories WHERE id = ?',
          [categoryId],
          function (deleteErr) {
            if (deleteErr) {
              return res.status(500).json({ error: deleteErr.message });
            }

            res.json({
              message: '分類已刪除',
              affectedPosts: affectedPosts
            });
          }
        );
      }
    );
  });
});

// ===== Admin Posts CRUD =====

// POST create new post (Admin)
apiRouter.post('/admin/posts', requireAdmin, (req, res) => {
  console.log('[POST /api/admin/posts] Received request to create a new post.');
  console.log('[POST /api/admin/posts] Body:', req.body);

  const {
    title, content, excerpt, category, tags = [], status = 'draft', layout_type = 'record',
    source_language = 'zh-TW',
    title_en, content_en, excerpt_en,
    title_zh_cn, content_zh_cn, excerpt_zh_cn,
    title_ja, content_ja, excerpt_ja,
    title_ko, content_ko, excerpt_ko,
    series_name, series_order,
    allow_comments = 1,
    send_newsletter = false,
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "缺少必填欄位: title, content" });
  }
  if (!I18N_LOCALES.includes(source_language)) {
    return res.status(400).json({ error: `無效的 source_language: ${source_language}` });
  }

  const sql = `
    INSERT INTO posts (
      title, content, excerpt, category, status, author, layout_type,
      source_language,
      title_en, content_en, excerpt_en,
      title_zh_cn, content_zh_cn, excerpt_zh_cn,
      title_ja, content_ja, excerpt_ja,
      title_ko, content_ko, excerpt_ko,
      series_name, series_order,
      allow_comments,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;
  const params = [
    title, content, excerpt, category || null, status, 'Koimsurai', layout_type,
    source_language,
    title_en || null, content_en || null, excerpt_en || null,
    title_zh_cn || null, content_zh_cn || null, excerpt_zh_cn || null,
    title_ja || null, content_ja || null, excerpt_ja || null,
    title_ko || null, content_ko || null, excerpt_ko || null,
    (series_name && String(series_name).trim()) ? String(series_name).trim() : null,
    Number.isFinite(Number(series_order)) ? Number(series_order) : null,
    allow_comments ? 1 : 0,
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('[POST /api/admin/posts] Database error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const postId = this.lastID;
    console.log(`[POST /api/admin/posts] Successfully inserted post with ID: ${postId}`);

    // 處理標籤
    manageTags(postId, tags, (tagErr) => {
      if (tagErr) {
        console.error('[POST /api/admin/posts] Tag management error:', tagErr);
        return res.status(500).json({ error: tagErr.message });
      }

      res.status(201).json({
        message: "success",
        data: { id: postId, title, content, excerpt, category, tags, status, source_language }
      });

      // Fire-and-forget after response — don't block the admin save.
      if (send_newsletter && status === 'published') {
        dispatchNewsletterForPost(postId);
      }
    });
  });
});

// PUT update post (Admin)
apiRouter.put('/admin/posts/:id', requireAdmin, (req, res) => {
  console.log(`[PUT /api/admin/posts/${req.params.id}] Received request to update post.`);
  console.log('[PUT /api/admin/posts/:id] Body:', req.body);

  const {
    title, content, excerpt, category, tags = [], status, layout_type,
    source_language,
    title_en, content_en, excerpt_en,
    title_zh_cn, content_zh_cn, excerpt_zh_cn,
    title_ja, content_ja, excerpt_ja,
    title_ko, content_ko, excerpt_ko,
    series_name, series_order,
    allow_comments,
    send_newsletter = false,
  } = req.body;

  if (source_language !== undefined && !I18N_LOCALES.includes(source_language)) {
    return res.status(400).json({ error: `無效的 source_language: ${source_language}` });
  }

  // 空字串 → NULL（視為清除翻譯），undefined → 不修改
  const toNullable = (v) => (v === undefined ? undefined : (v === '' ? null : v));
  const nb_title_en = toNullable(title_en);
  const nb_content_en = toNullable(content_en);
  const nb_excerpt_en = toNullable(excerpt_en);
  const nb_title_zh_cn = toNullable(title_zh_cn);
  const nb_content_zh_cn = toNullable(content_zh_cn);
  const nb_excerpt_zh_cn = toNullable(excerpt_zh_cn);
  const nb_title_ja = toNullable(title_ja);
  const nb_content_ja = toNullable(content_ja);
  const nb_excerpt_ja = toNullable(excerpt_ja);
  const nb_title_ko = toNullable(title_ko);
  const nb_content_ko = toNullable(content_ko);
  const nb_excerpt_ko = toNullable(excerpt_ko);
  const nb_allow_comments = (allow_comments === undefined) ? undefined : (allow_comments ? 1 : 0);

  const nb_series_name = (series_name === undefined)
    ? undefined
    : (series_name === '' || series_name === null ? null : String(series_name).trim());
  const nb_series_order = (series_order === undefined)
    ? undefined
    : (series_order === '' || series_order === null || !Number.isFinite(Number(series_order)) ? null : Number(series_order));

  const sql = `
    UPDATE posts SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      excerpt = COALESCE(?, excerpt),
      category = ?,
      status = COALESCE(?, status),
      layout_type = COALESCE(?, layout_type),
      source_language = COALESCE(?, source_language),
      title_en       = CASE WHEN ? = 1 THEN ? ELSE title_en END,
      content_en     = CASE WHEN ? = 1 THEN ? ELSE content_en END,
      excerpt_en     = CASE WHEN ? = 1 THEN ? ELSE excerpt_en END,
      title_zh_cn    = CASE WHEN ? = 1 THEN ? ELSE title_zh_cn END,
      content_zh_cn  = CASE WHEN ? = 1 THEN ? ELSE content_zh_cn END,
      excerpt_zh_cn  = CASE WHEN ? = 1 THEN ? ELSE excerpt_zh_cn END,
      title_ja       = CASE WHEN ? = 1 THEN ? ELSE title_ja END,
      content_ja     = CASE WHEN ? = 1 THEN ? ELSE content_ja END,
      excerpt_ja     = CASE WHEN ? = 1 THEN ? ELSE excerpt_ja END,
      title_ko       = CASE WHEN ? = 1 THEN ? ELSE title_ko END,
      content_ko     = CASE WHEN ? = 1 THEN ? ELSE content_ko END,
      excerpt_ko     = CASE WHEN ? = 1 THEN ? ELSE excerpt_ko END,
      series_name    = CASE WHEN ? = 1 THEN ? ELSE series_name END,
      series_order   = CASE WHEN ? = 1 THEN ? ELSE series_order END,
      allow_comments = CASE WHEN ? = 1 THEN ? ELSE allow_comments END,
      updated_at = datetime('now')
    WHERE id = ?
  `;
  const flag = (v) => (v === undefined ? 0 : 1);
  const params = [
    title, content, excerpt, category, status, layout_type,
    source_language === undefined ? null : source_language,
    flag(nb_title_en), nb_title_en ?? null,
    flag(nb_content_en), nb_content_en ?? null,
    flag(nb_excerpt_en), nb_excerpt_en ?? null,
    flag(nb_title_zh_cn), nb_title_zh_cn ?? null,
    flag(nb_content_zh_cn), nb_content_zh_cn ?? null,
    flag(nb_excerpt_zh_cn), nb_excerpt_zh_cn ?? null,
    flag(nb_title_ja), nb_title_ja ?? null,
    flag(nb_content_ja), nb_content_ja ?? null,
    flag(nb_excerpt_ja), nb_excerpt_ja ?? null,
    flag(nb_title_ko), nb_title_ko ?? null,
    flag(nb_content_ko), nb_content_ko ?? null,
    flag(nb_excerpt_ko), nb_excerpt_ko ?? null,
    flag(nb_series_name), nb_series_name ?? null,
    flag(nb_series_order), nb_series_order ?? null,
    flag(nb_allow_comments), nb_allow_comments ?? null,
    req.params.id,
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error(`[PUT /api/admin/posts/${req.params.id}] Database error:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "文章不存在" });
    }

    // 處理標籤
    manageTags(req.params.id, tags, (tagErr) => {
      if (tagErr) {
        console.error(`[PUT /api/admin/posts/${req.params.id}] Tag management error:`, tagErr);
        return res.status(500).json({ error: tagErr.message });
      }

      res.json({
        message: "success",
        data: { id: req.params.id, title, content, excerpt, category, tags, status }
      });

      // Auto-broadcast newsletter when admin flips draft → published with the flag.
      if (send_newsletter && status === 'published') {
        dispatchNewsletterForPost(req.params.id);
      }
    });
  });
});

// POST 以 OpenCC 自動產生简体中文翻譯（從 zh-TW 轉换）
apiRouter.post('/admin/posts/:id/generate-zh-cn', requireAdmin, async (req, res) => {
  const postId = req.params.id;
  db.get('SELECT * FROM posts WHERE id = ?', [postId], async (err, row) => {
    if (err) {
      console.error('[generate-zh-cn] 查詢失敗:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) return res.status(404).json({ error: '文章不存在' });

    const source = row.source_language || 'zh-TW';
    if (source !== 'zh-TW') {
      return res.status(400).json({ error: '只能從 zh-TW 原文自動轉换為 zh-CN' });
    }
    if (!row.title || !row.content) {
      return res.status(400).json({ error: '原文缺少 title 或 content' });
    }

    try {
      const t2s = await getOpenCCT2S();
      const title_zh_cn = t2s(row.title);
      const content_zh_cn = t2s(row.content);
      const excerpt_zh_cn = row.excerpt ? t2s(row.excerpt) : null;

      db.run(
        `UPDATE posts SET title_zh_cn = ?, content_zh_cn = ?, excerpt_zh_cn = ?, updated_at = datetime('now') WHERE id = ?`,
        [title_zh_cn, content_zh_cn, excerpt_zh_cn, postId],
        function (updateErr) {
          if (updateErr) {
            console.error('[generate-zh-cn] 寫入失敗:', updateErr);
            return res.status(500).json({ error: updateErr.message });
          }
          res.json({
            message: 'success',
            title_zh_cn, content_zh_cn, excerpt_zh_cn,
          });
        }
      );
    } catch (e) {
      console.error('[generate-zh-cn] OpenCC 錯誤:', e);
      res.status(500).json({ error: `OpenCC 轉换失敗: ${e.message}` });
    }
  });
});

// DELETE post (Admin)
apiRouter.delete('/admin/posts/:id', requireAdmin, (req, res) => {
  console.log(`[DELETE /api/admin/posts/${req.params.id}] Received request to delete post.`);

  // 先清理 post_tags 關聯，再刪除文章
  db.run('DELETE FROM post_tags WHERE post_id = ?', [req.params.id], (tagErr) => {
    if (tagErr) {
      console.error(`[DELETE /api/admin/posts/${req.params.id}] Failed to clean post_tags:`, tagErr.message);
      return res.status(500).json({ error: tagErr.message });
    }

    db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function (err) {
      if (err) {
        console.error(`[DELETE /api/admin/posts/${req.params.id}] Database error:`, err.message);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "文章不存在" });
      }

      res.json({
        message: "文章已刪除",
        deleted: this.changes
      });
    });
  });
});

// Helper function to manage tags
function manageTags(postId, tags, callback) {
  // 先刪除舊的標籤關聯
  db.run("DELETE FROM post_tags WHERE post_id = ?", [postId], (err) => {
    if (err) return callback(err);

    // 如果沒有新標籤，直接返回（舊的已刪除）
    if (!tags || tags.length === 0) {
      return callback(null);
    }
    if (err) return callback(err);

    // 處理每個標籤
    let processed = 0;
    let hasError = false;

    tags.forEach(tagName => {
      if (hasError) return;

      // 插入或取得標籤 ID
      db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tagName], function (err) {
        if (err && !hasError) {
          hasError = true;
          return callback(err);
        }

        // 取得標籤 ID
        db.get("SELECT id FROM tags WHERE name = ?", [tagName], (err, tag) => {
          if (err && !hasError) {
            hasError = true;
            return callback(err);
          }

          // 建立關聯
          db.run("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tag.id], (err) => {
            if (err && !hasError) {
              hasError = true;
              return callback(err);
            }

            processed++;
            if (processed === tags.length && !hasError) {
              callback(null);
            }
          });
        });
      });
    });
  });
}

// POST a new post
apiRouter.post('/posts', requireAdmin, (req, res) => {
  console.log('[POST /api/posts] Received request to create a new post.');
  console.log('[POST /api/posts] Body:', req.body);

  const { title, content, excerpt, category, tags = [], status = 'draft', layout_type = 'record' } = req.body;

  if (!title || !content) {
    res.status(400).json({ "error": "Missing required fields: title, content" });
    return;
  }

  const sql = 'INSERT INTO posts (title, content, excerpt, category, status, author, layout_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))';
  const params = [title, content, excerpt, category || null, status, 'Koimsurai', layout_type];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('[POST /api/posts] Database error:', err.message);
      res.status(400).json({ "error": err.message });
      return;
    }

    const postId = this.lastID;
    console.log(`[POST /api/posts] Successfully inserted post with ID: ${postId}`);

    // 處理標籤
    manageTags(postId, tags, (tagErr) => {
      if (tagErr) {
        console.error('[POST /api/posts] Tag management error:', tagErr);
        res.status(400).json({ "error": tagErr.message });
        return;
      }

      res.status(201).json({
        "message": "success",
        "data": { id: postId, title, content, excerpt, category, tags, status }
      });
    });
  });
});

// PUT (update) a post
apiRouter.put('/posts/:id', requireAdmin, (req, res) => {
  const { title, content, excerpt, category, tags = [], status, layout_type } = req.body;
  const sql = `
    UPDATE posts SET 
      title = COALESCE(?, title), 
      content = COALESCE(?, content), 
      excerpt = COALESCE(?, excerpt),
      category = COALESCE(?, category),
      status = COALESCE(?, status),
      layout_type = COALESCE(?, layout_type),
      updated_at = datetime("now")
    WHERE id = ?
  `;
  const params = [title, content, excerpt, category, status, layout_type, req.params.id];

  db.run(sql, params, function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Post not found" });
      return;
    }

    // 處理標籤
    manageTags(req.params.id, tags, (tagErr) => {
      if (tagErr) {
        console.error('[PUT /api/posts] Tag management error:', tagErr);
        res.status(400).json({ "error": tagErr.message });
        return;
      }

      res.json({
        "message": "success",
        "changes": this.changes
      });
    });
  });
});

// PATCH post status
apiRouter.patch('/posts/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;

  if (!status || !['published', 'draft'].includes(status)) {
    return res.status(400).json({ error: '無效的狀態值，必須是 published 或 draft' });
  }

  const sql = 'UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
  db.run(sql, [status, req.params.id], function (err) {
    if (err) {
      console.error('更新文章狀態錯誤:', err);
      res.status(400).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ message: '找不到文章' });
      return;
    }
    res.json({
      message: '狀態更新成功',
      status: status,
      changes: this.changes
    });
  });
});

// DELETE a post
apiRouter.delete('/posts/:id', requireAdmin, (req, res) => {
  // 先清理 post_tags 關聯
  db.run('DELETE FROM post_tags WHERE post_id = ?', [req.params.id], (tagErr) => {
    if (tagErr) {
      return res.status(500).json({ error: tagErr.message });
    }
    const sql = 'DELETE FROM posts WHERE id = ?';
    db.run(sql, req.params.id, function (err) {
      if (err) {
        res.status(400).json({ "error": err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ "message": "Post not found" });
        return;
      }
      res.json({ "message": "deleted", "changes": this.changes });
    });
  });
});

// --- Comment Routes ---

// GET comments for a post (public - only approved)
apiRouter.get('/posts/:id/comments', (req, res) => {
  const sql = "SELECT * FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC";
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    res.json({
      "message": "success",
      "comments": rows
    });
  });
});

// POST a new comment (public - with keyword filter + IP blacklist)
apiRouter.post('/posts/:id/comments', (req, res) => {
  const { author, content, captcha, email, website, avatar_url, provider, parent_id } = req.body;
  if (!author || !content) {
    return res.status(400).json({ "error": "Author and content are required" });
  }

  // 檢查是否為登入用戶（帶有 Bearer token）
  let isOAuthUser = false;
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
      if (decoded.userId && decoded.provider) {
        isOAuthUser = true;
      }
    } catch (_) { }
  }

  // 簡易驗證碼檢查（僅匿名用戶）
  if (!isOAuthUser && captcha !== undefined) {
    const expectedAnswer = req.body.captchaAnswer;
    if (captcha != expectedAnswer) {
      return res.status(400).json({ "error": "驗證碼錯誤" });
    }
  }

  // 取得用戶 IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';

  // 檢查 IP 黑名單
  db.get("SELECT id FROM ip_blacklist WHERE ip = ?", [ip], (err, blocked) => {
    if (blocked) {
      return res.status(403).json({ "error": "您的留言權限已被限制" });
    }

    // 檢查關鍵字過濾（使用快取）
    getKeywordFilters().then(filters => {
      const lowerContent = (content + ' ' + author).toLowerCase();
      let matchedAction = null;
      if (filters) {
        for (const f of filters) {
          if (lowerContent.includes(f.keyword.toLowerCase())) {
            matchedAction = f.action;
            break;
          }
        }
      }

      if (matchedAction === 'reject') {
        return res.status(400).json({ "error": "留言內容包含不允許的詞彙" });
      }

      const status = matchedAction === 'spam' ? 'spam' : (isOAuthUser ? 'approved' : 'pending');

      const sql = 'INSERT INTO comments (post_id, author, content, email, website, ip, status, is_admin, avatar_url, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)';
      const params = [req.params.id, author, content, email || '', website || '', ip, status, avatar_url || '', parent_id || null];

      db.run(sql, params, function (err) {
        if (err) {
          res.status(400).json({ "error": err.message });
          return;
        }
        res.status(201).json({
          "message": "success",
          "id": this.lastID,
          "status": status
        });
      });
    });
  });
});

// POST like a comment
apiRouter.post('/comments/:id/like', (req, res) => {
  const sql = 'UPDATE comments SET likes = likes + 1 WHERE id = ?';
  db.run(sql, [req.params.id], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Comment not found" });
      return;
    }

    db.get('SELECT likes FROM comments WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        res.status(500).json({ "error": err.message });
        return;
      }
      res.json({
        "message": "success",
        "likes": row.likes
      });
    });
  });
});

// ═══════════════════════════════
// Admin Comment Management Routes
// ═══════════════════════════════

// GET all comments (admin)
apiRouter.get('/admin/comments', requireAdmin, (req, res) => {
  const { status, post_id, search, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let where = '1=1';
  const params = [];

  if (status && status !== 'all') {
    where += ' AND c.status = ?';
    params.push(status);
  }
  if (post_id) {
    where += ' AND c.post_id = ?';
    params.push(post_id);
  }
  if (search) {
    where += ' AND (c.content LIKE ? OR c.author LIKE ? OR c.ip LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count query
  db.get(`SELECT COUNT(*) as total FROM comments c WHERE ${where}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });

    const countParams = [...params];
    params.push(parseInt(limit), parseInt(offset));

    const sql = `
      SELECT c.*, p.title as post_title
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // Get status counts
      db.all(`
        SELECT status, COUNT(*) as count FROM comments GROUP BY status
      `, [], (err, statusCounts) => {
        const counts = { pending: 0, approved: 0, spam: 0, trash: 0 };
        if (statusCounts) {
          statusCounts.forEach(s => { counts[s.status] = s.count; });
        }

        res.json({
          comments: rows,
          total: countRow.total,
          page: parseInt(page),
          limit: parseInt(limit),
          counts
        });
      });
    });
  });
});

// PATCH comment status (approve / spam / trash / pending)
apiRouter.patch('/admin/comments/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'approved', 'spam', 'trash'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.run('UPDATE comments SET status = ? WHERE id = ?', [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Comment not found' });
    res.json({ message: 'success' });
  });
});

// PATCH batch comment status
apiRouter.patch('/admin/comments/batch/status', requireAdmin, (req, res) => {
  const { ids, status } = req.body;
  const validStatuses = ['pending', 'approved', 'spam', 'trash'];
  if (!Array.isArray(ids) || !ids.length || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE comments SET status = ? WHERE id IN (${placeholders})`, [status, ...ids], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success', affected: this.changes });
  });
});

// PUT edit comment content (admin)
apiRouter.put('/admin/comments/:id', requireAdmin, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  db.run('UPDATE comments SET content = ? WHERE id = ?', [content, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Comment not found' });
    res.json({ message: 'success' });
  });
});

// DELETE comment permanently
apiRouter.delete('/admin/comments/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM comments WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Comment not found' });
    res.json({ message: 'success' });
  });
});

// POST admin reply to comment
apiRouter.post('/admin/comments/:id/reply', requireAdmin, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  // 先取得原留言的 post_id
  db.get('SELECT post_id FROM comments WHERE id = ?', [req.params.id], (err, parent) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!parent) return res.status(404).json({ error: 'Parent comment not found' });

    const sql = `INSERT INTO comments (post_id, author, content, status, is_admin, parent_id, ip) VALUES (?, '站長', ?, 'approved', 1, ?, '')`;
    db.run(sql, [parent.post_id, content, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'success', id: this.lastID });
    });
  });
});

// ── IP Blacklist ──

apiRouter.get('/admin/blacklist', requireAdmin, (req, res) => {
  db.all('SELECT * FROM ip_blacklist ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ blacklist: rows });
  });
});

apiRouter.post('/admin/blacklist', requireAdmin, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP is required' });
  db.run('INSERT OR IGNORE INTO ip_blacklist (ip, reason) VALUES (?, ?)', [ip, reason || ''], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: 'success', id: this.lastID });
  });
});

apiRouter.delete('/admin/blacklist/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM ip_blacklist WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success' });
  });
});

// ── Keyword Filters ──

apiRouter.get('/admin/keyword-filters', requireAdmin, (req, res) => {
  db.all('SELECT * FROM keyword_filters ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ filters: rows });
  });
});

apiRouter.post('/admin/keyword-filters', requireAdmin, (req, res) => {
  const { keyword, action } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });
  const validActions = ['spam', 'reject'];
  db.run('INSERT OR IGNORE INTO keyword_filters (keyword, action) VALUES (?, ?)',
    [keyword, validActions.includes(action) ? action : 'spam'], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      invalidateKeywordFiltersCache();
      res.status(201).json({ message: 'success', id: this.lastID });
    });
});

apiRouter.delete('/admin/keyword-filters/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM keyword_filters WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    invalidateKeywordFiltersCache();
    res.json({ message: 'success' });
  });
});

// ══════════════════════════════════════════
//  OAuth 第三方登入
// ══════════════════════════════════════════

const OAUTH = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
  },
};

// 取得 OAuth 設定（給前端用，不含 secret）
apiRouter.get('/auth/providers', (req, res) => {
  res.json({
    google: { clientId: OAUTH.google.clientId, enabled: !!OAUTH.google.clientId },
    github: { clientId: OAUTH.github.clientId, enabled: !!OAUTH.github.clientId },
  });
});

// Google OAuth 回調
apiRouter.post('/auth/google/callback', async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // 交換 token
    const tokenRes = await axios.post(OAUTH.google.tokenUrl, {
      code,
      client_id: OAUTH.google.clientId,
      client_secret: OAUTH.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const accessToken = tokenRes.data.access_token;

    // 取得使用者資訊
    const userRes = await axios.get(OAUTH.google.userUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { id, name, email, picture } = userRes.data;

    // 寫入或更新資料庫
    const user = await upsertOAuthUser('google', String(id), name, email || '', picture || '');
    const token = jwt.sign({ userId: user.id, provider: 'google', displayName: user.display_name, avatar: user.avatar_url, role: user.role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user.id, displayName: user.display_name, email: user.email, avatar: user.avatar_url, provider: 'google', role: user.role || 'USER' } });
  } catch (err) {
    console.error('[OAuth Google] Error:', err.response?.data || err.message);
    res.status(500).json({ error: '登入失敗' });
  }
});

// GitHub OAuth 回調
apiRouter.post('/auth/github/callback', async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // 交換 token
    const tokenRes = await axios.post(OAUTH.github.tokenUrl, {
      code,
      client_id: OAUTH.github.clientId,
      client_secret: OAUTH.github.clientSecret,
      redirect_uri: redirectUri,
    }, { headers: { Accept: 'application/json' } });
    const accessToken = tokenRes.data.access_token;

    // 取得使用者資訊
    const userRes = await axios.get(OAUTH.github.userUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'koimsurai-app' },
    });
    const { id, login, name, email, avatar_url } = userRes.data;

    // 若無 email，取得主要 email
    let userEmail = email || '';
    if (!userEmail) {
      try {
        const emailRes = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'koimsurai-app' },
        });
        const primary = emailRes.data.find(e => e.primary);
        if (primary) userEmail = primary.email;
      } catch (_) { }
    }

    const displayName = name || login;
    const user = await upsertOAuthUser('github', String(id), displayName, userEmail, avatar_url || '');
    const token = jwt.sign({ userId: user.id, provider: 'github', displayName: user.display_name, avatar: user.avatar_url, role: user.role || 'USER' }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user.id, displayName: user.display_name, email: user.email, avatar: user.avatar_url, provider: 'github', role: user.role || 'USER' } });
  } catch (err) {
    console.error('[OAuth GitHub] Error:', err.response?.data || err.message);
    res.status(500).json({ error: '登入失敗' });
  }
});

// 驗證 user token（前端用來恢復 session）
apiRouter.get('/auth/me', (req, res) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    // 如果是 OAuth user token（有 userId + provider）
    if (decoded.userId && decoded.provider) {
      db.get('SELECT * FROM oauth_users WHERE id = ?', [decoded.userId], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found' });
        // 如果是關聯帳號，回傳主帳號資料
        if (user.linked_to) {
          db.get('SELECT * FROM oauth_users WHERE id = ?', [user.linked_to], (err2, primary) => {
            if (err2 || !primary) return res.json({ id: user.id, displayName: user.display_name, email: user.email, avatar: user.avatar_url, provider: user.provider, role: user.role || 'USER' });
            res.json({ id: primary.id, displayName: primary.display_name, email: primary.email, avatar: primary.avatar_url, provider: primary.provider, role: primary.role || 'USER' });
          });
        } else {
          res.json({ id: user.id, displayName: user.display_name, email: user.email, avatar: user.avatar_url, provider: user.provider, role: user.role || 'USER' });
        }
      });
    } else if (decoded.username) {
      // 舊版管理員 token（向下相容）
      res.json({ id: 0, displayName: decoded.username, email: '', avatar: '', provider: 'admin', role: 'OWNER', isAdmin: true });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 登出（前端清除 token 即可，這裡僅用作紀錄）
apiRouter.post('/auth/logout', (req, res) => {
  res.json({ message: 'ok' });
});

// ══════════════════════════════════════════
//  用戶管理 API（僅 OWNER）
// ══════════════════════════════════════════

// 取得所有用戶列表
apiRouter.get('/admin/users', requireOwner, (req, res) => {
  db.all('SELECT id, provider, provider_id, display_name, email, avatar_url, role, linked_to, created_at, updated_at FROM oauth_users ORDER BY created_at DESC', [], (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ users });
  });
});

// 修改用戶角色
apiRouter.put('/admin/users/:id/role', requireOwner, (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;
  const validRoles = ['USER', 'ADMIN', 'OWNER'];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: '無效的角色，允許值：USER, ADMIN, OWNER' });
  }

  // 不能修改自己的角色
  if (req.user.dbUser && req.user.dbUser.id === parseInt(userId)) {
    return res.status(400).json({ error: '不能修改自己的角色' });
  }

  db.run('UPDATE oauth_users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '用戶不存在' });
    res.json({ message: '角色更新成功', role });
  });
});

// OWNER 自動識別 email
const OWNER_EMAIL = 'timo9378@gmail.com';

// Upsert OAuth user helper（支援 email-based 帳號關聯，先搶先贏 + role 管理）
function upsertOAuthUser(provider, providerId, displayName, email, avatarUrl) {
  return new Promise((resolve, reject) => {
    // 判斷是否為 OWNER
    const autoRole = (email && email.toLowerCase() === OWNER_EMAIL.toLowerCase()) ? 'OWNER' : 'USER';

    // 1. 先按 (provider, provider_id) 查找
    db.get('SELECT * FROM oauth_users WHERE provider = ? AND provider_id = ?', [provider, providerId], (err, existing) => {
      if (err) return reject(err);

      if (existing) {
        // 已有此 provider 紀錄 → 更新（但不覆蓋 role，除非是 OWNER email）
        const updateRole = autoRole === 'OWNER' ? 'OWNER' : existing.role;
        db.run('UPDATE oauth_users SET display_name = ?, email = ?, avatar_url = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [displayName, email, avatarUrl, updateRole, existing.id], (err2) => {
            if (err2) return reject(err2);
            // 如果有 linked_to，回傳主帳號的資料
            if (existing.linked_to) {
              db.get('SELECT * FROM oauth_users WHERE id = ?', [existing.linked_to], (err3, primary) => {
                if (err3 || !primary) return resolve({ ...existing, display_name: displayName, email, avatar_url: avatarUrl, role: updateRole });
                resolve(primary);
              });
            } else {
              resolve({ ...existing, display_name: displayName, email, avatar_url: avatarUrl, role: updateRole });
            }
          });
        return;
      }

      // 2. 沒有此 provider 紀錄 → 用 email 查找已有帳號
      if (email) {
        db.get('SELECT * FROM oauth_users WHERE email = ? AND email != "" AND linked_to IS NULL', [email], (err2, sameEmailUser) => {
          if (err2) return reject(err2);

          if (sameEmailUser) {
            // 同 email 已存在 → 建立新紀錄並連結到原帳號
            // 如果是 OWNER email，確保主帳號也是 OWNER
            if (autoRole === 'OWNER' && sameEmailUser.role !== 'OWNER') {
              db.run('UPDATE oauth_users SET role = ? WHERE id = ?', ['OWNER', sameEmailUser.id]);
              sameEmailUser.role = 'OWNER';
            }
            db.run('INSERT INTO oauth_users (provider, provider_id, display_name, email, avatar_url, role, linked_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [provider, providerId, displayName, email, avatarUrl, autoRole, sameEmailUser.id], function (err3) {
                if (err3) return reject(err3);
                resolve(sameEmailUser);
              });
          } else {
            // 全新用戶
            db.run('INSERT INTO oauth_users (provider, provider_id, display_name, email, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)',
              [provider, providerId, displayName, email, avatarUrl, autoRole], function (err3) {
                if (err3) return reject(err3);
                resolve({ id: this.lastID, provider, provider_id: providerId, display_name: displayName, email, avatar_url: avatarUrl, role: autoRole });
              });
          }
        });
      } else {
        // 無 email → 直接新建
        db.run('INSERT INTO oauth_users (provider, provider_id, display_name, email, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)',
          [provider, providerId, displayName, email, avatarUrl, autoRole], function (err2) {
            if (err2) return reject(err2);
            resolve({ id: this.lastID, provider, provider_id: providerId, display_name: displayName, email, avatar_url: avatarUrl, role: autoRole });
          });
      }
    });
  });
}

// --- Newsletter Routes ---

// POST subscribe to newsletter
apiRouter.post('/newsletter/subscribe', (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ "error": "Email is required" });
  }

  // 簡單的 email 驗證
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ "error": "Invalid email format" });
  }

  const token = genUnsubToken();
  const sql = 'INSERT INTO newsletter_subscribers (email, name, status, unsubscribe_token) VALUES (?, ?, ?, ?)';
  const params = [email, name || null, 'active', token];

  db.run(sql, params, function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: newsletter_subscribers.email')) {
        // 已經訂閱：如果是 unsubscribed 的，重新激活並補新 token
        db.run(
          `UPDATE newsletter_subscribers
           SET status = 'active',
               unsubscribed_at = NULL,
               unsubscribe_token = COALESCE(unsubscribe_token, ?)
           WHERE email = ? AND status != 'active'`,
          [token, email],
          function (updErr) {
            if (updErr) return res.status(400).json({ error: updErr.message });
            if (this.changes > 0) {
              return res.status(200).json({ message: 'Re-subscribed to newsletter' });
            }
            return res.status(400).json({ error: 'This email is already subscribed' });
          }
        );
        return;
      }
      res.status(400).json({ "error": err.message });
      return;
    }
    res.status(201).json({
      "message": "Successfully subscribed to newsletter",
      "id": this.lastID
    });
  });
});

// POST unsubscribe from newsletter — supports email OR token (one-click)
apiRouter.post('/newsletter/unsubscribe', (req, res) => {
  const { email, token } = req.body;

  if (!email && !token) {
    return res.status(400).json({ "error": "Email or token is required" });
  }

  const sql = token
    ? 'UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = datetime("now") WHERE unsubscribe_token = ?'
    : 'UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = datetime("now") WHERE email = ?';
  const param = token || email;

  db.run(sql, ['unsubscribed', param], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Subscriber not found" });
      return;
    }
    res.json({ "message": "Successfully unsubscribed from newsletter" });
  });
});

// GET subscriber info by token (for /unsubscribe confirmation page)
apiRouter.get('/newsletter/by-token/:token', (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ error: 'token required' });
  db.get(
    'SELECT email, name, status FROM newsletter_subscribers WHERE unsubscribe_token = ?',
    [token],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'invalid token' });
      res.json(row);
    }
  );
});

// POST /admin/posts/:id/send-newsletter — admin manual broadcast
apiRouter.post('/admin/posts/:id/send-newsletter', requireAdmin, (req, res) => {
  if (!isMailerConfigured()) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured on server' });
  }
  const { id } = req.params;
  db.get(
    'SELECT id, title, excerpt, status FROM posts WHERE id = ?',
    [id],
    (err, post) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!post) return res.status(404).json({ error: 'post not found' });
      if (post.status !== 'published') {
        return res.status(400).json({ error: 'only published posts can be sent' });
      }
      db.all(
        'SELECT email, name, unsubscribe_token FROM newsletter_subscribers WHERE status = ? AND unsubscribe_token IS NOT NULL',
        ['active'],
        async (subErr, subscribers) => {
          if (subErr) return res.status(500).json({ error: subErr.message });
          if (!subscribers.length) {
            return res.json({ sent: 0, failed: 0, message: 'no active subscribers' });
          }
          const result = await sendNewsletter({ post, subscribers });
          res.json({ message: 'newsletter dispatched', ...result });
        }
      );
    }
  );
});

// GET newsletter subscribers (admin only)
apiRouter.get('/newsletter/subscribers', requireAdmin, (req, res) => {
  const { page = 1, limit = 50, status = 'active' } = req.query;
  const offset = (page - 1) * limit;

  const sql = 'SELECT * FROM newsletter_subscribers WHERE status = ? ORDER BY subscribed_at DESC LIMIT ? OFFSET ?';
  db.all(sql, [status, parseInt(limit), parseInt(offset)], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // 計算總數
    db.get('SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status = ?', [status], (countErr, countRow) => {
      if (countErr) {
        res.status(500).json({ error: countErr.message });
        return;
      }

      res.json({
        message: "success",
        subscribers: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countRow.total,
          totalPages: Math.ceil(countRow.total / limit)
        }
      });
    });
  });
});

// --- Steam API Proxy ---

// GET Steam player summary
// 整合卡：official summary + level + badges + miniprofile 個人化（背景影片 / 頭像框 / 動畫頭像）
// 抓取的個人化資料來自非官方端點 steamcommunity.com/miniprofile，Steam 改版時可能失效
// 快取策略：stale-while-revalidate
//   - REFRESH_AFTER 過後在背景重抓；新版本驗證通過才覆蓋舊值
//   - 任何失敗（rate limit / 改版 / 網路）都保留現有快取，避免畫面破掉
let _steamProfileCache = null; // { data, fetchedAt, lastTriedAt }
let _steamProfileInflight = null;
const STEAM_PROFILE_REFRESH_AFTER = 30 * 60 * 1000; // 半小時嘗試重抓一次
const STEAM_PROFILE_RETRY_BACKOFF = 5 * 60 * 1000;  // 失敗後 5 分鐘內不重試
function _fetchHttps(url, asJson, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
    };
    https.get(opts, (apiRes) => {
      let data = '';
      apiRes.on('data', (c) => { data += c; });
      apiRes.on('end', () => {
        if (asJson) { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
        else resolve(data);
      });
    }).on('error', reject);
  });
}
function _parseMiniProfile(html) {
  if (!html) return {};
  const out = {};
  // 動畫底圖 nameplate（webm + mp4 fallback）
  const nameplateBlock = html.match(/<video class=["']miniprofile_nameplate[^>]*>([\s\S]*?)<\/video>/i);
  if (nameplateBlock) {
    const webm = nameplateBlock[1].match(/src=["']([^"']+\.webm)["']/i);
    const mp4 = nameplateBlock[1].match(/src=["']([^"']+\.mp4)["']/i);
    if (webm) out.nameplateWebm = webm[1];
    if (mp4) out.nameplateMp4 = mp4[1];
  }
  // 頭像框 PNG
  const frame = html.match(/playersection_avatar_frame[^>]*>\s*<img\s+src=["']([^"']+)["']/i);
  if (frame) out.avatarFrame = frame[1];
  // 動畫頭像 GIF（個人化購買後才有）— 注意要排除 _frame
  const animatedAvatar = html.match(/playersection_avatar(?!_frame)\s+[^"']*["'][^>]*>\s*<img\s+src=["']([^"']+)["']/i);
  if (animatedAvatar) out.animatedAvatar = animatedAvatar[1];
  // 主徽章
  const featured = html.match(/<div class=["']miniprofile_featuredcontainer["']>\s*<img src=["']([^"']+)["'][^>]*class=["']badge_icon["']>\s*<div class=["']description["']>\s*<div class=["']name["']>([^<]+)<\/div>\s*<div class=["']xp["']>([^<]+)<\/div>/i);
  if (featured) {
    out.featuredBadge = { icon: featured[1], name: featured[2].trim(), xp: featured[3].trim() };
  }
  return out;
}
async function _refreshSteamProfile() {
  // 同一時間只跑一個重抓
  if (_steamProfileInflight) return _steamProfileInflight;
  _steamProfileInflight = (async () => {
    let accountId;
    try { accountId = (BigInt(STEAM_ID) - 76561197960265728n).toString(); }
    catch { throw new Error('invalid STEAM_ID'); }

    const [player, level, badges, miniHtml] = await Promise.all([
      _fetchHttps(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`, true),
      _fetchHttps(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}`, true),
      _fetchHttps(`https://api.steampowered.com/IPlayerService/GetBadges/v1/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}`, true),
      _fetchHttps(`https://steamcommunity.com/miniprofile/${accountId}`, false).catch(() => ''),
    ]);

    // 驗證：必要欄位拿到才算成功，否則拋錯讓上層保留舊快取
    const playerObj = player?.response?.players?.[0];
    const lvl = level?.response?.player_level;
    if (!playerObj || lvl == null) {
      throw new Error('incomplete response from Steam');
    }
    const customization = _parseMiniProfile(miniHtml);
    return {
      player: playerObj,
      level: lvl,
      xp: badges?.response?.player_xp ?? 0,
      xpToNext: badges?.response?.player_xp_needed_to_level_up ?? 0,
      badgeCount: Array.isArray(badges?.response?.badges) ? badges.response.badges.length : 0,
      customization,
      profileUrl: `https://steamcommunity.com/profiles/${STEAM_ID}`,
    };
  })()
    .then((data) => {
      _steamProfileCache = { data, fetchedAt: Date.now(), lastTriedAt: Date.now() };
      _steamProfileInflight = null;
      return data;
    })
    .catch((e) => {
      // 失敗只更新 lastTriedAt，保留 data；後續 backoff 內不會再試
      if (_steamProfileCache) {
        _steamProfileCache.lastTriedAt = Date.now();
      }
      _steamProfileInflight = null;
      console.warn('[/api/steam/profile] refresh failed, keeping stale cache:', e.message);
      throw e;
    });
  return _steamProfileInflight;
}

apiRouter.get('/steam/profile', async (req, res) => {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.status(500).json({ error: 'Steam API 未配置' });
  }
  const now = Date.now();
  const cached = _steamProfileCache;

  // 已有快取：依新鮮度決定是否背景重抓
  if (cached) {
    const sinceFetch = now - cached.fetchedAt;
    const sinceTry = now - (cached.lastTriedAt || cached.fetchedAt);
    if (sinceFetch >= STEAM_PROFILE_REFRESH_AFTER && sinceTry >= STEAM_PROFILE_RETRY_BACKOFF) {
      // 不 await — 直接回舊資料，背景重抓
      _refreshSteamProfile().catch(() => {});
    }
    return res.json({ ...cached.data, _cachedAt: cached.fetchedAt });
  }

  // 第一次：必須等抓到才回
  try {
    const data = await _refreshSteamProfile();
    res.json({ ...data, _cachedAt: _steamProfileCache.fetchedAt });
  } catch (e) {
    res.status(503).json({ error: 'steam fetch failed, no cache yet', message: e.message });
  }
});

apiRouter.get('/steam/player', (req, res) => {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.status(500).json({
      error: 'Steam API 未配置',
      message: '請在 server/.env 中設置 STEAM_API_KEY 和 STEAM_ID'
    });
  }

  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`;

  https.get(url, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to parse Steam API response' });
      }
    });
  }).on('error', (error) => {
    console.error('Steam API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Steam data' });
  });
});

// GET Steam recently played games
apiRouter.get('/steam/recent-games', (req, res) => {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.status(500).json({
      error: 'Steam API 未配置',
      message: '請在 server/.env 中設置 STEAM_API_KEY 和 STEAM_ID'
    });
  }

  const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`;

  https.get(url, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to parse Steam API response' });
      }
    });
  }).on('error', (error) => {
    console.error('Steam API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Steam data' });
  });
});

// GET Steam owned games (所有擁有的遊戲)
apiRouter.get('/steam/owned-games', (req, res) => {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.status(500).json({
      error: 'Steam API 未配置',
      message: '請在 server/.env 中設置 STEAM_API_KEY 和 STEAM_ID'
    });
  }

  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&include_appinfo=true&include_played_free_games=true&format=json`;

  https.get(url, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to parse Steam API response' });
      }
    });
  }).on('error', (error) => {
    console.error('Steam API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Steam data' });
  });
});

// GET Steam game achievements (特定遊戲的成就)
apiRouter.get('/steam/achievements/:appid', (req, res) => {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.status(500).json({
      error: 'Steam API 未配置',
      message: '請在 server/.env 中設置 STEAM_API_KEY 和 STEAM_ID'
    });
  }

  const { appid } = req.params;
  const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`;

  https.get(url, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to parse Steam API response' });
      }
    });
  }).on('error', (error) => {
    console.error('Steam API Error:', error);
    res.status(500).json({ error: 'Failed to fetch Steam achievements data' });
  });
});

// --- Spotify API Routes ---
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://koimsurai.com/api/spotify/callback';

// Spotify 存取權杖快取
let spotifyAccessToken = null;
let spotifyTokenExpiry = null;

// Spotify OAuth 授權端點 - 初始授權頁面
apiRouter.get('/spotify/login', (req, res) => {
  const scope = 'user-read-recently-played user-top-read user-read-private user-read-email user-read-currently-playing user-read-playback-state';
  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: scope,
      redirect_uri: SPOTIFY_REDIRECT_URI
    });

  res.redirect(authUrl);
});

// Spotify OAuth 回調端點 - 處理授權回調
apiRouter.get('/spotify/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`授權失敗: ${error}`);
  }

  if (!code) {
    return res.status(400).send('缺少授權碼');
  }

  try {
    // 使用授權碼換取 access token 和 refresh token
    const response = await axios.post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    // 顯示 refresh_token (只需要設定一次)
    res.send(`
      <html>
        <head>
          <title>Spotify 授權成功</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container {
              background: white;
              border-radius: 12px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              padding: 40px;
              max-width: 700px;
              width: 100%;
            }
            h1 {
              color: #1DB954;
              margin-top: 0;
              font-size: 32px;
            }
            .token-box {
              background: #f5f5f5;
              border: 2px solid #1DB954;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
              word-break: break-all;
              font-family: 'Courier New', monospace;
              font-size: 14px;
              line-height: 1.6;
            }
            .label {
              font-weight: bold;
              color: #333;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .instruction {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .instruction h2 {
              margin-top: 0;
              color: #856404;
              font-size: 20px;
            }
            .instruction ol {
              margin: 10px 0;
              padding-left: 20px;
            }
            .instruction li {
              margin: 8px 0;
              color: #856404;
            }
            .code {
              background: #272822;
              color: #f8f8f2;
              padding: 15px;
              border-radius: 6px;
              overflow-x: auto;
              margin: 10px 0;
            }
            button {
              background: #1DB954;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 24px;
              cursor: pointer;
              font-size: 16px;
              font-weight: bold;
              margin-top: 20px;
              transition: background 0.3s;
            }
            button:hover {
              background: #1ed760;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Spotify 授權成功!</h1>
            
            <div class="instruction">
              <h2>📝 設定步驟:</h2>
              <ol>
                <li>複製下方的 <strong>REFRESH_TOKEN</strong></li>
                <li>打開 <code>server/.env</code> 檔案</li>
                <li>新增或更新這一行:</li>
              </ol>
              <div class="code">SPOTIFY_REFRESH_TOKEN=你的_refresh_token</div>
              <ol start="4">
                <li>重啟後端服務器</li>
                <li>完成! Music 頁面就能正常顯示了 🎵</li>
              </ol>
            </div>

            <div class="token-box">
              <div class="label">🔑 REFRESH_TOKEN (請複製此值):</div>
              <div id="refreshToken">${refresh_token}</div>
            </div>

            <button onclick="copyToken()">📋 複製 Refresh Token</button>

            <script>
              function copyToken() {
                const token = document.getElementById('refreshToken').innerText;
                navigator.clipboard.writeText(token).then(() => {
                  alert('✅ Refresh Token 已複製到剪貼簿!');
                }).catch(err => {
                  console.error('複製失敗:', err);
                  alert('複製失敗,請手動選取並複製');
                });
              }
            </script>
          </div>
        </body>
      </html>
    `);

    console.log('\n=================================');
    console.log('🎵 Spotify 授權成功!');
    console.log('=================================');
    console.log('請將以下 REFRESH_TOKEN 加入 server/.env:');
    console.log(`SPOTIFY_REFRESH_TOKEN=${refresh_token}`);
    console.log('=================================\n');

  } catch (error) {
    console.error('Spotify callback error:', error.response?.data || error.message);
    res.status(500).send(`
      <html>
        <head><title>授權失敗</title></head>
        <body style="font-family: Arial; padding: 40px; background: #f44336; color: white;">
          <h1>❌ 授權失敗</h1>
          <p>錯誤訊息: ${error.message}</p>
          <p>請檢查 Spotify App 設定是否正確</p>
        </body>
      </html>
    `);
  }
});

// 取得 Spotify Access Token
const getSpotifyAccessToken = async () => {
  // 檢查是否有有效的快取 token
  if (spotifyAccessToken && spotifyTokenExpiry && Date.now() < spotifyTokenExpiry) {
    return spotifyAccessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error('Spotify credentials not configured');
  }

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token',
      `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    spotifyAccessToken = response.data.access_token;
    spotifyTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 提前 1 分鐘更新
    return spotifyAccessToken;
  } catch (error) {
    console.error('Spotify token error:', error.response?.data || error.message);
    throw error;
  }
};

// 獲取最近播放的歌曲
apiRouter.get('/spotify/recently-played', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
      params: {
        limit: 10
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Spotify recently played error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch Spotify recently played',
      details: error.response?.data || error.message
    });
  }
});

// 獲取正在播放的歌曲
apiRouter.get('/spotify/now-playing', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 204 = 沒有正在播放
    if (response.status === 204 || !response.data) {
      return res.json({ is_playing: false });
    }

    const data = response.data;
    res.json({
      is_playing: data.is_playing,
      item: data.item,
      progress_ms: data.progress_ms,
      currently_playing_type: data.currently_playing_type
    });
  } catch (error) {
    console.error('Spotify now playing error:', error.response?.data || error.message);
    // 如果是 token 錯誤或未設定，回傳非播放狀態
    if (error.message === 'Spotify credentials not configured') {
      return res.json({ is_playing: false, error: 'Spotify 未配置' });
    }
    res.json({ is_playing: false });
  }
});

// 獲取最常聽的曲風
// top-genres / top-tracks 快取與熔斷
// Spotify 2024/2025 持續縮緊未批准 app 的 /me/top/* 配額，頻繁打會被 429
const TOP_GENRES_TTL = 6 * 60 * 60 * 1000;   // 6 小時
const TOP_TRACKS_TTL = 60 * 60 * 1000;        // 1 小時（各 time_range 各自快取）
const SPOTIFY_TOP_COOLDOWN = 60 * 60 * 1000;  // 被限後暫停 1 小時
let topGenresCache = null;                    // { data, expiresAt }
const topTracksCache = new Map();             // time_range:limit -> { data, expiresAt }
let topDisabledUntil = 0;

apiRouter.get('/spotify/top-genres', async (req, res) => {
  const now = Date.now();
  if (topGenresCache && topGenresCache.expiresAt > now) {
    return res.json(topGenresCache.data);
  }
  if (topDisabledUntil > now) {
    if (topGenresCache) return res.json(topGenresCache.data);
    return res.status(429).json({ error: 'Spotify rate limited, try later' });
  }

  try {
    const token = await getSpotifyAccessToken();
    const artistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists', {
      params: { limit: 50, time_range: 'medium_term' },
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    });

    const genreCount = {};
    artistsResponse.data.items.forEach(artist => {
      artist.genres.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count }));

    const payload = { genres: topGenres };
    topGenresCache = { data: payload, expiresAt: now + TOP_GENRES_TTL };
    res.json(payload);
  } catch (error) {
    const status = error.response?.status;
    if (status === 403 || status === 429) {
      topDisabledUntil = now + SPOTIFY_TOP_COOLDOWN;
      console.warn(`[Spotify] top-genres 被限制 (${status})，暫停呼叫 1 小時`);
      if (topGenresCache) return res.json(topGenresCache.data);
    } else {
      console.error('Spotify top genres error:', error.response?.data || error.message);
    }
    res.status(status || 500).json({
      error: 'Failed to fetch Spotify top genres',
      details: error.response?.data || error.message
    });
  }
});

// 獲取最常聽的歌曲
apiRouter.get('/spotify/top-tracks', async (req, res) => {
  const { time_range = 'medium_term', limit = 20 } = req.query;
  const key = `${time_range}:${limit}`;
  const now = Date.now();

  const cached = topTracksCache.get(key);
  if (cached && cached.expiresAt > now) {
    return res.json(cached.data);
  }
  if (topDisabledUntil > now) {
    if (cached) return res.json(cached.data);
    return res.status(429).json({ error: 'Spotify rate limited, try later' });
  }

  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
      params: { limit, time_range },
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    });

    topTracksCache.set(key, { data: response.data, expiresAt: now + TOP_TRACKS_TTL });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status;
    if (status === 403 || status === 429) {
      topDisabledUntil = now + SPOTIFY_TOP_COOLDOWN;
      console.warn(`[Spotify] top-tracks 被限制 (${status})，暫停呼叫 1 小時`);
      if (cached) return res.json(cached.data);
    } else {
      console.error('Spotify top tracks error:', error.response?.data || error.message);
    }
    res.status(status || 500).json({
      error: 'Failed to fetch Spotify top tracks',
      details: error.response?.data || error.message
    });
  }
});

// Spotify audio-features 快取與熔斷器
// Spotify 在 2024 底將此 endpoint 限制為特定已批准 app，未批准 app 會持續收到 403/429
// 策略：24h 記憶體快取 + 失敗後暫停呼叫 1h，避免無意義的 API 轟炸
const AUDIO_FEATURES_CACHE = new Map(); // trackId -> { data, expiresAt }
const AUDIO_FEATURES_TTL = 24 * 60 * 60 * 1000; // 24 小時
let audioFeaturesDisabledUntil = 0; // 熔斷到期時間（毫秒）
const AUDIO_FEATURES_COOLDOWN = 60 * 60 * 1000; // 熔斷冷卻 1 小時

apiRouter.get('/spotify/audio-features', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'Missing track IDs' });

  const idList = ids.split(',').filter(Boolean);
  const now = Date.now();

  // 先撈快取命中的部分
  const cached = {};
  const missing = [];
  for (const id of idList) {
    const entry = AUDIO_FEATURES_CACHE.get(id);
    if (entry && entry.expiresAt > now) {
      cached[id] = entry.data;
    } else {
      missing.push(id);
    }
  }

  // 熔斷中 → 只回傳快取的，其餘給 null
  if (audioFeaturesDisabledUntil > now) {
    return res.json({
      audio_features: idList.map(id => cached[id] || null),
    });
  }

  // 全部命中快取 → 直接回傳
  if (missing.length === 0) {
    return res.json({ audio_features: idList.map(id => cached[id]) });
  }

  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get('https://api.spotify.com/v1/audio-features', {
      params: { ids: missing.join(',') },
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 10000,
    });

    // 寫入快取
    const expiresAt = now + AUDIO_FEATURES_TTL;
    (response.data.audio_features || []).forEach(f => {
      if (f && f.id) {
        AUDIO_FEATURES_CACHE.set(f.id, { data: f, expiresAt });
        cached[f.id] = f;
      }
    });

    res.json({ audio_features: idList.map(id => cached[id] || null) });
  } catch (error) {
    const status = error.response?.status;
    // 403/429 → 觸發熔斷，暫停呼叫 Spotify 1 小時
    if (status === 403 || status === 429) {
      audioFeaturesDisabledUntil = now + AUDIO_FEATURES_COOLDOWN;
      console.warn(`[Spotify] audio-features 被限制 (${status})，暫停呼叫 1 小時`);
    } else {
      console.error('Spotify audio features error:', error.response?.data || error.message);
    }
    // 優雅降級：回傳快取 + null 補齊
    res.json({ audio_features: idList.map(id => cached[id] || null) });
  }
});

// 獲取用戶資料
apiRouter.get('/spotify/me', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Spotify user error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch Spotify user data',
      details: error.response?.data || error.message
    });
  }
});

// --- WakaTime API Routes ---
const WAKATIME_API_KEY = process.env.WAKATIME_API_KEY;

// WakaTime API 認證 header 生成函數
const getWakaTimeAuthHeader = () => {
  // WakaTime 使用 Base64 編碼的 API key 作為 Basic Auth
  const base64Auth = Buffer.from(WAKATIME_API_KEY).toString('base64');
  return `Basic ${base64Auth}`;
};

// 獲取今日統計 (包含實際編碼時間)
apiRouter.get('/wakatime/today', async (req, res) => {
  if (!WAKATIME_API_KEY) {
    return res.status(500).json({
      error: 'WakaTime API 未配置',
      message: '請在 server/.env 中設置 WAKATIME_API_KEY'
    });
  }

  try {
    console.log('🔄 [WakaTime] 開始獲取今日數據...');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // 並行發起 API 請求
    const [summaryResponse, durationsResponse] = await Promise.all([
      axios.get('https://wakatime.com/api/v1/users/current/summaries', {
        params: { start: dateStr, end: dateStr },
        headers: { 'Authorization': getWakaTimeAuthHeader() },
        timeout: 10000
      }),
      axios.get('https://wakatime.com/api/v1/users/current/durations', {
        params: { date: dateStr },
        headers: { 'Authorization': getWakaTimeAuthHeader() },
        timeout: 10000
      })
    ]);
    console.log('✅ [WakaTime] 所有 API 請求成功。');

    // 從 durations 中提取第一個和最後一個時間
    const durations = durationsResponse.data.data || [];
    let actualStart = null;
    let actualEnd = null;
    if (durations.length > 0) {
      actualStart = durations.reduce((earliest, current) => {
        const currentTime = current.time;
        return !earliest || currentTime < earliest ? currentTime : earliest;
      }, null);

      actualEnd = durations.reduce((latest, current) => {
        const endTime = current.time + current.duration;
        return !latest || endTime > latest ? endTime : latest;
      }, null);
    }

    // 獲取 summaries API 的數據
    const summaryData = summaryResponse.data.data[0] || {};
    console.log('📊 [WakaTime] 從 summaries 獲取的總時間:', summaryData.grand_total?.text);

    // 合併最終結果
    const result = {
      data: [summaryData],
      start: summaryResponse.data.start,
      end: summaryResponse.data.end,
      actualCodingTime: {
        start: actualStart ? new Date(actualStart * 1000).toISOString() : null,
        end: actualEnd ? new Date(actualEnd * 1000).toISOString() : null,
        hasData: durations.length > 0
      }
    };

    console.log('📤 [WakaTime] 準備回傳給前端的最終數據 (部分): grand_total.text = ', result.data[0]?.grand_total?.text);
    res.json(result);

  } catch (error) {
    console.error('❌ [WakaTime] 處理 API 時發生錯誤:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch WakaTime today data',
      details: error.response?.data || error.message
    });
  }
});

// 獲取本週統計
apiRouter.get('/wakatime/week', async (req, res) => {
  if (!WAKATIME_API_KEY) {
    return res.status(500).json({
      error: 'WakaTime API 未配置',
      message: '請在 server/.env 中設置 WAKATIME_API_KEY'
    });
  }

  try {
    const response = await axios.get('https://wakatime.com/api/v1/users/current/stats/last_7_days', {
      headers: {
        'Authorization': getWakaTimeAuthHeader()
      },
      timeout: 10000
    });

    res.json(response.data);
  } catch (error) {
    console.error('WakaTime API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch WakaTime week data',
      details: error.response?.data || error.message
    });
  }
});

// 獲取專案統計
apiRouter.get('/wakatime/projects', async (req, res) => {
  if (!WAKATIME_API_KEY) {
    return res.status(500).json({
      error: 'WakaTime API 未配置',
      message: '請在 server/.env 中設置 WAKATIME_API_KEY'
    });
  }

  try {
    const response = await axios.get('https://wakatime.com/api/v1/users/current/stats/last_7_days', {
      headers: {
        'Authorization': getWakaTimeAuthHeader()
      },
      timeout: 10000
    });

    res.json(response.data);
  } catch (error) {
    console.error('WakaTime API Error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch WakaTime projects data',
      details: error.response?.data || error.message
    });
  }
});

// --- Books API Routes ---

// GET all books for admin (需要認證)
apiRouter.get('/admin/books', requireAdmin, (req, res) => {
  const { status, rating, year, search, sortBy = 'date_added_desc' } = req.query;

  let sql = 'SELECT * FROM books WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND reading_status = ?';
    params.push(status);
  }

  if (rating) {
    sql += ' AND rating = ?';
    params.push(parseInt(rating));
  }

  if (year) {
    sql += ' AND published_date LIKE ?';
    params.push(`${year}%`);
  }

  if (search) {
    sql += ' AND (title LIKE ? OR authors LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Sorting
  switch (sortBy) {
    case 'date_added_asc':
      sql += ' ORDER BY date_added ASC';
      break;
    case 'date_added_desc':
      sql += ' ORDER BY date_added DESC';
      break;
    case 'title_asc':
      sql += ' ORDER BY title ASC';
      break;
    case 'title_desc':
      sql += ' ORDER BY title DESC';
      break;
    case 'rating_desc':
      sql += ' ORDER BY rating DESC, date_added DESC';
      break;
    case 'published_date_desc':
      sql += ' ORDER BY published_date DESC';
      break;
    default:
      sql += ' ORDER BY date_added DESC';
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查詢書籍錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// GET all books with filtering and sorting
apiRouter.get('/books', (req, res) => {
  const { status, rating, year, search, sortBy = 'date_added_desc' } = req.query;

  let sql = 'SELECT * FROM books WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND reading_status = ?';
    params.push(status);
  }

  if (rating) {
    sql += ' AND rating = ?';
    params.push(parseInt(rating));
  }

  if (year) {
    sql += ' AND published_date LIKE ?';
    params.push(`${year}%`);
  }

  if (search) {
    sql += ' AND (title LIKE ? OR authors LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Sorting
  switch (sortBy) {
    case 'date_added_asc':
      sql += ' ORDER BY date_added ASC';
      break;
    case 'date_added_desc':
      sql += ' ORDER BY date_added DESC';
      break;
    case 'title_asc':
      sql += ' ORDER BY title ASC';
      break;
    case 'title_desc':
      sql += ' ORDER BY title DESC';
      break;
    case 'rating_desc':
      sql += ' ORDER BY rating DESC, date_added DESC';
      break;
    case 'published_date_desc':
      sql += ' ORDER BY published_date DESC';
      break;
    default:
      sql += ' ORDER BY date_added DESC';
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查詢書籍錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: 'success',
      books: rows
    });
  });
});

// GET a single book by id
apiRouter.get('/books/:id', (req, res) => {
  const sql = 'SELECT * FROM books WHERE id = ?';
  db.get(sql, [req.params.id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }
    res.json({
      message: 'success',
      book: row
    });
  });
});

// helper: 把 https.get 包成 Promise，避免 nested callback
function httpsGetJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Google Books 高解析度封面 URL 處理
function upgradeGoogleBooksCover(url) {
  if (!url) return '';
  let coverUrl = url
    .replace('&zoom=1', '&zoom=0')
    .replace('&edge=curl', '')
    .replace('&img=1', '&img=1&w=500&h=800');
  if (!coverUrl.includes('zoom=')) coverUrl += '&zoom=0';
  if (!coverUrl.includes('&w=')) coverUrl += '&w=500&h=800';
  return coverUrl;
}

// Google Books 搜尋
async function searchGoogleBooks(searchQuery) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=10`;
  try {
    const jsonData = await httpsGetJSON(url);
    if (!jsonData.items || jsonData.items.length === 0) return [];
    return jsonData.items.map((item) => {
      const v = item.volumeInfo;
      const isbn13 = v.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier;
      const isbn10 = v.industryIdentifiers?.find((id) => id.type === 'ISBN_10')?.identifier;
      let coverUrl = v.imageLinks
        ? (v.imageLinks.large || v.imageLinks.medium || v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || '')
        : '';
      coverUrl = upgradeGoogleBooksCover(coverUrl);
      return {
        isbn: isbn13 || isbn10 || '',
        title: v.title || '',
        authors: v.authors ? v.authors.join(', ') : '',
        publisher: v.publisher || '',
        published_date: v.publishedDate || '',
        description: v.description || '',
        cover_url: coverUrl,
        page_count: v.pageCount || null,
        language: v.language || '',
        categories: v.categories ? v.categories.join(', ') : '',
        source: 'google',
      };
    });
  } catch (e) {
    console.error('[Google Books] error:', e.message);
    return [];
  }
}

// OpenLibrary 搜尋 (給 Google Books 覆蓋不到的台灣本地書當 fallback)
async function searchOpenLibrary(inputQuery, isISBN) {
  try {
    if (isISBN) {
      const cleanISBN = inputQuery.replace(/[-\s]/g, '');
      // ISBN lookup
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanISBN}&format=json&jscmd=data`;
      const data = await httpsGetJSON(url);
      const key = `ISBN:${cleanISBN}`;
      if (!data[key]) return [];
      const b = data[key];
      return [{
        isbn: cleanISBN,
        title: b.title || '',
        authors: (b.authors || []).map((a) => a.name).join(', '),
        publisher: (b.publishers || []).map((p) => p.name).join(', '),
        published_date: b.publish_date || '',
        description: b.notes || (b.excerpts && b.excerpts[0]?.text) || '',
        cover_url: b.cover?.large || b.cover?.medium || b.cover?.small || '',
        page_count: b.number_of_pages || null,
        language: '',
        categories: (b.subjects || []).slice(0, 5).map((s) => s.name).join(', '),
        source: 'openlibrary',
      }];
    } else {
      // 書名搜尋
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(inputQuery)}&limit=10`;
      const data = await httpsGetJSON(url);
      if (!data.docs || data.docs.length === 0) return [];
      return data.docs.slice(0, 10).map((d) => ({
        isbn: (d.isbn && d.isbn[0]) || '',
        title: d.title || '',
        authors: (d.author_name || []).join(', '),
        publisher: (d.publisher && d.publisher[0]) || '',
        published_date: d.first_publish_year ? String(d.first_publish_year) : '',
        description: '',
        cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
        page_count: d.number_of_pages_median || null,
        language: (d.language && d.language[0]) || '',
        categories: (d.subject || []).slice(0, 3).join(', '),
        source: 'openlibrary',
      }));
    }
  } catch (e) {
    console.error('[OpenLibrary] error:', e.message);
    return [];
  }
}

// Search books — Google Books 為主，OpenLibrary 補位（涵蓋台灣本地書）
apiRouter.get('/books/search/external', async (req, res) => {
  const { query, isbn } = req.query;
  if (!query && !isbn) {
    return res.status(400).json({ error: '請提供書名或 ISBN' });
  }

  const inputQuery = isbn || query;
  const isISBN = /^[\d-]{10,17}$/.test(inputQuery.replace(/\s/g, ''));
  const searchQuery = isISBN
    ? `isbn:${inputQuery.replace(/[-\s]/g, '')}`
    : inputQuery;

  console.log(`[Books API] 搜尋請求: ${inputQuery}, isISBN=${isISBN}`);

  try {
    // 先打 Google Books
    let books = await searchGoogleBooks(searchQuery);

    // Google 空就試 OpenLibrary
    if (books.length === 0) {
      console.log('[Books API] Google Books 0 結果 → fallback OpenLibrary');
      books = await searchOpenLibrary(inputQuery, isISBN);
    }

    res.json({ message: 'success', books });
  } catch (error) {
    console.error('[Books API] error:', error);
    res.status(500).json({ error: 'Failed to fetch book data' });
  }
});

// POST a new book (admin only)
apiRouter.post('/books', requireAdmin, (req, res) => {
  const {
    isbn, title, authors, publisher, published_date, description,
    cover_url, page_count, language, categories,
    reading_status = 'to-read', rating, personal_notes
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: '書名為必填欄位' });
  }

  const sql = `
    INSERT INTO books (
      isbn, title, authors, publisher, published_date, description,
      cover_url, page_count, language, categories,
      reading_status, rating, personal_notes,
      date_added, date_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;

  const params = [
    isbn, title, authors, publisher, published_date, description,
    cover_url, page_count, language, categories,
    reading_status, rating, personal_notes
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('新增書籍錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    res.status(201).json({
      message: 'success',
      book: {
        id: this.lastID,
        ...req.body
      }
    });
  });
});

// PUT (update) a book (admin only)
apiRouter.put('/books/:id', requireAdmin, (req, res) => {
  const {
    isbn, title, authors, publisher, published_date, description,
    cover_url, page_count, language, categories,
    reading_status, rating, personal_notes,
    date_started, date_finished
  } = req.body;

  const sql = `
    UPDATE books SET
      isbn = COALESCE(?, isbn),
      title = COALESCE(?, title),
      authors = COALESCE(?, authors),
      publisher = COALESCE(?, publisher),
      published_date = COALESCE(?, published_date),
      description = COALESCE(?, description),
      cover_url = COALESCE(?, cover_url),
      page_count = COALESCE(?, page_count),
      language = COALESCE(?, language),
      categories = COALESCE(?, categories),
      reading_status = COALESCE(?, reading_status),
      rating = COALESCE(?, rating),
      personal_notes = COALESCE(?, personal_notes),
      date_started = COALESCE(?, date_started),
      date_finished = COALESCE(?, date_finished),
      date_updated = datetime('now')
    WHERE id = ?
  `;

  const params = [
    isbn, title, authors, publisher, published_date, description,
    cover_url, page_count, language, categories,
    reading_status, rating, personal_notes,
    date_started, date_finished,
    req.params.id
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('更新書籍錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    if (this.changes === 0) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    res.json({
      message: 'success',
      changes: this.changes
    });
  });
});

// DELETE a book (admin only)
apiRouter.delete('/books/:id', requireAdmin, (req, res) => {
  const sql = 'DELETE FROM books WHERE id = ?';
  db.run(sql, [req.params.id], function (err) {
    if (err) {
      console.error('刪除書籍錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    if (this.changes === 0) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    res.json({
      message: 'deleted',
      changes: this.changes
    });
  });
});

// GET book statistics
apiRouter.get('/books/stats/summary', (req, res) => {
  const sql = `
    SELECT 
      COUNT(*) as total_books,
      COUNT(CASE WHEN reading_status = 'read' THEN 1 END) as books_read,
      COUNT(CASE WHEN reading_status = 'reading' THEN 1 END) as books_reading,
      COUNT(CASE WHEN reading_status = 'to-read' THEN 1 END) as books_to_read,
      AVG(CASE WHEN rating IS NOT NULL THEN rating END) as average_rating,
      SUM(CASE WHEN page_count IS NOT NULL THEN page_count ELSE 0 END) as total_pages
    FROM books
  `;

  db.get(sql, [], (err, stats) => {
    if (err) {
      console.error('查詢書籍統計錯誤:', err);
      res.status(500).json({ error: err.message });
      return;
    }

    res.json({
      message: 'success',
      stats: {
        ...stats,
        average_rating: stats.average_rating ? parseFloat(stats.average_rating.toFixed(1)) : null
      }
    });
  });
});

// --- GitHub API Proxy ---

// GET GitHub user info and recent commits
apiRouter.get('/github/user/:username', (req, res) => {
  const { username } = req.params;
  const options = {
    hostname: 'api.github.com',
    path: `/users/${username}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Personal-Website-Backend'
    }
  };

  https.get(options, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to parse GitHub API response' });
      }
    });
  }).on('error', (error) => {
    console.error('GitHub API Error:', error);
    res.status(500).json({ error: 'Failed to fetch GitHub data' });
  });
});

// Helper: fetch JSON from GitHub API
function ghFetch(path, ghToken) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': 'Personal-Website-Backend' };
    if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;
    https.get({ hostname: 'api.github.com', path, headers }, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// GET GitHub user events (commits, etc.) — enriched with commit messages
apiRouter.get('/github/events/:username', async (req, res) => {
  const { username } = req.params;
  const ghToken = process.env.GITHUB_TOKEN;

  try {
    const eventsPath = ghToken
      ? `/users/${username}/events?per_page=30`
      : `/users/${username}/events/public`;
    const events = await ghFetch(eventsPath, ghToken);

    if (!Array.isArray(events)) {
      return res.json(events || []);
    }

    // Enrich PushEvents that have empty commits
    const pushEvents = events.filter(
      e => e.type === 'PushEvent' && (!e.payload.commits || e.payload.commits.length === 0) && e.payload.before && e.payload.head
    );

    if (pushEvents.length > 0 && ghToken) {
      const enrichPromises = pushEvents.map(async (event) => {
        const repo = event.repo.name;
        const compareData = await ghFetch(
          `/repos/${repo}/compare/${event.payload.before}...${event.payload.head}`,
          ghToken
        );
        if (compareData && Array.isArray(compareData.commits)) {
          event.payload.commits = compareData.commits.map(c => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author,
          }));
          event.payload.size = compareData.commits.length;
        }
      });
      await Promise.all(enrichPromises);
    }

    res.json(events);
  } catch (error) {
    console.error('GitHub API Error:', error);
    res.status(500).json({ error: 'Failed to fetch GitHub data' });
  }
});

// 保留舊的基本認證端點作為兼容性
apiRouter.post('/posts/legacy', basicAuth, (req, res) => {
  console.log('[POST /api/posts/legacy] Received request to create a new post (legacy).');
  const { title, content, tags, author, date } = req.body;

  if (!title || !content) {
    res.status(400).json({ "error": "Missing required fields: title, content" });
    return;
  }

  const sql = 'INSERT INTO posts (title, content, status, author, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))';
  const params = [title, content, 'published', author || 'Koimsurai'];

  db.run(sql, params, function (err) {
    if (err) {
      console.error('[POST /api/posts/legacy] Database error:', err.message);
      res.status(400).json({ "error": err.message });
      return;
    }

    console.log(`[POST /api/posts/legacy] Successfully inserted post with ID: ${this.lastID}`);
    res.status(201).json({
      "message": "success",
      "data": { id: this.lastID, ...req.body }
    });
  });
});

// 重置管理員密碼的特殊端點（僅在開發環境使用）
apiRouter.post('/auth/reset-admin', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }

  const targetUsername = process.env.ADMIN_USERNAME || req.body?.username || 'admin';
  const targetPassword = process.env.ADMIN_PASSWORD || req.body?.password;
  const saltRounds = 10;

  if (!targetPassword) {
    return res.status(400).json({
      message: 'ADMIN_PASSWORD is not configured. Set ADMIN_PASSWORD in env or pass password in request body for dev reset.'
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(targetPassword, saltRounds);

    // 先嘗試更新用戶
    db.run(
      "UPDATE users SET password_hash = ? WHERE username = ?",
      [hashedPassword, targetUsername],
      function (err) {
        if (err) {
          console.error('更新密碼失敗:', err);
          return res.status(500).json({ message: '更新密碼失敗' });
        }

        if (this.changes === 0) {
          // 用戶不存在，創建新用戶
          db.run(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [targetUsername, hashedPassword, 'admin'],
            function (insertErr) {
              if (insertErr) {
                console.error('創建用戶失敗:', insertErr);
                return res.status(500).json({ message: '創建用戶失敗' });
              }

              res.json({
                message: `管理員用戶 ${targetUsername} 已創建`,
                username: targetUsername
              });
            }
          );
        } else {
          res.json({
            message: `管理員 ${targetUsername} 密碼已重置`,
            username: targetUsername
          });
        }
      }
    );
  } catch (error) {
    console.error('密碼處理失敗:', error);
    res.status(500).json({ message: '密碼處理失敗' });
  }
});

// --- Collection (收藏館) API Routes ---

// 1. 取得收藏項目
apiRouter.get('/collection/:type', (req, res) => {
  const { type } = req.params;
  const { format, sort, favorite, limit } = req.query;
  let sql = `SELECT * FROM collection_items WHERE collection_type = ?`;
  let params = [type];

  if (format) {
    sql += ' AND media_format = ?';
    params.push(format);
  }

  if (favorite === 'true') {
    sql += ' AND is_favorite = 1';
  }

  if (sort === 'rating') {
    sql += ' ORDER BY rating DESC';
  } else if (sort === 'watch_date') {
    sql += ' ORDER BY watch_date DESC';
  } else {
    sql += ' ORDER BY created_at DESC';
  }

  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查詢收藏項目錯誤:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({
      message: 'success',
      items: rows
    });
  });
});

// 2. 後台搜尋外部 API (TMDB/AniList)
apiRouter.post('/collection/search-external', requireAdmin, async (req, res) => {
  const { query, type } = req.body;

  if (!query || !type) {
    return res.status(400).json({ error: '缺少必填參數: query, type' });
  }

  try {
    // TODO: 根據 type 串接 TMDB 或 AniList API
    // type 可以是: 'movie', 'tv', 'anime'

    res.status(501).json({
      error: 'Not implemented yet',
      message: '此功能尚未實現，請先手動添加收藏項目'
    });
  } catch (error) {
    console.error('搜尋外部 API 錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. 新增收藏項目
apiRouter.post('/collection', requireAdmin, (req, res) => {
  const item = req.body;

  // 驗證必填欄位
  if (!item.title || !item.collection_type || !item.media_format) {
    return res.status(400).json({
      error: '缺少必填欄位: title, collection_type, media_format'
    });
  }

  const fields = Object.keys(item).join(', ');
  const placeholders = Object.keys(item).map(() => '?').join(', ');
  const values = Object.values(item);

  db.run(
    `INSERT INTO collection_items (${fields}) VALUES (${placeholders})`,
    values,
    function (err) {
      if (err) {
        console.error('新增收藏項目錯誤:', err);
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({
        message: '收藏項目已新增',
        id: this.lastID
      });
    }
  );
});

// 4. 更新收藏項目
apiRouter.put('/collection/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const item = req.body;

  if (Object.keys(item).length === 0) {
    return res.status(400).json({ error: '沒有要更新的欄位' });
  }

  const updates = Object.keys(item).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(item), id];

  db.run(
    `UPDATE collection_items SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    values,
    function (err) {
      if (err) {
        console.error('更新收藏項目錯誤:', err);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '收藏項目不存在' });
      }

      res.json({
        message: '收藏項目已更新',
        changes: this.changes
      });
    }
  );
});

// 5. 刪除收藏項目
apiRouter.delete('/collection/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run(
    `DELETE FROM collection_items WHERE id = ?`,
    [id],
    function (err) {
      if (err) {
        console.error('刪除收藏項目錯誤:', err);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: '收藏項目不存在' });
      }

      res.json({
        message: '收藏項目已刪除',
        changes: this.changes
      });
    }
  );
});

// 6. n8n 批次匯入
apiRouter.post('/sync/collection', (req, res) => {
  const apiKey = req.headers['x-api-key'];

  // 驗證 API Key
  if (!process.env.N8N_SYNC_API_KEY) {
    return res.status(500).json({
      error: 'N8N_SYNC_API_KEY 未設定',
      message: '請在 server/.env 中設置 N8N_SYNC_API_KEY'
    });
  }

  if (apiKey !== process.env.N8N_SYNC_API_KEY) {
    return res.status(403).json({ error: 'Invalid API Key' });
  }

  const items = req.body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items 必須是非空陣列' });
  }

  let inserted = 0;
  let errors = [];

  const stmt = db.prepare(`
    INSERT INTO collection_items (
      title, original_title, year, poster_url, overview, 
      external_id, collection_type, media_format, source, 
      status, rating, review, is_favorite, watch_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    stmt.run([
      item.title,
      item.original_title || null,
      item.year || null,
      item.poster_url || null,
      item.overview || null,
      item.external_id || null,
      item.collection_type,
      item.media_format,
      item.source || 'n8n_import',
      item.status || 'completed',
      item.rating || null,
      item.review || null,
      item.is_favorite ? 1 : 0,
      item.watch_date || null
    ], err => {
      if (err) {
        errors.push({ title: item.title, error: err.message });
      } else {
        inserted++;
      }
    });
  }

  stmt.finalize(() => {
    res.json({
      message: '批次匯入完成',
      inserted,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined
    });
  });
});

// 靜態檔案 — 提供上傳的圖片
app.use('/uploads', express.static(path.join(__dirname, 'storage', 'uploads')));

app.use('/api', apiRouter);

// --- Dynamic Sitemap ---
app.get('/sitemap.xml', (req, res) => {
  const siteUrl = process.env.SITE_URL || 'https://koimsurai.com';
  const staticPages = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/blog', changefreq: 'weekly', priority: '0.8' },
    { loc: '/bookshelf', changefreq: 'monthly', priority: '0.6' },
    { loc: '/photos', changefreq: 'monthly', priority: '0.7' },
    { loc: '/music', changefreq: 'weekly', priority: '0.6' },
    { loc: '/now', changefreq: 'weekly', priority: '0.7' },
    { loc: '/setup', changefreq: 'monthly', priority: '0.6' },
    { loc: '/journey', changefreq: 'monthly', priority: '0.6' },
    { loc: '/activity', changefreq: 'daily', priority: '0.5' },
  ];

  const sql = `SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC`;
  db.all(sql, [], (err, posts) => {
    if (err) {
      console.error('[sitemap] 查詢失敗:', err);
      return res.status(500).send('Internal Server Error');
    }

    const postEntries = (posts || []).flatMap(p => {
      // SQLite 回傳可能是 "YYYY-MM-DD HH:MM:SS" 或 ISO 格式，統一只取日期部分
      const raw = (p.updated_at || p.created_at || '').trim();
      const lastmod = raw.split(/[T\s]/)[0];
      const source = p.source_language || 'zh-TW';
      const locales = availableLocales(p); // 含 source + 已翻譯語系

      // 每個 locale 自己一個 <url>，每個 <url> 都附上所有 hreflang alternate + x-default（指向 source）
      const alternates = locales.map(loc => {
        const href = postUrlForLocale(siteUrl, p.id, loc, source);
        return `    <xhtml:link rel="alternate" hreflang="${LOCALE_HREFLANG[loc]}" href="${href}" />`;
      }).join('\n');
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${postUrlForLocale(siteUrl, p.id, source, source)}" />`;

      return locales.map(loc => {
        const selfUrl = postUrlForLocale(siteUrl, p.id, loc, source);
        return `  <url>
    <loc>${selfUrl}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
${alternates}
${xDefault}
  </url>`;
      });
    });

    const today = new Date().toISOString().split('T')[0];
    const staticEntries = staticPages.map(p => `  <url>
    <loc>${siteUrl}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticEntries.join('\n')}
${postEntries.join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  });
});

// --- RSS Feed ---
app.get('/rss', (req, res) => {
  const siteUrl = process.env.SITE_URL || 'https://koimsurai.com';
  const sql = `
    SELECT p.id, p.title, p.excerpt, p.content, p.created_at, p.updated_at, p.author, p.category,
           GROUP_CONCAT(t.name) as tags
    FROM posts p
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.status = 'published'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 30
  `;

  db.all(sql, [], (err, posts) => {
    if (err) return res.status(500).send('Internal Server Error');

    const escXml = (s) => String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const lastBuild = posts.length > 0
      ? new Date(posts[0].updated_at || posts[0].created_at).toUTCString()
      : new Date().toUTCString();

    const items = posts.map(p => {
      const desc = p.excerpt || (p.content || '').replace(/<[^>]+>/g, '').replace(/[#*`>\-\n]/g, ' ').trim().slice(0, 300);
      const tags = p.tags ? p.tags.split(',') : [];
      const categories = tags.map(t => `<category>${escXml(t.trim())}</category>`).join('');
      return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${siteUrl}/blog/${p.id}</link>
      <guid isPermaLink="true">${siteUrl}/blog/${p.id}</guid>
      <description>${escXml(desc)}</description>
      <author>${escXml(p.author || 'Koimsurai')}</author>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      ${p.category ? `<category>${escXml(p.category)}</category>` : ''}
      ${categories}
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Koimsurai 手記</title>
    <link>${siteUrl}/blog</link>
    <description>Koimsurai 的個人部落格 — 技術筆記、生活隨筆、影集心得</description>
    <language>zh-TW</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${siteUrl}/rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  });
});

// Default response for any other request
app.use(function (req, res) {
  res.status(404).send('Not Found');
});

/* ──────────────────────────────────────────────────────────────────────
   動畫瘋觀看歷史同步（用自家開源 SDK：anigamer — https://github.com/timo9378/anigamer）
   - SDK 負責 cookie 解析 / serialize / Set-Cookie 自動輪替 / history / cover 抓取
   - 這層只剩：cookie 檔案持久化 + DB upsert + cron
   - cookie 啟動時先吃 file（最新 rotated 版本），沒有再 fallback env；
     SDK 偵測到 Bahamut rotate cookie 時，透過 onCookiesRotated 寫回檔案，
     只要 cron 持續跑就會被視為活躍 user，JWT 通常會默默續發，不用手動重抓
   - cron 每 6 小時跑一次，server 啟動 30 秒後也跑一次
─────────────────────────────────────────────────────────────────────── */
const { AniGamer } = require('anigamer');
const BAHAMUT_COOKIE_FILE = path.join(__dirname, 'db', '.bahamut-cookie.json');

// 啟動時：先吃 file（最新 rotated 版本），沒有再 fallback env
function loadBahamutCookie() {
  try {
    if (fs.existsSync(BAHAMUT_COOKIE_FILE)) {
      const stored = JSON.parse(fs.readFileSync(BAHAMUT_COOKIE_FILE, 'utf-8'));
      if (stored && typeof stored === 'object') {
        console.log('[Bahamut] loaded rotated cookies from', BAHAMUT_COOKIE_FILE);
        return stored;
      }
    }
  } catch (e) { /* ignore */ }
  return process.env.BAHAMUT_COOKIE || '';
}

// SDK client：Bahamut 回 Set-Cookie 時自動 merge，並透過 callback 寫回檔案
const bahamut = new AniGamer({
  cookie: loadBahamutCookie(),
  onCookiesRotated: (jar) => {
    try {
      fs.writeFileSync(BAHAMUT_COOKIE_FILE, JSON.stringify(jar, null, 2));
      console.log('[Bahamut] cookies rotated, persisted');
    } catch (e) {
      console.error('[Bahamut] persist cookie fail:', e.message);
    }
  },
});

// 推 Discord webhook（沒設 DISCORD_WEBHOOK_URL 就跳過，同 host 上的 discord-update-notify.sh）
async function notifyDiscord(content) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await axios.post(url, { content }, { timeout: 8000 });
  } catch (e) {
    console.error('[Bahamut] discord notify fail:', e.message);
  }
}

// BAHARUNE 約 14 天到期，Bahamut 是否會自動續期未經證實 →「剩 < 3 天」就推 Discord 提醒手動重抓
// SDK 不做自動登入（Bahamut reCAPTCHA），這是「自動運作、快死大聲提醒」的安全網
const JWT_WARN_THRESHOLD_SEC = 3 * 24 * 60 * 60;
let lastJwtAlertAt = 0; // 最多每 24h 提醒一次，避免每次 sync 洗版
async function maybeAlertDiscord(msg) {
  if (Date.now() - lastJwtAlertAt <= 24 * 60 * 60 * 1000) return;
  lastJwtAlertAt = Date.now();
  await notifyDiscord(msg);
}
async function checkBahamutJwtExpiry() {
  // 補強：jwtStatus() 只認 JWT 格式 BAHARUNE，若 BAHARUNE 被 server 端 Set-Cookie 成 "deleted"
  // 或非 JWT 字串，原本會 silent return 整個略過警告 — 改成這裡顯式偵測
  const jar = bahamut.cookies || {};
  const baharune = jar.BAHARUNE;
  if (!baharune || baharune === 'deleted' || !String(baharune).includes('.')) {
    console.warn('[Bahamut] BAHARUNE missing or non-JWT (got:', baharune ? `'${String(baharune).slice(0, 16)}'` : 'undefined', ')');
    await maybeAlertDiscord(
      `⚠️ **動畫瘋 BAHARUNE 不是有效 JWT**（值：\`${String(baharune || 'undefined').slice(0, 24)}\`）— 觀看歷史同步停擺，請登入 ani.gamer.com.tw 重抓 cookie`,
    );
    return;
  }
  const status = bahamut.jwtStatus();
  if (!status) return;
  console.log(
    `[Bahamut] JWT exp ${status.expiresAt.toISOString()} (${Math.floor(status.secondsUntilExpiry / 86400)}d left)`,
  );
  const needAlert = status.isExpired || status.secondsUntilExpiry < JWT_WARN_THRESHOLD_SEC;
  if (needAlert) {
    const days = Math.max(0, Math.floor(status.secondsUntilExpiry / 86400));
    await maybeAlertDiscord(
      status.isExpired
        ? `⚠️ **動畫瘋 cookie 已過期** — 觀看歷史同步停擺，請登入 ani.gamer.com.tw 重抓 cookie 更新 BAHAMUT_COOKIE`
        : `⏳ **動畫瘋 cookie 剩 ${days} 天到期**（${status.expiresAt.toISOString()}）— 找時間登入 ani.gamer.com.tw 重抓 cookie`,
    );
  }
}

let bahamutSyncRunning = false;
async function syncBahamutHistory() {
  const { ok, missing } = bahamut.validate();
  if (!ok) {
    console.log('[Bahamut] cookie missing', missing.join(','), '— skip sync');
    return;
  }
  if (bahamutSyncRunning) {
    console.log('[Bahamut] sync already in progress, skip');
    return;
  }
  bahamutSyncRunning = true;
  console.log('[Bahamut] sync start');
  await checkBahamutJwtExpiry();

  try {
    let totalEntries = 0;
    let newEntries = 0;
    let coversFetched = 0;

    // SDK 走完所有頁 + 按 animeSn:videoSn 去重
    const allHistory = await bahamut.historyAll();

    // 1) 找出每個 anime_sn 在 db 是否已有 cover_url（同一部動畫共用一張 cover）
    const uniqueAnimeSns = [...new Set(allHistory.map((e) => e.animeSn).filter(Boolean))];
    const existingCovers = new Map(); // animeSn -> cover_url
    for (const sn of uniqueAnimeSns) {
      const row = await new Promise((resolve) => {
        db.get(
          'SELECT cover_url FROM anime_history WHERE anime_sn = ? AND cover_url IS NOT NULL AND cover_url != "" LIMIT 1',
          [sn],
          (err, r) => resolve(err ? null : r),
        );
      });
      if (row?.cover_url) existingCovers.set(sn, row.cover_url);
    }

    // 2) 對 db 沒紀錄的 anime_sn 用 SDK 抓 cover（og:image）
    for (const sn of uniqueAnimeSns) {
      if (existingCovers.has(sn)) continue;
      const cover = await bahamut.cover(sn).catch(() => null);
      if (cover) {
        existingCovers.set(sn, cover);
        coversFetched += 1;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    // 3) upsert 每集 — 展開 SDK 提供的 nested history[]（每個 anime 的全部觀看集數）
    //    每筆對應一集：(anime_sn, video_sn) 為主鍵。title 存系列名（清理掉 "[8]" 後綴）。
    for (const entry of allHistory) {
      const { animeSn, title: seriesTitle } = entry;
      if (!animeSn) continue;
      const coverUrl = existingCovers.get(animeSn) || '';
      // entry.raw.history 是 [{ videoSn, title: '婚姻劇毒 [8]', watchTime: '2026-05-28...' }, ...]
      // 若沒 raw 退回單筆（最新一集）
      const eps = entry.raw?.history?.length
        ? entry.raw.history
        : [{ videoSn: entry.videoSn, title: entry.title, watchTime: entry.watchedAt }];

      for (const ep of eps) {
        if (!ep?.videoSn) continue;
        // 從 "婚姻劇毒 [8]" 抽出 "8"；抽不到就 null
        const m = String(ep.title || '').match(/\[([^\]]+)\]\s*$/);
        const epLabel = m ? m[1] : null;
        const watchAtSql = ep.watchTime || null;

        const isNew = await new Promise((resolve) => {
          db.get(
            'SELECT 1 FROM anime_history WHERE anime_sn = ? AND video_sn = ?',
            [animeSn, ep.videoSn],
            (err, row) => resolve(!err && !row),
          );
        });
        if (isNew) newEntries += 1;

        await new Promise((resolve) => {
          db.run(
            `INSERT INTO anime_history (anime_sn, video_sn, title, cover_url, episode, last_watched_at, synced_at)
             VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
             ON CONFLICT(anime_sn, video_sn) DO UPDATE SET
               title = excluded.title,
               cover_url = COALESCE(NULLIF(excluded.cover_url, ''), anime_history.cover_url),
               episode = COALESCE(excluded.episode, anime_history.episode),
               last_watched_at = COALESCE(excluded.last_watched_at, anime_history.last_watched_at),
               synced_at = CURRENT_TIMESTAMP`,
            [animeSn, ep.videoSn, seriesTitle || '', coverUrl, epLabel, watchAtSql],
            () => resolve(),
          );
        });
        totalEntries += 1;
      }
    }

    console.log(`[Bahamut] sync done: ${totalEntries} entries, ${newEntries} new, ${coversFetched} covers fetched (${uniqueAnimeSns.length} unique animes)`);
  } catch (err) {
    console.error('[Bahamut] sync error:', err.message);
  } finally {
    bahamutSyncRunning = false;
  }
}

// GET /api/anime/history — 公開讀取最近觀看
apiRouter.get('/anime/history', (req, res) => {
  // cap 2000 (DB 約 900 列、之後成長有空間；前端 library 一次拿完 group by anime_sn)
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 2000);
  db.all(
    `SELECT anime_sn, video_sn, title, cover_url, episode, last_watched_at
     FROM anime_history
     ORDER BY last_watched_at DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', history: rows });
    },
  );
});

// GET /api/films/recent — 最近看的電影（id auto，依 watched_date DESC）
apiRouter.get('/films/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  db.all(
    `SELECT id, title, watched_date, rating, source, tmdb_id, poster_url, release_year, genres
     FROM film_history
     ORDER BY watched_date DESC NULLS LAST, id DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', films: rows });
    },
  );
});

// GET /api/tv/recent — 影集，依 series 聚合，每部一筆，附 episode count + 最新觀看日
apiRouter.get('/tv/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  db.all(
    `SELECT
       series_name,
       MAX(watched_date) AS last_watched,
       COUNT(*) AS ep_count,
       MAX(tmdb_id) AS tmdb_id,
       MAX(poster_url) AS poster_url,
       MAX(genres) AS genres,
       MAX(source) AS source
     FROM tv_history
     GROUP BY series_name
     ORDER BY last_watched DESC NULLS LAST
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', series: rows });
    },
  );
});

// GET /api/watch/stats — 給 Watch 頁面 STATS chip 用
apiRouter.get('/watch/stats', (req, res) => {
  const queries = {
    animeCount: 'SELECT COUNT(DISTINCT anime_sn) AS n FROM anime_history',
    animeEpisodes: 'SELECT COUNT(*) AS n FROM anime_history',
    filmCount: 'SELECT COUNT(*) AS n FROM film_history',
    tvSeriesCount: 'SELECT COUNT(DISTINCT series_name) AS n FROM tv_history',
    tvEpisodes: 'SELECT COUNT(*) AS n FROM tv_history',
  };
  Promise.all(
    Object.entries(queries).map(
      ([k, sql]) =>
        new Promise((resolve) => {
          db.get(sql, (err, row) => resolve([k, err ? 0 : row.n]));
        }),
    ),
  ).then((entries) => res.json({ message: 'success', ...Object.fromEntries(entries) }));
});

// 啟動 30 秒後跑首次 sync，之後每 6 小時跑一次
setTimeout(() => syncBahamutHistory(), 30 * 1000);
setInterval(() => syncBahamutHistory(), 6 * 60 * 60 * 1000);

/* ═════════════════════════════════════════════════════════════
   Trakt sync — going-forward HBO Max / Disney+ / 任何手動 log
   流程：device-auth 拿到 token 後存 db/.trakt-token.json，
   這裡 cron 每天拉 /sync/history 補進 film_history + tv_history
═════════════════════════════════════════════════════════════ */
const TRAKT_TOKEN_FILE = path.join(__dirname, 'db', '.trakt-token.json');
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;

function loadTraktToken() {
  try {
    if (!fs.existsSync(TRAKT_TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TRAKT_TOKEN_FILE, 'utf-8'));
  } catch (e) {
    console.warn('[Trakt] token file unreadable:', e.message);
    return null;
  }
}

function saveTraktToken(tok) {
  fs.writeFileSync(TRAKT_TOKEN_FILE, JSON.stringify(tok, null, 2));
  fs.chmodSync(TRAKT_TOKEN_FILE, 0o600);
}

const TRAKT_UA = 'koimsurai/1.0 (+https://koimsurai.com)';
async function refreshTraktToken(tok) {
  const r = await fetch('https://api.trakt.tv/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': TRAKT_UA },
    body: JSON.stringify({
      refresh_token: tok.refresh_token,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`refresh ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const out = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    scope: j.scope,
    expires_at: (j.created_at + j.expires_in) * 1000,
    created_at: j.created_at * 1000,
  };
  saveTraktToken(out);
  console.log('[Trakt] token refreshed, new expiry', new Date(out.expires_at).toISOString());
  return out;
}

async function getValidTraktToken() {
  let tok = loadTraktToken();
  if (!tok) return null;
  // refresh if < 7 days to expiry (Trakt tokens last 90 days; 7d buffer is plenty)
  if (Date.now() + 7 * 86400_000 >= tok.expires_at) {
    try { tok = await refreshTraktToken(tok); }
    catch (e) { console.error('[Trakt] refresh failed:', e.message); return null; }
  }
  return tok;
}

async function traktGet(tok, pathStr) {
  const r = await fetch(`https://api.trakt.tv${pathStr}`, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': TRAKT_UA,
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID,
      Authorization: `Bearer ${tok.access_token}`,
    },
  });
  if (!r.ok) throw new Error(`${pathStr} ${r.status}: ${await r.text()}`);
  return { data: await r.json(), pagecount: parseInt(r.headers.get('x-pagination-page-count') || '1', 10) };
}

let traktSyncRunning = false;
async function syncTraktHistory() {
  if (traktSyncRunning) { console.log('[Trakt] sync in progress, skip'); return; }
  const tok = await getValidTraktToken();
  if (!tok) { console.log('[Trakt] no token — skip sync (run trakt-device-auth.js to authorize)'); return; }

  traktSyncRunning = true;
  console.log('[Trakt] sync start');
  try {
    let films = 0, episodes = 0;

    // movies: page through /sync/history/movies (Trakt sorts DESC by watched_at)
    for (let page = 1; ; page++) {
      const { data, pagecount } = await traktGet(tok, `/sync/history/movies?page=${page}&limit=100`);
      for (const item of data) {
        const m = item.movie;
        if (!m) continue;
        const watched = (item.watched_at || '').slice(0, 10) || null;
        await new Promise((resolve) => {
          db.run(
            `INSERT OR IGNORE INTO film_history (title, watched_date, source, tmdb_id, release_year)
             VALUES (?, ?, 'trakt', ?, ?)`,
            [m.title, watched, m.ids?.tmdb || null, m.year || null],
            () => { films += 1; resolve(); },
          );
        });
      }
      if (page >= pagecount) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    // tv episodes
    for (let page = 1; ; page++) {
      const { data, pagecount } = await traktGet(tok, `/sync/history/episodes?page=${page}&limit=100`);
      for (const item of data) {
        const ep = item.episode;
        const show = item.show;
        if (!ep || !show) continue;
        const watched = (item.watched_at || '').slice(0, 10) || null;
        const epLabel = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
        await new Promise((resolve) => {
          db.run(
            `INSERT OR IGNORE INTO tv_history (series_name, episode_label, watched_date, source, tmdb_id)
             VALUES (?, ?, ?, 'trakt', ?)`,
            [show.title, epLabel, watched, show.ids?.tmdb || null],
            () => { episodes += 1; resolve(); },
          );
        });
      }
      if (page >= pagecount) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[Trakt] sync done: ${films} film rows, ${episodes} tv ep rows scanned`);
  } catch (e) {
    console.error('[Trakt] sync error:', e.message);
  } finally {
    traktSyncRunning = false;
  }
}

// 啟動 90 秒後跑首次（讓 Bahamut sync 先跑），之後每 6 小時跑一次
setTimeout(() => syncTraktHistory(), 90 * 1000);
setInterval(() => syncTraktHistory(), 6 * 60 * 60 * 1000);

/* ═════════════════════════════════════════════════════════════
   Letterboxd RSS — 拉 timo9378 的 diary RSS、塞 film_history
   只能拿到 user 之後手動 log 的 diary entry；watched 清單不在 RSS 裡
═════════════════════════════════════════════════════════════ */
const LETTERBOXD_RSS = 'https://letterboxd.com/timo9378/rss/';
const LETTERBOXD_UA = 'koimsurai/1.0 (+https://koimsurai.com)';

/** 從 Letterboxd RSS <item> 抽我們要的欄位。RSS 簡單，用正則撐住。 */
function parseLetterboxdItem(itemXml) {
  const grab = (tag) => {
    const m = itemXml.match(new RegExp(`<${tag.replace('.', '\\.')}>([\\s\\S]*?)<\\/${tag.replace('.', '\\.')}>`));
    if (!m) return null;
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  };
  const title = grab('letterboxd:filmTitle');
  if (!title) return null;
  return {
    title,
    year: parseInt(grab('letterboxd:filmYear') || '', 10) || null,
    watchedDate: grab('letterboxd:watchedDate'), // 'YYYY-MM-DD'
    rating: parseFloat(grab('letterboxd:memberRating') || ''), // 0~5.0, 半顆星可
    tmdbId: parseInt(grab('tmdb:movieId') || '', 10) || null,
  };
}

let letterboxdSyncRunning = false;
async function syncLetterboxdRss() {
  if (letterboxdSyncRunning) { console.log('[Letterboxd] sync in progress, skip'); return; }
  letterboxdSyncRunning = true;
  console.log('[Letterboxd] sync start');
  try {
    const r = await fetch(LETTERBOXD_RSS, { headers: { 'User-Agent': LETTERBOXD_UA } });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const xml = await r.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    let added = 0, updated = 0;
    for (const itemXml of items) {
      const parsed = parseLetterboxdItem(itemXml);
      if (!parsed?.title || !parsed?.watchedDate) continue;
      // ON CONFLICT: keep Netflix tmdb_id but bring in rating + letterboxd ID
      await new Promise((resolve) => {
        db.run(
          `INSERT INTO film_history (title, watched_date, rating, source, tmdb_id, release_year)
           VALUES (?, ?, ?, 'letterboxd', ?, ?)
           ON CONFLICT(title, watched_date) DO UPDATE SET
             rating = COALESCE(excluded.rating, film_history.rating),
             tmdb_id = COALESCE(film_history.tmdb_id, excluded.tmdb_id),
             release_year = COALESCE(film_history.release_year, excluded.release_year)`,
          [
            parsed.title,
            parsed.watchedDate,
            Number.isFinite(parsed.rating) ? Math.round(parsed.rating) : null,
            parsed.tmdbId,
            parsed.year,
          ],
          function () {
            if (this.changes > 0) (this.lastID > 0 ? added++ : updated++);
            resolve();
          },
        );
      });
    }
    console.log(`[Letterboxd] sync done: ${items.length} items processed (added/updated)`);
  } catch (e) {
    console.error('[Letterboxd] sync error:', e.message);
  } finally {
    letterboxdSyncRunning = false;
  }
}

// 啟動 120 秒後跑首次，之後每 4 小時跑一次（Letterboxd RSS 沒 rate limit 但別太頻繁）
setTimeout(() => syncLetterboxdRss(), 120 * 1000);
setInterval(() => syncLetterboxdRss(), 4 * 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
