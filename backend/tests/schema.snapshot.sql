-- 由 backend/tests/schema.rs 產生，不要手改。
-- 要更新：UPDATE_SCHEMA_SNAPSHOT=1 cargo test --test schema
-- 這份快照的用途是「schema 變了就要有人明說」——後端沒有編譯期 SQL 檢查，
-- 欄位靜悄悄改名的話只有線上會知道。

index idx_anime_history_sn
  CREATE INDEX idx_anime_history_sn ON anime_history(anime_sn)

index idx_anime_history_video
  CREATE INDEX idx_anime_history_video ON anime_history(video_sn)

index idx_anime_history_watched
  CREATE INDEX idx_anime_history_watched ON anime_history(last_watched_at DESC)

index idx_books_reading_status
  CREATE INDEX idx_books_reading_status ON books(reading_status)

index idx_collection_type
  CREATE INDEX idx_collection_type ON collection_items(collection_type)

index idx_comments_page
  CREATE INDEX idx_comments_page ON comments(page, status)

index idx_comments_post_status
  CREATE INDEX idx_comments_post_status ON comments(post_id, status)

index idx_comments_thought
  CREATE INDEX idx_comments_thought ON comments(thought_id, status)

index idx_film_history_tmdb
  CREATE INDEX idx_film_history_tmdb ON film_history(tmdb_id)

index idx_film_history_uniq
  CREATE UNIQUE INDEX idx_film_history_uniq ON film_history (title, COALESCE(watched_date, ''))

index idx_friend_links_status
  CREATE INDEX idx_friend_links_status ON friend_links (status, sort_order)

index idx_newsletter_status
  CREATE INDEX idx_newsletter_status ON newsletter_subscribers(status)

index idx_newsletter_token
  CREATE UNIQUE INDEX idx_newsletter_token ON newsletter_subscribers(unsubscribe_token)

index idx_oauth_provider
  CREATE INDEX idx_oauth_provider ON oauth_users(provider, provider_id)

index idx_post_tags_post
  CREATE INDEX idx_post_tags_post ON post_tags(post_id)

index idx_post_tags_tag
  CREATE INDEX idx_post_tags_tag ON post_tags(tag_id)

index idx_posts_category
  CREATE INDEX idx_posts_category ON posts(category)

index idx_posts_slug
  CREATE UNIQUE INDEX idx_posts_slug ON posts(slug) WHERE slug IS NOT NULL

index idx_posts_status_created
  CREATE INDEX idx_posts_status_created ON posts(status, created_at DESC)

index idx_posts_status_publish_at
  CREATE INDEX idx_posts_status_publish_at ON posts (status, publish_at)

index idx_thoughts_created
  CREATE INDEX idx_thoughts_created ON thoughts(created_at DESC)

index idx_tv_history_series
  CREATE INDEX idx_tv_history_series ON tv_history(series_name)

index idx_tv_history_uniq
  CREATE UNIQUE INDEX idx_tv_history_uniq ON tv_history (series_name, COALESCE(episode_label, ''), COALESCE(watched_date, ''))

index idx_web_vitals_metric_created
  CREATE INDEX idx_web_vitals_metric_created ON web_vitals(metric, created_at)

index idx_web_vitals_target
  CREATE INDEX idx_web_vitals_target ON web_vitals(metric, created_at) WHERE target IS NOT NULL

table anime_history
  CREATE TABLE anime_history ( anime_sn INTEGER NOT NULL, video_sn INTEGER NOT NULL, title TEXT, cover_url TEXT, episode TEXT, last_watched_at DATETIME DEFAULT CURRENT_TIMESTAMP, synced_at DATETIME DEFAULT CURRENT_TIMESTAMP, tmdb_id INTEGER, PRIMARY KEY (anime_sn, video_sn) )

table books
  CREATE TABLE books ( id INTEGER PRIMARY KEY AUTOINCREMENT, isbn TEXT, title TEXT NOT NULL, authors TEXT, publisher TEXT, published_date TEXT, description TEXT, cover_url TEXT, page_count INTEGER, language TEXT, categories TEXT, reading_status TEXT DEFAULT 'to-read', rating REAL, personal_notes TEXT, date_added DATETIME DEFAULT CURRENT_TIMESTAMP, date_updated DATETIME DEFAULT CURRENT_TIMESTAMP, date_started DATETIME, date_finished DATETIME )

