use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::{
    auth::require_admin,
    util::{bind_val, js_num_value, js_parse_int_opt, js_truthy, row_to_json},
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct BooksQuery {
    status: Option<String>,
    rating: Option<String>,
    year: Option<String>,
    search: Option<String>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
}

/// 共用查詢（/books 與 /admin/books 完全同邏輯，只差回應形狀）。
async fn query_books(state: &AppState, q: &BooksQuery) -> Result<Vec<Value>, sqlx::Error> {
    let mut sql = String::from("SELECT * FROM books WHERE 1=1");
    if q.status.is_some() {
        sql.push_str(" AND reading_status = ?");
    }
    if q.rating.is_some() {
        sql.push_str(" AND rating = ?");
    }
    if q.year.is_some() {
        sql.push_str(" AND published_date LIKE ?");
    }
    if q.search.is_some() {
        sql.push_str(" AND (title LIKE ? OR authors LIKE ?)");
    }
    sql.push_str(match q.sort_by.as_deref() {
        Some("date_added_asc") => " ORDER BY date_added ASC",
        Some("title_asc") => " ORDER BY title ASC",
        Some("title_desc") => " ORDER BY title DESC",
        Some("rating_desc") => " ORDER BY rating DESC, date_added DESC",
        Some("published_date_desc") => " ORDER BY published_date DESC",
        _ => " ORDER BY date_added DESC",
    });

    let mut query = sqlx::query(&sql);
    if let Some(s) = &q.status {
        query = query.bind(s.clone());
    }
    if let Some(r) = &q.rating {
        // Express: parseInt(rating)；NaN → 綁 NULL
        query = match js_parse_int_opt(r) {
            Some(i) => query.bind(i),
            None => query.bind(Option::<i64>::None),
        };
    }
    if let Some(y) = &q.year {
        query = query.bind(format!("{y}%"));
    }
    if let Some(s) = &q.search {
        let like = format!("%{s}%");
        query = query.bind(like.clone()).bind(like);
    }
    let rows = query.fetch_all(&state.pool).await?;
    Ok(rows.iter().map(|r| Value::Object(row_to_json(r))).collect())
}

/// `GET /api/books` —— 公開列表，`{message, books}`。
pub async fn list_books(State(state): State<AppState>, Query(q): Query<BooksQuery>) -> Response {
    match query_books(&state, &q).await {
        Ok(books) => Json(json!({ "message": "success", "books": books })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// `GET /api/admin/books` —— requireAdmin，**裸陣列**。
pub async fn admin_books(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<BooksQuery>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    match query_books(&state, &q).await {
        Ok(books) => Json(json!(books)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// `GET /api/books/:id` —— 公開單本，`{message, book}`；404 `{message:'Book not found'}`。
pub async fn get_book(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match sqlx::query("SELECT * FROM books WHERE id = ?").bind(&id).fetch_optional(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "message": "Book not found" }))).into_response(),
        Ok(Some(row)) => Json(json!({ "message": "success", "book": Value::Object(row_to_json(&row)) })).into_response(),
    }
}

/// POST/PUT 共用的 13/15 個欄位鍵名。
const BOOK_FIELDS: [&str; 13] = [
    "isbn", "title", "authors", "publisher", "published_date", "description",
    "cover_url", "page_count", "language", "categories", "reading_status", "rating", "personal_notes",
];

/// `POST /api/books`（requireAdmin）—— 建書。回應 `{message, book:{id, ...req.body}}`（spread 原 body）。
pub async fn create_book(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if !js_truthy(body.get("title")) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "書名為必填欄位" }))).into_response();
    }
    let mut q = sqlx::query(
        "INSERT INTO books (isbn, title, authors, publisher, published_date, description, \
         cover_url, page_count, language, categories, reading_status, rating, personal_notes, \
         date_added, date_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    );
    for k in BOOK_FIELDS {
        // reading_status 缺 key → 'to-read'（destructure default，null 不觸發）
        if k == "reading_status" && !body.contains_key(k) {
            q = q.bind("to-read");
        } else {
            q = bind_val(q, body.get(k));
        }
    }
    match q.execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) => {
            // {id: lastID, ...req.body}：body 的 key 覆寫值、id 位置保持最前
            let mut book = Map::new();
            book.insert("id".into(), json!(r.last_insert_rowid()));
            for (k, v) in &body {
                book.insert(k.clone(), v.clone());
            }
            (StatusCode::CREATED, Json(json!({ "message": "success", "book": Value::Object(book) }))).into_response()
        }
    }
}

