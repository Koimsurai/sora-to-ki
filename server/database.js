const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.sqlite');
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

    // 更新文章表結構
    db.run(`
      CREATE TABLE IF NOT EXISTS posts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        status TEXT DEFAULT 'published',
        author TEXT DEFAULT 'Koimsurai',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 遷移舊資料
    db.run(`
      INSERT OR IGNORE INTO posts_new (id, title, content, author, created_at)
      SELECT id, title, content, author, created_at FROM posts
    `);

    // 刪除舊表，重命名新表
    db.run(`DROP TABLE IF EXISTS posts`);
    db.run(`ALTER TABLE posts_new RENAME TO posts`);

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

    // 創建留言表
    db.run(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    // 檢查並創建/更新管理員用戶
    const targetUsername = process.env.ADMIN_USERNAME || 'timo9378';
    const targetPassword = process.env.ADMIN_PASSWORD || 'jces5556';
    const saltRounds = 10;
    
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

    console.log('資料庫初始化完成');
  });
}

module.exports = { initializeDatabase, db };
