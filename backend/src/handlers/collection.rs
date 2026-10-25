//! 收藏頁的後台（2026-10 後台提案的「收藏」頁）：觀看紀錄與聽的歌要不要出現在前台。
//!
//! 這些都是同步進來的（巴哈、Simkl、Spotify），站長沒辦法決定「有沒有看」，只能決定
//! 「這一部／這一首要不要出現在前台」。不公開的記在 `collection_hidden`，公開端點
//! （`/api/anime/history`、`/api/films/recent`、`/api/tv/recent`、`/api/watch/stats`、
//! Spotify 那幾支）讀的時候拿掉。
//!
//! 最愛（`watch_favorites`）沿用 `/api/watch/favorites` 的增改刪，這裡只在每一部後面標出
//! 「是不是已經在最愛裡」。

use std::collections::HashSet;

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, SqlitePool};

use crate::state::AppState;

pub const KINDS: &[&str] = &["anime", "film", "tv", "track"];
/// 後台「在看」列幾部
const WATCH_LIMIT: i64 = 120;

/// 某一種不公開的 key。讀失敗就當作沒有藏任何東西（記 log），不讓整個公開端點掛掉
pub async fn hidden_keys(pool: &SqlitePool, kind: &str) -> HashSet<String> {
    match sqlx::query_scalar::<_, String>("SELECT key FROM collection_hidden WHERE kind = ?")
        .bind(kind)
        .fetch_all(pool)
        .await
    {
        Ok(keys) => keys.into_iter().collect(),
        Err(e) => {
            tracing::error!("[collection] 讀不到不公開清單：{e}");
            HashSet::new()
        }
    }
}

/// 後台「在看」的一部（動畫、電影、影集混在一起，照最後看的時間排）
#[derive(Debug, Serialize, FromRow, specta::Type, utoipa::ToSchema)]
pub struct AdminWatchItem {
    /// anime | film | tv
    pub kind: String,
    /// 不公開清單用的 key：動畫是 anime_sn、電影是 film_history.id、影集是劇名
    pub key: String,
    pub title: String,
    pub cover: Option<String>,
    /// 動畫是最後一集、影集是看了幾集、電影是評分
    pub detail: Option<String>,
    pub watched_at: Option<String>,
    /// bahamut | simkl | trakt …
    pub source: Option<String>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub tmdb_id: Option<i64>,
    pub hidden: bool,
    /// 在最愛裡的話是那一筆的 id
    #[specta(type = Option<specta_typescript::Number>)]
    pub favorite_id: Option<i64>,
}

/// 後台「在聽」的一首（Spotify 最近播放，含不公開的）
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminTrackItem {
    pub id: String,
    pub name: String,
    pub artists: String,
    pub cover: Option<String>,
    pub played_at: String,
    pub hidden: bool,
}

/// 不公開的一筆（給後台列「藏了哪些」，Spotify 的歌不在最近播放裡也看得到）
#[derive(Debug, Serialize, FromRow, specta::Type, utoipa::ToSchema)]
pub struct HiddenItem {
    pub kind: String,
    pub key: String,
    pub title: String,
    pub hidden_at: String,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminCollectionResponse {
    pub watch: Vec<AdminWatchItem>,
    pub tracks: Vec<AdminTrackItem>,
    /// Spotify 抓失敗的話是理由（沒接 Spotify 不算失敗，tracks 就是空的）
    pub tracks_error: Option<String>,
    pub hidden: Vec<HiddenItem>,
}

/// `GET /api/admin/collection` —— 在看（含不公開的）、在聽、不公開清單
#[utoipa::path(get, path = "/api/admin/collection", tag = "admin", security(("bearer" = [])),
    responses((status = 200, body = AdminCollectionResponse), (status = 401, description = "未授權")))]
