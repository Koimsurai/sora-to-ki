//! 後台「流量」頁：代理 Plausible 的 Stats API。
//!
//! Plausible 用 wiremock 扮演。守的是：
//!   - 沒設 key 時不打上游、回 `configured: false`（後台顯示怎麼設，不是錯誤）
//!   - 有 key 時帶 Bearer、打 v2 的 query，回應整理成後台要的形狀
//!   - Plausible 拒絕時把它的原因帶回來（key 錯、site_id 錯），回 502
//!   - 要登入後台才打得到

mod common;

use std::sync::Arc;

use axum::http::StatusCode;
use serde_json::{Value, json};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use common::{owner_token, request, test_app_with_state};
use koimsurai_web_backend::{router::build_router, state::ExternalUrls};

async fn app_against(server: &MockServer) -> axum::Router {
    let (_app, _pool, mut state) = test_app_with_state().await;
    state.external = Arc::new(ExternalUrls { plausible: server.uri(), ..ExternalUrls::default() });
    build_router(state)
}

/// 依查詢的 dimensions 回不同的結果，模擬 Plausible 的 v2 query
fn answer(req: &Request) -> ResponseTemplate {
    let body: Value = serde_json::from_slice(&req.body).unwrap_or_default();
    let dim = body["dimensions"][0].as_str().unwrap_or("");
    let out = match dim {
        "" => json!({ "results": [{ "metrics": [120, 150, 400, 55, 75], "dimensions": [] }] }),
        "time:day" => json!({
            "results": [{ "metrics": [7, 9], "dimensions": ["2026-10-25"] }],
            "meta": { "time_labels": ["2026-10-24", "2026-10-25"] },
        }),
        "event:page" => json!({ "results": [{ "metrics": [80], "dimensions": ["/blog/hello"] }] }),
        "visit:source" => json!({ "results": [{ "metrics": [30], "dimensions": ["Google"] }] }),
        "visit:country" => json!({ "results": [{ "metrics": [60], "dimensions": ["TW"] }] }),
        "visit:device" => json!({ "results": [{ "metrics": [70], "dimensions": ["Desktop"] }] }),
        _ => return ResponseTemplate::new(400).set_body_json(json!({ "error": "unexpected" })),
    };
    ResponseTemplate::new(200).set_body_json(out)
}

#[tokio::test]
async fn without_key_reports_not_configured_and_does_not_call_upstream() {
    unsafe { std::env::remove_var("PLAUSIBLE_API_KEY") };
    let server = MockServer::start().await;
    let app = app_against(&server).await;

    let (status, body) = request(&app, "GET", "/api/admin/analytics", None, Some(&owner_token(true))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["configured"], false);
    assert_eq!(body["period"], "30d");
    assert!(server.received_requests().await.unwrap_or_default().is_empty(), "沒有 key 不該打 Plausible");
}

#[tokio::test]
async fn requires_admin() {
    let server = MockServer::start().await;
    let app = app_against(&server).await;
    let (status, _) = request(&app, "GET", "/api/admin/analytics", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn shapes_plausible_results_for_the_admin_page() {
    unsafe {
        std::env::set_var("PLAUSIBLE_API_KEY", "test-key");
        std::env::set_var("PLAUSIBLE_SITE_ID", "example.test");
    }
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/v2/query"))
        .and(header("authorization", "Bearer test-key"))
        .respond_with(answer)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v1/stats/realtime/visitors"))
        .respond_with(ResponseTemplate::new(200).set_body_string("3"))
        .mount(&server)
        .await;
    let app = app_against(&server).await;

    let (status, body) =
        request(&app, "GET", "/api/admin/analytics?period=7d", None, Some(&owner_token(true))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["configured"], true);
    assert_eq!(body["period"], "7d");
    assert_eq!(body["realtime"], 3);
    assert_eq!(body["totals"]["visitors"], 120);
    assert_eq!(body["totals"]["pageviews"], 400);
    assert_eq!(body["totals"]["bounce_rate"], 55.0);
    assert_eq!(
        body["series"],
        json!([
            { "date": "2026-10-24", "visitors": 0, "pageviews": 0 },
            { "date": "2026-10-25", "visitors": 7, "pageviews": 9 },
        ])
    );
    assert_eq!(body["pages"], json!([{ "name": "/blog/hello", "visitors": 80 }]));
    assert_eq!(body["countries"][0]["name"], "TW");
    assert_eq!(body["dashboard_url"], format!("{}/example.test", server.uri()));

    // 送出去的查詢：站台名、期間都要帶對；熱門頁面要把後台濾掉
    let sent: Vec<Value> = server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|r| r.url.path() == "/api/v2/query")
        .map(|r| serde_json::from_slice(&r.body).unwrap_or_default())
        .collect();
    assert_eq!(sent.len(), 6);
    assert!(sent.iter().all(|q| q["site_id"] == "example.test" && q["date_range"] == "7d"));
    let pages = sent.iter().find(|q| q["dimensions"][0] == "event:page").cloned().unwrap_or_default();
    assert_eq!(pages["filters"], json!([["contains_not", "event:page", ["/admin"]]]));
}

#[tokio::test]
async fn upstream_rejection_is_reported_with_its_reason() {
    unsafe { std::env::set_var("PLAUSIBLE_API_KEY", "wrong-key") };
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/api/v2/query"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({ "error": "Invalid API key" })))
        .mount(&server)
        .await;
    let app = app_against(&server).await;

    let (status, body) = request(&app, "GET", "/api/admin/analytics", None, Some(&owner_token(true))).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    let error = body["error"].as_str().unwrap_or_default();
    assert!(error.contains("401") && error.contains("Invalid API key"), "{error}");
}
