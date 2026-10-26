//! 收藏頁的「不公開」（`handlers/collection`）：同步進來的觀看紀錄，站長決定哪一部不出現在前台。
//!
//! 守的是「站長以為藏起來了、讀者照樣看得到」：每一支讀觀看紀錄的公開端點都要過濾，
//! 統計也要跟著少算——前台寫「看了 3 部」卻只列得出 2 部，等於告訴讀者藏了一部。

mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{get, owner_token, request, test_app};

async fn admin(app: &axum::Router, method: &str, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    request(app, method, path, body, Some(&owner_token(true))).await
}

async fn seed(pool: &sqlx::SqlitePool) {
    for sql in [
        "INSERT INTO anime_history (anime_sn, video_sn, title, episode, last_watched_at) \
         VALUES (100, 1, '公開的動畫', '1', '2026-10-20 10:00:00'), (100, 2, '公開的動畫', '2', '2026-10-21 10:00:00'), \
                (200, 3, '想藏的動畫', '5', '2026-10-22 10:00:00')",
        "INSERT INTO film_history (id, title, watched_date, rating, source, tmdb_id) \
         VALUES (1, '公開的電影', '2026-10-01', 4, 'simkl', 555), (2, '想藏的電影', '2026-10-02', NULL, 'simkl', NULL)",
        "INSERT INTO tv_history (series_name, episode_label, watched_date, source) \
         VALUES ('想藏的影集', 'S01E01', '2026-10-03', 'simkl'), ('想藏的影集', 'S01E02', '2026-10-04', 'simkl')",
        "INSERT INTO watch_favorites (tmdb_id, kind, rating, quote, sort_order) VALUES (555, 'film', 5, '', 0)",
    ] {
        sqlx::query(sql).execute(pool).await.unwrap();
    }
}

