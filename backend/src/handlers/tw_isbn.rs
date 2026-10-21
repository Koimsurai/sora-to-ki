//! 國家圖書館「臺灣出版新書預告書訊」的本地索引：定期匯入每月 CSV、提供 ISBN 與全文查詢。
//!
//! 為什麼要自己存一份：外部書目 API 對台灣出版的書收錄很差（2026-10 實測書櫃現有 22 本，
//! Google Books 只找得到 5 本、OpenLibrary 6 本），而國圖**沒有查詢 API**——只給每月一個
//! `YYYYMM_isbn.csv`。全國新書資訊網的網頁查詢要 session 與 CSRF token、結果還是另外載入的，
//! 不是能穩定依賴的介面，所以只用這份有文件、有授權條款的開放資料。
//!
//! ⚠ 涵蓋範圍：**2024-01 起申請 ISBN 的書**。之前出版的書不在裡面（書櫃那 22 本只有 3 本在），
//!   舊書照舊靠 Google Books / OpenLibrary。這份索引補的是「之後加進書櫃的新書」。
//!
//! 索引：ISBN 是唯一鍵（精確查）；書名／作者／出版社走 FTS5 **trigram**（中文沒有空白分詞，
//! 預設的 unicode61 會把整串書名當成一個詞，查不到子字串）。少於 3 個字的查詢 trigram
//! 無能為力，退回 `LIKE`。見 migrations/0019_tw_isbn.sql。

use std::collections::HashMap;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::SqlitePool;

use crate::state::AppState;

/// 開放資料從這個月份開始有檔。更早的月份一律 404，不必去問。
const FIRST_YM: u32 = 202_401;

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub(crate) struct TwBook {
    pub isbn: String,
    pub title: String,
    pub author: Option<String>,
    pub publisher: Option<String>,
    pub edition: Option<String>,
    pub pub_date: Option<String>,
    pub pages: Option<i64>,
    pub price: Option<String>,
    pub binding: Option<String>,
    pub language: Option<String>,
    pub category: Option<String>,
    pub subject: Option<String>,
    pub audience: Option<String>,
    pub keywords: Option<String>,
    pub translated: Option<String>,
}

// ── CSV ────────────────────────────────────────────────────────────────

/// 解析一個月份的 CSV。欄位用**表頭名稱**對應，不用位置——國圖改過欄位順序也加過欄位
/// （2024 年的檔有 20 欄、之後是 27 欄），照位置讀的話整份資料會靜靜錯位。
///
/// 跳過沒有 ISBN 或沒有書名的列。ISBN 去掉連字號與空白。
pub(crate) fn parse_csv(text: &str) -> Vec<TwBook> {
    let text = text.trim_start_matches('\u{feff}');
    let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(text.as_bytes());
    let Ok(headers) = rdr.headers().cloned() else { return vec![] };
    let col: HashMap<&str, usize> = headers.iter().enumerate().map(|(i, h)| (h.trim(), i)).collect();

    rdr.records()
        .filter_map(Result::ok)
        .filter_map(|rec| {
            let get = |name: &str| -> Option<String> {
                col.get(name)
                    .and_then(|&i| rec.get(i))
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
            };
            let isbn: String = get("ISBN")?.chars().filter(char::is_ascii_alphanumeric).collect();
            let title = get("申請書名")?;
            if isbn.is_empty() {
                return None;
            }
            Some(TwBook {
                isbn,
                title,
                author: get("作者"),
                publisher: get("出版機構"),
                edition: get("版次"),
                pub_date: get("預訂出版日"),
                // 有聲書的「頁數」是片長（約367分），那不是頁數，存 NULL
                pages: get("頁數").and_then(|p| p.parse().ok()),
                price: get("定價"),
                binding: get("裝訂方式"),
                language: get("作品語文"),
                category: get("常用分類").or_else(|| get("建議上架分類")),
                subject: get("圖書主題"),
                audience: get("適讀對象"),
                keywords: get("關鍵字"),
                translated: get("是否為翻譯書").or_else(|| get("是否為引進版權著作")),
            })
        })
        .collect()
}

