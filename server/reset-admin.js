const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath);

async function resetAdmin() {
  const username = 'timo9378';
  const password = 'jces5556';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  console.log('檢查現有用戶...');
  
  db.all("SELECT * FROM users", [], (err, rows) => {
    if (err) {
      console.error('查詢用戶失敗:', err);
      return;
    }
    
    console.log('現有用戶:', rows);
    
    // 先刪除舊的 admin 用戶（如果存在）
    db.run("DELETE FROM users WHERE username = 'admin'", [], (err) => {
      if (err) {
        console.error('刪除舊用戶失敗:', err);
      } else {
        console.log('已刪除舊的 admin 用戶');
      }
      
      // 檢查 timo9378 是否存在
      db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) {
          console.error('查詢用戶失敗:', err);
          return;
        }
        
        if (user) {
          // 更新密碼
          db.run(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            [hashedPassword, username],
            (err) => {
              if (err) {
                console.error('更新密碼失敗:', err);
              } else {
                console.log(`已更新 ${username} 的密碼`);
              }
              db.close();
            }
          );
        } else {
          // 創建新用戶
          db.run(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            [username, hashedPassword, 'admin'],
            (err) => {
              if (err) {
                console.error('創建用戶失敗:', err);
              } else {
                console.log(`已創建用戶 ${username}`);
              }
              db.close();
            }
          );
        }
      });
    });
  });
}

resetAdmin().catch(console.error);