table categories
  CREATE TABLE categories ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, short_description TEXT DEFAULT '' , name_en TEXT, name_ja TEXT, name_ko TEXT, name_zh_cn TEXT, description_en TEXT, description_ja TEXT, description_ko TEXT, description_zh_cn TEXT, short_description_en TEXT, short_description_ja TEXT, short_description_ko TEXT, short_description_zh_cn TEXT)

table collection_hidden
  CREATE TABLE collection_hidden ( kind TEXT NOT NULL, key TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', hidden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (kind, key) )

table collection_items
  CREATE TABLE collection_items ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, original_title TEXT, year INTEGER, poster_url TEXT, overview TEXT, external_id TEXT, collection_type TEXT NOT NULL, media_format TEXT NOT NULL, source TEXT DEFAULT 'manual', status TEXT DEFAULT 'completed', rating INTEGER, review TEXT, is_favorite BOOLEAN DEFAULT 0, watch_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP )

table comments
  CREATE TABLE comments ( id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, author TEXT NOT NULL, content TEXT NOT NULL, likes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'approved', ip TEXT DEFAULT '', parent_id INTEGER DEFAULT NULL, is_admin INTEGER DEFAULT 0, email TEXT DEFAULT '', website TEXT DEFAULT '', avatar_url TEXT DEFAULT '', thought_id INTEGER DEFAULT NULL, page TEXT DEFAULT NULL, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE )

table film_history
  CREATE TABLE film_history ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, watched_date DATE, rating INTEGER, source TEXT, tmdb_id INTEGER, poster_url TEXT, release_year INTEGER, genres TEXT, notes TEXT, synced_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(title, watched_date) )

