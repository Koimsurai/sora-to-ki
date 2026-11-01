//! 書架與觀看紀錄的另一個來源：NeoDB（聯邦式的書影音標記，大陸用戶多半從豆瓣搬過去），
//! 以及 Bangumi 的書（Bangumi 的動畫與影集在 handlers/watch_sources.rs）。
//!
//! 書寫進 `books`，記下來源與那個平台上的編號（`external_id`）：同一本再同步一次是更新閱讀狀態
//! （想讀 → 在讀 → 讀完），不是多一本。手動加的書不受影響。
//! NeoDB 的電影、影集一樣寫進觀看紀錄（影集沒有集數，記成一集）。

use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};

use crate::handlers::watch_sources::{Entry, Film, Series};
use crate::integrations;
use crate::state::AppState;

/// 書架上的一本（從別的平台來的）
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Book {
    /// 平台＋編號，例如 `neodb:3dSbQ5…`、`bangumi:1234`
    pub external_id: String,
    pub title: String,
    pub authors: Option<String>,
    pub cover: Option<String>,
    /// `to-read`、`reading`、`read`
    pub status: &'static str,
    /// `YYYY-MM-DD`，標記的那天
    pub date: String,
}

/// 新的一本，或狀態變了的一本，都算一筆
async fn upsert_book(conn: &mut SqliteConnection, source: &str, b: &Book) -> bool {
    let (started, finished) = match b.status {
        "reading" => (Some(b.date.as_str()), None),
        "read" => (None, Some(b.date.as_str())),
        _ => (None, None),
    };
    sqlx::query(
        "INSERT INTO books (title, authors, cover_url, reading_status, date_started, date_finished, source, external_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(external_id) WHERE external_id IS NOT NULL DO UPDATE SET \
           reading_status = excluded.reading_status, \
           date_started = COALESCE(books.date_started, excluded.date_started), \
           date_finished = COALESCE(excluded.date_finished, books.date_finished), \
           date_updated = CURRENT_TIMESTAMP \
         WHERE books.reading_status IS NOT excluded.reading_status",
    )
    .bind(&b.title)
    .bind(b.authors.as_deref())
    .bind(b.cover.as_deref())
    .bind(b.status)
    .bind(started)
    .bind(finished)
    .bind(source)
    .bind(&b.external_id)
    .execute(conn)
    .await
    .is_ok_and(|r| r.rows_affected() > 0)
}

pub(crate) async fn write_books(pool: &SqlitePool, source: &str, books: &[Book]) -> Result<u32, String> {
    let failed = |e: sqlx::Error| format!("Couldn't save to the database: {e}");
    let mut tx = pool.begin().await.map_err(failed)?;
    let mut n = 0;
    for b in books {
        n += u32::from(upsert_book(&mut tx, source, b).await);
    }
    tx.commit().await.map_err(failed)?;
    Ok(n)
}

// ── Bangumi 的書 ─────────────────────────────────────────────────────────

/// Bangumi 收藏的一本書（subject_type 1）：想讀 1、讀過 2、在讀 3；擱置與拋棄不收
pub(crate) fn bangumi_book(c: &Value, locale: &str) -> Option<Book> {
    let status = match c.get("type").and_then(Value::as_u64)? {
        1 => "to-read",
        2 => "read",
        3 => "reading",
        _ => return None,
    };
    let subject = c.get("subject")?;
    let id = c.get("subject_id").and_then(Value::as_u64)?;
    let local = subject.get("name_cn").and_then(Value::as_str).filter(|s| !s.is_empty());
    let native = subject.get("name").and_then(Value::as_str).filter(|s| !s.is_empty());
    let title = if locale.starts_with("zh") { local.or(native) } else { native.or(local) }?.to_string();
    Some(Book {
        external_id: format!("bangumi:{id}"),
        title,
        authors: None,
        cover: subject
            .pointer("/images/common")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        status,
        date: c.get("updated_at").and_then(Value::as_str)?.get(..10)?.to_string(),
    })
}

// ── NeoDB ───────────────────────────────────────────────────────────────

/// NeoDB 的書架（想讀 wishlist、在讀 progress、讀完 complete）上的一筆。
/// 書 → `Book`；電影、影集 → 觀看紀錄（想看的不收）
pub(crate) enum NeoMark {
    Book(Book),
    Watch(Entry),
}

