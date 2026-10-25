-- 收藏頁「不公開」的東西（2026-10 後台提案的「收藏」頁）。
--
-- 觀看紀錄與聽的歌都是同步進來的（巴哈、Simkl、Spotify），站長沒辦法決定「有沒有看」，
-- 只能決定「這一部／這一首要不要出現在前台」。一列 = 一個不公開的東西：
--   kind = 'anime'：key 是巴哈的 anime_sn（整部動畫，不是單集）
--   kind = 'film' ：key 是 film_history.id
--   kind = 'tv'   ：key 是 tv_history.series_name（整部影集）
--   kind = 'track'：key 是 Spotify 的 track id
-- title：藏的時候記下名字。Spotify 的歌不在 DB 裡，後台要列出「藏了哪些」只能靠這裡記的
CREATE TABLE IF NOT EXISTS collection_hidden (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  hidden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, key)
);
