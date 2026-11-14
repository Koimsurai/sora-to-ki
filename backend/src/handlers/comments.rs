use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    auth::{bearer_token, verify_jwt},
    error::{AppError, Problem},
    handlers::posts::{CommentRow, CommentsResponse},
    state::AppState,
};

/// 自己有留言、但不是文章也不是碎念的頁面（`comments.page`，見 migration 0026）。
/// 白名單：路徑上的名字不在這裡就是 404，不讓人隨便開一個新的留言區
const PAGES: &[&str] = &["messages"];

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CommentBody {
    author: Option<String>,
    content: Option<String>,
    captcha: Option<Value>,
    #[serde(rename = "captchaAnswer")]
    captcha_answer: Option<Value>,
    email: Option<String>,
    website: Option<String>,
    avatar_url: Option<String>,
    parent_id: Option<i64>,
    /// 站長回覆時寄信通知（表單上的勾選框；有填 email 才算數）
    notify_reply: Option<bool>,
    /// 留言當時的語系：回覆信用這個語言寫
    locale: Option<String>,
}

/// 取 client IP：對齊 Express `req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || ''`。
/// 生產有 nginx 設 X-Forwarded-For（trust proxy=1），故 XFF 最左即真實 IP。
/// 無 XFF 時 Express 退 req.ip（socket）；這裡退 ''（生產不會走到，見 STRANGLER 備註）。
pub(crate) fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map_or_default(|s| s.trim().to_string())
}

/// JS 寬鬆相等（`==`）的近似：覆蓋 number/string/bool/null 與 number↔string 強制轉換
/// （captcha 比對用；exotic 型別未完整對齊）。
fn js_loose_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::String(x), Value::String(y)) => x == y,
        (Value::Number(n), Value::String(s)) | (Value::String(s), Value::Number(n)) => {
            let sv = if s.trim().is_empty() { Some(0.0) } else { s.trim().parse::<f64>().ok() };
            sv == n.as_f64()
        }
        _ => false,
    }
}

/// 留言者填的網站：只填網域的補 `https://`（不然前台當成相對路徑，連到 `/blog/<網域>`），
/// 不是 http(s) 的（`javascript:` 之類）、沒有點的、含空白的一律存成空字串。
/// 前台 `src/lib/website.ts` 對舊資料做同一件事
fn normalize_website(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() || s.len() > 2048 || s.chars().any(char::is_whitespace) {
        return String::new();
    }
    let lower = s.to_ascii_lowercase();
    let full = if lower.starts_with("https://") || lower.starts_with("http://") {
        s.to_string()
    } else {
        // `host:8080` 的冒號後面是數字，不是協定；其他帶冒號的開頭（javascript:、mailto:）都不收
        let head = s.split('/').next().unwrap_or_default();
        if let Some((_, after)) = head.split_once(':')
            && !after.starts_with(|c: char| c.is_ascii_digit())
        {
            return String::new();
        }
        format!("https://{}", s.trim_start_matches('/'))
    };
    let host = full
        .split_once("://")
        .map_or("", |(_, rest)| rest)
        .split(['/', '?', '#', ':'])
        .next()
        .unwrap_or_default();
    if host.contains('.') && !host.contains('@') { full } else { String::new() }
}

/// createComment 等價：author/content 必填 → OAuth 偵測 → captcha（匿名）→ IP 黑名單 →
/// 關鍵字過濾（reject/spam）→ 審核狀態 → INSERT → 201。target_col 為 'post_id'|'thought_id'|'page'（固定）。
async fn create_comment(
    state: &AppState,
    headers: &HeaderMap,
    target_col: &str,
    target_id: &str,
    body: CommentBody,
) -> Response {
    let author = body.author.unwrap_or_default();
    let content = body.content.unwrap_or_default();
    if author.is_empty() || content.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Author and content are required" })))
            .into_response();
    }

    // 登入（OAuth）用戶：Bearer token 驗章成功且帶 userId + provider
    let is_oauth = bearer_token(headers).and_then(|t| verify_jwt(t, &state.jwt_secret)).is_some_and(|c| {
        c.get("userId").and_then(serde_json::Value::as_i64).is_some()
            && c.get("provider").and_then(|v| v.as_str()).is_some()
    });

    // captcha 檢查（僅匿名且有帶 captcha 欄位時）
    if !is_oauth && let Some(captcha) = &body.captcha {
        let answer = body.captcha_answer.clone().unwrap_or(Value::Null);
        if !js_loose_eq(captcha, &answer) {
            return Problem::new("captcha_wrong", "Wrong captcha answer").respond(StatusCode::BAD_REQUEST);
        }
    }

    let ip = client_ip(headers);

    // IP 黑名單
    let blocked = sqlx::query_scalar::<_, i64>("SELECT id FROM ip_blacklist WHERE ip = ?")
        .bind(&ip)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();
    if blocked.is_some() {
        return Problem::new("comment_blocked", "Commenting is restricted for you")
            .respond(StatusCode::FORBIDDEN);
    }

    // 關鍵字過濾：第一個命中的 filter 決定 action（DB rowid 序，無 ORDER BY）
    let filters =
        sqlx::query_as::<_, (String, Option<String>)>("SELECT keyword, action FROM keyword_filters")
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();
    let lower = format!("{content} {author}").to_lowercase();
    let mut matched: Option<String> = None;
    for (keyword, action) in &filters {
        if lower.contains(&keyword.to_lowercase()) {
            matched = action.clone();
            break;
        }
    }
    if matched.as_deref() == Some("reject") {
        return Problem::new("comment_rejected", "The comment contains words that aren't allowed")
            .respond(StatusCode::BAD_REQUEST);
    }
    let status = if matched.as_deref() == Some("spam") {
        "spam"
    } else if is_oauth {
        "approved"
    } else {
        "pending"
    };

    // INSERT（is_admin 固定 0；parent_id 0/缺 → NULL）
    let sql = format!(
        "INSERT INTO comments ({target_col}, author, content, email, website, ip, status, is_admin, avatar_url, parent_id, \
         notify_reply, notify_token, locale) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)"
    );
    let parent = body.parent_id.filter(|&n| n != 0);
    let email = body.email.unwrap_or_default().trim().to_string();
    // 沒留信箱，勾了也沒地方寄
    let notify = body.notify_reply == Some(true) && !email.is_empty();
    let locale = body.locale.filter(|l| crate::handlers::posts::I18N_LOCALES.contains(&l.as_str()));
    let result = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(target_id)
        .bind(&author)
        .bind(&content)
        .bind(&email)
        .bind(normalize_website(body.website.as_deref().unwrap_or_default()))
        .bind(&ip)
        .bind(status)
        .bind(body.avatar_url.unwrap_or_default())
        .bind(parent)
        .bind(i64::from(notify))
        .bind(notify.then(crate::handlers::newsletter::gen_unsub_token))
        .bind(locale)
        .execute(&state.pool)
        .await;

    match result {
        Err(e) => crate::error::internal_error(StatusCode::BAD_REQUEST, e),
        Ok(r) => {
            // 站長在前台登入後回覆：寄信給原留言者；其他人的留言：通知站長
            if is_oauth && crate::handlers::notify::is_owner(state, headers).await {
                if let Some(p) = parent {
                    crate::handlers::notify::owner_replied(state, p, &content);
                }
            } else if status != "spam" {
                let target = match target_col {
                    "post_id" => crate::handlers::notify::Target::Post(target_id.to_string()),
                    "thought_id" => crate::handlers::notify::Target::Thought(target_id.to_string()),
                    _ => crate::handlers::notify::Target::Page(target_id.to_string()),
                };
                crate::handlers::notify::comment_created(
                    state,
                    target,
                    &author,
                    &content,
                    status == "pending",
                );
            }
            (
                StatusCode::CREATED,
                Json(json!({ "message": "success", "id": r.last_insert_rowid(), "status": status })),
            )
                .into_response()
        }
    }
}

