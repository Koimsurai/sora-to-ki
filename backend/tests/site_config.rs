//! 站台設定（`/api/site/config`、`/api/admin/site/config`）。
//!
//! 驗的是「錯了會默默壞掉」的幾條：
//!   · 種子：既有的站（users 有人）升級上來不能被關掉任何一頁；全新安裝才預設關掉設備頁
//!   · 改了要真的生效：PUT 之後 GET 讀到新的，而且 RSS 這類讀 identity 的地方跟著換
//!   · 沒登入不能改、不認得的頁面要擋下來
//!
//! ⚠ 設定在記憶體裡有一份（process 全域），依賴 nextest 每個測試一個行程。

mod common;

use axum::http::StatusCode;
use common::{get, owner_token, request, test_app};
use koimsurai_web_backend::handlers::site_config::load_or_seed;
use serde_json::json;

#[tokio::test]
async fn 全新安裝的種子預設關掉設備頁() {
    let (app, pool) = test_app().await;
    sqlx::query("DELETE FROM users").execute(&pool).await.unwrap();
    load_or_seed(&pool).await.unwrap();

    let (status, v) = get(&app, "/api/site/config").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["disabled_pages"], json!(["setup"]));
}

#[tokio::test]
async fn 既有的站升級上來_一頁都不關() {
    let (app, pool) = test_app().await;
    sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ('old', 'x', 'admin')")
        .execute(&pool)
        .await
        .unwrap();
    load_or_seed(&pool).await.unwrap();

    let (_, v) = get(&app, "/api/site/config").await;
    assert_eq!(v["disabled_pages"], json!([]), "升級不能讓既有的頁面消失");
}

#[tokio::test]
async fn 有設_site_disabled_pages_就照它_空字串是一頁都不關() {
    let (_app, pool) = test_app().await;
    sqlx::query("DELETE FROM users").execute(&pool).await.unwrap();
    // SAFETY: nextest 每個測試一個行程
    unsafe { std::env::set_var("SITE_DISABLED_PAGES", "") };
    let s = load_or_seed(&pool).await.unwrap();
    assert_eq!(s.disabled_pages, Vec::<String>::new(), "明確給空字串就不該再猜成全新安裝");
}

#[tokio::test]
async fn site_disabled_pages_不認得的略過_照固定順序() {
    let (_app, pool) = test_app().await;
    // SAFETY: nextest 每個測試一個行程
    unsafe { std::env::set_var("SITE_DISABLED_PAGES", " friends, nope ,setup") };
    let s = load_or_seed(&pool).await.unwrap();
    assert_eq!(s.disabled_pages, vec!["setup", "friends"]);
}

#[tokio::test]
async fn 已經有設定就不再用種子蓋掉() {
    let (_app, pool) = test_app().await;
    sqlx::query("INSERT INTO site_settings (key, value) VALUES ('site', ?)")
        .bind(json!({ "name": "後台改過的站名", "disabled_pages": ["friends"] }).to_string())
        .execute(&pool)
        .await
        .unwrap();
    let s = load_or_seed(&pool).await.unwrap();
    assert_eq!(s.name, "後台改過的站名");
    assert_eq!(s.disabled_pages, vec!["friends"]);
}

#[tokio::test]
async fn 改了之後讀得到_rss_的標題也跟著換() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let (status, v) = request(
        &app,
        "PUT",
        "/api/admin/site/config",
        Some(json!({ "name": "新的站名", "disabled_pages": ["photos", "setup"] })),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["name"], "新的站名");
    assert_eq!(v["author"], "新的站名", "沒設作者時跟站名一樣");
    assert_eq!(v["disabled_pages"], json!(["setup", "photos"]), "照固定順序存");

    let (_, again) = get(&app, "/api/site/config").await;
    assert_eq!(again["name"], "新的站名");

    let (_, rss) = get(&app, "/rss").await;
    assert!(rss.as_str().unwrap_or_default().contains("<title>新的站名</title>"), "RSS 要用新的站名");
}

#[tokio::test]
async fn 沒登入不能改() {
    let (app, _pool) = test_app().await;
    let (status, _) =
        request(&app, "PUT", "/api/admin/site/config", Some(json!({ "name": "x" })), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn 不認得的頁面與空白站名都回_400_而且不改動() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let (_, before) = get(&app, "/api/site/config").await;

    for body in [json!({ "disabled_pages": ["notes"] }), json!({ "name": "   " })] {
        let (status, v) = request(&app, "PUT", "/api/admin/site/config", Some(body), Some(&token)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{v}");
        assert!(v["error"].is_string());
    }
    let (_, after) = get(&app, "/api/site/config").await;
    assert_eq!(before, after, "擋下來的請求不能改到任何東西");
}
