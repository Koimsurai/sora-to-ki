use axum::{extract::State, Json};
use serde::Serialize;
use sqlx::FromRow;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Serialize, FromRow)]
struct DigestPost {
    id: i64,
    title: String,
    category: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
struct DigestThought {
    id: i64,
    content: String,
    ref_type: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
struct DigestComment {
    id: i64,
    author: String,
    content: String,
    created_at: String,
    post_id: Option<i64>,
    thought_id: Option<i64>,
    post_title: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct DigestTimeline {
    id: i64,
    title: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DigestResponse {
    message: &'static str,
    posts: Vec<DigestPost>,
    thoughts: Vec<DigestThought>,
    comments: Vec<DigestComment>,
    timeline: Vec<DigestTimeline>,
}

/// `GET /api/home/digest` —— 首頁動態帶（近期文章/碎念/留言迴聲/年度軌跡）。
/// Express 有 60s 記憶體快取，這裡每次都讀同一 DB（資料一致即等價，不複製快取）；
/// 4 條查詢與欄位逐字照抄，回應 key 順序 message→posts→thoughts→comments→timeline。
pub async fn home_digest(State(state): State<AppState>) -> Result<Json<DigestResponse>, AppError> {
    let posts = sqlx::query_as::<_, DigestPost>(
        "SELECT id, title, category, created_at FROM posts \
         WHERE status = 'published' ORDER BY created_at DESC LIMIT 5",
    )
    .fetch_all(&state.pool)
    .await?;

    let thoughts = sqlx::query_as::<_, DigestThought>(
        "SELECT id, substr(content, 1, 120) AS content, ref_type, created_at FROM thoughts \
         ORDER BY created_at DESC LIMIT 3",
    )
    .fetch_all(&state.pool)
    .await?;

    let comments = sqlx::query_as::<_, DigestComment>(
        "SELECT c.id, c.author, substr(c.content, 1, 80) AS content, c.created_at, \
                c.post_id, c.thought_id, p.title AS post_title \
         FROM comments c LEFT JOIN posts p ON p.id = c.post_id \
         WHERE c.status = 'approved' AND c.is_admin = 0 \
         ORDER BY c.created_at DESC LIMIT 4",
    )
    .fetch_all(&state.pool)
    .await?;

    let timeline = sqlx::query_as::<_, DigestTimeline>(
        "SELECT id, title, created_at FROM posts \
         WHERE status = 'published' AND created_at >= date('now', 'start of year') \
         ORDER BY created_at ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(DigestResponse {
        message: "success",
        posts,
        thoughts,
        comments,
        timeline,
    }))
}

/// `GET /api/health` —— 純文字 `OK`（Express `res.status(200).send('OK')`）。
pub async fn health() -> axum::response::Response {
    use axum::response::IntoResponse;
    ([(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")], "OK").into_response()
}
