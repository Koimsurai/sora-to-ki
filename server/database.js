const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Ensure the database directory exists
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('資料庫連接失敗:', err.message);
  } else {
    console.log('已連接到 SQLite 資料庫');
  }
});

// 初始化資料庫
function initializeDatabase() {
  db.serialize(() => {
    // 創建用戶表
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 檢查 posts 表是否存在以及其結構
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'", (err, table) => {
      if (err) {
        console.error('檢查 posts 表錯誤:', err);
        return;
      }

      if (!table) {
        // posts 表不存在，直接創建新表
        console.log('創建新的 posts 表...');
        db.run(`
          CREATE TABLE posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            excerpt TEXT,
            category TEXT,
            status TEXT DEFAULT 'published',
            author TEXT DEFAULT 'Koimsurai',
            view_count INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (createErr) => {
          if (createErr) {
            console.error('創建 posts 表錯誤:', createErr);
          } else {
            console.log('posts 表創建成功');
          }
        });
      } else {
        // posts 表存在，檢查是否需要遷移
        db.all("PRAGMA table_info(posts)", (err, columns) => {
          if (err) {
            console.error('檢查 posts 表結構錯誤:', err);
            return;
          }

          const columnNames = columns.map(col => col.name);
          const hasCategory = columnNames.includes('category');
          const hasViewCount = columnNames.includes('view_count');

          if (!hasCategory || !hasViewCount) {
            // 需要遷移
            console.log('遷移 posts 表結構...');
            
            // 創建新表
            db.run(`
              CREATE TABLE IF NOT EXISTS posts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                excerpt TEXT,
                category TEXT,
                status TEXT DEFAULT 'published',
                author TEXT DEFAULT 'Koimsurai',
                view_count INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (createErr) => {
              if (createErr) {
                console.error('創建 posts_new 表錯誤:', createErr);
                return;
              }

              // 動態構建 SELECT 語句
              let selectFields = ['id', 'title', 'content'];
              let insertFields = ['id', 'title', 'content'];
              
              if (columnNames.includes('excerpt')) {
                selectFields.push('excerpt');
                insertFields.push('excerpt');
              } else {
                selectFields.push("'' as excerpt");
                insertFields.push('excerpt');
              }

              selectFields.push("'' as category");
              insertFields.push('category');

              if (columnNames.includes('status')) {
                selectFields.push('status');
                insertFields.push('status');
              } else {
                selectFields.push("'published' as status");
                insertFields.push('status');
              }

              if (columnNames.includes('author')) {
                selectFields.push('author');
                insertFields.push('author');
              } else {
                selectFields.push("'Koimsurai' as author");
                insertFields.push('author');
              }

              selectFields.push('0 as view_count');
              insertFields.push('view_count');

              selectFields.push('0 as likes');
              insertFields.push('likes');

              if (columnNames.includes('created_at')) {
                selectFields.push('created_at');
                insertFields.push('created_at');
              } else {
                selectFields.push("datetime('now') as created_at");
                insertFields.push('created_at');
              }

              if (columnNames.includes('updated_at')) {
                selectFields.push('updated_at');
                insertFields.push('updated_at');
              } else if (columnNames.includes('created_at')) {
                selectFields.push('created_at as updated_at');
                insertFields.push('updated_at');
              } else {
                selectFields.push("datetime('now') as updated_at");
                insertFields.push('updated_at');
              }

              const migrateSql = `
                INSERT INTO posts_new (${insertFields.join(', ')})
                SELECT ${selectFields.join(', ')}
                FROM posts
              `;

              // 複製資料
              db.run(migrateSql, (migrateErr) => {
                if (migrateErr) {
                  console.error('遷移資料錯誤:', migrateErr);
                  return;
                }

                // 刪除舊表
                db.run('DROP TABLE posts', (dropErr) => {
                  if (dropErr) {
                    console.error('刪除舊 posts 表錯誤:', dropErr);
                    return;
                  }

                  // 重命名新表
                  db.run('ALTER TABLE posts_new RENAME TO posts', (renameErr) => {
                    if (renameErr) {
                      console.error('重命名 posts_new 表錯誤:', renameErr);
                    } else {
                      console.log('posts 表遷移成功');
                    }
                  });
                });
              });
            });
          } else {
            console.log('posts 表結構已是最新版本');

            // 檢查是否需要新增 layout_type 欄位
            const hasLayoutType = columnNames.includes('layout_type');
            if (!hasLayoutType) {
              console.log('新增 layout_type 欄位...');
              db.run("ALTER TABLE posts ADD COLUMN layout_type TEXT DEFAULT 'record'", (alterErr) => {
                if (alterErr) {
                  console.error('新增 layout_type 欄位錯誤:', alterErr);
                } else {
                  console.log('layout_type 欄位新增成功');
                }
              });
            }

          }
        });
      }
    });

    // i18n 欄位：無論上面 posts 表走哪條路徑，最後都獨立檢查並補齊
    // source_language + 9 個翻譯欄位（en / zh-CN / ja × title/content/excerpt）
    setTimeout(() => {
      db.all("PRAGMA table_info(posts)", (err, cols) => {
        if (err) { console.error('i18n migration: PRAGMA 失敗:', err); return; }
        const existing = new Set(cols.map(c => c.name));
        const i18nColumns = [
          { name: 'source_language', type: "TEXT DEFAULT 'zh-TW'" },
          { name: 'title_en', type: 'TEXT' },
          { name: 'content_en', type: 'TEXT' },
          { name: 'excerpt_en', type: 'TEXT' },
          { name: 'title_zh_cn', type: 'TEXT' },
          { name: 'content_zh_cn', type: 'TEXT' },
          { name: 'excerpt_zh_cn', type: 'TEXT' },
          { name: 'title_ja', type: 'TEXT' },
          { name: 'content_ja', type: 'TEXT' },
          { name: 'excerpt_ja', type: 'TEXT' },
          { name: 'title_ko', type: 'TEXT' },
          { name: 'content_ko', type: 'TEXT' },
          { name: 'excerpt_ko', type: 'TEXT' },
        ];
        i18nColumns.forEach(col => {
          if (!existing.has(col.name)) {
            db.run(`ALTER TABLE posts ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
              if (alterErr) console.error(`i18n migration: 新增 ${col.name} 錯誤:`, alterErr);
              else console.log(`i18n migration: ${col.name} 欄位新增成功`);
            });
          }
        });

        // 系列文（Series）支援
        const seriesColumns = [
          { name: 'series_name', type: 'TEXT DEFAULT NULL' },
          { name: 'series_order', type: 'INTEGER DEFAULT NULL' },
        ];
        seriesColumns.forEach(col => {
          if (!existing.has(col.name)) {
            db.run(`ALTER TABLE posts ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
              if (alterErr) console.error(`series migration: 新增 ${col.name} 錯誤:`, alterErr);
              else console.log(`series migration: ${col.name} 欄位新增成功`);
            });
          }
        });

        // 允許留言 toggle
        if (!existing.has('allow_comments')) {
          db.run("ALTER TABLE posts ADD COLUMN allow_comments INTEGER DEFAULT 1", (alterErr) => {
            if (alterErr) console.error('allow_comments migration 錯誤:', alterErr);
            else console.log('allow_comments 欄位新增成功');
          });
        }
      });
    }, 500);

    // 創建分類表
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('創建 categories 表錯誤:', err);
      } else {
        console.log('categories 表已就緒');

        // 檢查是否需要新增 short_description 欄位
        db.all("PRAGMA table_info(categories)", (pragmaErr, columns) => {
          if (pragmaErr) {
            console.error('檢查 categories 表結構錯誤:', pragmaErr);
            return;
          }
          const colNames = columns.map(c => c.name);
          if (!colNames.includes('short_description')) {
            console.log('新增 short_description 欄位到 categories 表...');
            db.run("ALTER TABLE categories ADD COLUMN short_description TEXT DEFAULT ''", (alterErr) => {
              if (alterErr) {
                console.error('新增 short_description 欄位錯誤:', alterErr);
              } else {
                console.log('categories.short_description 欄位新增成功');
              }
            });
          }
        });
        
        // 檢查是否需要遷移現有的分類數據
        db.all(`
          SELECT DISTINCT category 
          FROM posts 
          WHERE category IS NOT NULL AND category != ''
        `, [], (err, rows) => {
          if (err) {
            console.error('查詢現有分類失敗:', err);
            return;
          }
          
          if (rows && rows.length > 0) {
            console.log(`發現 ${rows.length} 個現有分類，開始遷移...`);
            
            rows.forEach(row => {
              const categoryName = row.category;
              const slug = categoryName.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w\-\u4e00-\u9fa5]+/g, '');
              
              db.run(`
                INSERT OR IGNORE INTO categories (name, slug, description)
                VALUES (?, ?, ?)
              `, [categoryName, slug, `自動遷移的分類: ${categoryName}`], (insertErr) => {
                if (insertErr) {
                  console.error(`遷移分類 "${categoryName}" 失敗:`, insertErr);
                } else {
                  console.log(`✓ 已遷移分類: ${categoryName}`);
                }
              });
            });
          }
        });
      }
    });

    // 創建標籤表
    db.run(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 創建文章標籤關聯表
    db.run(`
      CREATE TABLE IF NOT EXISTS post_tags (
        post_id INTEGER,
        tag_id INTEGER,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, tag_id)
      )
    `);

    // Emoji 反應表 — 每個 (post_id, emoji) 一列，count 累計
    db.run(`
      CREATE TABLE IF NOT EXISTS post_reactions (
        post_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, emoji),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    // 動畫瘋觀看紀錄 — 從 api.gamer.com.tw/anime/v3/history.php 同步進來。
    // anime_sn = 整部動畫的 ID, video_sn = 集數 ID, 兩個合一才唯一。
    // last_watched_at 是「我們第一次同步看到這筆」的時間（Bahamut API 沒給確切觀看時間，
    // 但 cron 6 小時跑一次，誤差最多 ±6 小時，夠用了）。
    db.run(`
      CREATE TABLE IF NOT EXISTS anime_history (
        anime_sn INTEGER NOT NULL,
        video_sn INTEGER NOT NULL,
        title TEXT,
        cover_url TEXT,
        episode TEXT,
        last_watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (anime_sn, video_sn)
      )
    `);

    // 補加 episode + tmdb_id 欄位（舊 DB 沒有時 ALTER）
    db.all("PRAGMA table_info(anime_history)", (err, cols) => {
      if (err) return;
      const names = new Set(cols.map((c) => c.name));
      if (!names.has('episode')) {
        db.run("ALTER TABLE anime_history ADD COLUMN episode TEXT", (e) => {
          if (e) console.error('add episode column fail:', e.message);
          else console.log('[anime_history] added episode column');
        });
      }
      if (!names.has('tmdb_id')) {
        db.run("ALTER TABLE anime_history ADD COLUMN tmdb_id INTEGER", (e) => {
          if (e) console.error('add tmdb_id column fail:', e.message);
          else console.log('[anime_history] added tmdb_id column');
        });
      }
    });

    // ── film_history：電影觀看紀錄（Netflix CSV import + 之後 Letterboxd RSS）──
    // PRIMARY KEY: id auto；唯一鍵 (title, watched_date) 防重複匯入
    db.run(`
      CREATE TABLE IF NOT EXISTS film_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        watched_date DATE,
        rating INTEGER,
        source TEXT,
        tmdb_id INTEGER,
        poster_url TEXT,
        release_year INTEGER,
        genres TEXT,
        notes TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(title, watched_date)
      )
    `);

    // ── tv_history：影集觀看紀錄 — 一筆 = 一集（Netflix CSV 是 episode-level）──
    db.run(`
      CREATE TABLE IF NOT EXISTS tv_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_name TEXT NOT NULL,
        episode_label TEXT,
        watched_date DATE,
        source TEXT,
        tmdb_id INTEGER,
        poster_url TEXT,
        genres TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(series_name, episode_label, watched_date)
      )
    `);

    // ── thoughts：碎念 / 思考 feed（Innei 式短想法）──
    // ref_type: NULL | 'link' | 'media'；ref_json 存 OG / TMDb 卡片資料
    db.run(`
      CREATE TABLE IF NOT EXISTS thoughts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        ref_type TEXT,
        ref_url TEXT,
        ref_json TEXT,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        edited INTEGER DEFAULT 0
      )
    `);

    // 檢查並更新 comments 表
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'", (err, table) => {
      if (err) {
        console.error('檢查 comments 表錯誤:', err);
        return;
      }

      if (!table) {
        // comments 表不存在，直接創建
        console.log('創建新的 comments 表...');
        db.run(`
          CREATE TABLE comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
          )
        `, (createErr) => {
          if (createErr) {
            console.error('創建 comments 表錯誤:', createErr);
          } else {
            console.log('comments 表創建成功');
          }
        });
      } else {
        // comments 表存在，檢查是否有 likes 欄位
        db.all("PRAGMA table_info(comments)", (err, columns) => {
          if (err) {
            console.error('檢查 comments 表結構錯誤:', err);
            return;
          }

          const columnNames = columns.map(col => col.name);
          const hasLikes = columnNames.includes('likes');

          if (!hasLikes) {
            // 直接添加 likes 欄位
            console.log('為 comments 表添加 likes 欄位...');
            db.run(`ALTER TABLE comments ADD COLUMN likes INTEGER DEFAULT 0`, (alterErr) => {
              if (alterErr) {
                console.error('添加 likes 欄位錯誤:', alterErr);
              } else {
                console.log('likes 欄位添加成功');
              }
            });
          }

            // 遷移：新增 status, ip, parent_id, is_admin, email, website 欄位
            const migrations = [
              { col: 'status', sql: "ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'approved'" },
              { col: 'ip', sql: "ALTER TABLE comments ADD COLUMN ip TEXT DEFAULT ''" },
              { col: 'parent_id', sql: "ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL" },
              { col: 'is_admin', sql: "ALTER TABLE comments ADD COLUMN is_admin INTEGER DEFAULT 0" },
              { col: 'email', sql: "ALTER TABLE comments ADD COLUMN email TEXT DEFAULT ''" },
              { col: 'website', sql: "ALTER TABLE comments ADD COLUMN website TEXT DEFAULT ''" },
              { col: 'avatar_url', sql: "ALTER TABLE comments ADD COLUMN avatar_url TEXT DEFAULT ''" },
            ];
            migrations.forEach(({ col, sql }) => {
              if (!columnNames.includes(col)) {
                console.log(`為 comments 表添加 ${col} 欄位...`);
                db.run(sql, (e) => {
                  if (e) console.error(`添加 ${col} 欄位錯誤:`, e);
                  else console.log(`${col} 欄位添加成功`);
                });
              }
            });

                // 建立 collection_items 資料表
                db.run(`CREATE TABLE IF NOT EXISTS collection_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    original_title TEXT,
                    year INTEGER,
                    poster_url TEXT,
                    overview TEXT,
                    external_id TEXT,
                    collection_type TEXT NOT NULL,
                    media_format TEXT NOT NULL,
                    source TEXT DEFAULT 'manual',
                    status TEXT DEFAULT 'completed',
                    rating INTEGER,
                    review TEXT,
                    is_favorite BOOLEAN DEFAULT 0,
                    watch_date DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );`);
        });
      }
    });

    // 創建電子報訂閱表
    db.run(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        status TEXT DEFAULT 'active',
        unsubscribe_token TEXT UNIQUE,
        subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at DATETIME
      )
    `);

    // 為舊資料補上 unsubscribe_token 欄位（已存在的 table 不會被 CREATE 影響）
    db.run("ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_token TEXT", (alterErr) => {
      if (alterErr && !String(alterErr.message).includes('duplicate column')) {
        console.warn('newsletter_subscribers unsubscribe_token migration skipped:', alterErr.message);
      }
    });
    // 為缺少 token 的舊訂閱者補一個 token
    db.run(`
      UPDATE newsletter_subscribers
      SET unsubscribe_token = lower(hex(randomblob(16)))
      WHERE unsubscribe_token IS NULL
    `);
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_token ON newsletter_subscribers(unsubscribe_token)");

    // 創建 IP 黑名單表
    db.run(`
      CREATE TABLE IF NOT EXISTS ip_blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE NOT NULL,
        reason TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 創建關鍵字過濾表
    db.run(`
      CREATE TABLE IF NOT EXISTS keyword_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT UNIQUE NOT NULL,
        action TEXT DEFAULT 'spam',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 創建 OAuth 使用者表
    db.run(`
      CREATE TABLE IF NOT EXISTS oauth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'USER',
        linked_to INTEGER DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_id)
      )
    `);

    // Migration: 新增 role 欄位（如果不存在）
    db.all("PRAGMA table_info(oauth_users)", [], (err, columns) => {
      if (columns && !columns.find(c => c.name === 'linked_to')) {
        db.run("ALTER TABLE oauth_users ADD COLUMN linked_to INTEGER DEFAULT NULL");
      }
      if (columns && !columns.find(c => c.name === 'role')) {
        db.run("ALTER TABLE oauth_users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER'");
      }
    });

    // 創建書籍表
    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn TEXT,
        title TEXT NOT NULL,
        authors TEXT,
        publisher TEXT,
        published_date TEXT,
        description TEXT,
        cover_url TEXT,
        page_count INTEGER,
        language TEXT,
        categories TEXT,
        reading_status TEXT DEFAULT 'to-read',
        rating REAL,
        personal_notes TEXT,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_started DATETIME,
        date_finished DATETIME
      )
    `, (err) => {
      if (err) {
        console.error('創建 books 表錯誤:', err);
      } else {
        console.log('books 表已就緒');
        // Migration logic for rating column
        db.all("PRAGMA table_info(books)", (err, columns) => {
          if (err) return;
          const ratingColumn = columns.find(c => c.name === 'rating');
          if (ratingColumn && ratingColumn.type === 'INTEGER') {
            console.log('正在遷移 books 表的 rating 欄位從 INTEGER 到 REAL...');
            db.serialize(() => {
              db.run("CREATE TABLE books_new (id INTEGER PRIMARY KEY AUTOINCREMENT, isbn TEXT, title TEXT NOT NULL, authors TEXT, publisher TEXT, published_date TEXT, description TEXT, cover_url TEXT, page_count INTEGER, language TEXT, categories TEXT, reading_status TEXT, rating REAL, personal_notes TEXT, date_added DATETIME, date_updated DATETIME, date_started DATETIME, date_finished DATETIME)");
              db.run("INSERT INTO books_new SELECT id, isbn, title, authors, publisher, published_date, description, cover_url, page_count, language, categories, reading_status, rating, personal_notes, date_added, date_updated, date_started, date_finished FROM books");
              db.run("DROP TABLE books");
              db.run("ALTER TABLE books_new RENAME TO books");
              console.log('books 表的 rating 欄位遷移成功。');
            });
          }
        });
      }
    });

    // 檢查並創建/更新管理員用戶
    const targetUsername = process.env.ADMIN_USERNAME || 'admin';
    const targetPassword = process.env.ADMIN_PASSWORD;
    const saltRounds = 10;

    if (!targetPassword) {
      console.warn('[SECURITY] ADMIN_PASSWORD is not set. Skipping default admin password bootstrap.');
      return;
    }
    
    // 使用 async 函數包裝
    (async () => {
      try {
        const hashedPassword = await bcrypt.hash(targetPassword, saltRounds);
        
        // 先檢查目標用戶是否存在
        db.get("SELECT * FROM users WHERE username = ?", [targetUsername], (err, existingUser) => {
          if (err) {
            console.error('檢查用戶失敗:', err);
            return;
          }
          
          if (existingUser) {
            // 用戶存在，更新密碼
            db.run(
              "UPDATE users SET password_hash = ? WHERE username = ?",
              [hashedPassword, targetUsername],
              function(err) {
                if (err) {
                  console.error('更新用戶密碼失敗:', err);
                } else {
                  console.log(`已更新管理員 ${targetUsername} 的密碼`);
                }
              }
            );
          } else {
            // 用戶不存在，創建新用戶
            db.run(
              "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
              [targetUsername, hashedPassword, 'admin'],
              function(err) {
                if (err) {
                  console.error('創建用戶失敗:', err);
                } else {
                  console.log(`已創建管理員用戶: ${targetUsername}`);
                }
              }
            );
          }
        });
      } catch (error) {
        console.error('密碼處理失敗:', error);
      }
    })();

    // 檢查是否已有文章，如果沒有則從 JSON 文件導入示例數據
    db.get("SELECT COUNT(*) as count FROM posts", [], async (err, row) => {
      if (err) {
        console.error('檢查文章失敗:', err);
        return;
      }

      if (row.count === 0) {
        try {
          const fs = require('fs');
          const path = require('path');
          const postsPath = path.join(__dirname, '..', 'src', 'data', 'posts.json');
          
          if (fs.existsSync(postsPath)) {
            const postsData = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
            
            for (const post of postsData) {
              // 插入文章
              db.run(
                "INSERT INTO posts (title, content, status, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                [
                  post.title,
                  post.content,
                  'published',
                  post.author,
                  new Date(post.date).toISOString(),
                  new Date().toISOString()
                ],
                function(insertErr) {
                  if (insertErr) {
                    console.error('插入文章失敗:', insertErr);
                    return;
                  }
                  
                  const postId = this.lastID;
                  
                  // 處理標籤
                  if (post.tags && post.tags.length > 0) {
                    for (const tagName of post.tags) {
                      // 先嘗試插入標籤（如果不存在）
                      db.run(
                        "INSERT OR IGNORE INTO tags (name) VALUES (?)",
                        [tagName],
                        function(tagInsertErr) {
                          if (tagInsertErr) {
                            console.error('插入標籤失敗:', tagInsertErr);
                            return;
                          }
                          
                          // 獲取標籤 ID 並建立關聯
                          db.get("SELECT id FROM tags WHERE name = ?", [tagName], (getTagErr, tagRow) => {
                            if (getTagErr) {
                              console.error('獲取標籤 ID 失敗:', getTagErr);
                              return;
                            }
                            
                            if (tagRow) {
                              db.run(
                                "INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)",
                                [postId, tagRow.id],
                                (linkErr) => {
                                  if (linkErr) {
                                    console.error('建立文章標籤關聯失敗:', linkErr);
                                  }
                                }
                              );
                            }
                          });
                        }
                      );
                    }
                  }
                }
              );
            }
            
            console.log(`已導入 ${postsData.length} 篇示例文章`);
          } else {
            console.log('未找到示例文章文件，跳過數據導入');
          }
        } catch (error) {
          console.error('導入示例文章失敗:', error);
        }
      }
    });

    // ─── Performance Indexes ───
    db.run("CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC)");
    db.run("CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)");
    db.run("CREATE INDEX IF NOT EXISTS idx_comments_post_status ON comments(post_id, status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_post_tags_post ON post_tags(post_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_users(provider, provider_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_books_reading_status ON books(reading_status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_collection_type ON collection_items(collection_type)");

    // ─── SQLite Performance Tuning ───
    db.run("PRAGMA journal_mode = WAL");        // Write-Ahead Logging for better concurrency
    db.run("PRAGMA synchronous = NORMAL");       // Faster writes, safe with WAL
    db.run("PRAGMA cache_size = -8000");         // 8MB page cache (default ~2MB)
    db.run("PRAGMA temp_store = MEMORY");        // Temp tables in memory

    console.log('資料庫初始化完成');
  });
}

module.exports = { initializeDatabase, db };