/// `2025-01-00` → `2025-01`（日是 00 代表只知道年月）。
pub(crate) fn normalize_pub_date(d: &str) -> String {
    d.strip_suffix("-00").unwrap_or(d).to_string()
}

/// 從 [`FIRST_YM`] 到 `now_ym`（含）的每個月份，`YYYYMM`。
pub(crate) fn months_until(now_ym: u32) -> Vec<String> {
    let mut out = Vec::new();
    let mut ym = FIRST_YM;
    while ym <= now_ym {
        out.push(ym.to_string());
        ym = if ym % 100 == 12 { (ym / 100 + 1) * 100 + 1 } else { ym + 1 };
    }
    out
}

// ── 匯入 ──────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum MonthOutcome {
    /// 這個月份的檔還沒公布（404）
    NotPublished,
    /// 跟上次一樣（304）
    Unchanged,
    /// 匯入了幾筆
    Imported(usize),
}

/// 匯入一個月份。用 `If-Modified-Since` 問：沒變的月份國圖回 304，不用下載也不用重寫。
/// （國圖不送 ETag，只有 Last-Modified。）
pub(crate) async fn import_month(
    pool: &SqlitePool,
    http: &reqwest::Client,
    base: &str,
    ym: &str,
) -> Result<MonthOutcome, String> {
    let url = format!("{base}/NEW_ISBNNet/opendata/{ym}_isbn.csv");
    let last: Option<String> = sqlx::query_scalar("SELECT last_modified FROM tw_isbn_months WHERE ym = ?")
        .bind(ym)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();

    let mut req = http.get(&url);
    if let Some(lm) = &last {
        req = req.header(reqwest::header::IF_MODIFIED_SINCE, lm);
    }
    let resp = req.send().await.map_err(|e| format!("{ym}: {e}"))?;
    match resp.status() {
        reqwest::StatusCode::NOT_FOUND => return Ok(MonthOutcome::NotPublished),
        reqwest::StatusCode::NOT_MODIFIED => return Ok(MonthOutcome::Unchanged),
        s if !s.is_success() => return Err(format!("{ym}: HTTP {s}")),
        _ => {}
    }
    let last_modified =
        resp.headers().get(reqwest::header::LAST_MODIFIED).and_then(|v| v.to_str().ok()).map(String::from);
    let text = resp.text().await.map_err(|e| format!("{ym}: {e}"))?;
    let rows = parse_csv(&text);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for b in &rows {
        // 內容沒變就不寫：UPDATE 會觸發 FTS 的刪除＋重建，整月重抓時沒必要全部重做一次
        sqlx::query(
            "INSERT INTO tw_books (isbn, title, author, publisher, edition, pub_date, pages, price, binding, \
             language, category, subject, audience, keywords, translated, ym) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(isbn) DO UPDATE SET title = excluded.title, author = excluded.author, \
             publisher = excluded.publisher, edition = excluded.edition, pub_date = excluded.pub_date, \
             pages = excluded.pages, price = excluded.price, binding = excluded.binding, \
             language = excluded.language, category = excluded.category, subject = excluded.subject, \
             audience = excluded.audience, keywords = excluded.keywords, translated = excluded.translated, \
             ym = excluded.ym, updated_at = datetime('now') \
             WHERE tw_books.title IS NOT excluded.title OR tw_books.author IS NOT excluded.author \
             OR tw_books.publisher IS NOT excluded.publisher OR tw_books.pub_date IS NOT excluded.pub_date \
             OR tw_books.pages IS NOT excluded.pages OR tw_books.category IS NOT excluded.category",
        )
        .bind(&b.isbn)
        .bind(&b.title)
        .bind(&b.author)
        .bind(&b.publisher)
        .bind(&b.edition)
        .bind(&b.pub_date)
        .bind(b.pages)
        .bind(&b.price)
        .bind(&b.binding)
        .bind(&b.language)
        .bind(&b.category)
        .bind(&b.subject)
        .bind(&b.audience)
        .bind(&b.keywords)
        .bind(&b.translated)
        .bind(ym)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("{ym} {}: {e}", b.isbn))?;
    }
    sqlx::query(
        "INSERT INTO tw_isbn_months (ym, last_modified, rows, fetched_at) VALUES (?, ?, ?, datetime('now')) \
         ON CONFLICT(ym) DO UPDATE SET last_modified = excluded.last_modified, rows = excluded.rows, \
         fetched_at = excluded.fetched_at",
    )
    .bind(ym)
    .bind(&last_modified)
    .bind(i64::try_from(rows.len()).unwrap_or(i64::MAX))
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(MonthOutcome::Imported(rows.len()))
}

