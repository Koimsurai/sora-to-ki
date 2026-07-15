use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;

use crate::{error::AppError, state::AppState};

// ── 多語系（對齊 Express index.js 的常數與 helper）─────────────────────────
pub(crate) const I18N_LOCALES: [&str; 5] = ["zh-TW", "zh-CN", "en", "ja", "ko"];

/// LOCALE_COLUMN_SUFFIX：zh-TW 是來源語、無後綴欄位。
pub(crate) fn locale_suffix(locale: &str) -> Option<&'static str> {
    match locale {
        "zh-CN" => Some("zh_cn"),
        "en" => Some("en"),
        "ja" => Some("ja"),
        "ko" => Some("ko"),
        _ => None,
    }
}

/// parseLocale：把 ?lang= 正規化成 canonical locale，無法辨識回 None。
fn parse_locale(raw: Option<&str>) -> Option<&'static str> {
    match raw?.to_lowercase().as_str() {
        "zh-tw" | "zh-hant" => Some("zh-TW"),
        "zh-cn" | "zh-hans" => Some("zh-CN"),
        "en" => Some("en"),
        "ja" => Some("ja"),
        "ko" => Some("ko"),
        _ => None,
    }
}

/// posts 一列（含全部 i18n 欄位；用 `SELECT p.*` 取，FromRow 依名對應、忽略多餘欄位）。
#[derive(Debug, FromRow)]
pub struct PostRow {
    id: i64,
    title: String,
    content: String,
    excerpt: Option<String>,
    category: Option<String>,
    status: String,
    author: Option<String>,
    view_count: i64,
    likes: i64,
    layout_type: Option<String>,
    created_at: String,
    updated_at: Option<String>,
    source_language: Option<String>,
    series_name: Option<String>,
    series_order: Option<i64>,
    title_en: Option<String>,
    content_en: Option<String>,
    excerpt_en: Option<String>,
    title_zh_cn: Option<String>,
    content_zh_cn: Option<String>,
    excerpt_zh_cn: Option<String>,
    title_ja: Option<String>,
    content_ja: Option<String>,
    excerpt_ja: Option<String>,
    title_ko: Option<String>,
    content_ko: Option<String>,
    excerpt_ko: Option<String>,
    // GROUP_CONCAT(t.name)；無 tag 時為 NULL
    tags: Option<String>,
}

/// 取某後綴的 (title, content, excerpt) 三元組。
fn i18n_trio<'a>(row: &'a PostRow, sfx: &str) -> (Option<&'a str>, Option<&'a str>, Option<&'a str>) {
    match sfx {
        "en" => (row.title_en.as_deref(), row.content_en.as_deref(), row.excerpt_en.as_deref()),
        "zh_cn" => (
            row.title_zh_cn.as_deref(),
            row.content_zh_cn.as_deref(),
            row.excerpt_zh_cn.as_deref(),
        ),
        "ja" => (row.title_ja.as_deref(), row.content_ja.as_deref(), row.excerpt_ja.as_deref()),
        "ko" => (row.title_ko.as_deref(), row.content_ko.as_deref(), row.excerpt_ko.as_deref()),
        _ => (None, None, None),
    }
}

fn source_lang(row: &PostRow) -> &str {
    row.source_language.as_deref().unwrap_or("zh-TW")
}

/// 非空字串才算「有內容」（對齊 JS 的 `!t` truthy 檢查：null 與 '' 都視為無）。
fn nonempty(s: Option<&str>) -> Option<&str> {
    s.filter(|v| !v.is_empty())
}

/// getLocaleContent：回 (title, content, excerpt)；該 locale 無內容回 None。
fn locale_content(row: &PostRow, locale: &str) -> Option<(String, String, String)> {
    let source = source_lang(row);
    if locale == source {
        return Some((
            row.title.clone(),
            row.content.clone(),
            row.excerpt.clone().unwrap_or_default(),
        ));
    }
    let sfx = locale_suffix(locale)?;
    let (t, c, e) = i18n_trio(row, sfx);
    let t = nonempty(t)?;
    let c = nonempty(c)?;
    let excerpt = nonempty(e).unwrap_or("").to_string();
    Some((t.to_string(), c.to_string(), excerpt))
}

