//! OpenAPI 文件（utoipa）+ Scalar UI。與 specta 型別同源——同一批 response struct
//! 同時 derive `specta::Type`（給前端 TS）與 `utoipa::ToSchema`（給 OpenAPI）。
//! 首波只收公開讀端點；admin/mutation/第三方待後續增量（照 SPECTA/ROADMAP B6）。

use axum::Json;
use utoipa::OpenApi;

use crate::handlers;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "koimsurai / 宙と木 API",
        description = "個人站 Rust 後端 · 公開讀端點（型別與前端 specta 生成同源）",
        version = "0.1.0",
    ),
    paths(
        handlers::posts::list_posts,
        handlers::posts::get_post,
        handlers::watch::anime_history,
        handlers::watch::films_recent,
        handlers::watch::tv_recent,
        handlers::watch::watch_stats,
        handlers::books::list_books,
        handlers::series::list_series,
        handlers::series::series_by_name,
        handlers::home::home_digest,
        handlers::stats::site_stats,
    ),
    components(schemas(
        handlers::posts::PostListItem,
        handlers::posts::Pagination,
        handlers::posts::PostsListResponse,
        handlers::posts::PostDetailResponse,
        handlers::watch::AnimeRow,
        handlers::watch::AnimeHistoryResponse,
        handlers::watch::FilmRow,
        handlers::watch::FilmsResponse,
        handlers::watch::TvRow,
        handlers::watch::TvResponse,
        handlers::watch::WatchStatsResponse,
        handlers::books::BookRow,
        handlers::books::BooksListResponse,
        handlers::series::SeriesRow,
        handlers::series::SeriesListResponse,
        handlers::series::SeriesPostRow,
        handlers::series::SeriesDetailResponse,
        handlers::home::DigestPost,
        handlers::home::DigestThought,
        handlers::home::DigestComment,
        handlers::home::DigestTimeline,
        handlers::home::DigestResponse,
        handlers::stats::StatsResponse,
    )),
    tags(
        (name = "posts", description = "文章"),
        (name = "watch", description = "在看什麼（anime/films/tv/stats）"),
        (name = "books", description = "書櫃"),
        (name = "series", description = "系列文"),
        (name = "home", description = "首頁動態帶"),
        (name = "stats", description = "站台統計"),
    ),
)]
pub struct ApiDoc;

/// `GET /api/openapi.json` —— 機器可讀 OpenAPI 3.1 spec（完全自架）。
/// UI（Scalar）由 utoipa-scalar 整合在 main.rs 掛 `/api/docs`（axum 0.8 後可原生 merge）。
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