pub(crate) fn neodb_mark(m: &Value) -> Option<NeoMark> {
    let shelf = m.get("shelf_type").and_then(Value::as_str)?;
    let item = m.get("item")?;
    let title = item.get("display_title").and_then(Value::as_str).filter(|s| !s.is_empty())?.to_string();
    let cover =
        item.get("cover_image_url").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);
    let date = m.get("created_time").and_then(Value::as_str)?.get(..10)?.to_string();
    match item.get("category").and_then(Value::as_str)? {
        "book" => Some(NeoMark::Book(Book {
            external_id: format!("neodb:{}", item.get("uuid").and_then(Value::as_str)?),
            title,
            authors: None,
            cover,
            status: match shelf {
                "wishlist" => "to-read",
                "progress" => "reading",
                "complete" => "read",
                _ => return None,
            },
            date,
        })),
        "movie" if shelf == "complete" => {
            let rating =
                m.get("rating_grade").and_then(Value::as_i64).filter(|r| *r > 0).map(|r| (r + 1) / 2);
            Some(NeoMark::Watch(Entry::Film(Film { title, date, cover, year: None, tmdb_id: None, rating })))
        }
        "tv" if shelf == "complete" || shelf == "progress" => {
            Some(NeoMark::Watch(Entry::Series(Series { title, progress: 1, date, cover, anime: false })))
        }
        _ => None,
    }
}

async fn neodb_sync(state: &AppState) -> Result<u32, String> {
    let token = integrations::var("NEODB_TOKEN").ok_or("The NeoDB access token is missing")?;
    // 預設是最大的那台 neodb.social；用別台（例如自架的）就填它的網址
    let base = integrations::var("NEODB_URL")
        .map_or_else(|| state.external.neodb.clone(), |u| u.trim_end_matches('/').to_string());
    let full = integrations::last_record(&state.pool, "neodb").await.is_none_or(|r| !r.ok);
    let pages: u32 = if full { 20 } else { 1 };
    let (mut books, mut watch) = (Vec::new(), Vec::new());
    for category in ["book", "movie", "tv"] {
        for shelf in ["progress", "complete", "wishlist"] {
            if category != "book" && shelf == "wishlist" {
                continue;
            }
            for page in 1..=pages {
                let url = format!("{base}/api/me/shelf/{shelf}?category={category}&page={page}");
                let r = state
                    .http
                    .get(url)
                    .bearer_auth(&token)
                    .timeout(std::time::Duration::from_secs(20))
                    .send()
                    .await
                    .map_err(|_| "Couldn't reach NeoDB".to_string())?;
                if r.status() == reqwest::StatusCode::UNAUTHORIZED {
                    return Err("NeoDB didn't accept the access token".into());
                }
                if !r.status().is_success() {
                    return Err(format!("NeoDB answered {}", r.status().as_u16()));
                }
                let v: Value =
                    r.json().await.map_err(|_| "NeoDB sent something that isn't JSON".to_string())?;
                for m in v.get("data").and_then(Value::as_array).into_iter().flatten() {
                    match neodb_mark(m) {
                        Some(NeoMark::Book(b)) => books.push(b),
                        Some(NeoMark::Watch(e)) => watch.push(e),
                        None => {}
                    }
                }
                if v.get("pages").and_then(Value::as_u64).is_none_or(|p| u64::from(page) >= p) {
                    break;
                }
            }
        }
    }
    let n = write_books(&state.pool, "neodb", &books).await?;
    Ok(n + crate::handlers::watch_sources::write_all(&state.pool, "neodb", &watch).await?)
}

/// 跑一輪並記下結果（worker 與後台的「立刻同步」共用）
pub async fn sync_and_record(state: &AppState) -> Result<u32, String> {
    let result = neodb_sync(state).await;
    if let Err(e) = &result {
        tracing::warn!("[neodb] sync failed: {e}");
    }
    integrations::record(&state.pool, "neodb", result.clone()).await;
    result
}

