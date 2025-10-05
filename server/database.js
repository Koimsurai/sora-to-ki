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
          } else {
            console.log('comments 表結構已是最新版本');
          }
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
        subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at DATETIME
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