/// 把每個月份都問一次。沒變的回 304，所以每天跑一輪只是三十來個很小的請求。
/// 單一月份失敗不擋其他月份：記 log、下一輪再試。
pub(crate) async fn sync_once(state: &AppState, now_ym: u32) -> (usize, usize) {
    let (mut imported, mut failed) = (0, 0);
    for ym in months_until(now_ym) {
        match import_month(&state.pool, &state.http, &state.external.ncl_isbn, &ym).await {
            Ok(MonthOutcome::Imported(n)) => {
                imported += n;
                tracing::info!("[tw-isbn] {ym}: imported {n} rows");
            }
            Ok(_) => {}
            Err(e) => {
                failed += 1;
                tracing::warn!("[tw-isbn] {e}");
            }
        }
    }
    (imported, failed)
}

fn current_ym() -> u32 {
    use chrono::Datelike;
    // 國圖在台灣：用台灣時間判斷「這個月」（UTC+8，不受容器時區設定影響）
    let now = chrono::Utc::now() + chrono::Duration::hours(8);
    u32::try_from(now.year()).unwrap_or(2026) * 100 + now.month()
}

/// 啟動匯入 worker（`ENABLE_TW_ISBN_SYNC=1` 才啟動）：啟動後等 90 秒先跑一輪，
/// 之後每天一輪（`TW_ISBN_SYNC_PERIOD_SECS` 可調）。
pub fn spawn_sync(state: AppState) -> Option<tokio::task::JoinHandle<()>> {
    let period = crate::worker::env_secs("TW_ISBN_SYNC_PERIOD_SECS", 24 * 3600);
    crate::worker::spawn_periodic(state, "tw-isbn", "ENABLE_TW_ISBN_SYNC", 90, period, |s| async move {
        let (n, failed) = sync_once(&s, current_ym()).await;
        tracing::info!("[tw-isbn] sync done: {n} rows imported, {failed} months failed");
    })
}

// ── 查詢 ──────────────────────────────────────────────────────────────

// 欄位清單用巨集展開成字面值：sqlx 0.9 只收 `&'static str` 的 SQL（擋掉字串拼接的注入），
// format! 出來的字串過不了編譯。值一律走 bind。
macro_rules! cols {
    () => {
        "isbn, title, author, publisher, edition, pub_date, pages, price, binding, language, \
         category, subject, audience, keywords, translated"
    };
    (b) => {
        "b.isbn, b.title, b.author, b.publisher, b.edition, b.pub_date, b.pages, b.price, b.binding, \
         b.language, b.category, b.subject, b.audience, b.keywords, b.translated"
    };
}

