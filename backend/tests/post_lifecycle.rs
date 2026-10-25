//! 排程發佈與回收桶（`handlers/post_lifecycle`）走 HTTP 與 worker 的整條路。
//!
//! 這一塊的錯全是「靜靜地錯」：排程的文章提早出現、到了時間沒出現、電子報寄兩封、
//! 丟進回收的文章還在公開清單上、還原回來少了標籤。回應一律 200，從外面看不出來。

mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{owner_token, request, test_app, test_app_with_state};
use koimsurai_web_backend::handlers::post_lifecycle;

async fn admin(app: &axum::Router, method: &str, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    request(app, method, path, body, Some(&owner_token(true))).await
}

async fn create(app: &axum::Router, body: Value) -> (StatusCode, Value) {
    admin(app, "POST", "/api/admin/posts", Some(body)).await
}

async fn create_id(app: &axum::Router, body: Value) -> i64 {
    let (st, v) = create(app, body).await;
    assert!(st.is_success(), "建立文章失敗：{st} {v}");
    v["data"]["id"].as_i64().unwrap_or_else(|| panic!("建立回應要帶 id：{v}"))
}

async fn public_titles(app: &axum::Router) -> Vec<String> {
    let (_, body) = request(app, "GET", "/api/posts", None, None).await;
    body["posts"].as_array().unwrap().iter().map(|p| p["title"].as_str().unwrap().to_string()).collect()
}

/// 把那篇的排程時間直接改到過去（API 不收過去的時間，測 worker 只能這樣模擬「時間到了」）
async fn make_due(pool: &sqlx::SqlitePool, id: i64, at: &str) {
    sqlx::query("UPDATE posts SET publish_at = ? WHERE id = ?")
        .bind(at)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

// ── 排程 ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn 排程的文章到時間之前讀者看不到() {
    let (app, _pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "明天見", "content": "內文", "status": "scheduled", "publish_at": "2099-01-01T09:00:00+08:00" }),
    )
    .await;

    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["status"], "scheduled");
    assert_eq!(one["publish_at"], "2099-01-01 01:00:00", "時間要換成 UTC 存");

    assert!(!public_titles(&app).await.contains(&"明天見".to_string()), "排程的文章提早出現在公開清單");
    let (st, _) = request(&app, "GET", &format!("/api/posts/{id}"), None, None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "排程的文章不該能用 id 讀到");
}

#[tokio::test]
async fn 排程的時間不對就不收() {
    let (app, _pool) = test_app().await;
    for (publish_at, why) in [
        (Value::Null, "沒給時間"),
        (json!("2000-01-01T00:00:00Z"), "時間已經過了"),
        (json!("下週一"), "看不懂的時間"),
    ] {
        let (st, v) = create(
            &app,
            json!({ "title": "t", "content": "c", "status": "scheduled", "publish_at": publish_at }),
        )
        .await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "{why} 要 400：{v}");
    }
    let (st, _) = create(&app, json!({ "title": "t", "content": "c", "status": "trashed" })).await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "建立時不能直接進回收");
    let (st, _) = create(&app, json!({ "title": "t", "content": "c", "status": "public" })).await;
    assert_eq!(st, StatusCode::BAD_REQUEST, "不認得的狀態要擋，不然文章會變成哪裡都看不到的幽靈");
}

#[tokio::test]
async fn 時間到了_worker_發佈並把日期改成預定的時間() {
    let (app, pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "準時", "content": "內文", "status": "scheduled", "publish_at": "2099-01-01 00:00" }),
    )
    .await;
    let later = create_id(
        &app,
        json!({ "title": "還沒", "content": "內文", "status": "scheduled", "publish_at": "2099-01-01 00:00" }),
    )
    .await;
    make_due(&pool, id, "2020-05-06 07:08:09").await;

    let published = post_lifecycle::publish_due(&pool).await.unwrap();
    assert_eq!(published, vec![(id, false)], "只有到期的那篇");

    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["status"], "published");
    assert_eq!(one["created_at"], "2020-05-06 07:08:09", "日期要是預定的那一刻，不是寫下草稿的那天");
    assert_eq!(one["publish_at"], Value::Null);
    assert!(public_titles(&app).await.contains(&"準時".to_string()));

    let (_, other) = admin(&app, "GET", &format!("/api/admin/posts/{later}"), None).await;
    assert_eq!(other["status"], "scheduled", "還沒到的不能跟著出去");

    assert!(
        post_lifecycle::publish_due(&pool).await.unwrap().is_empty(),
        "同一篇不能翻兩次（電子報會寄兩封）"
    );
}