/// availableLocales：列出該文實際有內容的 locale（source 永遠在最前）。
fn available_locales(row: &PostRow) -> Vec<String> {
    let source = source_lang(row).to_string();
    let mut list = vec![source.clone()];
    for loc in I18N_LOCALES {
        if loc == source {
            continue;
        }
        if let Some(sfx) = locale_suffix(loc) {
            let (t, c, _) = i18n_trio(row, sfx);
            if nonempty(t).is_some() && nonempty(c).is_some() {
                list.push(loc.to_string());
            }
        }
    }
    list
}

fn split_tags(tags: &Option<String>) -> Vec<String> {
    match tags {
        Some(s) if !s.is_empty() => s.split(',').map(|x| x.to_string()).collect(),
        _ => vec![],
    }
}

// ── GET /api/posts（分頁列表）────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    page: Option<String>,
    limit: Option<String>,
    search: Option<String>,
    tag: Option<String>,
    category: Option<String>,
    status: Option<String>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
    lang: Option<String>,
}

fn parse_int(s: Option<&str>, default: i64) -> i64 {
    s.and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(default)
}

#[derive(Debug, Serialize)]
struct PostListItem {
    id: i64,
    title: String,
    excerpt: String,
    category: Option<String>,
    status: String,
    author: Option<String>,
    view_count: i64,
    likes: i64,
    layout_type: Option<String>,
    created_at: String,
    updated_at: Option<String>,
    source_language: String,
    available_locales: Vec<String>,
    tags: Vec<String>,
}

#[derive(Debug, Serialize)]
struct Pagination {
    page: i64,
    limit: i64,
    total: i64,
    #[serde(rename = "totalPages")]
    total_pages: i64,
}

#[derive(Debug, Serialize)]
pub struct PostsListResponse {
    message: &'static str,
    posts: Vec<PostListItem>,
    locale: Option<&'static str>,
    pagination: Pagination,
}