pub(crate) async fn lookup_isbn(pool: &SqlitePool, isbn: &str) -> Option<TwBook> {
    sqlx::query_as::<_, TwBook>(concat!("SELECT ", cols!(), " FROM tw_books WHERE isbn = ?"))
        .bind(isbn)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// 全文查詢。每個以空白分開的詞都 ≥ 3 個字元時走 FTS5（trigram，依 BM25 排序，書名權重最高）；
/// 有詞短於 3 個字元時 trigram 查不了，整串退回 `LIKE`（14 萬筆全掃約十來毫秒，可以接受）。
pub(crate) async fn search(pool: &SqlitePool, q: &str, limit: i64) -> Vec<TwBook> {
    let q = q.trim();
    if q.is_empty() {
        return vec![];
    }
    let terms: Vec<&str> = q.split_whitespace().collect();
    let result = if terms.iter().all(|t| t.chars().count() >= 3) {
        // 每個詞包成片語（"…"）：使用者輸入的 - * : 之類不會被當成 FTS5 的運算子
        let fts_query =
            terms.iter().map(|t| format!("\"{}\"", t.replace('"', "\"\""))).collect::<Vec<_>>().join(" ");
        sqlx::query_as::<_, TwBook>(concat!(
            "SELECT ",
            cols!(b),
            " FROM tw_books_fts f JOIN tw_books b ON b.id = f.rowid \
             WHERE tw_books_fts MATCH ? ORDER BY bm25(tw_books_fts, 10.0, 4.0, 1.0) LIMIT ?"
        ))
        .bind(fts_query)
        .bind(limit)
        .fetch_all(pool)
        .await
    } else {
        let like = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
        sqlx::query_as::<_, TwBook>(concat!(
            "SELECT ",
            cols!(),
            " FROM tw_books WHERE title LIKE ?1 ESCAPE '\\' OR author LIKE ?1 ESCAPE '\\' \
             ORDER BY pub_date DESC LIMIT ?2"
        ))
        .bind(like)
        .bind(limit)
        .fetch_all(pool)
        .await
    };
    result.unwrap_or_else(|e| {
        tracing::warn!("[tw-isbn] search failed: {e}");
        vec![]
    })
}

/// 跟外部書目搜尋（Google Books / OpenLibrary）同一個形狀，後台的「從搜尋結果帶入」可以直接用。
/// 國圖的資料沒有封面與簡介。
pub(crate) fn to_search_json(b: &TwBook) -> Value {
    json!({
        "isbn": b.isbn,
        "title": b.title,
        "authors": b.author.clone().unwrap_or_default(),
        "publisher": b.publisher.clone().unwrap_or_default(),
        "published_date": b.pub_date.as_deref().map(normalize_pub_date).unwrap_or_default(),
        "description": "",
        "cover_url": "",
        "page_count": b.pages,
        "language": b.language.clone().unwrap_or_default(),
        "categories": b.category.clone().unwrap_or_default(),
        "source": "ncl",
    })
}

#[derive(Debug, Deserialize)]
pub struct TwSearchQuery {
    isbn: Option<String>,
    q: Option<String>,
    limit: Option<i64>,
}

/// `GET /api/books/tw?isbn=…` 或 `?q=…`——直接查國圖書目索引。
#[utoipa::path(get, path = "/api/books/tw", tag = "books",
    responses((status = 200, description = "國圖新書書目（2024 起），動態 JSON"), (status = 400, description = "沒給 isbn 或 q")))]
