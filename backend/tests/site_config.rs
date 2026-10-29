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
async fn 全新安裝的種子關掉還沒做成範本的頁面_也不帶原作者的朋友() {
    let (app, pool) = test_app().await;
    sqlx::query("DELETE FROM users").execute(&pool).await.unwrap();
    load_or_seed(&pool).await.unwrap();

    let (status, v) = get(&app, "/api/site/config").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["disabled_pages"], json!(["works", "setup", "log"]));
    let (friends,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM friend_links").fetch_one(&pool).await.unwrap();
    assert_eq!(friends, 0);
}

#[tokio::test]
async fn 既有的站升級上來_朋友一個都不能少() {
    let (_app, pool) = test_app().await;
    sqlx::query("INSERT INTO users (username, password_hash, role) VALUES ('old', 'x', 'admin')")
        .execute(&pool)
        .await
        .unwrap();
    load_or_seed(&pool).await.unwrap();
    let (friends,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM friend_links").fetch_one(&pool).await.unwrap();
    assert_eq!(friends, 2);
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

/// 信箱與 GitHub 是設定表建好之後才加的欄位：舊的那份裡沒有它們，要退回環境變數，
/// 不然既有的站升級上來聯絡方式會整個消失；在後台改過（包括清空）之後就以設定為準
#[tokio::test]
async fn 舊設定裡沒有信箱與_github_時退回環境變數_改過之後以設定為準() {
    // SAFETY: nextest 每個測試一個行程
    unsafe {
        std::env::set_var("SITE_EMAIL", "me@example.com");
        std::env::set_var("SITE_GITHUB", "someone");
    }
    let (app, pool) = test_app().await;
    sqlx::query("INSERT INTO site_settings (key, value) VALUES ('site', ?)")
        .bind(json!({ "name": "升級上來的站", "disabled_pages": [] }).to_string())
        .execute(&pool)
        .await
        .unwrap();
    load_or_seed(&pool).await.unwrap();
    let (_, v) = get(&app, "/api/site/config").await;
    assert_eq!(v["email"], "me@example.com");
    assert_eq!(v["github"], "someone");

    let token = owner_token(true);
    let (status, v) =
        request(&app, "PUT", "/api/admin/site/config", Some(json!({ "email": "" })), Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["email"], "", "清空之後不能又退回環境變數");
    assert_eq!(v["github"], "someone", "沒帶的欄位照舊");
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
    let rss = rss.as_str().unwrap_or_default();
    assert!(rss.contains("<title>新的站名</title>"), "RSS 要用新的站名");
    assert!(rss.contains("<generator>sora-to-ki</generator>"), "程式名是固定的，不跟站名走");
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

/// 預設語系是英文的站：沒帶 ?lang 的 RSS 是英文 feed，英文原文的文章讀本體欄位；
/// 繁中 feed 不會出現它（它沒有繁中）。新文章沒說原文是哪個語系，就是站台的預設語系
#[tokio::test]
async fn 預設英文的站_rss_與新文章都跟著預設語系() {
    // SAFETY: nextest 每個測試一個行程
    unsafe { std::env::set_var("SITE_DEFAULT_LOCALE", "en") };
    let (app, pool) = test_app().await;
    load_or_seed(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO posts (title, content, excerpt, status, source_language) \
         VALUES ('An English post', 'Body', 'Short', 'published', 'en')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (_, rss) = get(&app, "/rss").await;
    let rss = rss.as_str().unwrap_or_default();
    assert!(rss.contains("<title>An English post</title>"), "預設語系的 feed 要有英文原文的文章");
    assert!(rss.contains("<language>en</language>"));
    let (_, tw) = get(&app, "/rss?lang=zh-TW").await;
    assert!(!tw.as_str().unwrap_or_default().contains("An English post"), "沒有繁中的文章不進繁中的 feed");

    let token = owner_token(true);
    let (status, v) = request(
        &app,
        "POST",
        "/api/admin/posts",
        Some(json!({ "title": "Hello", "content": "World", "status": "draft" })),
        Some(&token),
    )
    .await;
    assert!(status.is_success(), "{v}");
    let (src,): (String,) = sqlx::query_as("SELECT source_language FROM posts WHERE title = 'Hello'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(src, "en");
}

/// 英文原稿補了繁中譯文：繁中 feed 與繁中的文章列表都看得到它，標題是繁中譯文
#[tokio::test]
async fn 英文原稿補了繁中譯文_繁中讀者看得到() {
    unsafe { std::env::set_var("SITE_DEFAULT_LOCALE", "en") };
    let (app, pool) = test_app().await;
    load_or_seed(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO posts (title, content, status, source_language, title_zh_tw, content_zh_tw) \
         VALUES ('Translated post', 'Body', 'published', 'en', '翻好的文章', '內文')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let (_, tw) = get(&app, "/rss?lang=zh-TW").await;
    let tw = tw.as_str().unwrap_or_default();
    assert!(tw.contains("<title>翻好的文章</title>"), "繁中 feed 要用繁中譯文：{tw}");
    let (_, list) = get(&app, "/api/posts?lang=zh-TW").await;
    assert!(list.to_string().contains("翻好的文章"), "繁中列表要有它：{list}");
    let (_, en) = get(&app, "/rss").await;
    assert!(en.as_str().unwrap_or_default().contains("<title>Translated post</title>"));
}