async fn hide(app: &axum::Router, kind: &str, key: &str, hidden: bool) {
    let (st, v) = admin(
        app,
        "PUT",
        "/api/admin/collection/hidden",
        Some(json!({ "kind": kind, "key": key, "title": "t", "hidden": hidden })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v}");
}

fn titles(v: &Value, list: &str, field: &str) -> Vec<String> {
    v[list].as_array().unwrap().iter().map(|r| r[field].as_str().unwrap().to_string()).collect()
}

#[tokio::test]
async fn 藏起來的公開清單都看不到_統計也少算() {
    let (app, pool) = test_app().await;
    seed(&pool).await;
    let (_, before) = get(&app, "/api/watch/stats").await;

    hide(&app, "anime", "200", true).await;
    hide(&app, "film", "2", true).await;
    hide(&app, "tv", "想藏的影集", true).await;

    let (_, anime) = get(&app, "/api/anime/history").await;
    assert!(!titles(&anime, "history", "title").contains(&"想藏的動畫".to_string()));
    assert!(titles(&anime, "history", "title").contains(&"公開的動畫".to_string()));
    let (_, films) = get(&app, "/api/films/recent").await;
    assert_eq!(titles(&films, "films", "title"), ["公開的電影"]);
    let (_, tv) = get(&app, "/api/tv/recent").await;
    assert!(!titles(&tv, "series", "series_name").contains(&"想藏的影集".to_string()));

    let (_, after) = get(&app, "/api/watch/stats").await;
    let n = |v: &Value, k: &str| v[k].as_i64().unwrap();
    assert_eq!(n(&before, "animeCount") - n(&after, "animeCount"), 1);
    assert_eq!(n(&before, "animeEpisodes") - n(&after, "animeEpisodes"), 1);
    assert_eq!(n(&before, "filmCount") - n(&after, "filmCount"), 1);
    assert_eq!(n(&before, "tvSeriesCount") - n(&after, "tvSeriesCount"), 1);
    assert_eq!(n(&before, "tvEpisodes") - n(&after, "tvEpisodes"), 2);

    // 改回公開就回來
    hide(&app, "film", "2", false).await;
    let (_, films) = get(&app, "/api/films/recent").await;
    assert!(titles(&films, "films", "title").contains(&"想藏的電影".to_string()));
}

#[tokio::test]
async fn 後台列得出每一部_標出藏了沒與在不在最愛() {
    let (app, pool) = test_app().await;
    seed(&pool).await;
    hide(&app, "anime", "200", true).await;

    let (st, v) = admin(&app, "GET", "/api/admin/collection", None).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    let watch = v["watch"].as_array().unwrap();
    let find = |kind: &str, key: &str| {
        watch
            .iter()
            .find(|w| w["kind"] == kind && w["key"] == key)
            .unwrap_or_else(|| panic!("缺 {kind}/{key}：{v}"))
    };
    let anime = find("anime", "200");
    assert_eq!(anime["hidden"], true);
    assert_eq!(anime["title"], "想藏的動畫");
    assert_eq!(find("anime", "100")["detail"], "2", "動畫一部一列，帶最後一集");
    assert_eq!(find("tv", "想藏的影集")["detail"], "看了 2 集");
    assert!(find("film", "1")["favorite_id"].is_number(), "tmdb 對得上的電影要標出在最愛裡");
    assert_eq!(find("film", "2")["favorite_id"], Value::Null);
    assert_eq!(watch[0]["key"], "200", "照最後看的時間排，新的在前");

    let hidden = v["hidden"].as_array().unwrap();
    assert_eq!(hidden.len(), 1);
    assert_eq!(hidden[0]["kind"], "anime");
    // 沒接 Spotify 不算失敗：在聽是空的、沒有錯誤
    assert_eq!(v["tracks"], json!([]));
    assert_eq!(v["tracks_error"], Value::Null);
}

/// Simkl 的電影帶 tmdb_id、不存海報，前台讀的時候才從 TMDb 補。後台原本直接讀 DB 欄位，
/// 所以 Simkl 同步進來的每一部在後台都是空框
///
/// ⚠ 用 `std::env::set_var` 指向 mock，依賴 nextest 的行程隔離（同 tests/watch.rs）。
#[tokio::test]
async fn 後台的電影缺海報時從_tmdb_補() {
    let server = wiremock::MockServer::start().await;
    unsafe {
        std::env::set_var("TMDB_BASE_URL", server.uri());
        std::env::set_var("TMDB_API_TOKEN", "test-tmdb-token");
    }
    wiremock::Mock::given(wiremock::matchers::path("/3/movie/555"))
        .respond_with(
            wiremock::ResponseTemplate::new(200)
                .set_body_json(json!({ "title": "公開的電影", "poster_path": "/p.jpg" })),
        )
        .mount(&server)
        .await;
    let (app, pool) = test_app().await;
    seed(&pool).await;

    let (st, v) = admin(&app, "GET", "/api/admin/collection", None).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    let watch = v["watch"].as_array().unwrap();
    let cover = |kind: &str, key: &str| {
        watch.iter().find(|w| w["kind"] == kind && w["key"] == key).map(|w| w["cover"].clone()).unwrap()
    };
    assert_eq!(cover("film", "1"), "https://image.tmdb.org/t/p/w342/p.jpg");
    assert_eq!(cover("film", "2"), Value::Null, "沒有 tmdb_id 的補不了");

    let reqs = server.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "只有缺圖又有 tmdb_id 的那部該打，實際打了 {} 次", reqs.len());
}

#[tokio::test]
async fn 種類或_key_不對就不收_而且要登入() {
    let (app, _pool) = test_app().await;
    for body in [
        json!({ "kind": "book", "key": "1", "hidden": true }),
        json!({ "kind": "anime", "key": "  ", "hidden": true }),
        json!({ "kind": "track", "key": "x".repeat(201), "hidden": true }),
    ] {
        let (st, v) = admin(&app, "PUT", "/api/admin/collection/hidden", Some(body)).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{v}");
    }
    let (st, _) = request(&app, "GET", "/api/admin/collection", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = request(
        &app,
        "PUT",
        "/api/admin/collection/hidden",
        Some(json!({ "kind": "anime", "key": "1", "hidden": true })),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}