/// `GET /api/posts` —— 公開分頁列表（過濾 / 排序 / 多語）。SQL 與分頁邏輯照抄 Express。
pub async fn list_posts(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<PostsListResponse>, AppError> {
    let status = q.status.as_deref().unwrap_or("published");
    let page = parse_int(q.page.as_deref(), 1);
    let limit = parse_int(q.limit.as_deref(), 10);
    let offset = (page - 1) * limit;
    let requested_locale = parse_locale(q.lang.as_deref());

    // 動態 WHERE（與 Express 同序：status → search → tag → category）
    let mut sql = String::from(
        "SELECT p.*, GROUP_CONCAT(t.name) as tags \
         FROM posts p \
         LEFT JOIN post_tags pt ON p.id = pt.post_id \
         LEFT JOIN tags t ON pt.tag_id = t.id \
         WHERE p.status = ?",
    );
    if q.search.is_some() {
        sql.push_str(" AND (p.title LIKE ? OR p.content LIKE ?)");
    }
    if q.tag.is_some() {
        sql.push_str(" AND t.name = ?");
    }
    if q.category.is_some() {
        sql.push_str(" AND p.category = ?");
    }
    sql.push_str(" GROUP BY p.id");
    match q.sort_by.as_deref() {
        Some("oldest") => sql.push_str(" ORDER BY p.created_at ASC"),
        Some("popular") => sql.push_str(" ORDER BY p.view_count DESC, p.created_at DESC"),
        _ => sql.push_str(" ORDER BY p.created_at DESC"),
    }
    sql.push_str(" LIMIT ? OFFSET ?");

    let mut query = sqlx::query_as::<_, PostRow>(&sql).bind(status);
    if let Some(s) = &q.search {
        let like = format!("%{s}%");
        query = query.bind(like.clone()).bind(like);
    }
    if let Some(t) = &q.tag {
        query = query.bind(t.clone());
    }
    if let Some(c) = &q.category {
        query = query.bind(c.clone());
    }
    let rows = query.bind(limit).bind(offset).fetch_all(&state.pool).await?;

    // count 查詢（同樣的 WHERE，無 GROUP BY/排序/分頁）
    let mut count_sql = String::from(
        "SELECT COUNT(DISTINCT p.id) as total \
         FROM posts p \
         LEFT JOIN post_tags pt ON p.id = pt.post_id \
         LEFT JOIN tags t ON pt.tag_id = t.id \
         WHERE p.status = ?",
    );
    if q.search.is_some() {
        count_sql.push_str(" AND (p.title LIKE ? OR p.content LIKE ?)");
    }
    if q.tag.is_some() {
        count_sql.push_str(" AND t.name = ?");
    }
    if q.category.is_some() {
        count_sql.push_str(" AND p.category = ?");
    }
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql).bind(status);
    if let Some(s) = &q.search {
        let like = format!("%{s}%");
        count_q = count_q.bind(like.clone()).bind(like);
    }
    if let Some(t) = &q.tag {
        count_q = count_q.bind(t.clone());
    }
    if let Some(c) = &q.category {
        count_q = count_q.bind(c.clone());
    }
    let total: i64 = count_q.fetch_one(&state.pool).await?;

    let mut posts = Vec::new();
    for row in &rows {
        let content = match requested_locale {
            Some(loc) => locale_content(row, loc),
            None => Some((row.title.clone(), row.content.clone(), row.excerpt.clone().unwrap_or_default())),
        };
        let Some((title, _content, excerpt)) = content else {
            continue; // 該語言無翻譯 → 不出現在列表
        };
        posts.push(PostListItem {
            id: row.id,
            title,
            excerpt,
            category: row.category.clone(),
            status: row.status.clone(),
            author: row.author.clone(),
            view_count: row.view_count,
            likes: row.likes,
            layout_type: row.layout_type.clone(),
            created_at: row.created_at.clone(),
            updated_at: row.updated_at.clone(),
            source_language: source_lang(row).to_string(),
            available_locales: available_locales(row),
            tags: split_tags(&row.tags),
        });
    }

    let (resp_total, total_pages) = if requested_locale.is_some() {
        let n = posts.len() as i64;
        (n, if limit > 0 { (n + limit - 1) / limit } else { 0 })
    } else {
        (total, if limit > 0 { (total + limit - 1) / limit } else { 0 })
    };

    Ok(Json(PostsListResponse {
        message: "success",
        posts,
        locale: requested_locale,
        pagination: Pagination {
            page,
            limit,
            total: resp_total,
            total_pages,
        },
    }))
}

// ── GET /api/posts/:id（單篇）─────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct LangQuery {
    lang: Option<String>,
}

/// `GET /api/posts/:id` —— 公開單篇（多語；找不到 / 該語無內容皆回對應 404）。
pub async fn get_post(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<LangQuery>,
) -> Result<Response, AppError> {
    let row = sqlx::query_as::<_, PostRow>(
        "SELECT p.*, GROUP_CONCAT(t.name) as tags \
         FROM posts p \
         LEFT JOIN post_tags pt ON p.id = pt.post_id \
         LEFT JOIN tags t ON pt.tag_id = t.id \
         WHERE p.id = ? \
         GROUP BY p.id",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        // 對齊 Express：404 + {"message":"Post not found"}
        return Ok((StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response());
    };

    let source = source_lang(&row).to_string();
    let requested = parse_locale(q.lang.as_deref()).unwrap_or(source.as_str());

    let Some((title, content, excerpt)) = locale_content(&row, requested) else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({
                "message": "Post not available in requested locale",
                "locale": requested,
                "available_locales": available_locales(&row),
            })),
        )
            .into_response());
    };

    let is_source = requested == source;
    Ok(Json(json!({
        "message": "success",
        "id": row.id,
        "title": title,
        "content": content,
        "excerpt": excerpt,
        "category": row.category,
        "status": row.status,
        "author": row.author,
        "view_count": row.view_count,
        "likes": row.likes,
        "layout_type": row.layout_type,
        "series_name": row.series_name,
        "series_order": row.series_order,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "locale": requested,
        "source_language": source,
        "is_source": is_source,
        "available_locales": available_locales(&row),
        "tags": split_tags(&row.tags),
    }))
    .into_response())
}

