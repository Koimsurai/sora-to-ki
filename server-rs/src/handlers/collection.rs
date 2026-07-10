use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::state::AppState;
use crate::{
    auth::require_admin,
    util::{bind_val, js_truthy, row_to_json},
};

#[derive(Debug, Deserialize)]
pub struct CollectionQuery {
    format: Option<String>,
    sort: Option<String>,
    favorite: Option<String>,
    limit: Option<String>,
}

/// `GET /api/collection/:type` —— 公開列表（format/favorite 過濾、sort、limit）。
pub async fn list_collection(
    State(state): State<AppState>,
    Path(ctype): Path<String>,
    Query(q): Query<CollectionQuery>,
) -> Response {
    let mut sql = String::from("SELECT * FROM collection_items WHERE collection_type = ?");
    if q.format.is_some() {
        sql.push_str(" AND media_format = ?");
    }
    if q.favorite.as_deref() == Some("true") {
        sql.push_str(" AND is_favorite = 1");
    }
    sql.push_str(match q.sort.as_deref() {
        Some("rating") => " ORDER BY rating DESC",
        Some("watch_date") => " ORDER BY watch_date DESC",
        _ => " ORDER BY created_at DESC",
    });
    if q.limit.is_some() {
        sql.push_str(" LIMIT ?");
    }
    let mut query = sqlx::query(&sql).bind(&ctype);
    if let Some(f) = &q.format {
        query = query.bind(f.clone());
    }
    if let Some(l) = &q.limit {
        // Express: Number(limit)；NaN → 綁 NULL（LIMIT NULL = 不限制）
        let n = l.trim();
        query = if n.is_empty() {
            query.bind(0i64) // Number('') = 0
        } else if let Ok(i) = n.parse::<i64>() {
            query.bind(i)
        } else if let Ok(f) = n.parse::<f64>() {
            query.bind(f)
        } else {
            query.bind(Option::<i64>::None)
        };
    }
    match query.fetch_all(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(rows) => {
            let items: Vec<Value> = rows.iter().map(|r| Value::Object(row_to_json(r))).collect();
            Json(json!({ "message": "success", "items": items })).into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchExternalBody {
    query: Option<Value>,
    #[serde(rename = "type")]
    type_: Option<Value>,
}

/// `POST /api/collection/search-external`（requireAdmin）—— Express 端是 501 stub，照抄。
pub async fn search_external(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SearchExternalBody>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if !js_truthy(body.query.as_ref()) || !js_truthy(body.type_.as_ref()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "缺少必填參數: query, type" }))).into_response();
    }
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({ "error": "Not implemented yet", "message": "此功能尚未實現，請先手動添加收藏項目" })),
    )
        .into_response()
}

/// `POST /api/collection`（requireAdmin）—— 動態欄位 INSERT（欄名來自 body key，照抄 Express；
/// 非法欄名 → SQL 錯誤 500，與 Express 行為一致——僅錯誤字串因 driver 不同）。
pub async fn create_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if !js_truthy(body.get("title")) || !js_truthy(body.get("collection_type")) || !js_truthy(body.get("media_format"))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "缺少必填欄位: title, collection_type, media_format" })),
        )
            .into_response();
    }
    let keys: Vec<&String> = body.keys().collect();
    let fields = keys.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", ");
    let placeholders = vec!["?"; keys.len()].join(", ");
    let sql = format!("INSERT INTO collection_items ({fields}) VALUES ({placeholders})");
    let mut q = sqlx::query(&sql);
    for k in &keys {
        q = bind_val(q, body.get(*k));
    }
    match q.execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) => (StatusCode::CREATED, Json(json!({ "message": "收藏項目已新增", "id": r.last_insert_rowid() }))).into_response(),
    }
}

/// `PUT /api/collection/:id`（requireAdmin）—— 動態欄位 UPDATE。
pub async fn update_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Map<String, Value>>,
) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "沒有要更新的欄位" }))).into_response();
    }
    let sets = body.keys().map(|k| format!("{k} = ?")).collect::<Vec<_>>().join(", ");
    let sql = format!("UPDATE collection_items SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    let mut q = sqlx::query(&sql);
    for k in body.keys() {
        q = bind_val(q, body.get(k));
    }
    q = q.bind(&id);
    match q.execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": "收藏項目不存在" }))).into_response()
        }
        Ok(r) => Json(json!({ "message": "收藏項目已更新", "changes": r.rows_affected() })).into_response(),
    }
}

