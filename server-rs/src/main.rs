use std::{env, str::FromStr, sync::Arc, time::Duration};

use axum::{
    extract::DefaultBodyLimit,
    http::Method,
    routing::{delete, get, patch, post, put},
    Router,
};
use tower_http::cors::{AllowHeaders, Any, CorsLayer};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod error;
mod handlers;
mod proxy;
mod state;
mod util;

use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,koimsurai_web_backend=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 連到與 Express 相同的 sqlite。strangler 期間兩邊共用此檔，
    // 故設 busy_timeout 避免 SQLITE_BUSY（WAL 下讀可重疊）。
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let connect_opts = SqliteConnectOptions::from_str(&database_url)?
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(
            env::var("DATABASE_MAX_CONNECTIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5),
        )
        .connect_with(connect_opts)
        .await?;

    let upstream = env::var("EXPRESS_UPSTREAM")
        .unwrap_or_else(|_| "http://127.0.0.1:3001".to_string());
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    // 與 Express 共用 JWT_SECRET（HS256 驗章）。fail-fast：沒設就不啟動。
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set (與 Express 共用)");

    let state = AppState {
        pool,
        http,
        upstream: Arc::from(upstream.as_str()),
        jwt_secret: Arc::from(jwt_secret.as_str()),
        spotify: Arc::new(state::SpotifyState::default()),
        steam: Arc::new(state::SteamState::default()),
        watch: Arc::new(state::WatchState::default()),
        bahamut: handlers::bahamut::build_state(&database_url),
    };

    // Trakt 歷史同步 worker（ENABLE_TRAKT_SYNC=1 才啟動；見 handlers/watch.rs）
    handlers::watch::spawn_trakt_sync(state.clone());
    // 動畫瘋同步 worker（ENABLE_BAHAMUT_SYNC=1 才啟動；見 handlers/bahamut.rs）
    handlers::bahamut::spawn_sync(state.clone());

    // 已接管的端點走 Rust；其餘一律 fallback 代理回 Express。
    // 每個接管路由的 method-fallback 也指向 proxy：非 GET 方法打到這些路徑時，
    // 轉回 Express 處理（保留 Express 對「未知方法+路徑」回 404 的行為，而非 axum 預設的 405）。
    let app = Router::new()
        .route(
            "/api/tags",
            get(handlers::tags::list_tags).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/categories",
            get(handlers::categories::list_categories).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/series",
            get(handlers::series::list_series).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/series/:name",
            get(handlers::series::series_by_name).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/stats",
            get(handlers::stats::site_stats).fallback(proxy::proxy_to_express),
        )
        // thoughts：/rss 靜態路由（axum matchit 優先於 /:id）；已接管的 RSS feed。
        .route(
            "/api/thoughts/rss",
            get(handlers::thoughts::thoughts_rss).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/thoughts",
            get(handlers::thoughts::list_thoughts).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/thoughts/:id",
            get(handlers::thoughts::get_thought).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/thoughts/:id/comments",
            get(handlers::thoughts::list_thought_comments)
                .post(handlers::comments::thought_comment)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/health",
            get(handlers::home::health).fallback(proxy::proxy_to_express),
        )
        // home digest（純 DB 讀）；/quote/daily 走外部 API+opencc，留 proxy
        .route(
            "/api/home/digest",
            get(handlers::home::home_digest).fallback(proxy::proxy_to_express),
        )
        // posts：列表 / 單篇 / 反應 / 留言（皆公開純讀；寫入與 view/like 走 method-fallback proxy）
        .route(
            "/api/posts",
            get(handlers::posts::list_posts)
                .post(handlers::posts::create_post_public)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id",
            get(handlers::posts::get_post)
                .put(handlers::posts::update_post_public)
                .delete(handlers::posts::delete_post_public)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id/status",
            patch(handlers::posts::patch_post_status).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/legacy",
            post(handlers::posts::create_post_legacy).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id/reactions",
            get(handlers::posts::post_reactions)
                .post(handlers::posts::post_reaction)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id/comments",
            get(handlers::posts::post_comments)
                .post(handlers::comments::post_comment)
                .fallback(proxy::proxy_to_express),
        )
        // 計數寫入（公開）
        .route(
            "/api/posts/:id/view",
            post(handlers::posts::post_view).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id/like",
            post(handlers::posts::post_like).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/posts/:id/unlike",
            post(handlers::posts::post_unlike).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/comments/:id/like",
            post(handlers::posts::comment_like).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/thoughts/:id/react",
            post(handlers::thoughts::thought_react).fallback(proxy::proxy_to_express),
        )
        // admin thoughts CRUD（unfurl / TMDb enrich）
        .route(
            "/api/admin/thoughts",
            post(handlers::thoughts::admin_create_thought).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/thoughts/:id",
            put(handlers::thoughts::admin_update_thought)
                .delete(handlers::thoughts::admin_delete_thought)
                .fallback(proxy::proxy_to_express),
        )
        // auth：登入 / 當前使用者 / 登出 / OAuth 設定（OAuth callbacks 打外部 API 留 proxy）
        .route(
            "/api/auth/login",
            post(handlers::auth::login).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/auth/me",
            get(handlers::auth::me).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/auth/logout",
            post(handlers::auth::logout).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/auth/providers",
            get(handlers::auth::providers).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/auth/reset-admin",
            post(handlers::auth::reset_admin).fallback(proxy::proxy_to_express),
        )
        // 用戶角色管理（requireOwner）
        .route(
            "/api/admin/users/:id/role",
            put(handlers::admin::admin_update_user_role).fallback(proxy::proxy_to_express),
        )
        // OAuth callbacks（google/github；spotify/callback 一次性 setup 留 proxy）
        .route(
            "/api/auth/google/callback",
            post(handlers::oauth::google_callback).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/auth/github/callback",
            post(handlers::oauth::github_callback).fallback(proxy::proxy_to_express),
        )
        // newsletter（send-newsletter 走全域 proxy=resend 硬骨頭）
        .route(
            "/api/newsletter/subscribe",
            post(handlers::newsletter::subscribe).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/newsletter/unsubscribe",
            post(handlers::newsletter::unsubscribe).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/newsletter/by-token/:token",
            get(handlers::newsletter::by_token).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/newsletter/subscribers",
            get(handlers::newsletter::subscribers).fallback(proxy::proxy_to_express),
        )
        // admin authed 讀 + CRUD 寫入（同路徑掛多方法；未接管方法走 fallback proxy）
        .route(
            "/api/admin/tags",
            get(handlers::admin::admin_tags)
                .post(handlers::admin::create_tag)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/tags/:id",
            put(handlers::admin::update_tag)
                .delete(handlers::admin::delete_tag)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/categories",
            get(handlers::admin::admin_categories)
                .post(handlers::admin::create_category)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/categories/:id",
            put(handlers::admin::update_category)
                .delete(handlers::admin::delete_category)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/users",
            get(handlers::admin::admin_users).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/blacklist",
            get(handlers::admin::admin_blacklist)
                .post(handlers::admin::create_blacklist)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/blacklist/:id",
            delete(handlers::admin::delete_blacklist).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/keyword-filters",
            get(handlers::admin::admin_keyword_filters)
                .post(handlers::admin::create_keyword_filter)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/keyword-filters/:id",
            delete(handlers::admin::delete_keyword_filter).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/posts",
            get(handlers::admin::admin_posts)
                .post(handlers::admin::admin_create_post)
                .fallback(proxy::proxy_to_express),
        )
        // …/send-newsletter（resend 硬骨頭）仍走全域 fallback proxy
        .route(
            "/api/admin/posts/:id",
            get(handlers::admin::admin_get_post)
                .put(handlers::admin::admin_update_post)
                .delete(handlers::admin::admin_delete_post)
                .fallback(proxy::proxy_to_express),
        )
        // generate-zh-cn（opencc 硬骨頭 → ferrous-opencc Tw2s，byte-identical）
        .route(
            "/api/admin/posts/:id/generate-zh-cn",
            post(handlers::opencc::generate_zh_cn).fallback(proxy::proxy_to_express),
        )
        // send-newsletter（resend 硬骨頭 → reqwest 直打 Resend batch API）
        .route(
            "/api/admin/posts/:id/send-newsletter",
            post(handlers::mailer::send_newsletter_route).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/comments",
            get(handlers::admin::admin_comments).fallback(proxy::proxy_to_express),
        )
        // 批次審核（Express bug #2 死路由的修好版；靜態段優先於 :id/status）
        .route(
            "/api/admin/comments/batch/status",
            patch(handlers::admin::admin_batch_comment_status).fallback(proxy::proxy_to_express),
        )
        // 後台統計（⚠️ visitors 用 Math.random，非 byte 對拍——除該欄外對拍）
        .route(
            "/api/admin/stats",
            get(handlers::admin::admin_stats).fallback(proxy::proxy_to_express),
        )
        // comments moderation。
        // ⚠️ 不註冊 `/batch/status`：Express 按註冊順序，`:id/status`(先註冊) 遮蔽了 `batch/status`，
        // 使 batch 成為死路由（`batch/status` 被當 id="batch" → UPDATE 0 列 → 404）。為等價，Rust 亦
        // 讓 `batch/status` 落到 `:id/status`（id="batch"）→ 同樣 404。（Express 端 batch 端點失效之既有 bug。）
        .route(
            "/api/admin/comments/:id/status",
            patch(handlers::admin::patch_comment_status).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/comments/:id/reply",
            post(handlers::admin::reply_comment).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/comments/:id",
            put(handlers::admin::update_comment)
                .delete(handlers::admin::delete_comment)
                .fallback(proxy::proxy_to_express),
        )
        // books 域（/books/search/external 打 Google/OpenLibrary，留全域 proxy 待第三方輪）
        .route(
            "/api/books",
            get(handlers::books::list_books)
                .post(handlers::books::create_book)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/books/:id",
            get(handlers::books::get_book)
                .put(handlers::books::update_book)
                .delete(handlers::books::delete_book)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/books/stats/summary",
            get(handlers::books::book_stats).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/books",
            get(handlers::books::admin_books).fallback(proxy::proxy_to_express),
        )
        // collection 域
        .route(
            "/api/collection",
            post(handlers::collection::create_item).fallback(proxy::proxy_to_express),
        )
        // n8n 批次匯入（x-api-key）——Rust 已是 collection_items 寫者，併入維持單寫者
        .route(
            "/api/sync/collection",
            post(handlers::collection::sync_collection).fallback(proxy::proxy_to_express),
        )
        // gallery（零 sharp 部分：讀 manifest / 串流代理）
        .route(
            "/api/gallery/photos",
            get(handlers::gallery::gallery_photos).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/image-proxy",
            get(handlers::gallery::image_proxy).fallback(proxy::proxy_to_express),
        )
        // gallery sync（sharp 硬骨頭本體：rotate+resize+lossy webp+EXIF+manifest）
        .route(
            "/api/admin/gallery/sync",
            post(handlers::gallery::gallery_sync).fallback(proxy::proxy_to_express),
        )
        // OG 圖（sharp/librsvg → resvg；axum 不支援 :id.png 部分參數，handler 內 strip 後綴）
        .route(
            "/api/og/:file",
            get(handlers::og::og_png).fallback(proxy::proxy_to_express),
        )
        // 上傳（multer → axum multipart；thumbhash 實測等價）
        .route(
            "/api/admin/upload",
            post(handlers::upload::upload)
                .fallback(proxy::proxy_to_express)
                // multer limits.fileSize = 50MB（其餘路由走全域 10MB）
                .route_layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            "/api/collection/search-external",
            post(handlers::collection::search_external).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/collection/:type",
            get(handlers::collection::list_collection)
                .put(handlers::collection::update_item)
                .delete(handlers::collection::delete_item)
                .fallback(proxy::proxy_to_express),
        )
        // 第三方代理（/steam/profile SWR 快取、/quote/daily 每日快取+opencc、spotify、watch 域留 proxy）
        .route(
            "/api/github/user/:username",
            get(handlers::thirdparty::github_user).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/github/events/:username",
            get(handlers::thirdparty::github_events).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/wakatime/today",
            get(handlers::thirdparty::wakatime_today).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/wakatime/week",
            get(handlers::thirdparty::wakatime_week).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/wakatime/projects",
            get(handlers::thirdparty::wakatime_projects).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/steam/profile",
            get(handlers::thirdparty::steam_profile).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/login",
            get(handlers::spotify::login).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/recently-played",
            get(handlers::spotify::recently_played).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/now-playing",
            get(handlers::spotify::now_playing).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/top-genres",
            get(handlers::spotify::top_genres).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/top-tracks",
            get(handlers::spotify::top_tracks).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/audio-features",
            get(handlers::spotify::audio_features).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/spotify/me",
            get(handlers::spotify::me).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/steam/player",
            get(handlers::thirdparty::steam_player).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/steam/recent-games",
            get(handlers::thirdparty::steam_recent_games).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/steam/owned-games",
            get(handlers::thirdparty::steam_owned_games).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/steam/achievements/:appid",
            get(handlers::thirdparty::steam_achievements).fallback(proxy::proxy_to_express),
        )
        // watch 域（bahamut status/cookie 留 proxy=anigamer 硬骨頭；cron 同步留 Express）
        .route(
            "/api/anime/history",
            get(handlers::watch::anime_history).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/films/recent",
            get(handlers::watch::films_recent).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/tv/recent",
            get(handlers::watch::tv_recent).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/watch/stats",
            get(handlers::watch::watch_stats).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/watch/favorites",
            get(handlers::watch::favorites)
                .post(handlers::watch::create_favorite)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/watch/favorites/:id",
            put(handlers::watch::update_favorite)
                .delete(handlers::watch::delete_favorite)
                .fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/watch/tmdb-search",
            get(handlers::watch::tmdb_search).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/watch/now",
            get(handlers::watch::watch_now).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/watch/now",
            post(handlers::watch::heartbeat).fallback(proxy::proxy_to_express),
        )
        // 動畫瘋 cookie/status（bahamutPushAuth）
        .route(
            "/api/admin/bahamut/status",
            get(handlers::bahamut::status).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/admin/bahamut/cookie",
            post(handlers::bahamut::cookie).fallback(proxy::proxy_to_express),
        )
        .route(
            "/api/books/search/external",
            get(handlers::thirdparty::books_search_external).fallback(proxy::proxy_to_express),
        )
        .fallback(proxy::proxy_to_express)
        // 對齊 Express `app.use(cors())`：所有回應 ACAO:*；preflight 回六 methods、
        // Allow-Headers reflect 請求（mirror_request = cors 套件預設行為）。
        // 已知微差：preflight Rust 回 200、Express 回 204（瀏覽器語意等價）。
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([
                    Method::GET,
                    Method::HEAD,
                    Method::PUT,
                    Method::PATCH,
                    Method::POST,
                    Method::DELETE,
                ])
                .allow_headers(AllowHeaders::mirror_request()),
        )
        // 對齊 Express `express.json({limit:'10mb'})`（axum 預設 2MB 會讓長文 PUT 413）
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let bind_addr =
        env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3002".to_string());
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("koimsurai-web-backend (strangler) listening on http://{bind_addr}");
    tracing::info!("proxying un-migrated routes to {upstream}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

/// SIGTERM（docker stop）/ Ctrl-C → 停止收新連線、讓在途請求跑完。
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(e) => tracing::error!("SIGTERM handler 安裝失敗: {e}"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received — draining in-flight requests");
}
