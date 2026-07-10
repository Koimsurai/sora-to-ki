use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;
use crate::{
    auth::require_admin,
    util::{parse_int, row_to_json},
};

/// `crypto.randomBytes(16).toString('hex')` 等價：32 hex 字元。
fn gen_unsub_token() -> String {
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[derive(Debug, Deserialize)]
pub struct SubscribeBody {
    email: Option<String>,
    name: Option<String>,
}

/// `POST /api/newsletter/subscribe` —— 公開訂閱；重複 email 且非 active → 重新啟用。
pub async fn subscribe(State(state): State<AppState>, Json(b): Json<SubscribeBody>) -> Response {
    let email = b.email.unwrap_or_default();
    if email.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Email is required" }))).into_response();
    }
    // Express regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    static EMAIL_RE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap());
    let re = &*EMAIL_RE;
    if !re.is_match(&email) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid email format" }))).into_response();
    }
    let token = gen_unsub_token();
    let name = b.name.filter(|s| !s.is_empty());
    match sqlx::query(
        "INSERT INTO newsletter_subscribers (email, name, status, unsubscribe_token) VALUES (?, ?, 'active', ?)",
    )
    .bind(&email)
    .bind(&name)
    .bind(&token)
    .execute(&state.pool)
    .await
    {
        Ok(r) => (
            StatusCode::CREATED,
            Json(json!({ "message": "Successfully subscribed to newsletter", "id": r.last_insert_rowid() })),
        )
            .into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("UNIQUE constraint failed: newsletter_subscribers.email") {
                // 已訂閱：非 active → 重新啟用並補 token
                match sqlx::query(
                    "UPDATE newsletter_subscribers SET status = 'active', unsubscribed_at = NULL, \
                     unsubscribe_token = COALESCE(unsubscribe_token, ?) WHERE email = ? AND status != 'active'",
                )
                .bind(&token)
                .bind(&email)
                .execute(&state.pool)
                .await
                {
                    Err(e2) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e2.to_string() }))).into_response(),
                    Ok(r) if r.rows_affected() > 0 => {
                        Json(json!({ "message": "Re-subscribed to newsletter" })).into_response()
                    }
                    Ok(_) => (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": "This email is already subscribed" })),
                    )
                        .into_response(),
                }
            } else {
                (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UnsubscribeBody {
    email: Option<String>,
    token: Option<String>,
}

/// `POST /api/newsletter/unsubscribe` —— email 或 token 擇一（token 優先）。
pub async fn unsubscribe(State(state): State<AppState>, Json(b): Json<UnsubscribeBody>) -> Response {
    let email = b.email.filter(|s| !s.is_empty());
    let token = b.token.filter(|s| !s.is_empty());
    // token 優先於 email（對齊 Express `token || email`）；兩者皆無 → 400
    let (sql, param) = match (token, email) {
        (Some(t), _) => (
            "UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = datetime('now') WHERE unsubscribe_token = ?",
            t,
        ),
        (None, Some(e)) => (
            "UPDATE newsletter_subscribers SET status = ?, unsubscribed_at = datetime('now') WHERE email = ?",
            e,
        ),
        (None, None) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Email or token is required" }))).into_response()
        }
    };
    match sqlx::query(sql).bind("unsubscribed").bind(&param).execute(&state.pool).await {
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "Subscriber not found" }))).into_response()
        }
        Ok(_) => Json(json!({ "message": "Successfully unsubscribed from newsletter" })).into_response(),
    }
}

/// `GET /api/newsletter/by-token/:token` —— 退訂確認頁用（裸 row：email/name/status）。
pub async fn by_token(State(state): State<AppState>, Path(token): Path<String>) -> Response {
    match sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
        "SELECT email, name, status FROM newsletter_subscribers WHERE unsubscribe_token = ?",
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await
    {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "invalid token" }))).into_response(),
        Ok(Some((email, name, status))) => {
            Json(json!({ "email": email, "name": name, "status": status })).into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SubscribersQuery {
    page: Option<String>,
    limit: Option<String>,
    status: Option<String>,
}

/// `GET /api/newsletter/subscribers`（requireAdmin）—— 分頁列表（SELECT * 動態 row）。
pub async fn subscribers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SubscribersQuery>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    let page = parse_int(q.page.as_deref(), 1);
    let limit = parse_int(q.limit.as_deref(), 50);
    let offset = (page - 1) * limit;
    let status = q.status.as_deref().unwrap_or("active");

    let rows = match sqlx::query(
        "SELECT * FROM newsletter_subscribers WHERE status = ? ORDER BY subscribed_at DESC LIMIT ? OFFSET ?",
    )
    .bind(status)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let total = match sqlx::query_scalar::<_, i64>("SELECT COUNT(*) as total FROM newsletter_subscribers WHERE status = ?")
        .bind(status)
        .fetch_one(&state.pool)
        .await
    {
        Ok(t) => t,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let subs: Vec<Value> = rows.iter().map(|r| Value::Object(row_to_json(r))).collect();
    let total_pages = if limit > 0 { (total + limit - 1) / limit } else { 0 };
    Json(json!({
        "message": "success",
        "subscribers": subs,
        "pagination": { "page": page, "limit": limit, "total": total, "totalPages": total_pages }
    }))
    .into_response()
}
