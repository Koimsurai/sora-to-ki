-- 書架上從別的平台同步進來的書（NeoDB、Bangumi；backend/src/handlers/read_sources.rs）：
-- 記下來源與那個平台上的編號，同一本再同步一次是更新閱讀狀態，不是多一本。
-- 手動加的書兩欄都是 NULL，不受影響。
ALTER TABLE books ADD COLUMN source TEXT;
ALTER TABLE books ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_external_id ON books(external_id) WHERE external_id IS NOT NULL;
