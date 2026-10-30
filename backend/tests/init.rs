//! 初次設定（`/api/init/*`）：沒有站長的站，拿 log 裡的設定碼認領站長。
//!
//! 驗的是「錯了就有人搶走別人的站」的幾條：
//!   · 沒有設定碼、設定碼錯、已經有站長了，都認領不了
//!   · 只有 GitHub／Google 登入的 token 能認領（MCP 的機器帳號不行）
//!   · 錯太多次設定碼會換一組
//!   · 有設 OWNER_EMAIL 的站不走初次設定
//!
//! ⚠ 用 `std::env::set_var` 與行程全域的錯誤計數，依賴 nextest 每個測試一個行程。

mod common;

use axum::http::StatusCode;
use common::{TEST_SECRET, get, owner_token, post_json, request, test_app};
use koimsurai_web_backend::handlers::init::announce;
use serde_json::json;

/// 一個用 GitHub 登入過的讀者，回傳他的 token
async fn oauth_reader(pool: &sqlx::SqlitePool, linked_to: Option<i64>) -> (i64, String) {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO oauth_users (provider, provider_id, display_name, email, role, linked_to) \
         VALUES ('github', ?, '某人', 'someone@example.com', 'USER', ?) RETURNING id",
    )
    .bind(format!("gh-{}", linked_to.unwrap_or(0)))
    .bind(linked_to)
    .fetch_one(pool)
    .await
    .unwrap();
    let now = koimsurai_web_backend::util::now_secs();
    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &json!({ "userId": id, "provider": "github", "role": "USER", "iat": now, "exp": now + 3600 }),
        &jsonwebtoken::EncodingKey::from_secret(TEST_SECRET.as_bytes()),
    )
    .unwrap();
    (id, token)
}

async fn code_of(pool: &sqlx::SqlitePool) -> Option<String> {
    sqlx::query_scalar("SELECT value FROM site_settings WHERE key = 'setup_code'")
        .fetch_optional(pool)
        .await
        .unwrap()
}

async fn role_of(pool: &sqlx::SqlitePool, id: i64) -> String {
    sqlx::query_scalar("SELECT role FROM oauth_users WHERE id = ?").bind(id).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn 拿設定碼認領站長_之後就關門() {
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let code = code_of(&pool).await.expect("沒有站長時要產生設定碼");
    let (_, v) = get(&app, "/api/init/status").await;
    assert_eq!(v, json!({ "needed": true }));

    // 第一步只驗碼；小寫、沒有連字號也收
    let (status, _) =
        post_json(&app, "/api/init/check", json!({ "code": code.to_lowercase().replace('-', "") })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (id, token) = oauth_reader(&pool, None).await;
    let (status, _) =
        request(&app, "POST", "/api/init/claim", Some(json!({ "code": code })), Some(&token)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(role_of(&pool, id).await, "OWNER");
    assert_eq!(code_of(&pool).await, None, "認領完設定碼要刪掉");

    let (_, v) = get(&app, "/api/init/status").await;
    assert_eq!(v, json!({ "needed": false }));
    // 同一組碼再來一次（或另一個人）：已經有站長了
    let (status, v) =
        request(&app, "POST", "/api/init/claim", Some(json!({ "code": code })), Some(&token)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(v["code"], "already_claimed");
    // 站長真的進得了後台
    let (status, _) =
        request(&app, "PUT", "/api/admin/site/config", Some(json!({ "name": "新站" })), Some(&token)).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn 合併過的帳號_站長記在主帳號上() {
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let code = code_of(&pool).await.unwrap();
    let (primary, _) = oauth_reader(&pool, None).await;
    let (_, token) = oauth_reader(&pool, Some(primary)).await;
    let (status, _) =
        request(&app, "POST", "/api/init/claim", Some(json!({ "code": code })), Some(&token)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(role_of(&pool, primary).await, "OWNER");
}

#[tokio::test]
async fn 設定碼錯_沒登入_機器帳號_都認領不了() {
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let code = code_of(&pool).await.unwrap();
    let (id, token) = oauth_reader(&pool, None).await;

    let (status, v) =
        request(&app, "POST", "/api/init/claim", Some(json!({ "code": "AAAA-AAAA" })), Some(&token)).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(v["code"], "bad_code");

    let (status, v) = post_json(&app, "/api/init/claim", json!({ "code": code })).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(v["code"], "not_signed_in");

    // MCP 用的帳密 token（帶 username、沒有 userId）不能拿來當站長
    let (status, _) =
        request(&app, "POST", "/api/init/claim", Some(json!({ "code": code })), Some(&owner_token(true)))
            .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    assert_eq!(role_of(&pool, id).await, "USER");
    assert_eq!(code_of(&pool).await, Some(code), "沒認領成功，設定碼不動");
}

#[tokio::test]
async fn 錯太多次設定碼就換一組() {
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let first = code_of(&pool).await.unwrap();
    for _ in 0..10 {
        let (status, _) = post_json(&app, "/api/init/check", json!({ "code": "WRONG" })).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }
    let second = code_of(&pool).await.unwrap();
    assert_ne!(first, second);
    let (status, _) = post_json(&app, "/api/init/check", json!({ "code": first })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "舊的那組不能再用");
}

#[tokio::test]
async fn 重開機_設定碼不換() {
    let (_app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let first = code_of(&pool).await.unwrap();
    announce(&pool).await.unwrap();
    assert_eq!(code_of(&pool).await, Some(first));
}

#[tokio::test]
async fn 已經有站長的站_開機時清掉設定碼_也不走初次設定() {
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    let (id, _) = oauth_reader(&pool, None).await;
    sqlx::query("UPDATE oauth_users SET role = 'OWNER' WHERE id = ?").bind(id).execute(&pool).await.unwrap();
    announce(&pool).await.unwrap();
    assert_eq!(code_of(&pool).await, None);
    let (status, v) = post_json(&app, "/api/init/check", json!({ "code": "x" })).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(v["code"], "already_claimed");
}

#[tokio::test]
async fn 有設_owner_email_的站不走初次設定() {
    unsafe { std::env::set_var("OWNER_EMAIL", "me@example.com") };
    let (app, pool) = test_app().await;
    announce(&pool).await.unwrap();
    assert_eq!(code_of(&pool).await, None);
    let (_, v) = get(&app, "/api/init/status").await;
    assert_eq!(v, json!({ "needed": false }));
}
