-- 文章內容格式：'markdown'（預設，走既有 react-markdown 管線）| 'mdx'（走 MDX 編譯管線）。
-- 逐篇 opt-in：既有文章全部維持 markdown，不受影響。
ALTER TABLE posts ADD COLUMN format TEXT DEFAULT 'markdown';
