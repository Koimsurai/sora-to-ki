-- Baseline schema（2026-07）：對齊 Express 退役時的正式 DB 最終形狀。
-- 來源：git 歷史的 server/database.js（初始 DDL + 全部後續 ALTER 折疊進欄位清單）
--       + Rust main.rs 曾冪等建立的 web_vitals / link_previews。
-- 全部 IF NOT EXISTS：在既有正式 DB 上執行是 no-op（sqlx 只記錄版本），
-- 在全新 DB / 測試 in-memory DB 上則建出完整 schema。

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- posts：初始欄位 + layout_type/i18n（en/zh_cn/ja/ko × title/content/excerpt）
-- + series + allow_comments 等歷次 ALTER 的最終形狀
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  category TEXT,
  status TEXT DEFAULT 'published',
  author TEXT DEFAULT 'Koimsurai',
  view_count INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  layout_type TEXT DEFAULT 'record',
  source_language TEXT DEFAULT 'zh-TW',
  title_en TEXT,
  content_en TEXT,
  excerpt_en TEXT,
  title_zh_cn TEXT,
  content_zh_cn TEXT,
  excerpt_zh_cn TEXT,
  title_ja TEXT,
  content_ja TEXT,
  excerpt_ja TEXT,
  title_ko TEXT,
  content_ko TEXT,
  excerpt_ko TEXT,
  series_name TEXT DEFAULT NULL,
  series_order INTEGER DEFAULT NULL,
  allow_comments INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  short_description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_reactions (
  post_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, emoji),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- comments：post_id 可為 NULL（碎念留言只填 thought_id——見 9bf416b 的 nullable 遷移）
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'approved',
  ip TEXT DEFAULT '',
  parent_id INTEGER DEFAULT NULL,
  is_admin INTEGER DEFAULT 0,
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  thought_id INTEGER DEFAULT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS anime_history (
  anime_sn INTEGER NOT NULL,
  video_sn INTEGER NOT NULL,
  title TEXT,
  cover_url TEXT,
  episode TEXT,
  last_watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tmdb_id INTEGER,
  PRIMARY KEY (anime_sn, video_sn)
);

CREATE TABLE IF NOT EXISTS film_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  watched_date DATE,
  rating INTEGER,
  source TEXT,
  tmdb_id INTEGER,
  poster_url TEXT,
  release_year INTEGER,
  genres TEXT,
  notes TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(title, watched_date)
);

CREATE TABLE IF NOT EXISTS tv_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_name TEXT NOT NULL,
  episode_label TEXT,
  watched_date DATE,
  source TEXT,
  tmdb_id INTEGER,
  poster_url TEXT,
  genres TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_name, episode_label, watched_date)
);

CREATE TABLE IF NOT EXISTS thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  ref_type TEXT,
  ref_url TEXT,
  ref_json TEXT,
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  edited INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS watch_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'film',
  rating INTEGER DEFAULT 5,
  quote TEXT DEFAULT '',
  poster_url TEXT,
  year INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- collection_items：Rust 端已無端點使用，但正式 DB 存在此表——baseline 保持對齊
CREATE TABLE IF NOT EXISTS collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  poster_url TEXT,
  overview TEXT,
  external_id TEXT,
  collection_type TEXT NOT NULL,
  media_format TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'completed',
  rating INTEGER,
  review TEXT,
  is_favorite BOOLEAN DEFAULT 0,
  watch_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'active',
  unsubscribe_token TEXT UNIQUE,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME
);

CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT UNIQUE NOT NULL,
  reason TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keyword_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT UNIQUE NOT NULL,
  action TEXT DEFAULT 'spam',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'USER',
  linked_to INTEGER DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT,
  title TEXT NOT NULL,
  authors TEXT,
  publisher TEXT,
  published_date TEXT,
  description TEXT,
  cover_url TEXT,
  page_count INTEGER,
  language TEXT,
  categories TEXT,
  reading_status TEXT DEFAULT 'to-read',
  rating REAL,
  personal_notes TEXT,
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_started DATETIME,
  date_finished DATETIME
);

-- Rust 期新增（原本由 main.rs 冪等建立，收編進 migration）
CREATE TABLE IF NOT EXISTS web_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  rating TEXT NOT NULL,
  path TEXT NOT NULL,
  is_mobile INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image TEXT,
  site_name TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 索引（Express performance indexes + Rust 期新增，全數折疊）──
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_comments_post_status ON comments(post_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_thought ON comments(thought_id, status);
CREATE INDEX IF NOT EXISTS idx_post_tags_post ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_token ON newsletter_subscribers(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_books_reading_status ON books(reading_status);
CREATE INDEX IF NOT EXISTS idx_collection_type ON collection_items(collection_type);
CREATE INDEX IF NOT EXISTS idx_anime_history_watched ON anime_history(last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_anime_history_sn ON anime_history(anime_sn);
CREATE INDEX IF NOT EXISTS idx_anime_history_video ON anime_history(video_sn);
CREATE INDEX IF NOT EXISTS idx_film_history_tmdb ON film_history(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_tv_history_series ON tv_history(series_name);
CREATE INDEX IF NOT EXISTS idx_thoughts_created ON thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_vitals_metric_created ON web_vitals(metric, created_at);