#[tokio::test]
async fn 排程時勾的電子報留到發佈那一刻() {
    let (app, pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "有信", "content": "c", "status": "scheduled", "publish_at": "2099-01-01 00:00", "send_newsletter": true }),
    )
    .await;
    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["newsletter_pending"], true);

    make_due(&pool, id, "2020-01-01 00:00:00").await;
    assert_eq!(post_lifecycle::publish_due(&pool).await.unwrap(), vec![(id, true)]);
    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["newsletter_pending"], false, "寄過就要清掉，不然下次編輯又會寄一次");
}

#[tokio::test]
async fn 排程改回草稿或直接發佈_時間要清掉() {
    let (app, pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "改變心意", "content": "c", "status": "scheduled", "publish_at": "2099-01-01 00:00", "send_newsletter": true }),
    )
    .await;
    let (st, _) =
        admin(&app, "PUT", &format!("/api/admin/posts/{id}"), Some(json!({ "status": "draft" }))).await;
    assert!(st.is_success());
    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["publish_at"], Value::Null, "留著舊時間的話，下次改回排程會帶著過期的時間");
    assert_eq!(one["newsletter_pending"], false);

    // MCP 的 set_post_status 也一樣
    let (st, _) = admin(
        &app,
        "PUT",
        &format!("/api/admin/posts/{id}"),
        Some(json!({ "status": "scheduled", "publish_at": "2099-02-02 00:00" })),
    )
    .await;
    assert!(st.is_success());
    let (st, _) =
        admin(&app, "PATCH", &format!("/api/posts/{id}/status"), Some(json!({ "status": "published" })))
            .await;
    assert!(st.is_success());
    let publish_at: Option<String> = sqlx::query_scalar("SELECT publish_at FROM posts WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(publish_at, None);
}

#[tokio::test]
async fn worker_一輪會發佈到期的() {
    let (app, pool, state) = test_app_with_state().await;
    let id = create_id(
        &app,
        json!({ "title": "一輪", "content": "c", "status": "scheduled", "publish_at": "2099-01-01 00:00" }),
    )
    .await;
    make_due(&pool, id, "2020-01-01 00:00:00").await;
    assert_eq!(post_lifecycle::tick(&state).await, 1);
    assert!(public_titles(&app).await.contains(&"一輪".to_string()));
}

// ── 回收桶 ────────────────────────────────────────────────────────────

#[tokio::test]
async fn 丟進回收再還原_回到原本的狀態與標籤() {
    let (app, pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "回來吧", "content": "c", "status": "published", "tags": ["rust"] }),
    )
    .await;

    let (st, v) = admin(&app, "DELETE", &format!("/api/admin/posts/{id}"), None).await;
    assert!(st.is_success(), "{v}");
    assert!(!public_titles(&app).await.contains(&"回來吧".to_string()), "回收裡的文章還在公開清單上");

    // 「全部」不含回收；要明確點進回收才看得到
    let (_, all) = admin(&app, "GET", "/api/admin/posts?limit=100", None).await;
    assert!(all["posts"].as_array().unwrap().iter().all(|p| p["id"] != id), "回收裡的文章混在全部裡");
    let (_, trashed) = admin(&app, "GET", "/api/admin/posts?status=trashed", None).await;
    assert_eq!(trashed["posts"][0]["id"], id);

    let (st, v) = admin(&app, "POST", &format!("/api/admin/posts/{id}/restore"), None).await;
    assert!(st.is_success(), "{v}");
    assert_eq!(v["status"], "published");
    let (_, one) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    assert_eq!(one["tags"], json!(["rust"]), "還原回來少了標籤");
    assert_eq!(one["trashed_at"], Value::Null);
    assert!(public_titles(&app).await.contains(&"回來吧".to_string()));

    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM posts WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn 排程中的文章丟進回收再還原是草稿() {
    let (app, pool) = test_app().await;
    let id = create_id(
        &app,
        json!({ "title": "s", "content": "c", "status": "scheduled", "publish_at": "2099-01-01 00:00" }),
    )
    .await;
    admin(&app, "DELETE", &format!("/api/admin/posts/{id}"), None).await;
    // 在回收裡的時候就算時間到了也不能發出去
    assert_eq!(post_lifecycle::publish_due(&pool).await.unwrap(), Vec::<(i64, bool)>::new());
    let (_, v) = admin(&app, "POST", &format!("/api/admin/posts/{id}/restore"), None).await;
    assert_eq!(v["status"], "draft", "排程時間在丟的時候清掉了，還原後讓人重新決定");
}