pub async fn tw_search(State(state): State<AppState>, Query(p): Query<TwSearchQuery>) -> Response {
    let limit = p.limit.unwrap_or(10).clamp(1, 50);
    let books: Vec<Value> = if let Some(isbn) = p.isbn.as_deref().filter(|s| !s.trim().is_empty()) {
        let clean: String = isbn.chars().filter(char::is_ascii_alphanumeric).collect();
        lookup_isbn(&state.pool, &clean).await.iter().map(to_search_json).collect()
    } else if let Some(q) = p.q.as_deref().filter(|s| !s.trim().is_empty()) {
        search(&state.pool, q, limit).await.iter().map(to_search_json).collect()
    } else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "請提供 isbn 或 q" }))).into_response();
    };
    Json(json!({ "message": "success", "books": books })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header_exists, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// 形狀取自真的 202501_isbn.csv：UTF-8 BOM、中文表頭、有引號包住含逗號的欄位、有聲書的頁數是片長。
    const CSV: &str = "\u{feff}申請書名,作者,出版機構,版次,預訂出版日,ISBN,頁數,常用分類,作品語文,是否為翻譯書\n\
        午夜圖書館,麥特．海格,漫遊者文化,初版,2025-01-00,978-986-489-425-3,288,文學,繁體中文,是\n\
        \"活著的理由, 增訂版\",麥特．海格,漫遊者文化,二版,2025-01-15,9789864894727,240,心理勵志,繁體中文,是\n\
        聽見午夜,某作者,某出版,初版,2025-01-00,9786260000001,約367分,有聲書,繁體中文,否\n\
        ,沒有書名的列,某出版,初版,2025-01-00,9786260000002,100,文學,繁體中文,否\n\
        沒有ISBN的列,某作者,某出版,初版,2025-01-00,,100,文學,繁體中文,否\n";

    #[test]
    fn parse_csv_照表頭名稱對欄位_引號與_bom_都處理() {
        let rows = parse_csv(CSV);
        assert_eq!(rows.len(), 3, "沒有書名或沒有 ISBN 的列要跳過");
        assert_eq!(rows[0].isbn, "9789864894253", "ISBN 的連字號要去掉");
        assert_eq!(rows[0].title, "午夜圖書館", "BOM 不能黏在第一個表頭上（否則整欄對不到）");
        assert_eq!(rows[0].pages, Some(288));
        assert_eq!(rows[1].title, "活著的理由, 增訂版", "引號裡的逗號不是欄位分隔");
        assert_eq!(rows[2].pages, None, "有聲書的「約367分」是片長不是頁數");
        assert_eq!(rows[0].category.as_deref(), Some("文學"));
        assert_eq!(rows[0].translated.as_deref(), Some("是"));
    }

    #[test]
    fn parse_csv_欄位順序不同也對得到() {
        let csv = "ISBN,申請書名,作者\n9789864894253,午夜圖書館,麥特．海格\n";
        let rows = parse_csv(csv);
        assert_eq!(rows[0].title, "午夜圖書館");
        assert_eq!(rows[0].author.as_deref(), Some("麥特．海格"));
    }

    #[test]
    fn months_until_跨年且含當月() {
        let m = months_until(202_402);
        assert_eq!(m, vec!["202401", "202402"]);
        let m = months_until(202_501);
        assert_eq!(m.len(), 13);
        assert_eq!(m[11], "202412");
        assert_eq!(m[12], "202501", "12 月之後要進到下一年的 01，不是 202413");
        assert!(months_until(202_312).is_empty(), "開放資料從 2024-01 才有");
    }

    #[test]
    fn normalize_pub_date_只拿掉代表未知的日() {
        assert_eq!(normalize_pub_date("2025-01-00"), "2025-01");
        assert_eq!(normalize_pub_date("2025-01-15"), "2025-01-15");
    }

    async fn state_with_mock(server: &MockServer) -> AppState {
        let mut st = crate::state::test_state().await;
        st.external = std::sync::Arc::new(crate::state::ExternalUrls::all_pointing_at(&server.uri()));
        st
    }

    async fn mount_month(server: &MockServer, ym: &str, body: &str) {
        Mock::given(method("GET"))
            .and(path(format!("/ncl/NEW_ISBNNet/opendata/{ym}_isbn.csv")))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Last-Modified", "Wed, 02 Apr 2025 08:20:42 GMT")
                    .set_body_string(body),
            )
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn 匯入後_isbn_精確查得到_中文子字串也查得到() {
        let server = MockServer::start().await;
        mount_month(&server, "202401", CSV).await;
        let st = state_with_mock(&server).await;

        let out = import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();
        assert_eq!(out, MonthOutcome::Imported(3));

        let b = lookup_isbn(&st.pool, "9789864894253").await.expect("ISBN 精確查");
        assert_eq!(b.title, "午夜圖書館");

        // trigram：書名中段的子字串。unicode61 分詞的話這條會是空的
        let hits = search(&st.pool, "圖書館", 10).await;
        assert_eq!(hits.len(), 1, "{hits:?}");
        assert_eq!(hits[0].isbn, "9789864894253");

        // 作者也在索引裡
        assert_eq!(search(&st.pool, "麥特．海格", 10).await.len(), 2);

        // 兩個字：trigram 查不了，要退回 LIKE（「午夜」同時在兩本書名裡）
        let short = search(&st.pool, "午夜", 10).await;
        assert_eq!(short.len(), 2, "短於 3 個字的查詢要退回 LIKE：{short:?}");

        // 使用者輸入的 FTS5 運算子字元不能讓查詢壞掉
        assert_eq!(search(&st.pool, "\"圖書館 OR *", 10).await, vec![]);
    }

    #[tokio::test]
    async fn 重複匯入是冪等的_改了書名之後舊書名查不到_新書名查得到() {
        let server = MockServer::start().await;
        let st = state_with_mock(&server).await;

        mount_month(&server, "202401", CSV).await;
        import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();
        server.reset().await;
        mount_month(&server, "202401", CSV).await;
        import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tw_books").fetch_one(&st.pool).await.unwrap();
        assert_eq!(n, 3, "同一個月重抓不能多出重複的書");

        // 國圖更正了書名：FTS 索引要跟著換（UPDATE trigger），否則舊書名還查得到、新的查不到
        server.reset().await;
        mount_month(&server, "202401", &CSV.replace("午夜圖書館", "子夜藏書閣")).await;
        import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();
        assert_eq!(search(&st.pool, "圖書館", 10).await, vec![], "舊書名還留在索引裡");
        assert_eq!(search(&st.pool, "藏書閣", 10).await.len(), 1);
    }

    #[tokio::test]
    async fn 第二次用_if_modified_since_問_304_就不重寫_404_是還沒公布() {
        let server = MockServer::start().await;
        let st = state_with_mock(&server).await;
        mount_month(&server, "202401", CSV).await;
        import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();

        server.reset().await;
        Mock::given(method("GET"))
            .and(path("/ncl/NEW_ISBNNet/opendata/202401_isbn.csv"))
            // ⚠ 不能用 header(name, value)：wiremock 會把標頭值照逗號拆開比對，而 HTTP 日期本身就有逗號
            .and(header_exists("If-Modified-Since"))
            .respond_with(ResponseTemplate::new(304))
            .mount(&server)
            .await;
        let out = import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();
        assert_eq!(out, MonthOutcome::Unchanged, "要帶上次的 Last-Modified 來問");
        let reqs = server.received_requests().await.unwrap();
        let ims = reqs[0].headers.get("If-Modified-Since").and_then(|v| v.to_str().ok());
        assert_eq!(ims, Some("Wed, 02 Apr 2025 08:20:42 GMT"), "帶的要是上次回應的 Last-Modified，原封不動");

        // 沒 mount 的月份 wiremock 回 404＝還沒公布，不是錯誤
        let out = import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202402").await.unwrap();
        assert_eq!(out, MonthOutcome::NotPublished);
    }

    #[tokio::test]
    async fn 端點_isbn_與_q_都要能查_都沒給是_400() {
        let server = MockServer::start().await;
        mount_month(&server, "202401", CSV).await;
        let st = state_with_mock(&server).await;
        import_month(&st.pool, &st.http, &st.external.ncl_isbn, "202401").await.unwrap();

        let body = |r: Response| async move {
            let b = http_body_util::BodyExt::collect(r.into_body()).await.unwrap().to_bytes();
            serde_json::from_slice::<Value>(&b).unwrap()
        };
        let q = |isbn: Option<&str>, q: Option<&str>| TwSearchQuery {
            isbn: isbn.map(String::from),
            q: q.map(String::from),
            limit: None,
        };
        let v = body(tw_search(State(st.clone()), Query(q(Some("978-986-489-425-3"), None))).await).await;
        assert_eq!(v["books"][0]["title"], "午夜圖書館");
        assert_eq!(v["books"][0]["published_date"], "2025-01", "日是 00 的要拿掉");
        assert_eq!(v["books"][0]["source"], "ncl");

        let v = body(tw_search(State(st.clone()), Query(q(None, Some("活著的理由")))).await).await;
        assert_eq!(v["books"][0]["isbn"], "9789864894727");

        let r = tw_search(State(st), Query(q(None, None))).await;
        assert_eq!(r.status(), StatusCode::BAD_REQUEST);
    }
}