/// `DELETE /api/collection/:id`（requireAdmin）。
pub async fn delete_item(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap) -> Response {
    if let Err(e) = require_admin(&headers, &state).await {
        return e.into_response();
    }
    match sqlx::query("DELETE FROM collection_items WHERE id = ?").bind(&id).execute(&state.pool).await {
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": "收藏項目不存在" }))).into_response()
        }
        Ok(r) => Json(json!({ "message": "收藏項目已刪除", "changes": r.rows_affected() })).into_response(),
    }
}

/// `POST /api/sync/collection` —— n8n 批次匯入到 `collection_items`（x-api-key 驗證）。
/// 移植 `index.js`：Rust 已是 collection_items 寫者（#61-65），此端點併入維持單寫者。
pub async fn sync_collection(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    // N8N_SYNC_API_KEY 未設 → 500（對齊 Express 的訊息）
    let key = match std::env::var("N8N_SYNC_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "N8N_SYNC_API_KEY 未設定", "message": "請在 server/.env 中設置 N8N_SYNC_API_KEY" })),
            )
                .into_response()
        }
    };
    let api_key = headers.get("x-api-key").and_then(|v| v.to_str().ok()).unwrap_or("");
    if api_key != key {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Invalid API Key" }))).into_response();
    }
    // items 必須是非空陣列
    let items = match body.get("items").and_then(|v| v.as_array()) {
        Some(a) if !a.is_empty() => a,
        _ => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "items 必須是非空陣列" }))).into_response(),
    };

    // `x || null`：truthy 才取值，否則 NULL
    let or_null = |item: &Value, k: &str| -> Option<Value> {
        let v = item.get(k);
        if js_truthy(v) {
            v.cloned()
        } else {
            None
        }
    };

    let mut inserted = 0i64;
    let mut errors: Vec<Value> = Vec::new();
    for item in items {
        // source || 'n8n_import'、status || 'completed'、is_favorite ? 1 : 0
        let source = or_null(item, "source").unwrap_or_else(|| json!("n8n_import"));
        let status = or_null(item, "status").unwrap_or_else(|| json!("completed"));
        let is_fav = json!(if js_truthy(item.get("is_favorite")) { 1 } else { 0 });
        let mut q = sqlx::query(
            "INSERT INTO collection_items (\
             title, original_title, year, poster_url, overview, \
             external_id, collection_type, media_format, source, \
             status, rating, review, is_favorite, watch_date\
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        );
        q = bind_val(q, item.get("title")); // 無預設（缺→NULL，交約束決定）
        q = bind_val(q, or_null(item, "original_title").as_ref());
        q = bind_val(q, or_null(item, "year").as_ref());
        q = bind_val(q, or_null(item, "poster_url").as_ref());
        q = bind_val(q, or_null(item, "overview").as_ref());
        q = bind_val(q, or_null(item, "external_id").as_ref());
        q = bind_val(q, item.get("collection_type"));
        q = bind_val(q, item.get("media_format"));
        q = bind_val(q, Some(&source));
        q = bind_val(q, Some(&status));
        q = bind_val(q, or_null(item, "rating").as_ref());
        q = bind_val(q, or_null(item, "review").as_ref());
        q = bind_val(q, Some(&is_fav));
        q = bind_val(q, or_null(item, "watch_date").as_ref());
        match q.execute(&state.pool).await {
            Ok(_) => inserted += 1,
            Err(e) => errors.push(json!({ "title": item.get("title").cloned().unwrap_or(Value::Null), "error": e.to_string() })),
        }
    }

    // { message, inserted, total, errors?（空則省略 key，對齊 undefined）}
    let mut out = Map::new();
    out.insert("message".into(), json!("批次匯入完成"));
    out.insert("inserted".into(), json!(inserted));
    out.insert("total".into(), json!(items.len()));
    if !errors.is_empty() {
        out.insert("errors".into(), Value::Array(errors));
    }
    Json(Value::Object(out)).into_response()
}
