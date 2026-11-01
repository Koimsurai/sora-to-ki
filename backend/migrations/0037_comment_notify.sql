-- 站長回覆時寄信給原留言者：讀者在留言表單上勾了「站長回覆時寄信通知我」才寄（email 欄誰都能亂填，
-- 所以預設不寄）。notify_token 是信裡退訂連結用的，一則留言一個；退訂會把同一個信箱的勾選全部拿掉，
-- 之後新的留言再勾就是重新同意。locale 是留言當時的語系，信用那個語言寫。
ALTER TABLE comments ADD COLUMN notify_reply INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN notify_token TEXT DEFAULT NULL;
ALTER TABLE comments ADD COLUMN locale TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_notify_token ON comments(notify_token);