// ── GET /api/posts/:id/reactions ─────────────────────────────────────────
#[derive(Debug, Serialize, FromRow)]
pub struct ReactionRow {
    emoji: String,
    count: i64,
}

#[derive(Debug, Serialize)]
pub struct ReactionsResponse {
    reactions: Vec<ReactionRow>,
}

/// `GET /api/posts/:id/reactions` —— 公開純讀。
pub async fn post_reactions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReactionsResponse>, AppError> {
    let reactions = sqlx::query_as::<_, ReactionRow>(
        "SELECT emoji, count FROM post_reactions WHERE post_id = ? AND count > 0 ORDER BY count DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ReactionsResponse { reactions }))
}

// ── GET /api/posts/:id/comments ──────────────────────────────────────────
/// comments 一列。欄位順序對齊 live 表實際 `SELECT *` 展開順序。
#[derive(Debug, Serialize, FromRow)]
pub struct CommentRow {
    id: i64,
    // thought 留言的 post_id 為 NULL（createComment 只填 thought_id）；blog 留言為文章 id。
    // Option 對兩者都正確：Some→數字、None→null。
    post_id: Option<i64>,
    author: String,
    content: String,
    likes: i64,
    created_at: String,
    is_admin: i64,
    email: Option<String>,
    website: Option<String>,
    status: Option<String>,
    ip: Option<String>,
    parent_id: Option<i64>,
    avatar_url: Option<String>,
    thought_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CommentsResponse {
    message: &'static str,
    comments: Vec<CommentRow>,
}

impl CommentsResponse {
    pub fn new(comments: Vec<CommentRow>) -> Self {
        Self {
            message: "success",
            comments,
        }
    }
}

/// `GET /api/posts/:id/comments` —— 公開純讀（只列 approved）。
pub async fn post_comments(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<CommentsResponse>, AppError> {
    let comments = sqlx::query_as::<_, CommentRow>(
        "SELECT id, post_id, author, content, likes, created_at, is_admin, email, website, status, ip, parent_id, avatar_url, thought_id \
         FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(CommentsResponse {
        message: "success",
        comments,
    }))
}

// ── 計數寫入（公開）────────────────────────────────────────────────────────
/// `POST /api/posts/:id/view` —— view_count + 1。
pub async fn post_view(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match sqlx::query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response()
        }
        Ok(_) => Json(json!({ "message": "success", "view_count_incremented": true })).into_response(),
    }
}