pub fn spawn_sync(state: &AppState) {
    crate::worker::spawn_periodic(
        state.clone(),
        "neodb",
        "ENABLE_NEODB_SYNC",
        140,
        6 * 3600,
        |s| async move {
            let _ = sync_and_record(&s).await;
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// NeoDB `/api/me/shelf/{type}` 的一筆（欄位照它的 OpenAPI：MarkSchema 與 ItemSchema）
    fn mark(category: &str, shelf: &str, uuid: &str) -> Value {
        json!({
            "shelf_type": shelf, "visibility": 0, "created_time": "2026-10-20T08:00:00Z", "rating_grade": 8,
            "item": { "uuid": uuid, "category": category, "display_title": "三體", "cover_image_url": "https://neodb.social/m/x.jpg" }
        })
    }

    #[test]
    fn neodb_書照書架給閱讀狀態_電影要看完的() {
        let Some(NeoMark::Book(b)) = neodb_mark(&mark("book", "progress", "abc")) else {
            panic!("該是書")
        };
        assert_eq!(
            (b.external_id.as_str(), b.status, b.date.as_str()),
            ("neodb:abc", "reading", "2026-10-20")
        );
        assert!(
            matches!(neodb_mark(&mark("movie", "complete", "m")), Some(NeoMark::Watch(Entry::Film(f))) if f.rating == Some(4))
        );
        assert!(neodb_mark(&mark("movie", "wishlist", "m")).is_none(), "想看的不是看過");
        assert!(matches!(neodb_mark(&mark("tv", "progress", "t")), Some(NeoMark::Watch(Entry::Series(_)))));
        assert!(neodb_mark(&mark("game", "complete", "g")).is_none());
    }

    #[test]
    fn bangumi_的書() {
        let c = json!({
            "updated_at": "2026-10-01T10:00:00+08:00", "subject_id": 42, "type": 3,
            "subject": { "name": "三体", "name_cn": "三體", "images": { "common": "https://lain.bgm.tv/c.jpg" } }
        });
        let b = bangumi_book(&c, "zh-TW").expect("讀得出來");
        assert_eq!((b.external_id.as_str(), b.title.as_str(), b.status), ("bangumi:42", "三體", "reading"));
        let mut dropped = c;
        dropped["type"] = json!(5);
        assert!(bangumi_book(&dropped, "zh-TW").is_none());
    }

    #[tokio::test]
    async fn 同一本再同步是更新狀態不是多一本() {
        let st = crate::state::test_state().await;
        let mut b = Book {
            external_id: "neodb:abc".into(),
            title: "三體".into(),
            authors: None,
            cover: None,
            status: "reading",
            date: "2026-10-01".into(),
        };
        assert_eq!(write_books(&st.pool, "neodb", &[b.clone()]).await, Ok(1));
        assert_eq!(write_books(&st.pool, "neodb", &[b.clone()]).await, Ok(0), "沒變就不算");
        b.status = "read";
        b.date = "2026-10-20".into();
        assert_eq!(write_books(&st.pool, "neodb", &[b]).await, Ok(1));
        let row: (i64, String, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT COUNT(*), MAX(reading_status), MAX(date_started), MAX(date_finished) FROM books",
        )
        .fetch_one(&st.pool)
        .await
        .expect("讀 books");
        assert_eq!(row, (1, "read".into(), Some("2026-10-01".into()), Some("2026-10-20".into())));
    }

    #[tokio::test]
    async fn neodb_同步帶_token_書與電影各自寫進去() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/neodb/api/me/shelf/complete"))
            .and(query_param("category", "movie"))
            .and(header("authorization", "Bearer tok"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({ "data": [mark("movie", "complete", "m1")], "pages": 1 })),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/neodb/api/me/shelf/progress"))
            .and(query_param("category", "book"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({ "data": [mark("book", "progress", "b1")], "pages": 1 })),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [], "pages": 1 })))
            .mount(&server)
            .await;
        integrations::set_for_test("NEODB_TOKEN", Some("tok"));
        integrations::set_for_test("NEODB_URL", None);
        let mut st = crate::state::test_state().await;
        st.external = std::sync::Arc::new(crate::state::ExternalUrls::all_pointing_at(&server.uri()));
        assert_eq!(sync_and_record(&st).await, Ok(2));
    }

    #[tokio::test]
    async fn neodb_token_錯了要說() {
        let server = MockServer::start().await;
        Mock::given(method("GET")).respond_with(ResponseTemplate::new(401)).mount(&server).await;
        integrations::set_for_test("NEODB_TOKEN", Some("bad"));
        integrations::set_for_test("NEODB_URL", Some(&format!("{}/neodb/", server.uri())));
        let st = crate::state::test_state().await;
        assert!(matches!(sync_and_record(&st).await, Err(e) if e.contains("token")));
        integrations::set_for_test("NEODB_TOKEN", None);
        assert!(sync_and_record(&st).await.is_err());
    }
}
