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
    // 新的一頁加了遷移，這裡也要加一行（E2E 的種子是照檔名 *_page_content*.sql 自己找的）
    let sql = [
        include_str!("../migrations/0031_page_content.sql"),
        include_str!("../migrations/0032_page_content_log.sql"),
        include_str!("../migrations/0033_page_content_works.sql"),
        include_str!("../migrations/0034_page_content_qa.sql"),
    ]
    .join("\n");
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
    let (_, v) = get(&app, "/api/pages/log").await;
    assert_eq!(v["milestones"], json!([]), "別人的站不能拿到原作者的里程碑");
    let (_, v) = get(&app, "/api/pages/works").await;
    assert_eq!(v["items"], json!([]), "別人的站不能拿到原作者的作品");
    let (_, v) = get(&app, "/api/pages/qa").await;
    assert_eq!(v["items"], json!([]), "別人的站不能拿到原作者的問答");

    set_site_name(&pool, "宙と木").await;
    for sql in &inserts {
        // 遷移檔是 repo 裡的固定內容，不是使用者輸入
        sqlx::query(sqlx::AssertSqlSafe(sql.as_str())).execute(&pool).await.unwrap();
    }
    let (_, v) = get(&app, "/api/pages/about").await;
    assert_eq!(v["chapters"].as_array().map(Vec::len), Some(8));
    assert_eq!(v["chapters"][0]["year"], "2004");
    assert_eq!(v["quote"]["cite"], "Steve Jobs");
    let (_, v) = get(&app, "/api/pages/log").await;
    assert_eq!(v["start"], "2025-04-01T00:00:00+08:00");
    assert_eq!(v["milestones"][0]["level"], 2);
    let (_, v) = get(&app, "/api/pages/works").await;
    assert_eq!(v["items"][0]["repo"], "Koimsurai/Volticar_API", "第一件是螺旋的起點");
    assert_eq!(v["items"].as_array().map(Vec::len), Some(7));
    let (_, v) = get(&app, "/api/pages/qa").await;
    assert_eq!(v["items"].as_array().map(Vec::len), Some(8));
    assert!(
        v["items"][2]["a"]["zh-TW"]
            .as_str()
            .unwrap_or_default()
            .ends_with("\n\nhttps://koimsurai.com/blog/21"),
        "文章卡是單獨一段的網址"
    );
}

#[tokio::test]
async fn 日誌的起點沒填就是第一篇文章那天_存的還是空的() {
    let (app, pool) = test_app().await;
    sqlx::query("DELETE FROM posts").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO posts (title, content, status, created_at) VALUES ('草稿', 'x', 'draft', '2020-01-01 00:00:00')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO posts (title, content, status, created_at) VALUES ('第一篇', 'x', 'published', '2024-05-06 09:00:00')")
        .execute(&pool)
        .await
        .unwrap();
    let (_, v) = get(&app, "/api/pages/log").await;
    assert_eq!(v["start"], "2024-05-06T00:00:00Z", "草稿不算");

    let token = owner_token(true);
    let (status, saved) = request(
        &app,
        "PUT",
        "/api/admin/pages/log",
        Some(json!({ "start": "", "milestones": [] })),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["start"], "", "存進去的是空的，下一篇文章更早的話起點會跟著變");
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

#[tokio::test]
async fn 作品填過之後_github_works_照這份抓_不再看環境變數() {
    let (_app, pool) = test_app().await;
    assert_eq!(
        koimsurai_web_backend::handlers::page_content::works_repos(&pool).await.unwrap(),
        None,
        "還沒填過：讓 /api/github/works 退回 GITHUB_WORKS"
    );
    sqlx::query("INSERT INTO page_content (key, value) VALUES ('works', ?)")
        .bind(json!({ "items": [{ "repo": "a/b" }, { "repo": "c/d" }] }).to_string())
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        koimsurai_web_backend::handlers::page_content::works_repos(&pool).await.unwrap(),
        Some(vec!["a/b".to_string(), "c/d".to_string()])
    );
}

#[tokio::test]
async fn 作品的_repo_寫壞了擋下來_預覽要登入() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let bad = json!({ "items": [{ "repo": "not a repo" }] });
    let (status, v) = request(&app, "PUT", "/api/admin/pages/works", Some(bad), Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{v}");
    let (status, _) = get(&app, "/api/admin/github/works?repos=a/b").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "預覽用的是站上的 token，不能讓人隨便打");
}

#[tokio::test]
async fn 問答的答案可以比一般欄位長_但有上限() {
    let (app, _pool) = test_app().await;
    let token = owner_token(true);
    let long = "字".repeat(1500);
    let ok = json!({ "items": [{ "q": { "zh-TW": "問" }, "a": { "zh-TW": long } }] });
    let (status, v) = request(&app, "PUT", "/api/admin/pages/qa", Some(ok), Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let too_long = json!({ "items": [{ "q": { "zh-TW": "問" }, "a": { "zh-TW": "字".repeat(2001) } }] });
    let (status, _) = request(&app, "PUT", "/api/admin/pages/qa", Some(too_long), Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
