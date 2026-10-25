-- 友鏈：朋友名單從程式碼搬進 DB，外加公開的申請表單與後台審核（2026-10 後台提案）。
--
-- status：
--   'pending'  ：剛送來、還沒看
--   'waiting'  ：看過了，等對方把這裡加回去再說（仍在「待看」裡）
--   'approved' ：朋友，出現在朋友頁
--   'rejected' ：退回
-- slug：朋友頁用它決定每顆星的軌道（同一位朋友的位置不會因為名單順序變而跳動）。
--   收下時才由網址產生；舊的兩位沿用原本寫死的 id，位置不變。
-- checks：最近一次自動檢查的結果（JSON 陣列），checked_at 是那次的時間。
-- ip：申請者的 IP，只給防濫用用（同一個 IP 一天送太多次就擋），朋友頁不會出現。
CREATE TABLE IF NOT EXISTS friend_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  feed_url TEXT,
  email TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  checks TEXT,
  checked_at DATETIME,
  ip TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_friend_links_status ON friend_links (status, sort_order);

-- 原本寫死在 handlers/friends.rs 的兩位（站名與介紹照對方站上寫的）
INSERT INTO friend_links (slug, name, url, description, feed_url, status, sort_order, reviewed_at) VALUES
  ('doraeyi', 'Liam', 'https://blog.doraeyi.com', '前端工程師的偵探手記', 'https://blog.doraeyi.com/rss.xml', 'approved', 1, CURRENT_TIMESTAMP),
  ('sao-x', '影の書庫', 'https://blog.sao-x.com', '潛伏於陰影中的書庫，收藏著程式、技術與日常的筆記。', 'https://blog.sao-x.com/rss.xml', 'approved', 2, CURRENT_TIMESTAMP);
