require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const axios = require('axios');
const { initializeDatabase, db } = require('./database.js');
const { authMiddleware, basicAuth, JWT_SECRET } = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 3001;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

// 初始化資料庫
initializeDatabase();

const fs = require('fs');
const path = require('path');
const multer = require('multer');

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
apiRouter.post('/admin/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // 建構回傳 URL: /uploads/YYYY/MM/filename
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const fileUrl = `/uploads/${year}/${month}/${req.file.filename}`;

  res.json({
    message: 'success',
    url: fileUrl,
    filename: req.file.filename
  });
});

// Gallery API Endpoint
apiRouter.get('/gallery/photos', async (req, res) => {
  const manifestPath = path.join(__dirname, 'storage', 'gallery', 'manifest.json');

  if (fs.existsSync(manifestPath)) {
    try {
      const data = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(data);
      res.json(manifest); // 回傳完整結構 (包含 version, photos 等)
    } catch (err) {
      console.error('Error reading gallery manifest:', err);
      res.status(500).json({ error: 'Failed to read gallery manifest' });
    }
  } else {
    // 若無 manifest，回傳空結構以免前端錯誤
    res.json({
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      totalPhotos: 0,
      photos: []
    });
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

      res.json({
        message: "success",
        posts: rows.map(row => ({
          ...row,
          tags: row.tags ? row.tags.split(',') : []
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      });
    });
  });
});

// GET all posts for admin (需要認證)
apiRouter.get('/admin/posts', authMiddleware, (req, res) => {
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
apiRouter.get('/admin/posts/:id', authMiddleware, (req, res) => {
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
      tags: row.tags ? row.tags.split(',') : []
    });
  });
});

