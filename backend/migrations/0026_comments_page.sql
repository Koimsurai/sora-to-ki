-- 留言頁（/messages）的留言：不屬於任何一篇文章或碎念，記在 page（現在只有 'messages'）。
--
-- 2026-10 翻新時留言頁拿文章留言那一套來用，送的是 post_id = 'meta-messages'——而 comments.post_id
-- 有外鍵指向 posts(id)，於是每一則都撞 FOREIGN KEY constraint failed，從上線起一則都沒寫進去過。
-- 這一欄沒有外鍵：可以留言的頁面由後端的白名單決定（handlers/comments.rs 的 PAGES）。
ALTER TABLE comments ADD COLUMN page TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page, status);
