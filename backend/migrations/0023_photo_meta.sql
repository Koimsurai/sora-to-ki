-- 照片的後台設定（2026-10 後台提案的「照片」頁）。
--
-- 照片本身在 manifest.json（NAS 同步產生，見 handlers/gallery.rs），每次同步都會重寫那個檔。
-- 站長改的東西存在這裡、讀的時候疊上去，所以重新同步不會把改過的標題蓋回檔名。
--
-- title / description：NULL = 用 manifest 的（同步時的檔名、空字串）
-- tags / tags_en：JSON 陣列；NULL = 用 manifest 的（同步時自動標的）
-- featured：精選，前台地面站排在最上面
-- hidden：前台不顯示（公開的 /api/gallery/photos 不給；檔案本身還在，知道網址的仍然打得開）
CREATE TABLE IF NOT EXISTS photo_meta (
  photo_id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  tags TEXT,
  tags_en TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
