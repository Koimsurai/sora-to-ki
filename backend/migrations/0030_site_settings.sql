-- 站台設定：後台與 MCP 改的那一層（2026-10，開源自架版）。
--
-- 一個 key 一份 JSON。目前只有 `site`（站名、作者、介紹、關掉的頁面），之後的配色、作品清單、
-- 時間軸各自是一個 key，不必每多一種設定就開一張表。
--
-- 這裡是唯一來源：環境變數（SITE_NAME…）只在這張表還是空的時候寫進來當種子一次，
-- 之後改設定一律走後台或 MCP，不會有「後台改了卻被環境變數蓋回去」的情況。
-- 金鑰不放這裡，永遠在環境變數。
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