pub async fn admin_collection(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
) -> Result<Json<AdminCollectionResponse>, crate::error::AppError> {
    let pool = &state.pool;
    // 一部一列：動畫照 anime_sn 併、影集照劇名併；最愛照 tmdb_id＋種類對上
    let watch = sqlx::query_as::<_, AdminWatchItem>(
        "SELECT w.kind, w.key, w.title, w.cover, w.detail, w.watched_at, w.source, w.tmdb_id, \
                EXISTS (SELECT 1 FROM collection_hidden h WHERE h.kind = w.kind AND h.key = w.key) AS hidden, \
                (SELECT f.id FROM watch_favorites f WHERE f.tmdb_id = w.tmdb_id \
                   AND f.kind = CASE w.kind WHEN 'film' THEN 'film' ELSE 'tv' END LIMIT 1) AS favorite_id \
         FROM ( \
           SELECT 'anime' AS kind, CAST(anime_sn AS TEXT) AS key, COALESCE(MAX(title), '') AS title, \
                  MAX(cover_url) AS cover, MAX(episode) AS detail, MAX(last_watched_at) AS watched_at, \
                  'bahamut' AS source, MAX(tmdb_id) AS tmdb_id \
             FROM anime_history GROUP BY anime_sn \
           UNION ALL \
           SELECT 'film', CAST(id AS TEXT), title, poster_url, \
                  CASE WHEN rating IS NULL THEN NULL ELSE '★ ' || rating END, watched_date, source, tmdb_id \
             FROM film_history \
           UNION ALL \
           SELECT 'tv', series_name, series_name, MAX(poster_url), '看了 ' || COUNT(*) || ' 集', \
                  MAX(watched_date), MAX(source), MAX(tmdb_id) \
             FROM tv_history GROUP BY series_name \
         ) w ORDER BY w.watched_at DESC NULLS LAST LIMIT ?",
    )
    .bind(WATCH_LIMIT)
    .fetch_all(pool)
    .await?;

    let hidden_tracks = hidden_keys(pool, "track").await;
    let (tracks, tracks_error) = match crate::handlers::spotify::recent_unfiltered(&state).await {
        Ok(r) => (
            r.items
                .into_iter()
                .map(|i| AdminTrackItem {
                    hidden: hidden_tracks.contains(&i.track.id),
                    artists: i.track.artists.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join("、"),
                    cover: i.track.album.images.last().map(|img| img.url.clone()),
                    id: i.track.id,
                    name: i.track.name,
                    played_at: i.played_at,
                })
                .collect(),
            None,
        ),
        Err(e) => (Vec::new(), Some(e)),
    };

    let hidden = sqlx::query_as::<_, HiddenItem>(
        "SELECT kind, key, title, hidden_at FROM collection_hidden ORDER BY hidden_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(AdminCollectionResponse { watch, tracks, tracks_error, hidden }))
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct HiddenBody {
    kind: String,
    key: String,
    /// 藏的時候記下名字（Spotify 的歌不在 DB 裡，之後要列出來只能靠這個）
    title: Option<String>,
    hidden: bool,
}

/// `PUT /api/admin/collection/hidden` —— 某一部／某一首設成不公開或改回公開
#[utoipa::path(put, path = "/api/admin/collection/hidden", tag = "admin", security(("bearer" = [])),
    request_body = HiddenBody,
    responses((status = 200, description = "改好了"), (status = 400, description = "種類或 key 不對"), (status = 401, description = "未授權")))]
pub async fn admin_set_hidden(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    crate::error::JsonBody(b): crate::error::JsonBody<HiddenBody>,
) -> Response {
    let key = b.key.trim();
    if !KINDS.contains(&b.kind.as_str()) || key.is_empty() || key.chars().count() > 200 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "種類或 key 不對" }))).into_response();
    }
    let title: String = b.title.as_deref().unwrap_or_default().trim().chars().take(200).collect();
    let r = if b.hidden {
        sqlx::query(
            "INSERT INTO collection_hidden (kind, key, title) VALUES (?, ?, ?) \
             ON CONFLICT (kind, key) DO UPDATE SET title = excluded.title",
        )
        .bind(&b.kind)
        .bind(key)
        .bind(&title)
        .execute(&state.pool)
        .await
    } else {
        sqlx::query("DELETE FROM collection_hidden WHERE kind = ? AND key = ?")
            .bind(&b.kind)
            .bind(key)
            .execute(&state.pool)
            .await
    };
    match r {
        Ok(_) => Json(json!({ "kind": b.kind, "key": key, "hidden": b.hidden })).into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}
