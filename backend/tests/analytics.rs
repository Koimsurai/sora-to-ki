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
    // 兩個 event:page 查詢：熱門頁面（濾掉後台）與文章頁的捲動／停留（只要 /blog/）
    let articles = body["filters"][0][0] == "contains";
    let source_entry = body["dimensions"][1] == "visit:entry_page";
    // 上一段的總數：這一段到昨天（台北）為止，上一段的結束日不是昨天
    let yesterday = ((chrono::Utc::now() + chrono::TimeDelta::hours(8)).date_naive()
        - chrono::TimeDelta::days(1))
    .to_string();
    let previous = dim.is_empty() && body["date_range"][1].as_str() != Some(yesterday.as_str());
    let out = match dim {
        "" if previous => json!({ "results": [{ "metrics": [30, 40, 90, 70, 60, 2.25], "dimensions": [] }] }),
        "" => json!({ "results": [{ "metrics": [120, 150, 400, 55, 75, 2.67], "dimensions": [] }] }),
        "event:page" if articles => json!({ "results": [
            { "metrics": [80, 55, 40], "dimensions": ["/blog/1"] },
            { "metrics": [20, 75, null], "dimensions": ["/en/blog/1"] },
            { "metrics": [5, 10, 3], "dimensions": ["/blog/no-such-post"] },
        ] }),
        "visit:source" if source_entry => json!({ "results": [
            { "metrics": [20], "dimensions": ["Google", "/blog/1"] },
            { "metrics": [10], "dimensions": ["Google", "/"] },
        ] }),
        "time:hour" => json!({
            "results": [{ "metrics": [4, 6], "dimensions": ["2026-10-29 01:00:00"] }],
            "meta": { "time_labels": ["2026-10-29 00:00:00", "2026-10-29 01:00:00"] },
        }),
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
    // 上一段：算漲跌用
    assert_eq!(body["previous"]["visitors"], 30);
    assert_eq!(body["totals"]["views_per_visit"], 2.67);
    // 每篇文章：兩個語系合併，捲動照人數加權 (55×80 + 75×20) / 100，停留只有 80 人有資料；
    // 資料庫裡找不到的那篇略過
    assert_eq!(
        body["posts"],
        json!([{
            "id": 1, "slug": "1", "title": "公開文章", "visitors": 100,
            "scroll_depth": 59.0, "time_on_page": 40.0, "read_minutes": 1, "hearts": 0, "comments": 0,
        }])
    );
    assert_eq!(
        body["entries"],
        json!([{ "source": "Google", "visitors": 30, "entries": [
            { "name": "/blog/1", "visitors": 20 },
            { "name": "/", "visitors": 10 },
        ] }])
    );
    // 沒設服務帳號：搜尋字詞那塊回 configured: false，不算錯誤
    assert_eq!(body["search"]["configured"], false);
    // 期間是明確的日期（到昨天為止的 7 天）
    assert!(body["start"].as_str().is_some_and(|d| d.len() == 10));

    // 送出去的查詢：站台名、期間都要帶對；熱門頁面要把後台濾掉
    let sent: Vec<Value> = server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|r| r.url.path() == "/api/v2/query")
        .map(|r| serde_json::from_slice(&r.body).unwrap_or_default())
        .collect();
    assert_eq!(sent.len(), 9);
    let this_period = json!([body["start"], body["end"]]);
    assert!(sent.iter().all(|q| q["site_id"] == "example.test"));
    assert_eq!(
        sent.iter().filter(|q| q["date_range"] == this_period).count(),
        8,
        "除了上一段的總數，其他查詢都是這一段"
    );
    let pages = sent
        .iter()
        .find(|q| q["dimensions"][0] == "event:page" && q["filters"][0][0] == "contains_not")
        .cloned()
        .unwrap_or_default();
    assert_eq!(pages["filters"], json!([["contains_not", "event:page", ["/admin"]]]));
}

#[tokio::test]
async fn today_is_hourly_and_compares_with_yesterday_so_far() {
    unsafe { std::env::set_var("PLAUSIBLE_API_KEY", "test-key") };
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/api/v2/query")).respond_with(answer).mount(&server).await;
    let app = app_against(&server).await;

    let (status, body) =
        request(&app, "GET", "/api/admin/analytics?period=today", None, Some(&owner_token(true))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["period"], "today");
    assert_eq!(body["start"], body["end"], "start 與 end 都是今天");
    assert_eq!(
        body["series"],
        json!([
            { "date": "2026-10-29 00:00", "visitors": 0, "pageviews": 0 },
            { "date": "2026-10-29 01:00", "visitors": 4, "pageviews": 6 },
        ]),
        "小時粒度的格子要留住小時"
    );

    let sent: Vec<Value> = server
        .received_requests()
        .await
        .unwrap_or_default()
        .iter()
        .filter(|r| r.url.path() == "/api/v2/query")
        .map(|r| serde_json::from_slice(&r.body).unwrap_or_default())
        .collect();
    let today = body["start"].as_str().unwrap_or_default();
    let starts: Vec<&str> = sent.iter().filter_map(|q| q["date_range"][0].as_str()).collect();
    assert_eq!(
        starts.iter().filter(|s| **s == format!("{today}T00:00:00+08:00")).count(),
        8,
        "這一段從台北的午夜開始"
    );
    let yesterday = (chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d").unwrap_or_default()
        - chrono::TimeDelta::days(1))
    .to_string();
    let prev = sent
        .iter()
        .find(|q| q["date_range"][0].as_str().is_some_and(|s| s.starts_with(&yesterday)))
        .cloned()
        .unwrap_or_default();
    // 上一段停在昨天的同一個時刻，不是昨天整天
    assert_eq!(
        prev["date_range"][1].as_str().map(|s| &s[11..16]),
        sent.iter()
            .find(|q| q["dimensions"][0] == "time:hour")
            .and_then(|q| q["date_range"][1].as_str())
            .map(|s| &s[11..16])
    );
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
