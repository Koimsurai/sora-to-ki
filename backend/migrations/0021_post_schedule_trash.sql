-- 排程發佈與回收桶（2026-10 後台提案）。
--
-- status 多了兩種值：
--   'scheduled'：到 publish_at 才發佈（handlers/post_lifecycle 的 worker 每分鐘翻一次）
--   'trashed'  ：在回收桶裡；30 天後由同一支 worker 真的刪掉
-- 公開端點本來就只讀 status = 'published'，所以這兩種狀態對讀者天生是看不到的。
--
-- publish_at：UTC 'YYYY-MM-DD HH:MM:SS'（跟 created_at 同一種寫法，SQLite 的 datetime() 直接比）。
--   翻成 published 時 created_at 改成這個時間，文章的日期就是「預定的那一刻」而不是「寫下草稿的那天」。
-- newsletter_pending：排程時勾了「發佈時推送電子報」，翻成 published 那一刻才寄。
-- trashed_at / trashed_from：丟進回收的時間，以及丟之前的狀態（還原時回到那個狀態）。
ALTER TABLE posts ADD COLUMN publish_at DATETIME;
ALTER TABLE posts ADD COLUMN newsletter_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN trashed_at DATETIME;
ALTER TABLE posts ADD COLUMN trashed_from TEXT;

-- worker 每分鐘查一次「到期的排程」，回收桶每天清一次——兩條都只碰極少數列
CREATE INDEX IF NOT EXISTS idx_posts_status_publish_at ON posts (status, publish_at);