// GET admin statistics
apiRouter.get('/admin/stats', authMiddleware, (req, res) => {
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
    if (row) {
      res.json({
        "message": "success",
        ...row,
        tags: row.tags ? row.tags.split(',') : []
      });
    } else {
      res.status(404).json({ "message": "Post not found" });
    }
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
apiRouter.get('/admin/tags', authMiddleware, (req, res) => {
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
apiRouter.post('/admin/tags', authMiddleware, (req, res) => {
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
apiRouter.put('/admin/tags/:id', authMiddleware, (req, res) => {
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
apiRouter.delete('/admin/tags/:id', authMiddleware, (req, res) => {
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
      COUNT(p.id) as post_count
    FROM categories c
    LEFT JOIN posts p ON p.category = c.name AND p.status = 'published'
    GROUP BY c.id, c.name, c.slug, c.description
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
apiRouter.get('/admin/categories', authMiddleware, (req, res) => {
  const sql = `
    SELECT 
      c.id,
      c.name,
      c.slug,
      c.description,
      c.created_at,
      c.updated_at,
      COUNT(p.id) as post_count
    FROM categories c
    LEFT JOIN posts p ON p.category = c.name
    GROUP BY c.id, c.name, c.slug, c.description, c.created_at, c.updated_at
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
apiRouter.post('/admin/categories', authMiddleware, (req, res) => {
  const { name, description, slug } = req.body;

  if (!name) {
    return res.status(400).json({ error: '分類名稱為必填' });
  }

  // 生成 slug（如果沒有提供）
  const categorySlug = slug || name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '');

  // 插入新分類
  db.run(
    `INSERT INTO categories (name, slug, description, created_at, updated_at) 
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [name, categorySlug, description || ''],
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
        post_count: 0
      });
    }
  );
});

// PUT update category
apiRouter.put('/admin/categories/:id', authMiddleware, (req, res) => {
  const categoryId = req.params.id;
  const { name, description, slug } = req.body;

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
       SET name = ?, slug = ?, description = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [name, categorySlug, description || '', categoryId],
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
apiRouter.delete('/admin/categories/:id', authMiddleware, (req, res) => {
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
apiRouter.post('/admin/posts', authMiddleware, (req, res) => {
  console.log('[POST /api/admin/posts] Received request to create a new post.');
  console.log('[POST /api/admin/posts] Body:', req.body);

  const { title, content, excerpt, category, tags = [], status = 'draft' } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "缺少必填欄位: title, content" });
  }

  const sql = `
    INSERT INTO posts (title, content, excerpt, category, status, author, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;
  const params = [title, content, excerpt, category || null, status, 'Koimsurai'];

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
        data: { id: postId, title, content, excerpt, category, tags, status }
      });
    });
  });
});

// PUT update post (Admin)
apiRouter.put('/admin/posts/:id', authMiddleware, (req, res) => {
  console.log(`[PUT /api/admin/posts/${req.params.id}] Received request to update post.`);
  console.log('[PUT /api/admin/posts/:id] Body:', req.body);

  const { title, content, excerpt, category, tags = [], status } = req.body;
  const sql = `
    UPDATE posts SET 
      title = COALESCE(?, title), 
      content = COALESCE(?, content), 
      excerpt = COALESCE(?, excerpt),
      category = ?,
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `;
  const params = [title, content, excerpt, category, status, req.params.id];

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
    });
  });
});

// DELETE post (Admin)
apiRouter.delete('/admin/posts/:id', authMiddleware, (req, res) => {
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
apiRouter.post('/posts', authMiddleware, (req, res) => {
  console.log('[POST /api/posts] Received request to create a new post.');
  console.log('[POST /api/posts] Body:', req.body);

  const { title, content, excerpt, category, tags = [], status = 'draft' } = req.body;

  if (!title || !content) {
    res.status(400).json({ "error": "Missing required fields: title, content" });
    return;
  }

  const sql = 'INSERT INTO posts (title, content, excerpt, category, status, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))';
  const params = [title, content, excerpt, category || null, status, 'Koimsurai'];

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
apiRouter.put('/posts/:id', authMiddleware, (req, res) => {
  const { title, content, excerpt, category, tags = [], status } = req.body;
  const sql = `
    UPDATE posts SET 
      title = COALESCE(?, title), 
      content = COALESCE(?, content), 
      excerpt = COALESCE(?, excerpt),
      category = COALESCE(?, category),
      status = COALESCE(?, status),
      updated_at = datetime("now")
    WHERE id = ?
  `;
  const params = [title, content, excerpt, category, status, req.params.id];

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
apiRouter.patch('/posts/:id/status', authMiddleware, (req, res) => {
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
apiRouter.delete('/posts/:id', authMiddleware, (req, res) => {
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

// GET comments for a post
apiRouter.get('/posts/:id/comments', (req, res) => {
  const sql = "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC";
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

// POST a new comment
apiRouter.post('/posts/:id/comments', (req, res) => {
  const { author, content, captcha } = req.body;
  if (!author || !content) {
    return res.status(400).json({ "error": "Author and content are required" });
  }

  // 簡易驗證碼檢查（如果提供）
  if (captcha !== undefined) {
    const expectedAnswer = req.body.captchaAnswer;
    if (captcha != expectedAnswer) {
      return res.status(400).json({ "error": "驗證碼錯誤" });
    }
  }

  const sql = 'INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)';
  const params = [req.params.id, author, content];

  db.run(sql, params, function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    res.status(201).json({
      "message": "success",
      "id": this.lastID
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

    // 回傳更新後的按讚數
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

  const sql = 'INSERT INTO newsletter_subscribers (email, name, status) VALUES (?, ?, ?)';
  const params = [email, name || null, 'active'];

  db.run(sql, params, function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ "error": "This email is already subscribed" });
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

// POST unsubscribe from newsletter
apiRouter.post('/newsletter/unsubscribe', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ "error": "Email is required" });
  }

  const sql = 'UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = datetime("now") WHERE email = ?';
  db.run(sql, ['unsubscribed', email], function (err) {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ "message": "Email not found in subscribers" });
      return;
    }
    res.json({ "message": "Successfully unsubscribed from newsletter" });
  });
});

// GET newsletter subscribers (admin only)
apiRouter.get('/newsletter/subscribers', authMiddleware, (req, res) => {
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
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://koimsurai.blogsyte.com/api/spotify/callback';

// Spotify 存取權杖快取
let spotifyAccessToken = null;
let spotifyTokenExpiry = null;

// Spotify OAuth 授權端點 - 初始授權頁面
apiRouter.get('/spotify/login', (req, res) => {
  const scope = 'user-read-recently-played user-top-read user-read-private user-read-email';
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

// 獲取最常聽的曲風
apiRouter.get('/spotify/top-genres', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();

    // 獲取最常聽的藝人
    const artistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists', {
      params: {
        limit: 50,
        time_range: 'medium_term' // 最近 6 個月
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 統計曲風
    const genreCount = {};
    artistsResponse.data.items.forEach(artist => {
      artist.genres.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    });

    // 排序並取前 5 名
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count }));

    res.json({ genres: topGenres });
  } catch (error) {
    console.error('Spotify top genres error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch Spotify top genres',
      details: error.response?.data || error.message
    });
  }
});

// 獲取最常聽的歌曲
apiRouter.get('/spotify/top-tracks', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    const { time_range = 'medium_term', limit = 20 } = req.query;

    const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
      params: {
        limit,
        time_range // short_term, medium_term, long_term
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Spotify top tracks error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch Spotify top tracks',
      details: error.response?.data || error.message
    });
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
apiRouter.get('/admin/books', authMiddleware, (req, res) => {
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

// Search books via Google Books API
apiRouter.get('/books/search/external', async (req, res) => {
  const { query, isbn } = req.query;

  if (!query && !isbn) {
    return res.status(400).json({ error: '請提供書名或 ISBN' });
  }

  let searchQuery;
  const inputQuery = isbn || query;

  // 檢測是否為 ISBN (10或13位數字,可能包含連字符)
  const isISBN = /^[\d-]{10,17}$/.test(inputQuery.replace(/\s/g, ''));

  if (isISBN) {
    // 移除連字符和空格
    const cleanISBN = inputQuery.replace(/[-\s]/g, '');
    searchQuery = `isbn:${cleanISBN}`;
  } else {
    searchQuery = inputQuery;
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=10`;

  console.log(`[Books API] 搜尋請求: ${inputQuery}, 格式化為: ${searchQuery}`);

  https.get(url, (apiRes) => {
    let data = '';

    apiRes.on('data', (chunk) => {
      data += chunk;
    });

    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);

        if (!jsonData.items || jsonData.items.length === 0) {
          return res.json({
            message: 'success',
            books: []
          });
        }

        // Format the response
        const books = jsonData.items.map(item => {
          const volumeInfo = item.volumeInfo;
          const isbn13 = volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier;
          const isbn10 = volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier;

          // 獲取高解析度封面圖片
          // Google Books 的 thumbnail 解析度很低,我們需要替換為更高解析度
          let coverUrl = '';
          if (volumeInfo.imageLinks) {
            // 優先使用這些更高解析度的圖片
            coverUrl = volumeInfo.imageLinks.large ||
              volumeInfo.imageLinks.medium ||
              volumeInfo.imageLinks.thumbnail ||
              volumeInfo.imageLinks.smallThumbnail || '';

            // 手動修改 URL 以獲取更大的圖片
            // Google Books 圖片格式: http://books.google.com/books/content?id=xxx&printsec=frontcover&img=1&zoom=1
            // 我們可以增加尺寸參數
            if (coverUrl) {
              // 移除限制參數並設定更大的尺寸
              coverUrl = coverUrl.replace('&zoom=1', '&zoom=0')
                .replace('&edge=curl', '')
                .replace('&img=1', '&img=1&w=500&h=800');

              // 如果 URL 中沒有 zoom 參數,手動添加更大的尺寸
              if (!coverUrl.includes('zoom=')) {
                coverUrl += '&zoom=0';
              }
              if (!coverUrl.includes('&w=')) {
                coverUrl += '&w=500&h=800';
              }
            }
          }

          return {
            isbn: isbn13 || isbn10 || '',
            title: volumeInfo.title || '',
            authors: volumeInfo.authors ? volumeInfo.authors.join(', ') : '',
            publisher: volumeInfo.publisher || '',
            published_date: volumeInfo.publishedDate || '',
            description: volumeInfo.description || '',
            cover_url: coverUrl,
            page_count: volumeInfo.pageCount || null,
            language: volumeInfo.language || '',
            categories: volumeInfo.categories ? volumeInfo.categories.join(', ') : ''
          };
        });

        res.json({
          message: 'success',
          books
        });
      } catch (error) {
        console.error('Google Books API 解析錯誤:', error);
        res.status(500).json({ error: 'Failed to parse Google Books API response' });
      }
    });
  }).on('error', (error) => {
    console.error('Google Books API Error:', error);
    res.status(500).json({ error: 'Failed to fetch book data' });
  });
});

// POST a new book (admin only)
apiRouter.post('/books', authMiddleware, (req, res) => {
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
apiRouter.put('/books/:id', authMiddleware, (req, res) => {
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
apiRouter.delete('/books/:id', authMiddleware, (req, res) => {
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

// GET GitHub user events (commits, etc.)
apiRouter.get('/github/events/:username', (req, res) => {
  const { username } = req.params;
  const options = {
    hostname: 'api.github.com',
    path: `/users/${username}/events/public`,
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

  const targetUsername = process.env.ADMIN_USERNAME || 'timo9378';
  const targetPassword = process.env.ADMIN_PASSWORD || 'jces5556';
  const saltRounds = 10;

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
apiRouter.post('/collection/search-external', authMiddleware, async (req, res) => {
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
apiRouter.post('/collection', authMiddleware, (req, res) => {
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
apiRouter.put('/collection/:id', authMiddleware, (req, res) => {
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
apiRouter.delete('/collection/:id', authMiddleware, (req, res) => {
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

// Default response for any other request
app.use(function (req, res) {
  res.status(404).send('Not Found');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
