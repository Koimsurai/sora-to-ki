#!/bin/sh
# 修 Express bug #1：comments.post_id 為 NOT NULL → thought 留言（post_id=NULL）
# 從站上線以來一直發不出去。SQLite 不支援 ALTER COLUMN → 12-step 重建表。
#
# 用法：在後端容器內執行（需 node + sqlite3 模組、workdir /usr/src/app）：
#   docker cp 本檔進容器 → docker exec -w /usr/src/app <c> sh /tmp/mig.sh /usr/src/app/db/db.sqlite
# 執行前務必：①備份 db ②低流量時段 ③兩個後端（Express/Rust）容忍 busy_timeout 內的短鎖。
set -eu
DB="${1:?用法: $0 <db.sqlite>}"

# 演練教訓：DROP TABLE 會連帶掉顯式 index，必須重建（見尾端兩條 CREATE INDEX）。
node -e '
const sqlite3 = require("sqlite3");
const db = new sqlite3.Database(process.argv[1]);
db.exec(`
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
CREATE TABLE comments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_admin INTEGER DEFAULT 0, email TEXT DEFAULT '"'"''"'"', website TEXT DEFAULT '"'"''"'"',
  status TEXT DEFAULT '"'"'approved'"'"', ip TEXT DEFAULT '"'"''"'"', parent_id INTEGER DEFAULT NULL,
  avatar_url TEXT DEFAULT '"'"''"'"', thought_id INTEGER DEFAULT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
INSERT INTO comments_new SELECT id,post_id,author,content,likes,created_at,is_admin,email,website,status,ip,parent_id,avatar_url,thought_id FROM comments;
DROP TABLE comments;
ALTER TABLE comments_new RENAME TO comments;
CREATE INDEX idx_comments_post_status ON comments(post_id, status);
CREATE INDEX idx_comments_thought ON comments(thought_id, status);
COMMIT;
PRAGMA foreign_keys=ON;
`, (err) => {
  if (err) { console.error("migration 失敗:", err.message); process.exit(1); }
  db.all("PRAGMA foreign_key_check(comments)", (e, rows) => {
    if (e || (rows && rows.length)) { console.error("fk_check 異常:", e || rows); process.exit(1); }
    db.get("SELECT COUNT(*) AS n FROM comments", (e2, r) => {
      console.log(`OK — comments ${r.n} 列，post_id 已 nullable，index 已重建`);
      process.exit(0);
    });
  });
});
' "$DB"
