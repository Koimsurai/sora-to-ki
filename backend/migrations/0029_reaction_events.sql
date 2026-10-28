-- 每一次愛心／表情／留言的讚／碎念的喜歡都記一筆（2026-10）。
--
-- 原本這些都只有計數器（post_reactions.count、comments.likes、thoughts.likes…），站長在後台看不到
-- 「什麼時候、哪一篇、從哪裡來的讀者」按的。這裡補上事件紀錄，計數器照舊是前台顯示的數字，
-- 開始記錄之前的那些只剩總數（後台寫成「開始記錄之前已收到 N」）。
--
-- 不記身分：沒有 IP、沒有 User-Agent 原文。
--   kind      post（文章的表情）／site（首頁的印記）／comment（留言的讚）／thought（碎念）
--   target_id 文章、留言、碎念的 id；site 是 NULL
--   value     表情本身（❤️ 🎉…）、like、dislike
--   delta     +1 按下、-1 收回
--   country   Cloudflare 的 CF-IPCountry（兩碼國碼）
--   referrer  讀者這次是從哪個網站連進來的（只有主機名，前台帶在 X-Visit-Referrer）
--   device    mobile／desktop（後端看 User-Agent 判斷，只留結論）
--   locale    讀者當時在哪個語系（前台帶在 X-Visit-Locale）
CREATE TABLE IF NOT EXISTS reaction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  target_id INTEGER,
  value TEXT NOT NULL,
  delta INTEGER NOT NULL,
  country TEXT,
  referrer TEXT,
  device TEXT,
  locale TEXT
);
CREATE INDEX IF NOT EXISTS idx_reaction_events_created ON reaction_events(created_at);
