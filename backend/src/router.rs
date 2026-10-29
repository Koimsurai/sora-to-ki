//! Router 組裝（自 main.rs 抽出）：main 只負責 env/pool/state 與監聽，
//! 整合測試則以 `build_router(test_state)` + tower `oneshot` 直接打端點，
//! 走與正式環境完全相同的 middleware 疊層（CORS / body limit / revalidate / trace）。

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderName, HeaderValue, Method},
    routing::{delete, get, patch, post, put},
};
use tower_http::cors::{AllowHeaders, Any, CorsLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_scalar::{Scalar, Servable};

use crate::upstream_cache::{self, CachePolicy, UpstreamCache};
use crate::{handlers, openapi, revalidate, state::AppState};

/// 全域 404（Express 退役後取代舊的 proxy fallback）：未知路徑回 404；
/// 未接管的「方法」則由 axum MethodRouter 自動回 405（標準語意）。
async fn not_found() -> (axum::http::StatusCode, &'static str) {
    (axum::http::StatusCode::NOT_FOUND, "Not Found")
}

/// 完整路由表 + middleware 疊層。全站端點皆 Rust 原生（Express 已於 2026-07-14 退役）。
pub fn build_router(state: AppState) -> Router {
    // 第三方代理共用一份回應快取，TTL 依資料多常變（見 upstream_cache 的說明）
    let upstream = std::sync::Arc::new(UpstreamCache::default());
    let cached = |secs: u64| {
        axum::middleware::from_fn_with_state(
            CachePolicy { cache: upstream.clone(), ttl: std::time::Duration::from_secs(secs) },
            upstream_cache::layer,
        )
    };
    Router::new()
        .route("/api/tags", get(handlers::tags::list_tags))
        .route("/api/categories", get(handlers::categories::list_categories))
        .route("/api/series", get(handlers::series::list_series))
        .route("/api/series/{name}", get(handlers::series::series_by_name))
        .route("/api/stats", get(handlers::stats::site_stats))
        // 前端 Core Web Vitals（B4）：beacon 寫入 + 聚合自看
        .route("/api/vitals", post(handlers::vitals::report_vital))
        // 前端錯誤（Sentry SDK 的 tunnel 目的地）與 CSP 違規回報。
        // 兩個都是公開無認證的——CSP report 是瀏覽器直接送的，帶不了任何標頭。
        // 路徑刻意不含 sentry/envelope/store，那是廣告外掛通用規則在比對的字。
        .route("/api/_report", post(handlers::report_tunnel::tunnel))
        .route("/api/csp-report", post(handlers::report_tunnel::csp_report))
        .route("/api/vitals/stats", get(handlers::vitals::vitals_stats))
        .route("/api/link-preview", get(handlers::link_preview::link_preview))
        // thoughts：/rss 靜態路由（axum matchit 優先於 /{id}）
        .route("/api/thoughts/rss", get(handlers::thoughts::thoughts_rss))
        .route("/api/thoughts", get(handlers::thoughts::list_thoughts))
        .route("/api/thoughts/{id}", get(handlers::thoughts::get_thought))
        .route(
            "/api/thoughts/{id}/comments",
            get(handlers::thoughts::list_thought_comments).post(handlers::comments::thought_comment),
        )
        .route("/api/health", get(handlers::home::health))
        // 設備頁的遙測：只有溫度、負載、記憶體、功耗（見 handlers::telemetry），快取 30 秒
        .route("/api/telemetry", get(handlers::telemetry::telemetry).layer(cached(30)))
        // 朋友頁：朋友清單寫死在後端，順手抓每個人的 RSS 最新一篇，快取一小時
        // 名單每次讀 DB（收下一位朋友馬上出現），feed 在 handler 裡各自快取一小時
        .route("/api/friends", get(handlers::friends::friends))
        .route("/api/friends/apply", post(handlers::friend_links::apply))
        // 每日名言（opencc cn→tw + 當日快取）
        .route("/api/quote/daily", get(handlers::quote::quote_daily))
        // 全站 RSS（app-level 非 /api；nginx `location = /rss` 指過來）
        .route("/rss", get(handlers::rss::site_rss))
        // home digest（純 DB 讀）
        .route("/api/home/digest", get(handlers::home::home_digest))
        // posts：列表 / 單篇 / 反應 / 留言
        .route("/api/posts", get(handlers::posts::list_posts))
        .route("/api/posts/{id}", get(handlers::posts::get_post))
        // MCP 的 set_post_status 在用；其餘寫入一律走 /api/admin/posts
        .route("/api/posts/{id}/status", patch(handlers::posts::patch_post_status))
        .route(
            "/api/posts/{id}/reactions",
            get(handlers::posts::post_reactions).post(handlers::posts::post_reaction),
        )
        // 站台層級：首頁「留下印記」按讚 + GitHub 星數（後端代理 + 快取）
        .route("/api/site/likes", get(handlers::site::get_site_likes).post(handlers::site::post_site_like))
        .route("/api/site/github-stars", get(handlers::site::get_github_stars))
        // 站台設定：公開讀（前端 SSR）、管理員改（後台與 MCP）
        .route("/api/site/config", get(handlers::site_config::get_site_config))
        .route("/api/admin/site/config", put(handlers::site_config::update_site_config))
        // 頁面內容（關於、作品…）：公開讀、管理員整份覆蓋
        .route("/api/pages/about", get(handlers::page_content::get_about))
        .route("/api/admin/pages/about", put(handlers::page_content::put_about))
        .route("/api/pages/log", get(handlers::page_content::get_log))
        .route("/api/admin/pages/log", put(handlers::page_content::put_log))
        .route("/api/pages/works", get(handlers::page_content::get_works))
        .route("/api/admin/pages/works", put(handlers::page_content::put_works))
        .route("/api/admin/github/works", get(handlers::thirdparty::admin_works_preview))
        // 文章內嵌投票（公開；防重複投票在 client 端做）
        .route("/api/polls/{id}", get(handlers::polls::get_poll))
        .route("/api/polls/{id}/vote", post(handlers::polls::vote_poll))
        .route(
            "/api/posts/{id}/comments",
            get(handlers::posts::post_comments).post(handlers::comments::post_comment),
        )
        // 不是文章也不是碎念、自己有留言的頁面（留言頁）
        .route(
            "/api/pages/{page}/comments",
            get(handlers::comments::page_comments).post(handlers::comments::page_comment),
        )
        // 計數寫入（公開）
        .route("/api/posts/{id}/view", post(handlers::posts::post_view))
        .route("/api/posts/{id}/like", post(handlers::posts::post_like))
        .route("/api/posts/{id}/unlike", post(handlers::posts::post_unlike))
        .route("/api/comments/{id}/like", post(handlers::posts::comment_like))
        .route("/api/thoughts/{id}/react", post(handlers::thoughts::thought_react))
        // admin thoughts CRUD（unfurl / TMDb enrich）
        .route("/api/admin/thoughts", post(handlers::thoughts::admin_create_thought))
        .route(
            "/api/admin/thoughts/{id}",
            put(handlers::thoughts::admin_update_thought).delete(handlers::thoughts::admin_delete_thought),
        )
        // auth：登入 / 當前使用者 / 登出 / OAuth 設定
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/me", get(handlers::auth::me))
        .route("/api/auth/logout", post(handlers::auth::logout))
        .route("/api/auth/providers", get(handlers::auth::providers))
        .route("/api/auth/reset-admin", post(handlers::auth::reset_admin))
        // 用戶角色管理（requireOwner）
        .route("/api/admin/users/{id}/role", put(handlers::admin::admin_update_user_role))
        // spotify 一次性 setup callback（簡版 HTML）
        .route("/api/spotify/callback", get(handlers::spotify::spotify_callback))
        // OAuth callbacks（google/github）
        .route("/api/auth/google/callback", post(handlers::oauth::google_callback))
        .route("/api/auth/github/callback", post(handlers::oauth::github_callback))
        // newsletter
        .route("/api/newsletter/subscribe", post(handlers::newsletter::subscribe))
        .route("/api/newsletter/unsubscribe", post(handlers::newsletter::unsubscribe))
        .route("/api/newsletter/by-token/{token}", get(handlers::newsletter::by_token))
        .route("/api/newsletter/subscribers", get(handlers::newsletter::subscribers))
        // admin authed 讀 + CRUD 寫入
        .route("/api/admin/tags", get(handlers::admin::admin_tags).post(handlers::admin::create_tag))
        .route("/api/admin/tags/{id}", put(handlers::admin::update_tag).delete(handlers::admin::delete_tag))
        .route(
            "/api/admin/categories",
            get(handlers::admin::admin_categories).post(handlers::admin::create_category),
        )
        .route(
            "/api/admin/categories/{id}",
            put(handlers::admin::update_category).delete(handlers::admin::delete_category),
        )
        .route("/api/admin/users", get(handlers::admin::admin_users))
        .route(
            "/api/admin/blacklist",
            get(handlers::admin::admin_blacklist).post(handlers::admin::create_blacklist),
        )
        .route("/api/admin/blacklist/{id}", delete(handlers::admin::delete_blacklist))
        .route(
            "/api/admin/keyword-filters",
            get(handlers::admin::admin_keyword_filters).post(handlers::admin::create_keyword_filter),
        )
        .route("/api/admin/keyword-filters/{id}", delete(handlers::admin::delete_keyword_filter))
        .route("/api/admin/posts", get(handlers::admin::admin_posts).post(handlers::admin::admin_create_post))
        .route(
            "/api/admin/posts/{id}",
            get(handlers::admin::admin_get_post)
                .put(handlers::admin::admin_update_post)
                .delete(handlers::admin::admin_delete_post),
        )
        .route("/api/admin/posts/{id}/restore", post(handlers::admin::admin_restore_post))
        // generate-zh-cn（ferrous-opencc Tw2s，byte-identical）
        .route("/api/admin/posts/{id}/generate-zh-cn", post(handlers::opencc::generate_zh_cn))
        // send-newsletter（reqwest 直打 Resend batch API）
        .route("/api/admin/posts/{id}/send-newsletter", post(handlers::mailer::send_newsletter_route))
        .route("/api/admin/comments", get(handlers::admin::admin_comments))
        // 批次審核（Express bug #2 死路由的修好版；靜態段優先於 :id/status）
        .route("/api/admin/comments/batch/status", patch(handlers::admin::admin_batch_comment_status))
        // 後台統計（⚠️ visitors 用 Math.random，非 byte 對拍——除該欄外對拍）
        .route("/api/admin/stats", get(handlers::admin::admin_stats))
        // 流量（代理自架 Plausible 的 Stats API，key 只在後端）
        .route("/api/admin/analytics", get(handlers::analytics::admin_analytics))
        .route("/api/admin/reactions", get(handlers::reaction_log::admin_reactions))
        .route("/api/admin/comments/{id}/status", patch(handlers::admin::patch_comment_status))
        .route("/api/admin/comments/{id}/reply", post(handlers::admin::reply_comment))
        .route(
            "/api/admin/comments/{id}",
            put(handlers::admin::update_comment).delete(handlers::admin::delete_comment),
        )
        // books 域
        .route("/api/books", get(handlers::books::list_books).post(handlers::books::create_book))
        .route(
            "/api/books/{id}",
            get(handlers::books::get_book)
                .put(handlers::books::update_book)
                .delete(handlers::books::delete_book),
        )
        .route("/api/books/stats/summary", get(handlers::books::book_stats))
        .route("/api/admin/books", get(handlers::books::admin_books))
        .route(
            "/api/admin/friends",
            get(handlers::friend_links::admin_friends).post(handlers::friend_links::admin_create_friend),
        )
        .route(
            "/api/admin/friends/{id}",
            patch(handlers::friend_links::admin_update_friend)
                .delete(handlers::friend_links::admin_delete_friend),
        )
        .route("/api/admin/friends/{id}/check", post(handlers::friend_links::admin_check_friend))
        // gallery（讀 manifest / 串流代理）
        .route("/api/gallery/photos", get(handlers::gallery::gallery_photos))
        .route("/api/image-proxy", get(handlers::gallery::image_proxy))
        // gallery sync（rotate+resize+lossy webp+EXIF+manifest）
        .route("/api/admin/gallery/sync", post(handlers::gallery::gallery_sync))
        // 照片的後台設定（標題、標籤、精選、隱藏），疊在 manifest 上
        .route("/api/admin/gallery/photos", get(handlers::photo_meta::admin_photos))
        .route("/api/admin/gallery/photos/{id}", patch(handlers::photo_meta::admin_update_photo))
        // 收藏頁：觀看紀錄與聽的歌要不要出現在前台
        .route("/api/admin/collection", get(handlers::collection::admin_collection))
        .route("/api/admin/collection/hidden", put(handlers::collection::admin_set_hidden))
        // OG 圖（takumi；axum 不支援 :id.png 部分參數，handler 內 strip 後綴）
        .route("/api/og/{file}", get(handlers::og::og_png))
        // 上傳（axum multipart；thumbhash 實測等價）
        .route(
            "/api/admin/upload",
            post(handlers::upload::upload)
                // multer limits.fileSize = 50MB（其餘路由走全域 10MB）
                .route_layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        // 第三方代理（/steam/profile SWR 快取、spotify、github、wakatime）
        .route("/api/github/user/{username}", get(handlers::thirdparty::github_user).layer(cached(600)))
        .route("/api/github/events/{username}", get(handlers::thirdparty::github_events).layer(cached(300)))
        // repos / contributions 以前是瀏覽器直接打第三方（api.github.com 未認證、
        // jogruber 的爬蟲服務）；收進後端才吃得到 token 額度，型別也才有來源
        .route("/api/github/repos/{username}", get(handlers::thirdparty::github_repos).layer(cached(1800)))
        // 作品頁的數據：一天變不了多少，快取六小時
        .route("/api/github/works", get(handlers::thirdparty::github_works).layer(cached(21600)))
        .route(
            "/api/github/contributions/{username}",
            get(handlers::thirdparty::github_contributions).layer(cached(3600)),
        )
        .route("/api/wakatime/today", get(handlers::thirdparty::wakatime_today).layer(cached(300)))
        .route("/api/wakatime/week", get(handlers::thirdparty::wakatime_week).layer(cached(1800)))
        .route("/api/wakatime/projects", get(handlers::thirdparty::wakatime_projects).layer(cached(1800)))
        // profile 自己有 SWR 快取（refresh_steam_profile），不再疊一層
        .route("/api/steam/profile", get(handlers::thirdparty::steam_profile))
        .route("/api/spotify/login", get(handlers::spotify::login))
        .route("/api/spotify/recently-played", get(handlers::spotify::recently_played).layer(cached(60)))
        // 每個分頁每 30 秒輪詢一次；10 秒內的請求共用同一份，Spotify 只被打一次
        .route("/api/spotify/now-playing", get(handlers::spotify::now_playing).layer(cached(10)))
        .route("/api/spotify/top-genres", get(handlers::spotify::top_genres))
        .route("/api/spotify/top-tracks", get(handlers::spotify::top_tracks))
        .route("/api/spotify/audio-features", get(handlers::spotify::audio_features))
        .route("/api/spotify/me", get(handlers::spotify::me))
        // player 帶「線上／遊戲中」狀態，TTL 短；其餘幾小時才變一次
        .route("/api/steam/player", get(handlers::thirdparty::steam_player).layer(cached(60)))
        .route("/api/steam/recent-games", get(handlers::thirdparty::steam_recent_games).layer(cached(600)))
        .route("/api/steam/owned-games", get(handlers::thirdparty::steam_owned_games).layer(cached(3600)))
        .route(
            "/api/steam/achievements/{appid}",
            get(handlers::thirdparty::steam_achievements).layer(cached(3600)),
        )
        // watch 域
        .route("/api/anime/history", get(handlers::watch::anime_history))
        .route("/api/films/recent", get(handlers::watch::films_recent))
        .route("/api/tv/recent", get(handlers::watch::tv_recent))
        .route("/api/watch/stats", get(handlers::watch::watch_stats))
        .route("/api/watch/favorites", get(handlers::watch::favorites).post(handlers::watch::create_favorite))
        .route(
            "/api/watch/favorites/{id}",
            put(handlers::watch::update_favorite).delete(handlers::watch::delete_favorite),
        )
        .route("/api/watch/tmdb-search", get(handlers::watch::tmdb_search))
        .route("/api/watch/now", get(handlers::watch::watch_now))
        .route("/api/admin/watch/now", post(handlers::watch::heartbeat))
        // 動畫瘋 cookie/status（bahamutPushAuth）
        .route("/api/admin/bahamut/status", get(handlers::bahamut::status))
        .route("/api/admin/bahamut/cookie", post(handlers::bahamut::cookie))
        .route("/api/books/search/external", get(handlers::thirdparty::books_search_external))
        .route("/api/books/tw", get(handlers::tw_isbn::tw_search))
        // OpenAPI 文件（utoipa，與前端 specta 型別同源）：spec 自架 + Scalar UI
        .route("/api/openapi.json", get(openapi::openapi_json))
        .merge(Scalar::with_url("/api/docs", openapi::ApiDoc::openapi()))
        .fallback(not_found)
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
        // API 回應一律 `X-Robots-Tag: noindex`。
        //
        // 取代 robots.txt 裡的 `Disallow: /api/`：那行的本意是「別索引這些 JSON」，實際效果卻是
        // 「別抓取」——Googlebot 連渲染時要用都不行。GSC 的網址審查會列出一整排「遭到 robots.txt
        // 封鎖」（留言數、按讚數、文章清單…）。目前正文是 SSR 出來的所以沒實害，但只要有任何內容
        // 改成客戶端載入就會安靜地出事。Google 官方建議正是：不要用 robots.txt 擋渲染需要的資源，
        // 要防止被收錄改用這個標頭。
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-robots-tag"),
            HeaderValue::from_static("noindex"),
        ))
        // 對齊 Express `express.json({limit:'10mb'})`（axum 預設 2MB 會讓長文 PUT 413）
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        // 文章內容變更後通知前端清 ISR 快取（fire-and-forget；未設 env 則不啟用）
        .layer(axum::middleware::from_fn(revalidate::notify_on_post_write))
        // ⚠️ on_failure 降到 WARN 是刻意的。預設是 ERROR，而 ERROR 現在會變成 Sentry
        //   issue（見 main.rs 的 event_filter）——於是每個 5xx 都產生**兩則**：
        //   一則是 error.rs 的 `internal_error` 發的（帶檔名、行號、原始訊息，有用），
        //   一則是這裡發的 "response failed"（culprit 空、metadata {}，零資訊）。
        //   降成 WARN 之後它變成麵包屑，附在真正那則上說明「這次回應是 5xx」。
        .layer(
            TraceLayer::new_for_http()
                .on_failure(tower_http::trace::DefaultOnFailure::new().level(tracing::Level::WARN)),
        )
        // ── 錯誤追蹤（自架 GlitchTip）──────────────────────────────────
        // 兩層都要，缺一不可：
        //   NewSentryLayer  每個請求開一個獨立 Hub。沒有它的話，並發請求會共用同一個
        //                   scope，A 請求的麵包屑會出現在 B 請求的 issue 裡。
        //   SentryHttpLayer 把請求資訊掛進事件。`enable_transaction()` 沒開——
        //                   那是 APM，這裡 traces_sample_rate = 0。
        //
        // ⚠️ 順序：NewSentryLayer 要在外層（先開 Hub，裡面的東西才寫得進去）。
        //   axum 的 layer 是**由下往上**包，所以寫在後面的是外層。
        //
        // SENTRY_DSN 沒設時 sentry 是 no-op，這兩層留著也沒有成本，
        // 所以不做條件式組裝——那會讓 build_router 的回傳型別變複雜。
        .layer(sentry_tower::SentryHttpLayer::new())
        .layer(sentry_tower::NewSentryLayer::new_from_top())
        .with_state(state)
}
