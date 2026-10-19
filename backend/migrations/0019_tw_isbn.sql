-- 國家圖書館「臺灣出版新書預告書訊」的本地索引（handlers/tw_isbn.rs 的 sync worker 定期匯入）。
--
-- 來源：https://isbn.ncl.edu.tw/NEW_ISBNNet/opendata/YYYYMM_isbn.csv（政府資料開放授權）。
-- ⚠ 只有 2024-01 起的月份：那是「申請 ISBN 的新書」，2024 年以前出版的書不在裡面。
--   舊書仍靠 Google Books / OpenLibrary。
--
-- 為什麼要自己存一份：外部書目 API 對台灣出版的書收錄很差（書櫃現有 22 本，Google 只找得到 5 本），
-- 而國圖沒有查詢 API，只給整月的 CSV。

CREATE TABLE tw_books (
    id INTEGER PRIMARY KEY,
    isbn TEXT NOT NULL UNIQUE,     -- ISBN-13，去掉連字號
    title TEXT NOT NULL,
    author TEXT,
    publisher TEXT,
    edition TEXT,
    pub_date TEXT,                 -- 國圖給的是「預訂出版日」，日可能是 00（2025-01-00）
    pages INTEGER,
    price TEXT,
    binding TEXT,
    language TEXT,
    category TEXT,                 -- 常用分類
    subject TEXT,                  -- 圖書主題
    audience TEXT,
    keywords TEXT,
    translated TEXT,
    ym TEXT NOT NULL,              -- 出自哪個月份的檔（YYYYMM）
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 全文索引：trigram 分詞。
-- ⚠ 不要用預設的 unicode61：它用空白與標點切詞，中文書名整串是一個「詞」，查「圖書館」找不到「午夜圖書館」。
--   trigram 把每三個字元當一個詞，任何長度 ≥ 3 的子字串都查得到（短於 3 的由程式退回 LIKE）。
-- external content：文字只存在 tw_books，索引不重複存一份；由下面三個 trigger 維持同步。
CREATE VIRTUAL TABLE tw_books_fts USING fts5(
    title, author, publisher,
    content = 'tw_books', content_rowid = 'id',
    tokenize = 'trigram'
);

CREATE TRIGGER tw_books_ai AFTER INSERT ON tw_books BEGIN
    INSERT INTO tw_books_fts(rowid, title, author, publisher)
    VALUES (new.id, new.title, new.author, new.publisher);
END;
CREATE TRIGGER tw_books_ad AFTER DELETE ON tw_books BEGIN
    INSERT INTO tw_books_fts(tw_books_fts, rowid, title, author, publisher)
    VALUES ('delete', old.id, old.title, old.author, old.publisher);
END;
CREATE TRIGGER tw_books_au AFTER UPDATE ON tw_books BEGIN
    INSERT INTO tw_books_fts(tw_books_fts, rowid, title, author, publisher)
    VALUES ('delete', old.id, old.title, old.author, old.publisher);
    INSERT INTO tw_books_fts(rowid, title, author, publisher)
    VALUES (new.id, new.title, new.author, new.publisher);
END;

-- 每個月份檔的匯入紀錄：條件式請求用，沒變的月份不重抓。
-- 只有 Last-Modified 沒有 ETag：國圖的伺服器不送 ETag（If-Modified-Since 會正確回 304）。
CREATE TABLE tw_isbn_months (
    ym TEXT PRIMARY KEY,
    last_modified TEXT,
    rows INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
