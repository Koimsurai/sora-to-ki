//! 頁面內容（`/api/pages/*`、`/api/admin/pages/*`）。
//!
//! 驗的是「錯了會默默壞掉」的幾條：
//!   · 遷移只把原站的內容寫給原站：別人的站一開門就掛著原作者的自傳，沒有任何錯誤訊息
//!   · 存進去的就是讀出來的（含多語）
//!   · 沒登入不能改、不合法的整份擋下來而且不改動

mod common;

use axum::http::StatusCode;
use common::{get, owner_token, request, test_app};
use serde_json::json;

/// 遷移檔裡寫原站內容的那幾段 INSERT（E2E 的種子也是這樣重跑的）
fn origin_inserts() -> Vec<String> {
    let sql = include_str!("../migrations/0031_page_content.sql");
    // 每一段從「行首是 INSERT」的那一行開始（前面的註解裡也會提到 INSERT 這個字）
    sql.split(";\n")
        .filter_map(|s| {
            let lines: Vec<&str> = s.lines().collect();
            let at = lines.iter().position(|l| l.starts_with("INSERT"))?;
            Some(lines[at..].join("\n"))
        })
        .collect()
}

async fn set_site_name(pool: &sqlx::SqlitePool, name: &str) {
    sqlx::query("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('site', ?)")
        .bind(json!({ "name": name, "disabled_pages": [] }).to_string())
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn 沒填過的關於頁是空的() {
    let (app, _pool) = test_app().await;
    let (status, v) = get(&app, "/api/pages/about").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["chapters"], json!([]));
    assert_eq!(v["skills"], json!([]));
}

#[tokio::test]
async fn 原站的內容只寫給原站() {
    let inserts = origin_inserts();
    assert!(!inserts.is_empty(), "遷移檔裡要有原站的內容");

    let (app, pool) = test_app().await;
    set_site_name(&pool, "別人的站").await;
    for sql in &inserts {
        // 遷移檔是 repo 裡的固定內容，不是使用者輸入
        sqlx::query(sqlx::AssertSqlSafe(sql.as_str())).execute(&pool).await.unwrap();
    }
    let (_, v) = get(&app, "/api/pages/about").await;
    assert_eq!(v["chapters"], json!([]), "別人的站不能拿到原作者的關於頁");

    set_site_name(&pool, "宙と木").await;
    for sql in &inserts {
        // 遷移檔是 repo 裡的固定內容，不是使用者輸入
        sqlx::query(sqlx::AssertSqlSafe(sql.as_str())).execute(&pool).await.unwrap();
    }
    let (_, v) = get(&app, "/api/pages/about").await;
    assert_eq!(v["chapters"].as_array().map(Vec::len), Some(8));
    assert_eq!(v["chapters"][0]["year"], "2004");
    assert_eq!(v["quote"]["cite"], "Steve Jobs");
}

#[tokio::test]
async fn 存進去的就是讀出來的() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let body = json!({
        "chapters": [{ "year": "2020", "title": { "zh-TW": "開始", "en": "Start" }, "subtitle": {}, "line": { "zh-TW": "一句話" } }],
        "skills": [{ "label": { "zh-TW": "前端" }, "items": ["React"] }],
        "jobs": [],
        "quote": null
    });
    let (status, v) = request(&app, "PUT", "/api/admin/pages/about", Some(body.clone()), Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let (_, again) = get(&app, "/api/pages/about").await;
    assert_eq!(again, body);
}

#[tokio::test]
async fn 沒登入不能改() {
    let (app, _pool) = test_app().await;
    let (status, _) =
        request(&app, "PUT", "/api/admin/pages/about", Some(json!({ "chapters": [] })), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn 不合法的整份擋下來_而且不改動() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let ok = json!({ "chapters": [{ "year": "2004", "title": { "zh-TW": "出生" } }] });
    request(&app, "PUT", "/api/admin/pages/about", Some(ok), Some(&token)).await;
    let (_, before) = get(&app, "/api/pages/about").await;

    let bad = json!({ "chapters": [{ "year": "2004", "title": { "fr": "naissance" } }] });
    let (status, v) = request(&app, "PUT", "/api/admin/pages/about", Some(bad), Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{v}");
    assert!(v["error"].as_str().unwrap_or_default().contains("fr"));
    let (_, after) = get(&app, "/api/pages/about").await;
    assert_eq!(before, after);
}