/// `PUT /api/books/:id`（requireAdmin）—— 15 欄全 COALESCE（缺/null → 保留舊值）。
pub async fn update_book(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    let mut q = sqlx::query(
        "UPDATE books SET \
         isbn = COALESCE(?, isbn), title = COALESCE(?, title), authors = COALESCE(?, authors), \
         publisher = COALESCE(?, publisher), published_date = COALESCE(?, published_date), \
         description = COALESCE(?, description), cover_url = COALESCE(?, cover_url), \
         page_count = COALESCE(?, page_count), language = COALESCE(?, language), \
         categories = COALESCE(?, categories), reading_status = COALESCE(?, reading_status), \
         rating = COALESCE(?, rating), personal_notes = COALESCE(?, personal_notes), \
         date_started = COALESCE(?, date_started), date_finished = COALESCE(?, date_finished), \
         date_updated = datetime('now') WHERE id = ?",
    );
    for k in BOOK_FIELDS {
        q = bind_val(q, body.get(k));
    }
    q = bind_val(q, body.get("date_started"));
    q = bind_val(q, body.get("date_finished"));
    q = q.bind(&id);
    match q.execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "Book not found" }))).into_response()
        }
        Ok(r) => Json(json!({ "message": "success", "changes": r.rows_affected() })).into_response(),
    }
}

/// `DELETE /api/books/:id`（requireAdmin）。
pub async fn delete_book(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    match sqlx::query("DELETE FROM books WHERE id = ?").bind(&id).execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "Book not found" }))).into_response()
        }
        Ok(r) => Json(json!({ "message": "deleted", "changes": r.rows_affected() })).into_response(),
    }
}

/// `GET /api/books/stats/summary` —— 公開統計。
/// average_rating：truthy 才 toFixed(1)+parseFloat（0/null → null）；整值輸出整數。
pub async fn book_stats(State(state): State<AppState>) -> Response {
    let row = sqlx::query_as::<_, (i64, i64, i64, i64, Option<f64>, Option<i64>)>(
        "SELECT COUNT(*) as total_books, \
         COUNT(CASE WHEN reading_status = 'read' THEN 1 END) as books_read, \
         COUNT(CASE WHEN reading_status = 'reading' THEN 1 END) as books_reading, \
         COUNT(CASE WHEN reading_status = 'to-read' THEN 1 END) as books_to_read, \
         AVG(CASE WHEN rating IS NOT NULL THEN rating END) as average_rating, \
         SUM(CASE WHEN page_count IS NOT NULL THEN page_count ELSE 0 END) as total_pages FROM books",
    )
    .fetch_one(&state.pool)
    .await;
    match row {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok((total, read, reading, to_read, avg, pages)) => {
            let average_rating = match avg {
                Some(v) if v != 0.0 => {
                    // toFixed(1)（半數遠離零）再 parseFloat
                    let r = (v * 10.0).round() / 10.0;
                    js_num_value(r)
                }
                _ => Value::Null,
            };
            Json(json!({
                "message": "success",
                "stats": {
                    "total_books": total,
                    "books_read": read,
                    "books_reading": reading,
                    "books_to_read": to_read,
                    "average_rating": average_rating,
                    "total_pages": pages,
                }
            }))
            .into_response()
        }
    }
}
