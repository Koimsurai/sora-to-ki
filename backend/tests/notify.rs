//! 通知（handlers/notify.rs）：站長回覆時寄信給勾了通知的人、退訂、給站長的 webhook。
//!
//! 信與 webhook 都在背景送（不擋留言本身），所以斷言前要等 mock 收到。
//! ⚠ 用 `std::env::set_var`，**依賴 nextest 的行程隔離**（同 tests/mailer.rs）。

mod common;

use std::time::Duration;

use serde_json::{Value, json};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use common::{owner_token, post_json, request, test_app};

async fn mock_resend() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/emails"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "x" })))
        .mount(&server)
        .await;
    // SAFETY: nextest 一個測試一個行程
    unsafe {
        std::env::set_var("RESEND_BASE_URL", server.uri());
        std::env::set_var("RESEND_API_KEY", "re_test_key");
        std::env::set_var("NEWSLETTER_FROM", "Test <no-reply@example.test>");
        std::env::set_var("SITE_URL", "https://example.test");
    }
    server
}

/// 等 mock 收到 `n` 個請求（最多兩秒），回所有請求的 JSON body
async fn wait_for(server: &MockServer, n: usize) -> Vec<Value> {
    for _ in 0..100 {
        let got = server.received_requests().await.unwrap_or_default();
        if got.len() >= n {
            return got.iter().map(|r| serde_json::from_slice(&r.body).unwrap()).collect();
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .map(|r| serde_json::from_slice(&r.body).unwrap())
        .collect()
}

async fn comment(app: &axum::Router, body: Value) -> i64 {
    let (status, v) = post_json(app, "/api/posts/1/comments", body).await;
    assert_eq!(status.as_u16(), 201, "{v}");
    v["id"].as_i64().unwrap()
}

async fn reply(app: &axum::Router, id: i64, content: &str) {
    let (status, v) = request(
        app,
        "POST",
        &format!("/api/admin/comments/{id}/reply"),
        Some(json!({ "content": content })),
        Some(&owner_token(true)),
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{v}");
}

#[tokio::test]
async fn 勾了通知又留了信箱_站長回覆時寄一封信給他() {
    let server = mock_resend().await;
    let (app, _pool) = test_app().await;
    let id = comment(
        &app,
        json!({ "author": "讀者", "content": "寫得真好", "email": "reader@example.test", "notify_reply": true, "locale": "en" }),
    )
    .await;
    reply(&app, id, "謝謝你！").await;

    let sent = wait_for(&server, 1).await;
    assert_eq!(sent.len(), 1);
    let mail = &sent[0];
    assert_eq!(mail["to"], json!(["reader@example.test"]));
    assert!(mail["subject"].as_str().unwrap().contains("replied to your comment"), "用留言當時的語系寫");
    let html = mail["html"].as_str().unwrap();
    assert!(html.contains("謝謝你！") && html.contains("寫得真好"));
    assert!(html.contains("https://example.test/en/blog/1"), "連到讀者那個語系的文章");
    assert!(html.contains("/unsubscribe?reply="), "附退訂連結");
}

#[tokio::test]
async fn 沒勾通知或沒留信箱就不寄() {
    let server = mock_resend().await;
    let (app, pool) = test_app().await;
    let a = comment(&app, json!({ "author": "甲", "content": "一", "email": "a@example.test" })).await;
    let b = comment(&app, json!({ "author": "乙", "content": "二", "notify_reply": true })).await;
    reply(&app, a, "回甲").await;
    reply(&app, b, "回乙").await;

    let flag: i64 = sqlx::query_scalar("SELECT notify_reply FROM comments WHERE id = ?")
        .bind(b)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(flag, 0, "沒有信箱，勾了也不算");
    tokio::time::sleep(Duration::from_millis(300)).await;
    let sent = server.received_requests().await.unwrap_or_default();
    assert!(sent.is_empty(), "一封都不該寄：{}", sent.len());
}

#[tokio::test]
async fn 退訂之後同一個信箱的留言都不再寄() {
    let server = mock_resend().await;
    let (app, pool) = test_app().await;
    let first =
        comment(&app, json!({ "author": "讀者", "content": "第一則", "email": "Reader@Example.test", "notify_reply": true }))
            .await;
    let second =
        comment(&app, json!({ "author": "讀者", "content": "第二則", "email": "reader@example.test", "notify_reply": true }))
            .await;

    let token: String = sqlx::query_scalar("SELECT notify_token FROM comments WHERE id = ?")
        .bind(first)
        .fetch_one(&pool)
        .await
        .unwrap();
    let (status, _) = post_json(&app, "/api/comments/notify/unsubscribe", json!({ "token": token })).await;
    assert_eq!(status.as_u16(), 200);

    reply(&app, second, "回第二則").await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(server.received_requests().await.unwrap_or_default().is_empty(), "大小寫不同也是同一個信箱");

    let (status, v) = post_json(&app, "/api/comments/notify/unsubscribe", json!({ "token": "nope" })).await;
    assert_eq!(status.as_u16(), 404);
    assert_eq!(v["code"], "unsubscribe_invalid");
}

#[tokio::test]
async fn 公開的留言清單不會帶出通知的欄位() {
    let _server = mock_resend().await;
    let (app, pool) = test_app().await;
    let id = comment(
        &app,
        json!({ "author": "讀者", "content": "嗨", "email": "r@example.test", "notify_reply": true }),
    )
    .await;
    sqlx::query("UPDATE comments SET status = 'approved' WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();
    let (_, v) = common::get(&app, "/api/posts/1/comments").await;
    let raw = v.to_string();
    assert!(raw.contains("嗨"));
    assert!(!raw.contains("notify_token") && !raw.contains("r@example.test"), "{raw}");
}

/// OAuth 登入者的 token（userId + provider），角色看 oauth_users 那一列
fn oauth_token(user_id: i64) -> String {
    let now = koimsurai_web_backend::util::now_secs();
    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &json!({ "userId": user_id, "provider": "github", "exp": now + 3600 }),
        &jsonwebtoken::EncodingKey::from_secret(common::TEST_SECRET.as_bytes()),
    )
    .unwrap()
}

#[tokio::test]
async fn 站長在前台登入後回覆也會寄_一般登入者回覆不寄() {
    let server = mock_resend().await;
    let (app, pool) = test_app().await;
    sqlx::query(
        "INSERT INTO oauth_users (id, provider, provider_id, display_name, role) \
         VALUES (1, 'github', 'o', '站長', 'OWNER'), (2, 'github', 'u', '路人', 'USER')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let id = comment(
        &app,
        json!({ "author": "讀者", "content": "問題", "email": "r@example.test", "notify_reply": true }),
    )
    .await;

    for (uid, text) in [(2, "路人插話"), (1, "站長回答")] {
        let (status, v) = request(
            &app,
            "POST",
            "/api/posts/1/comments",
            Some(json!({ "author": "x", "content": text, "parent_id": id })),
            Some(&oauth_token(uid)),
        )
        .await;
        assert_eq!(status.as_u16(), 201, "{v}");
    }
    let sent = wait_for(&server, 1).await;
    tokio::time::sleep(Duration::from_millis(200)).await;
    let sent_all = server.received_requests().await.unwrap_or_default();
    assert_eq!(sent_all.len(), 1, "只有站長那則寄信");
    assert!(sent[0]["html"].as_str().unwrap().contains("站長回答"));
}

async fn mock_hook() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("POST")).respond_with(ResponseTemplate::new(204)).mount(&server).await;
    server
}

async fn set_hook(app: &axum::Router, url: &str, on_comment: bool) {
    let (status, v) = request(
        app,
        "PUT",
        "/api/admin/notify",
        Some(json!({ "webhook_url": url, "on_comment": on_comment, "on_friend": true })),
        Some(&owner_token(true)),
    )
    .await;
    assert_eq!(status.as_u16(), 200, "{v}");
}

#[tokio::test]
async fn 新留言送_webhook_不帶信箱() {
    let hook = mock_hook().await;
    let (app, _pool) = test_app().await;
    set_hook(&app, &format!("{}/hook", hook.uri()), true).await;
    comment(&app, json!({ "author": "路人", "content": "第一次來", "email": "secret@example.test" })).await;

    let got = wait_for(&hook, 1).await;
    assert_eq!(got.len(), 1);
    assert_eq!(got[0]["event"], "comment", "不是 Discord／Slack 的網址送通用 JSON");
    assert_eq!(got[0]["data"]["status"], "pending");
    let text = got[0]["text"].as_str().unwrap();
    assert!(text.contains("路人") && text.contains("第一次來") && text.contains("/admin/comments"), "{text}");
    assert!(!got[0].to_string().contains("secret@example.test"), "不帶讀者的信箱");
}

#[tokio::test]
async fn 關掉留言通知就不送() {
    let hook = mock_hook().await;
    let (app, _pool) = test_app().await;
    set_hook(&app, &format!("{}/hook", hook.uri()), false).await;
    comment(&app, json!({ "author": "路人", "content": "嗨" })).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(hook.received_requests().await.unwrap_or_default().is_empty());
}

#[tokio::test]
async fn 友鏈申請送_webhook() {
    let hook = mock_hook().await;
    let (app, _pool) = test_app().await;
    set_hook(&app, &format!("{}/hook", hook.uri()), false).await;
    let (status, v) = post_json(
        &app,
        "/api/friends/apply",
        json!({ "name": "鄰居", "url": "https://neighbor.example", "description": "隔壁的站", "email": "n@example.test", "message": "交換一下" }),
    )
    .await;
    assert_eq!(status.as_u16(), 201, "{v}");
    let got = wait_for(&hook, 1).await;
    assert_eq!(got.len(), 1);
    assert_eq!(got[0]["event"], "friend");
    assert!(got[0]["text"].as_str().unwrap().contains("鄰居"));
}

#[tokio::test]
async fn 後台設定_讀寫與送測試() {
    let hook = mock_hook().await;
    let (app, _pool) = test_app().await;
    let token = owner_token(true);

    let (status, v) = request(&app, "GET", "/api/admin/notify", None, Some(&token)).await;
    assert_eq!(status.as_u16(), 200);
    assert_eq!(
        v["settings"],
        json!({ "webhook_url": "", "on_comment": true, "on_friend": true }),
        "沒設過：空網址、兩類都開"
    );

    let (status, v) = request(
        &app,
        "PUT",
        "/api/admin/notify",
        Some(json!({ "webhook_url": "javascript:alert(1)" })),
        Some(&token),
    )
    .await;
    assert_eq!(status.as_u16(), 400);
    assert_eq!(v["code"], "webhook_url_invalid");

    let url = format!("{}/hook", hook.uri());
    let (status, v) =
        request(&app, "POST", "/api/admin/notify/test", Some(json!({ "webhook_url": url })), Some(&token))
            .await;
    assert_eq!(status.as_u16(), 200);
    assert_eq!(v["ok"], true);
    assert_eq!(hook.received_requests().await.unwrap().len(), 1, "測試是同步送的");

    let (status, _) = request(&app, "GET", "/api/admin/notify", None, None).await;
    assert_eq!(status.as_u16(), 401, "webhook 網址是密鑰，不登入看不到");
}
