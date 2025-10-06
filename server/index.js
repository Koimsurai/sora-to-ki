require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const { initializeDatabase, db } = require('./database.js');
const { authMiddleware, basicAuth, JWT_SECRET } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 3001;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

// 初始化資料庫
initializeDatabase();

// --- API Routes ---

const apiRouter = express.Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.status(200).send('OK');
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
  db.run(sql, [req.params.id], function(err) {
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
  db.run(sql, [req.params.id], function(err) {
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
  db.run(sql, [req.params.id], function(err) {
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

// GET all tags
apiRouter.get('/tags', (req, res) => {
  const sql = `
    SELECT t.*, COUNT(pt.post_id) as post_count 
    FROM tags t
    LEFT JOIN post_tags pt ON t.id = pt.tag_id
    GROUP BY t.id
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

// GET all categories
apiRouter.get('/categories', (req, res) => {
  const sql = `
    SELECT category, COUNT(*) as post_count
    FROM posts
    WHERE status = 'published' AND category IS NOT NULL AND category != ''
    GROUP BY category
    ORDER BY post_count DESC
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

// Helper function to manage tags
function manageTags(postId, tags, callback) {
  if (!tags || tags.length === 0) {
    return callback(null);
  }

  // 先刪除舊的標籤關聯
  db.run("DELETE FROM post_tags WHERE post_id = ?", [postId], (err) => {
    if (err) return callback(err);

    // 處理每個標籤
    let processed = 0;
    let hasError = false;

    tags.forEach(tagName => {
      if (hasError) return;

      // 插入或取得標籤 ID
      db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tagName], function(err) {
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
  
  db.run(sql, params, function(err) {
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

  db.run(sql, params, function(err) {
    if (err) {
      res.status(400).json({"error": err.message});
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({"message": "Post not found"});
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
  db.run(sql, [status, req.params.id], function(err) {
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
  const sql = 'DELETE FROM posts WHERE id = ?';
  db.run(sql, req.params.id, function(err) {
    if (err) {
      res.status(400).json({"error": err.message});
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({"message": "Post not found"});
      return;
    }
    res.json({ "message": "deleted", "changes": this.changes });
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

  db.run(sql, params, function(err) {
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
  db.run(sql, [req.params.id], function(err) {
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

  db.run(sql, params, function(err) {
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
  db.run(sql, ['unsubscribed', email], function(err) {
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
  
  db.run(sql, params, function(err) {
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
      function(err) {
        if (err) {
          console.error('更新密碼失敗:', err);
          return res.status(500).json({ message: '更新密碼失敗' });
        }
        
        if (this.changes === 0) {
          // 用戶不存在，創建新用戶
          db.run(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [targetUsername, hashedPassword, 'admin'],
            function(insertErr) {
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

app.use('/api', apiRouter);

// Default response for any other request
app.use(function(req, res){
  res.status(404).send('Not Found');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