/// 共用：對 posts.likes 做 +1/-1（unlike 限 likes>0），回更新後 likes 或對應 404。
async fn adjust_post_likes(state: &AppState, id: &str, like: bool) -> Response {
    let (sql, not_found) = if like {
        ("UPDATE posts SET likes = likes + 1 WHERE id = ?", "Post not found")
    } else {
        (
            "UPDATE posts SET likes = likes - 1 WHERE id = ? AND likes > 0",
            "Post not found or cannot unlike",
        )
    };
    match sqlx::query(sql).bind(id).execute(&state.pool).await {
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            return (StatusCode::NOT_FOUND, Json(json!({ "message": not_found }))).into_response()
        }
        Ok(_) => {}
    }
    match sqlx::query_scalar::<_, i64>("SELECT likes FROM posts WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
    {
        Ok(likes) => Json(json!({ "message": "success", "likes": likes })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// `POST /api/posts/:id/like`
pub async fn post_like(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    adjust_post_likes(&state, &id, true).await
}

/// `POST /api/posts/:id/unlike`
pub async fn post_unlike(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    adjust_post_likes(&state, &id, false).await
}

#[derive(Debug, Deserialize)]
pub struct ReactionBody {
    emoji: Option<String>,
    delta: Option<i64>,
}

/// `POST /api/posts/:id/reactions` —— emoji 反應 upsert（clamp 0）。
pub async fn post_reaction(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ReactionBody>,
) -> Response {
    const ALLOWED: [&str; 6] = ["👍", "❤️", "🎉", "🚀", "🤔", "😂"];
    let emoji = body.emoji.unwrap_or_default();
    if !ALLOWED.contains(&emoji.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalid emoji" }))).into_response();
    }
    let d: i64 = if body.delta == Some(-1) { -1 } else { 1 };
    if let Err(e) = sqlx::query(
        "INSERT INTO post_reactions (post_id, emoji, count, updated_at) \
         VALUES (?, ?, MAX(0, ?), datetime('now')) \
         ON CONFLICT(post_id, emoji) DO UPDATE SET count = MAX(0, count + ?), updated_at = datetime('now')",
    )
    .bind(&id)
    .bind(&emoji)
    .bind(d)
    .bind(d)
    .execute(&state.pool)
    .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT count FROM post_reactions WHERE post_id = ? AND emoji = ?",
    )
    .bind(&id)
    .bind(&emoji)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
    .unwrap_or(0);
    Json(json!({ "emoji": emoji, "count": count })).into_response()
}

/// `POST /api/comments/:id/like` —— comments.likes + 1。
pub async fn comment_like(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match sqlx::query("UPDATE comments SET likes = likes + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            return (StatusCode::NOT_FOUND, Json(json!({ "message": "Comment not found" }))).into_response()
        }
        Ok(_) => {}
    }
    match sqlx::query_scalar::<_, i64>("SELECT likes FROM comments WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
    {
        Ok(likes) => Json(json!({ "message": "success", "likes": likes })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ════════════════ posts 寫入（/posts 路徑；requireAdmin / basicAuth）════════════════
use serde_json::{Map, Value};

use crate::auth::require_admin;
use crate::handlers::admin::manage_tags;
use crate::util::js_truthy;

/// body.tags → Vec<String>（非陣列/缺 → 空；供 manageTags）。
fn tags_vec(b: &Map<String, Value>) -> Vec<String> {
    b.get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn v_to_s(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        other => Some(crate::util::js_interp(other)),
    }
}

/// `POST /api/posts`（requireAdmin）—— 簡版建文（無 i18n）。錯誤回 **400**（對齊 Express 此端點）。
pub async fn create_post_public(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(b): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if !js_truthy(b.get("title")) || !js_truthy(b.get("content")) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing required fields: title, content" }))).into_response();
    }
    let status = if b.contains_key("status") { b.get("status").and_then(v_to_s) } else { Some("draft".into()) };
    let layout = if b.contains_key("layout_type") { b.get("layout_type").and_then(v_to_s) } else { Some("record".into()) };
    let r = sqlx::query(
        "INSERT INTO posts (title, content, excerpt, category, status, author, layout_type, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(b.get("title").and_then(v_to_s))
    .bind(b.get("content").and_then(v_to_s))
    .bind(b.get("excerpt").and_then(v_to_s))
    .bind(b.get("category").filter(|v| js_truthy(Some(v))).and_then(v_to_s))
    .bind(&status)
    .bind("Koimsurai")
    .bind(&layout)
    .execute(&state.pool)
    .await;
    let post_id = match r {
        Ok(r) => r.last_insert_rowid(),
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    let tags = tags_vec(&b);
    if let Err(e) = manage_tags(&state, &post_id.to_string(), &tags).await {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response();
    }
    let mut data = Map::new();
    data.insert("id".into(), json!(post_id));
    data.insert("title".into(), b.get("title").cloned().unwrap_or(Value::Null));
    data.insert("content".into(), b.get("content").cloned().unwrap_or(Value::Null));
    if let Some(v) = b.get("excerpt") {
        data.insert("excerpt".into(), v.clone());
    }
    if let Some(v) = b.get("category") {
        data.insert("category".into(), v.clone());
    }
    data.insert("tags".into(), b.get("tags").cloned().unwrap_or_else(|| json!([])));
    data.insert("status".into(), b.get("status").cloned().unwrap_or_else(|| json!("draft")));
    (StatusCode::CREATED, Json(json!({ "message": "success", "data": Value::Object(data) }))).into_response()
}

/// `PUT /api/posts/:id`（requireAdmin）—— 6 欄 COALESCE（**category 也 COALESCE**，與 admin 版不同）。
pub async fn update_post_public(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(b): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    let r = sqlx::query(
        "UPDATE posts SET title = COALESCE(?, title), content = COALESCE(?, content), \
         excerpt = COALESCE(?, excerpt), category = COALESCE(?, category), status = COALESCE(?, status), \
         layout_type = COALESCE(?, layout_type), updated_at = datetime('now') WHERE id = ?",
    )
    .bind(b.get("title").and_then(v_to_s))
    .bind(b.get("content").and_then(v_to_s))
    .bind(b.get("excerpt").and_then(v_to_s))
    .bind(b.get("category").and_then(v_to_s))
    .bind(b.get("status").and_then(v_to_s))
    .bind(b.get("layout_type").and_then(v_to_s))
    .bind(&id)
    .execute(&state.pool)
    .await;
    let changes = match r {
        Ok(r) => r.rows_affected(),
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    if changes == 0 {
        return (StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response();
    }
    let tags = tags_vec(&b);
    if let Err(e) = manage_tags(&state, &id, &tags).await {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response();
    }
    Json(json!({ "message": "success", "changes": changes })).into_response()
}

#[derive(Debug, Deserialize)]
pub struct StatusBody {
    status: Option<String>,
}

/// `PATCH /api/posts/:id/status`（requireAdmin）—— 僅 published|draft。
pub async fn patch_post_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(b): Json<StatusBody>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    let status = b.status.unwrap_or_default();
    if status != "published" && status != "draft" {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "無效的狀態值，必須是 published 或 draft" }))).into_response();
    }
    match sqlx::query("UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&status)
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "message": "找不到文章" }))).into_response(),
        Ok(r) => Json(json!({ "message": "狀態更新成功", "status": status, "changes": r.rows_affected() })).into_response(),
    }
}