#[tokio::test]
async fn 只能永久刪除回收裡的文章() {
    let (app, _pool) = test_app().await;
    let id = create_id(&app, json!({ "title": "還在線上", "content": "c", "status": "published" })).await;
    let (st, _) = admin(&app, "DELETE", &format!("/api/admin/posts/{id}?permanent=true"), None).await;
    assert_eq!(st, StatusCode::CONFLICT, "一步刪掉線上的文章是最不該發生的意外");
    assert!(public_titles(&app).await.contains(&"還在線上".to_string()));

    let (st, _) = admin(&app, "POST", &format!("/api/admin/posts/{id}/restore"), None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "不在回收裡的不能還原");
    let (st, _) = admin(&app, "DELETE", "/api/admin/posts/999999", None).await;
    assert_eq!(st, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn 回收桶放滿天數才清掉() {
    let (app, pool) = test_app().await;
    let old = create_id(&app, json!({ "title": "放很久", "content": "c", "tags": ["a"] })).await;
    let fresh = create_id(&app, json!({ "title": "剛丟", "content": "c" })).await;
    for id in [old, fresh] {
        admin(&app, "DELETE", &format!("/api/admin/posts/{id}"), None).await;
    }
    sqlx::query("UPDATE posts SET trashed_at = datetime('now', '-31 days') WHERE id = ?")
        .bind(old)
        .execute(&pool)
        .await
        .unwrap();

    assert_eq!(post_lifecycle::purge_trash(&pool, post_lifecycle::TRASH_KEEP_DAYS).await.unwrap(), 1);
    let left: Vec<i64> = sqlx::query_scalar("SELECT id FROM posts WHERE id IN (?, ?)")
        .bind(old)
        .bind(fresh)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(left, vec![fresh]);
    let tags: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM post_tags WHERE post_id = ?")
        .bind(old)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(tags, 0, "清回收也要清標籤關聯");
}

#[tokio::test]
async fn 總覽的計數分得出排程與回收() {
    let (app, _pool) = test_app().await;
    let (_, before) = admin(&app, "GET", "/api/admin/stats", None).await;
    create_id(
        &app,
        json!({ "title": "a", "content": "c", "status": "scheduled", "publish_at": "2099-03-01 00:00" }),
    )
    .await;
    create_id(
        &app,
        json!({ "title": "b", "content": "c", "status": "scheduled", "publish_at": "2099-02-01 00:00" }),
    )
    .await;
    let gone = create_id(&app, json!({ "title": "c", "content": "c" })).await;
    admin(&app, "DELETE", &format!("/api/admin/posts/{gone}"), None).await;

    let (_, after) = admin(&app, "GET", "/api/admin/stats", None).await;
    let n = |v: &Value, k: &str| v[k].as_i64().unwrap_or_else(|| panic!("{k} 不是數字：{v}"));
    assert_eq!(n(&after, "scheduledPosts") - n(&before, "scheduledPosts"), 2);
    assert_eq!(n(&after, "trashedPosts") - n(&before, "trashedPosts"), 1);
    assert_eq!(n(&after, "totalPosts") - n(&before, "totalPosts"), 2, "回收裡的不算進總數");
    assert_eq!(after["nextScheduledAt"], "2099-02-01 00:00:00", "下一篇是時間最早的那篇");
}
