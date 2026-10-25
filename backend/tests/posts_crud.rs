//! 文章寫入面裡，不走 PostEditor 主流程的兩件事。
//!
//! Express 時代另有一套簡版的 `POST/PUT/DELETE /api/posts` 與 Basic Auth 的
//! `/api/posts/legacy`，2026-10 移除（nginx 日誌 53 天零呼叫）。留下的只有
//! `PATCH /api/posts/:id/status`——MCP 的 `set_post_status` 在用。
//! 公開路徑不再接受寫入，由 `posts_list.rs` 的「公開文章路徑不接受寫入」守著。

mod common;

use axum::http::StatusCode;
use serde_json::json;

use common::{owner_token, request, test_app};

async fn admin(
    app: &axum::Router,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> (StatusCode, serde_json::Value) {
    request(app, method, path, body, Some(&owner_token(true))).await
}

/// 經後台建一篇文章，回它的 id。
async fn create_post(app: &axum::Router, body: serde_json::Value) -> i64 {
    let (st, created) = admin(app, "POST", "/api/admin/posts", Some(body)).await;
    assert!(st.is_success(), "建立文章失敗：{st} {created}");
    ["data", "post"]
        .iter()
        .find_map(|k| created[*k]["id"].as_i64())
        .or_else(|| created["id"].as_i64())
        .unwrap_or_else(|| panic!("建立回應要帶 id：{created}"))
}

/// 刪文章要連帶清掉標籤關聯。只刪 posts 的話會留下孤兒列，SQLite 沒有 FK cascade，
/// 下一篇拿到同一個 id 就會莫名其妙帶著別人的標籤。
#[tokio::test]
async fn 刪除文章會連帶清掉標籤關聯() {
    let (app, pool) = test_app().await;
    let id = create_post(&app, json!({ "title": "有標籤", "content": "內文", "tags": ["rust"] })).await;
    let count = || async {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM post_tags WHERE post_id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
    };
    assert_eq!(count().await, 1, "建立時的標籤沒掛上");

    // 第一次刪是丟回收：還原時標籤要在，所以關聯不動
    let (st, v) = admin(&app, "DELETE", &format!("/api/admin/posts/{id}"), None).await;
    assert!(st.is_success(), "得到 {st} {v}");
    assert_eq!(count().await, 1, "丟進回收就把標籤拆掉的話，還原回來會少了標籤");

    let (st, v) = admin(&app, "DELETE", &format!("/api/admin/posts/{id}?permanent=true"), None).await;
    assert!(st.is_success(), "得到 {st} {v}");
    assert_eq!(count().await, 0, "標籤關聯沒被清掉，會變成孤兒列");

    let (st, _) = admin(&app, "DELETE", "/api/admin/posts/999999", None).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "刪不存在的文章要 404");
}

/// `PATCH /api/posts/:id/status` 只收 published / draft。
/// 收了別的值會讓那篇變成「既不在草稿也不在已發布」的幽靈——後台列表看不到、
/// 公開清單也看不到，但它確實存在。
#[tokio::test]
async fn 狀態只收_published_與_draft() {
    let (app, pool) = test_app().await;
    let id = create_post(&app, json!({ "title": "改狀態", "content": "內文", "status": "draft" })).await;
    let status = || async {
        sqlx::query_scalar::<_, String>("SELECT status FROM posts WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
    };

    for bad in [json!("archived"), json!("banana"), json!(""), json!(null)] {
        let (st, v) =
            admin(&app, "PATCH", &format!("/api/posts/{id}/status"), Some(json!({ "status": bad }))).await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "status={bad} 應該被擋");
        assert!(v["error"].as_str().unwrap().contains("published"), "錯誤訊息要說得出合法值");
    }
    assert_eq!(status().await, "draft", "擋下來之後 DB 不該被動到");

    let (st, v) =
        admin(&app, "PATCH", &format!("/api/posts/{id}/status"), Some(json!({ "status": "published" })))
            .await;
    assert_eq!(st, StatusCode::OK, "得到 {v}");
    assert_eq!(v["status"], "published");
    assert_eq!(status().await, "published");

    let (st, _) = admin(&app, "PATCH", "/api/posts/999999/status", Some(json!({ "status": "draft" }))).await;
    assert_eq!(st, StatusCode::NOT_FOUND, "改不存在的文章要 404");
}

/// 摘要裡連到章節的句子：後台寫入時逐語系併、公開單篇只回該語系且摘要裡找得到的。
/// 寫壞的格式要 400，不能存進去之後在前台畫出一條指向空氣的底線。
#[tokio::test]
async fn 摘要連結依語系寫入_公開只回摘要裡找得到的() {
    let (app, _pool) = test_app().await;
    let id = create_post(
        &app,
        json!({
            "title": "有摘要", "content": "## 一\n\n內文", "status": "published",
            "excerpt": "先架起來,正確率只有 38%。",
            "title_en": "With summary", "content_en": "## One\n\nBody", "excerpt_en": "Accuracy was only 38%.",
            "excerpt_links": { "zh-TW": [{ "text": "正確率只有 38%", "to": "05.4" }] },
        }),
    )
    .await;

    // 只帶 en：zh-TW 那組要留著；另外塞一句摘要裡沒有的，公開時要被濾掉
    let (st, v) = admin(
        &app,
        "PUT",
        &format!("/api/admin/posts/{id}"),
        Some(json!({ "excerpt_links": { "en": [
            { "text": "only 38%", "to": "05" },
            { "text": "not in the summary", "to": "01" },
        ] } })),
    )
    .await;
    assert!(st.is_success(), "得到 {st} {v}");

    let (_, zh) = request(&app, "GET", &format!("/api/posts/{id}"), None, None).await;
    assert_eq!(zh["excerpt_links"], json!([{ "text": "正確率只有 38%", "to": "05.4" }]));
    let (_, en) = request(&app, "GET", &format!("/api/posts/{id}?lang=en"), None, None).await;
    assert_eq!(en["excerpt_links"], json!([{ "text": "only 38%", "to": "05" }]));

    let (_, full) = admin(&app, "GET", &format!("/api/admin/posts/{id}"), None).await;
    let post = if full["post"].is_object() { &full["post"] } else { &full };
    assert_eq!(post["excerpt_links"]["en"].as_array().map(Vec::len), Some(2), "後台看得到原樣存的");

    for bad in [json!({ "fr": [] }), json!({ "en": [{ "text": "x", "to": "#ar-h05" }] }), json!("x")] {
        let (st, _) =
            admin(&app, "PUT", &format!("/api/admin/posts/{id}"), Some(json!({ "excerpt_links": bad })))
                .await;
        assert_eq!(st, StatusCode::BAD_REQUEST, "excerpt_links={bad} 應該被擋");
    }

    // 沒帶 excerpt_links 的更新不動它；帶 null 整欄清掉
    admin(&app, "PUT", &format!("/api/admin/posts/{id}"), Some(json!({ "title": "改標題" }))).await;
    let (_, zh) = request(&app, "GET", &format!("/api/posts/{id}"), None, None).await;
    assert_eq!(zh["excerpt_links"].as_array().map(Vec::len), Some(1));
    admin(&app, "PUT", &format!("/api/admin/posts/{id}"), Some(json!({ "excerpt_links": null }))).await;
    let (_, zh) = request(&app, "GET", &format!("/api/posts/{id}"), None, None).await;
    assert_eq!(zh["excerpt_links"], json!([]));
}