/// `DELETE /api/posts/:id`（requireAdmin）—— post_tags 先清（錯 500），posts 刪（錯 400）。
pub async fn delete_post_public(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if let Err(e) = sqlx::query("DELETE FROM post_tags WHERE post_id = ?").bind(&id).execute(&state.pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    match sqlx::query("DELETE FROM posts WHERE id = ?").bind(&id).execute(&state.pool).await {
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response(),
        Ok(r) => Json(json!({ "message": "deleted", "changes": r.rows_affected() })).into_response(),
    }
}

/// `POST /api/posts/legacy`（**basicAuth**）—— 舊匯入端點。
pub async fn create_post_legacy(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(b): Json<Map<String, Value>>,
) -> Response {
    if let Some(resp) = crate::auth::basic_auth_check(&headers) {
        return resp;
    }
    if !js_truthy(b.get("title")) || !js_truthy(b.get("content")) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Missing required fields: title, content" }))).into_response();
    }
    let author = b.get("author").filter(|v| js_truthy(Some(v))).and_then(v_to_s).unwrap_or_else(|| "Koimsurai".into());
    match sqlx::query(
        "INSERT INTO posts (title, content, status, author, created_at, updated_at) \
         VALUES (?, ?, 'published', ?, datetime('now'), datetime('now'))",
    )
    .bind(b.get("title").and_then(v_to_s))
    .bind(b.get("content").and_then(v_to_s))
    .bind(&author)
    .execute(&state.pool)
    .await
    {
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) => {
            // {id: lastID, ...req.body}
            let mut data = Map::new();
            data.insert("id".into(), json!(r.last_insert_rowid()));
            for (k, v) in &b {
                data.insert(k.clone(), v.clone());
            }
            (StatusCode::CREATED, Json(json!({ "message": "success", "data": Value::Object(data) }))).into_response()
        }
    }
}
