//! 友鏈申請（公開表單）與後台審核。
//!
//! 申請端點是公開、無認證的，這裡守的多半是防濫用：機器人、洗版、同一個網站送兩次、
//! 指到內網的網址。審核端守的是「收下之後朋友頁馬上看得到、退回之後馬上消失」。
//!
//! 不打 `GET /api/friends`：它會去抓每位朋友真的 feed（種子裡的兩位是真的站），
//! 測試不該連外。朋友頁的名單直接讀 `friends::approved`——handler 就是拿它去抓 feed 的。

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use common::{owner_token, request, test_app};
use koimsurai_web_backend::handlers::{friend_links, friends};

/// 帶 X-Forwarded-For 送申請（防濫用照 IP 算）
async fn apply_from(app: &axum::Router, ip: &str, body: Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri("/api/friends/apply")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", ip)
        .body(Body::from(body.to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn form(host: &str) -> Value {
    json!({
        "name": "隔壁的站",
        "url": format!("https://{host}/"),
        "description": "寫程式也寫日常",
        "email": "me@neighbor.example",
        "message": "你好，想交換友鏈",
    })
}

async fn admin(app: &axum::Router, method: &str, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    request(app, method, path, body, Some(&owner_token(true))).await
}

async fn friend_slugs(pool: &sqlx::SqlitePool) -> Vec<String> {
    friends::approved(pool).await.unwrap().into_iter().map(|f| f.slug).collect()
}

#[tokio::test]
async fn 原本寫死的兩位朋友搬進來了_位置不變() {
    let (_app, pool) = test_app().await;
    // slug 決定朋友頁上那顆星的軌道；換了位置會跳
    assert_eq!(friend_slugs(&pool).await, ["doraeyi", "sao-x"]);
}

#[tokio::test]
async fn 送出申請_後台待看裡看得到_朋友頁還看不到() {
    let (app, pool) = test_app().await;
    let (st, v) = apply_from(&app, "203.0.113.5", form("neighbor.example")).await;
    assert_eq!(st, StatusCode::CREATED, "{v}");

    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    assert_eq!(list["counts"]["pending"], 1);
    let row = &list["friends"][0];
    assert_eq!(row["name"], "隔壁的站");
    assert_eq!(row["url"], "https://neighbor.example", "根路徑的結尾斜線拿掉");
    assert_eq!(row["status"], "pending");
    assert!(row.get("ip").is_none(), "申請者的 IP 不給前端");

    assert_eq!(friend_slugs(&pool).await, ["doraeyi", "sao-x"], "還沒收下就不該出現在朋友頁");
}

#[tokio::test]
async fn 隱藏欄位有填的是機器人_假裝收到但不存() {
    let (app, _pool) = test_app().await;
    let mut body = form("bot.example");
    body["website"] = json!("http://spam.example");
    let (st, _) = apply_from(&app, "203.0.113.6", body).await;
    assert_eq!(st, StatusCode::CREATED, "不能讓機器人知道哪裡露餡");
    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    assert_eq!(list["counts"]["pending"], 0);
}

#[tokio::test]
async fn 同一個_ip_一天最多三份() {
    let (app, _pool) = test_app().await;
    for i in 0..friend_links::APPLY_PER_IP_PER_DAY {
        let (st, v) = apply_from(&app, "203.0.113.7", form(&format!("site{i}.example"))).await;
        assert_eq!(st, StatusCode::CREATED, "{v}");
    }
    let (st, _) = apply_from(&app, "203.0.113.7", form("one-more.example")).await;
    assert_eq!(st, StatusCode::TOO_MANY_REQUESTS);
    let (st, _) = apply_from(&app, "198.51.100.1", form("one-more.example")).await;
    assert_eq!(st, StatusCode::CREATED, "別的 IP 不受影響");
}

#[tokio::test]
async fn 黑名單上的_ip_不能送() {
    let (app, pool) = test_app().await;
    sqlx::query("INSERT INTO ip_blacklist (ip, reason) VALUES ('203.0.113.8', 'spam')")
        .execute(&pool)
        .await
        .unwrap();
    let (st, _) = apply_from(&app, "203.0.113.8", form("blocked.example")).await;
    assert_eq!(st, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn 同一個網站不收第二份_www_與大小寫也算同一個() {
    let (app, _pool) = test_app().await;
    let (st, _) = apply_from(&app, "203.0.113.9", form("dup.example")).await;
    assert_eq!(st, StatusCode::CREATED);
    let (st, _) = apply_from(&app, "198.51.100.2", form("WWW.Dup.example")).await;
    assert_eq!(st, StatusCode::CONFLICT);
    // 已經是朋友的也一樣
    let (st, _) = apply_from(&app, "198.51.100.3", form("blog.doraeyi.com")).await;
    assert_eq!(st, StatusCode::CONFLICT);
}

#[tokio::test]
async fn 欄位不對的不收() {
    let (app, _pool) = test_app().await;
    let cases = [
        (json!({ "url": "https://a.example" }), "沒有站名"),
        (json!({ "name": "a" }), "沒有網址"),
        (json!({ "name": "a", "url": "http://127.0.0.1:8080" }), "指到本機"),
        (json!({ "name": "a", "url": "http://192.168.1.1" }), "指到內網"),
        (json!({ "name": "a", "url": "https://a.example", "email": "nope" }), "信箱不對"),
        (json!({ "name": "a", "url": "https://koimsurai.com" }), "這個站自己"),
    ];
    for (body, why) in cases {
        let (st, v) = apply_from(&app, "203.0.113.10", body).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{why} 要 400：{v}");
    }
}

#[tokio::test]
async fn 收下之後朋友頁馬上看得到_退回之後消失() {
    let (app, pool) = test_app().await;
    apply_from(&app, "203.0.113.11", form("new-friend.example")).await;
    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    let id = list["friends"][0]["id"].as_i64().unwrap();

    let (st, v) =
        admin(&app, "PATCH", &format!("/api/admin/friends/{id}"), Some(json!({ "status": "approved" })))
            .await;
    assert!(st.is_success(), "{v}");
    assert_eq!(v["friend"]["slug"], "new-friend-example");
    assert!(v["friend"]["reviewed_at"].is_string());
    assert_eq!(friend_slugs(&pool).await, ["doraeyi", "sao-x", "new-friend-example"], "新朋友排在最後");

    let (st, _) =
        admin(&app, "PATCH", &format!("/api/admin/friends/{id}"), Some(json!({ "status": "rejected" })))
            .await;
    assert!(st.is_success());
    assert_eq!(friend_slugs(&pool).await, ["doraeyi", "sao-x"]);
}

#[tokio::test]
async fn 審核時改得了資料_改壞了照樣擋() {
    let (app, _pool) = test_app().await;
    apply_from(&app, "203.0.113.12", form("edit.example")).await;
    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    let id = list["friends"][0]["id"].as_i64().unwrap();
    let path = format!("/api/admin/friends/{id}");

    let (_, v) = admin(
        &app,
        "PATCH",
        &path,
        Some(json!({ "description": "改過的介紹", "feed_url": "https://edit.example/rss.xml" })),
    )
    .await;
    assert_eq!(v["friend"]["description"], "改過的介紹");
    assert_eq!(v["friend"]["name"], "隔壁的站", "沒帶的欄位不動");
    assert_eq!(v["friend"]["feed_url"], "https://edit.example/rss.xml");

    let (_, v) = admin(&app, "PATCH", &path, Some(json!({ "feed_url": "" }))).await;
    assert_eq!(v["friend"]["feed_url"], Value::Null, "空字串 = 清掉");

    let (st, _) = admin(&app, "PATCH", &path, Some(json!({ "url": "http://10.0.0.1" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = admin(&app, "PATCH", &path, Some(json!({ "status": "maybe" }))).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) =
        admin(&app, "PATCH", "/api/admin/friends/999999", Some(json!({ "status": "approved" }))).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn 沒留信箱的不能回信() {
    let (app, _pool) = test_app().await;
    let mut body = form("no-mail.example");
    body["email"] = Value::Null;
    apply_from(&app, "203.0.113.13", body).await;
    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    let id = list["friends"][0]["id"].as_i64().unwrap();
    let (st, v) = admin(
        &app,
        "PATCH",
        &format!("/api/admin/friends/{id}"),
        Some(json!({ "status": "approved", "reply": "收下了" })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "{v}");
    let (_, list) = admin(&app, "GET", "/api/admin/friends", None).await;
    assert_eq!(list["friends"][0]["status"], "pending", "回信失敗的話整個審核不該生效");
}

#[tokio::test]
async fn 站長可以直接加朋友_也可以刪() {
    let (app, pool) = test_app().await;
    let (st, v) = admin(
        &app,
        "POST",
        "/api/admin/friends",
        Some(json!({ "name": "老朋友", "url": "https://old.example", "description": "認識很久了" })),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED, "{v}");
    assert_eq!(v["status"], "approved");
    assert!(friend_slugs(&pool).await.contains(&"old-example".to_string()));

    let id = v["id"].as_i64().unwrap();
    let (st, _) = admin(&app, "DELETE", &format!("/api/admin/friends/{id}"), None).await;
    assert!(st.is_success());
    assert!(!friend_slugs(&pool).await.contains(&"old-example".to_string()));
}

#[tokio::test]
async fn 後台端點要登入() {
    let (app, _pool) = test_app().await;
    for (method, path) in [
        ("GET", "/api/admin/friends"),
        ("POST", "/api/admin/friends"),
        ("PATCH", "/api/admin/friends/1"),
        ("DELETE", "/api/admin/friends/1"),
        ("POST", "/api/admin/friends/1/check"),
    ] {
        let (st, _) = request(&app, method, path, Some(json!({})), None).await;
        assert_eq!(st, StatusCode::UNAUTHORIZED, "{method} {path}");
    }
}