/// `POST /api/posts/:id/comments`
#[utoipa::path(
    post, path = "/api/posts/{id}/comments", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "新增文章留言（動態 JSON）")),
)]
pub async fn post_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    crate::error::JsonBody(body): crate::error::JsonBody<CommentBody>,
) -> Response {
    create_comment(&state, &headers, "post_id", &id, body).await
}

/// `POST /api/thoughts/:id/comments`
#[utoipa::path(
    post, path = "/api/thoughts/{id}/comments", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "新增碎念留言（動態 JSON）")),
)]
pub async fn thought_comment(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    crate::error::JsonBody(body): crate::error::JsonBody<CommentBody>,
) -> Response {
    create_comment(&state, &headers, "thought_id", &id, body).await
}

/// `GET /api/pages/:page/comments` —— 公開純讀（只列 approved）。目前只有留言頁
#[utoipa::path(
    get, path = "/api/pages/{page}/comments", tag = "posts",
    params(("page" = String, Path)),
    responses((status = 200, body = CommentsResponse), (status = 404, description = "沒有這個留言區")),
)]
pub async fn page_comments(
    State(state): State<AppState>,
    Path(page): Path<String>,
) -> Result<Response, AppError> {
    if !PAGES.contains(&page.as_str()) {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let comments = sqlx::query_as::<_, CommentRow>(
        "SELECT id, post_id, author, content, likes, created_at, is_admin, website, status, parent_id, avatar_url, thought_id \
         FROM comments WHERE page = ? AND status = 'approved' ORDER BY created_at ASC",
    )
    .bind(&page)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(CommentsResponse::new(comments)).into_response())
}

/// `POST /api/pages/:page/comments` —— 留言頁的留言（規則同文章留言：匿名的要審核，登入的直接公開）
#[utoipa::path(
    post, path = "/api/pages/{page}/comments", tag = "posts",
    params(("page" = String, Path)),
    responses((status = 200, description = "新增留言頁的留言（動態 JSON）"), (status = 404, description = "沒有這個留言區")),
)]
pub async fn page_comment(
    State(state): State<AppState>,
    Path(page): Path<String>,
    headers: HeaderMap,
    crate::error::JsonBody(body): crate::error::JsonBody<CommentBody>,
) -> Response {
    if !PAGES.contains(&page.as_str()) {
        return StatusCode::NOT_FOUND.into_response();
    }
    create_comment(&state, &headers, "page", &page, body).await
}

#[cfg(test)]
mod tests {
    use super::normalize_website;

    #[test]
    fn bare_domain_gets_https() {
        assert_eq!(normalize_website("ikuka.blog"), "https://ikuka.blog");
        assert_eq!(normalize_website(" www.example.com/about "), "https://www.example.com/about");
        assert_eq!(normalize_website("//example.com"), "https://example.com");
        assert_eq!(normalize_website("example.com:8080/x"), "https://example.com:8080/x");
    }

    #[test]
    fn http_urls_kept() {
        assert_eq!(normalize_website("https://wind.ink"), "https://wind.ink");
        assert_eq!(normalize_website("HTTP://example.com/a?b=1"), "HTTP://example.com/a?b=1");
    }

    #[test]
    fn non_sites_dropped() {
        for bad in [
            "",
            "javascript:alert(1)",
            "data:text/html,hi",
            "mailto:a@b.com",
            "我的部落格",
            "localhost",
            "a b.com",
            "https://user@evil.com",
        ] {
            assert_eq!(normalize_website(bad), "", "{bad}");
        }
    }
}