table friend_links
  CREATE TABLE friend_links ( id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', feed_url TEXT, email TEXT, message TEXT, status TEXT NOT NULL DEFAULT 'pending', checks TEXT, checked_at DATETIME, ip TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at DATETIME )

table ip_blacklist
  CREATE TABLE ip_blacklist ( id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT UNIQUE NOT NULL, reason TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table keyword_filters
  CREATE TABLE keyword_filters ( id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT UNIQUE NOT NULL, action TEXT DEFAULT 'spam', created_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table link_previews
  CREATE TABLE link_previews ( url TEXT PRIMARY KEY, title TEXT, description TEXT, image TEXT, site_name TEXT, fetched_at TEXT NOT NULL DEFAULT (datetime('now')) )

table newsletter_subscribers
  CREATE TABLE newsletter_subscribers ( id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, status TEXT DEFAULT 'active', unsubscribe_token TEXT UNIQUE, subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP, unsubscribed_at DATETIME )

table oauth_users
  CREATE TABLE oauth_users ( id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, provider_id TEXT NOT NULL, display_name TEXT NOT NULL, email TEXT DEFAULT '', avatar_url TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'USER', linked_to INTEGER DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider, provider_id) )

table photo_meta
  CREATE TABLE photo_meta ( photo_id TEXT PRIMARY KEY, title TEXT, description TEXT, tags TEXT, tags_en TEXT, featured INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP )

table poll_votes
  CREATE TABLE poll_votes ( poll_id TEXT NOT NULL, option_key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (poll_id, option_key) )

table post_reactions
  CREATE TABLE post_reactions ( post_id INTEGER NOT NULL, emoji TEXT NOT NULL, count INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (post_id, emoji), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE )

table post_slug_history
  CREATE TABLE post_slug_history ( old_slug TEXT PRIMARY KEY, post_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE )

table post_tags
  CREATE TABLE post_tags ( post_id INTEGER, tag_id INTEGER, PRIMARY KEY (post_id, tag_id), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE )

table posts
  CREATE TABLE posts ( id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, excerpt TEXT, category TEXT, status TEXT DEFAULT 'published', author TEXT DEFAULT 'Koimsurai', view_count INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, layout_type TEXT DEFAULT 'record', source_language TEXT DEFAULT 'zh-TW', title_en TEXT, content_en TEXT, excerpt_en TEXT, title_zh_cn TEXT, content_zh_cn TEXT, excerpt_zh_cn TEXT, title_ja TEXT, content_ja TEXT, excerpt_ja TEXT, title_ko TEXT, content_ko TEXT, excerpt_ko TEXT, series_name TEXT DEFAULT NULL, series_order INTEGER DEFAULT NULL, allow_comments INTEGER DEFAULT 1 , format TEXT DEFAULT 'markdown', slug TEXT, excerpt_links TEXT, publish_at DATETIME, newsletter_pending INTEGER NOT NULL DEFAULT 0, trashed_at DATETIME, trashed_from TEXT)

table site_counters
  CREATE TABLE site_counters ( key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table sync_state
  CREATE TABLE sync_state ( key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table tags
  CREATE TABLE tags ( id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP , name_en TEXT, name_ja TEXT, name_ko TEXT, name_zh_cn TEXT)

table thoughts
  CREATE TABLE thoughts ( id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, ref_type TEXT, ref_url TEXT, ref_json TEXT, likes INTEGER DEFAULT 0, dislikes INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME, edited INTEGER DEFAULT 0 , verb TEXT)

table tv_history
  CREATE TABLE tv_history ( id INTEGER PRIMARY KEY AUTOINCREMENT, series_name TEXT NOT NULL, episode_label TEXT, watched_date DATE, source TEXT, tmdb_id INTEGER, poster_url TEXT, genres TEXT, synced_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(series_name, episode_label, watched_date) )

table tw_books
  CREATE TABLE tw_books ( id INTEGER PRIMARY KEY, isbn TEXT NOT NULL UNIQUE, -- ISBN-13，去掉連字號 title TEXT NOT NULL, author TEXT, publisher TEXT, edition TEXT, pub_date TEXT, -- 國圖給的是「預訂出版日」，日可能是 00（2025-01-00） pages INTEGER, price TEXT, binding TEXT, language TEXT, category TEXT, -- 常用分類 subject TEXT, -- 圖書主題 audience TEXT, keywords TEXT, translated TEXT, ym TEXT NOT NULL, -- 出自哪個月份的檔（YYYYMM） updated_at TEXT NOT NULL DEFAULT (datetime('now')) )

table tw_books_fts
  CREATE VIRTUAL TABLE tw_books_fts USING fts5( title, author, publisher, content = 'tw_books', content_rowid = 'id', tokenize = 'trigram' )

table tw_books_fts_config
  CREATE TABLE 'tw_books_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID

table tw_books_fts_data
  CREATE TABLE 'tw_books_fts_data'(id INTEGER PRIMARY KEY, block BLOB)

table tw_books_fts_docsize
  CREATE TABLE 'tw_books_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB)

table tw_books_fts_idx
  CREATE TABLE 'tw_books_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID

table tw_isbn_months
  CREATE TABLE tw_isbn_months ( ym TEXT PRIMARY KEY, last_modified TEXT, rows INTEGER NOT NULL, fetched_at TEXT NOT NULL DEFAULT (datetime('now')) )

table users
  CREATE TABLE users ( id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin', created_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table watch_favorites
  CREATE TABLE watch_favorites ( id INTEGER PRIMARY KEY AUTOINCREMENT, tmdb_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'film', rating INTEGER DEFAULT 5, quote TEXT DEFAULT '', poster_url TEXT, year INTEGER, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP )

table web_vitals
  CREATE TABLE web_vitals ( id INTEGER PRIMARY KEY AUTOINCREMENT, metric TEXT NOT NULL, value REAL NOT NULL, rating TEXT NOT NULL, path TEXT NOT NULL, is_mobile INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')) , target TEXT, load_state TEXT, shift_path TEXT, lcp_phases TEXT)

trigger tw_books_ad
  CREATE TRIGGER tw_books_ad AFTER DELETE ON tw_books BEGIN INSERT INTO tw_books_fts(tw_books_fts, rowid, title, author, publisher) VALUES ('delete', old.id, old.title, old.author, old.publisher); END

trigger tw_books_ai
  CREATE TRIGGER tw_books_ai AFTER INSERT ON tw_books BEGIN INSERT INTO tw_books_fts(rowid, title, author, publisher) VALUES (new.id, new.title, new.author, new.publisher); END

trigger tw_books_au
  CREATE TRIGGER tw_books_au AFTER UPDATE ON tw_books BEGIN INSERT INTO tw_books_fts(tw_books_fts, rowid, title, author, publisher) VALUES ('delete', old.id, old.title, old.author, old.publisher); INSERT INTO tw_books_fts(rowid, title, author, publisher) VALUES (new.id, new.title, new.author, new.publisher); END

