//! 後台的「流量」頁：代理自架 Plausible 的 Stats API。
//!
//! 為什麼走後端而不是讓後台直接打 Plausible：
//!   1. **API key 只能留在後端。** 那把 key 能讀整個站的統計，放進前端 bundle 等於公開。
//!   2. **CSP 的 `connect-src` 維持 `'self'`**（同 report_tunnel.rs 的理由）。
//!   3. Plausible 的「Embed dashboard」要一條沒有密碼的分享連結才嵌得進來——拿到網址的人
//!      都看得到，而且外觀是 Plausible 自己的，跟後台不搭。
//!
//! 設定（`.env.backend`）：
//!   - `PLAUSIBLE_API_KEY`：Plausible 的 Account Settings → API Keys 建一把 Stats API key。
//!     沒設的話端點回 `configured: false`，後台顯示怎麼設，不算錯誤。
//!   - `PLAUSIBLE_SITE_ID`：選填，預設 `koimsurai.com`（Plausible 裡的站台名稱）。
//!
//! 一頁要的東西拆成六個查詢平行打（總數、走勢、熱門頁面、來源、國家、裝置），
//! 外加 v1 的即時人數。Stats API v2 一個查詢只能有一組 dimensions，所以沒辦法併成一個。

use std::time::Duration;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::state::AppState;

/// 單一查詢的逾時。Plausible 掛掉時後台頁面不該一直轉圈
const TIMEOUT: Duration = Duration::from_secs(10);
/// 熱門頁面、來源那幾張表各取幾列
const TOP_N: u64 = 10;

fn api_key() -> Option<String> {
    std::env::var("PLAUSIBLE_API_KEY").ok().filter(|s| !s.trim().is_empty())
}

fn site_id() -> String {
    std::env::var("PLAUSIBLE_SITE_ID")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "koimsurai.com".into())
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct AnalyticsQuery {
    /// `7d`、`30d`（預設）或 `6mo`
    pub period: Option<String>,
}

/// 期間 → (Plausible 的 date_range, 走勢圖的時間粒度)。只收這三種，其他一律當 30 天。
/// 半年用週：一天一格的話 180 根柱子擠在一起，看不出起伏。
fn period_spec(period: Option<&str>) -> (&'static str, &'static str) {
    match period {
        Some("7d") => ("7d", "time:day"),
        Some("6mo") => ("6mo", "time:week"),
        _ => ("30d", "time:day"),
    }
}

#[derive(Debug, Default, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct AnalyticsTotals {
    #[specta(type = specta_typescript::Number)]
    pub visitors: i64,
    #[specta(type = specta_typescript::Number)]
    pub visits: i64,
    #[specta(type = specta_typescript::Number)]
    pub pageviews: i64,
    /// 跳出率，百分比（0–100）
    pub bounce_rate: f64,
    /// 平均停留，秒
    pub visit_duration: f64,
}

/// 走勢圖的一格。`date` 是那一格的起點（`yyyy-MM-dd`，週粒度時是那週的第一天）
#[derive(Debug, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct AnalyticsPoint {
    pub date: String,
    #[specta(type = specta_typescript::Number)]
    pub visitors: i64,
    #[specta(type = specta_typescript::Number)]
    pub pageviews: i64,
}

/// 排行表的一列：名字（頁面路徑、來源、國碼、裝置）與訪客數
#[derive(Debug, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct AnalyticsRow {
    pub name: String,
    #[specta(type = specta_typescript::Number)]
    pub visitors: i64,
}

#[derive(Debug, Default, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AnalyticsResponse {
    /// 後端有沒有設 `PLAUSIBLE_API_KEY`；沒設時其他欄位都是空的
    pub configured: bool,
    pub period: String,
    /// 最近五分鐘的訪客（Plausible 的 realtime）；查不到時是 null，不影響其他欄位
    #[specta(type = Option<specta_typescript::Number>)]
    pub realtime: Option<i64>,
    pub totals: AnalyticsTotals,
    pub series: Vec<AnalyticsPoint>,
    pub pages: Vec<AnalyticsRow>,
    pub sources: Vec<AnalyticsRow>,
    /// 國家是 ISO 3166-1 alpha-2 國碼，前端用 `Intl.DisplayNames` 翻成中文
    pub countries: Vec<AnalyticsRow>,
    pub devices: Vec<AnalyticsRow>,
    /// 「在 Plausible 打開」的連結
    pub dashboard_url: String,
}

fn int(v: &Value) -> i64 {
    // 計數是整數，但保險起見浮點數也收（四捨五入）
    #[allow(clippy::cast_possible_truncation, reason = "訪客數遠小於 2^53，不會截斷")]
    v.as_i64().unwrap_or_else(|| v.as_f64().map_or(0, |f| f.round() as i64))
}

fn results(body: &Value) -> &[Value] {
    body["results"].as_array().map_or(&[], Vec::as_slice)
}

/// 總數那個查詢：沒有 dimensions，只有一列，metrics 照請求的順序
/// （visitors, visits, pageviews, bounce_rate, visit_duration）
fn totals_from(body: &Value) -> AnalyticsTotals {
    let Some(m) = results(body).first().and_then(|r| r["metrics"].as_array()) else {
        return AnalyticsTotals::default();
    };
    let at = |i: usize| m.get(i).unwrap_or(&Value::Null);
    AnalyticsTotals {
        visitors: int(at(0)),
        visits: int(at(1)),
        pageviews: int(at(2)),
        bounce_rate: at(3).as_f64().unwrap_or(0.0),
        visit_duration: at(4).as_f64().unwrap_or(0.0),
    }
}

/// 走勢：結果只有「有資料的那幾格」，沒人來的日子不會出現。
/// 有 `meta.time_labels`（請求帶 include.time_labels）就照它補成連續的格子，空的補 0；
/// 舊版 Plausible 不認得那個選項的話退回只畫有資料的格子。
fn series_from(body: &Value) -> Vec<AnalyticsPoint> {
    let point = |r: &Value| {
        let m = r["metrics"].as_array();
        let at = |i: usize| m.and_then(|m| m.get(i)).unwrap_or(&Value::Null);
        AnalyticsPoint {
            date: day_of(r["dimensions"][0].as_str().unwrap_or_default()),
            visitors: int(at(0)),
            pageviews: int(at(1)),
        }
    };
    let rows: Vec<AnalyticsPoint> = results(body).iter().map(point).collect();
    let Some(labels) = body["meta"]["time_labels"].as_array() else { return rows };
    labels
        .iter()
        .filter_map(Value::as_str)
        .map(|label| {
            let date = day_of(label);
            rows.iter().find(|p| p.date == date).map_or(
                AnalyticsPoint { date, visitors: 0, pageviews: 0 },
                |p| AnalyticsPoint { date: p.date.clone(), visitors: p.visitors, pageviews: p.pageviews },
            )
        })
        .collect()
}

/// 時間格的標籤只留日期：`time:day` 回 `2026-10-26`，有些版本或粒度會帶時間
fn day_of(label: &str) -> String {
    label.get(..10).unwrap_or(label).to_string()
}

/// 排行：dimensions 第一個是名字，metrics 第一個是訪客數
fn rows_from(body: &Value) -> Vec<AnalyticsRow> {
    results(body)
        .iter()
        .map(|r| AnalyticsRow {
            name: r["dimensions"][0].as_str().unwrap_or_default().to_string(),
            visitors: int(&r["metrics"][0]),
        })
        .collect()
}

/// 打一個 v2 查詢。失敗時回人看得懂的一句話（會原樣顯示在後台）
async fn query(state: &AppState, key: &str, body: Value) -> Result<Value, String> {
    let resp = state
        .http
        .post(format!("{}/api/v2/query", state.external.plausible))
        .bearer_auth(key)
        .timeout(TIMEOUT)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("連不到 Plausible：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        // Plausible 的錯誤訊息很具體（key 不對、site_id 不對、參數不認得），帶回去給站長看
        let text = resp.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["error"].as_str().map(str::to_string))
            .unwrap_or_else(|| text.chars().take(200).collect());
        return Err(format!("Plausible 回了 {status}：{detail}"));
    }
    resp.json::<Value>().await.map_err(|e| format!("Plausible 的回應讀不懂：{e}"))
}

/// v1 的即時人數（v2 沒有對應的查詢）。回應本體就是一個數字
async fn realtime(state: &AppState, key: &str, site: &str) -> Option<i64> {
    let resp = state
        .http
        .get(format!("{}/api/v1/stats/realtime/visitors", state.external.plausible))
        .query(&[("site_id", site)])
        .bearer_auth(key)
        .timeout(TIMEOUT)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.text().await.ok()?.trim().parse().ok()
}

/// `GET /api/admin/analytics?period=30d` —— requireAdmin。
#[utoipa::path(get, path = "/api/admin/analytics", tag = "admin", security(("bearer" = [])),
    params(AnalyticsQuery),
    responses(
        (status = 200, body = AnalyticsResponse),
        (status = 401, description = "未授權"),
        (status = 502, description = "Plausible 查詢失敗（error 欄位是原因）"),
    ))]
pub async fn admin_analytics(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    Query(q): Query<AnalyticsQuery>,
) -> Response {
    let (range, bucket) = period_spec(q.period.as_deref());
    let site = site_id();
    let dashboard_url = format!("{}/{site}", state.external.plausible);
    let Some(key) = api_key() else {
        return Json(AnalyticsResponse {
            period: range.into(),
            dashboard_url,
            ..AnalyticsResponse::default()
        })
        .into_response();
    };

    let top = |dimension: &str, extra: Value| {
        let mut body = json!({
            "site_id": site,
            "date_range": range,
            "metrics": ["visitors"],
            "dimensions": [dimension],
            "order_by": [["visitors", "desc"]],
            "pagination": { "limit": TOP_N },
        });
        if let (Some(b), Some(e)) = (body.as_object_mut(), extra.as_object()) {
            b.extend(e.clone());
        }
        body
    };

    let (totals, series, pages, sources, countries, devices, live) = tokio::join!(
        query(
            &state,
            &key,
            json!({
                "site_id": site,
                "date_range": range,
                "metrics": ["visitors", "visits", "pageviews", "bounce_rate", "visit_duration"],
            }),
        ),
        query(
            &state,
            &key,
            json!({
                "site_id": site,
                "date_range": range,
                "metrics": ["visitors", "pageviews"],
                "dimensions": [bucket],
                "include": { "time_labels": true },
            }),
        ),
        // 後台不是讀者會看的頁面：以前的紀錄裡有站長自己逛後台的瀏覽，排行裡濾掉
        query(
            &state,
            &key,
            top("event:page", json!({ "filters": [["contains_not", "event:page", ["/admin"]]] }))
        ),
        query(&state, &key, top("visit:source", json!({}))),
        query(&state, &key, top("visit:country", json!({}))),
        query(&state, &key, top("visit:device", json!({}))),
        realtime(&state, &key, &site),
    );

    // 任一個查詢失敗多半是同一個原因（key 錯、site_id 錯、Plausible 掛了），回第一個就夠
    let (totals, series, pages, sources, countries, devices) =
        match (totals, series, pages, sources, countries, devices) {
            (Ok(a), Ok(b), Ok(c), Ok(d), Ok(e), Ok(f)) => (a, b, c, d, e, f),
            (a, b, c, d, e, f) => {
                let error = [a, b, c, d, e, f].into_iter().find_map(Result::err).unwrap_or_default();
                tracing::warn!(%error, "Plausible 查詢失敗");
                return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response();
            }
        };

    Json(AnalyticsResponse {
        configured: true,
        period: range.into(),
        realtime: live,
        totals: totals_from(&totals),
        series: series_from(&series),
        pages: rows_from(&pages),
        sources: rows_from(&sources),
        countries: rows_from(&countries),
        devices: rows_from(&devices),
        dashboard_url,
    })
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn period_falls_back_to_30_days() {
        assert_eq!(period_spec(Some("7d")), ("7d", "time:day"));
        assert_eq!(period_spec(Some("6mo")), ("6mo", "time:week"));
        assert_eq!(period_spec(Some("all")), ("30d", "time:day"));
        assert_eq!(period_spec(None), ("30d", "time:day"));
    }

    #[test]
    fn totals_follow_requested_metric_order() {
        let body = json!({ "results": [{ "metrics": [12, 15, 40, 61.5, 93], "dimensions": [] }] });
        assert_eq!(
            totals_from(&body),
            AnalyticsTotals {
                visitors: 12,
                visits: 15,
                pageviews: 40,
                bounce_rate: 61.5,
                visit_duration: 93.0
            }
        );
        assert_eq!(totals_from(&json!({ "results": [] })), AnalyticsTotals::default());
    }

    #[test]
    fn series_fills_empty_days_from_time_labels() {
        let body = json!({
            "results": [{ "metrics": [3, 5], "dimensions": ["2026-10-25"] }],
            "meta": { "time_labels": ["2026-10-24", "2026-10-25", "2026-10-26"] },
        });
        let s = series_from(&body);
        assert_eq!(
            s.iter().map(|p| p.date.as_str()).collect::<Vec<_>>(),
            ["2026-10-24", "2026-10-25", "2026-10-26"]
        );
        assert_eq!(s.iter().map(|p| p.visitors).collect::<Vec<_>>(), [0, 3, 0]);
        assert_eq!(s[1].pageviews, 5);
    }

    #[test]
    fn series_without_time_labels_keeps_returned_rows() {
        let body = json!({ "results": [{ "metrics": [1, 2], "dimensions": ["2026-10-25 00:00:00"] }] });
        assert_eq!(
            series_from(&body),
            [AnalyticsPoint { date: "2026-10-25".into(), visitors: 1, pageviews: 2 }]
        );
    }

    #[test]
    fn rows_take_first_dimension_and_metric() {
        let body = json!({ "results": [
            { "metrics": [9], "dimensions": ["/blog/a"] },
            { "metrics": [4.0], "dimensions": ["/"] },
        ] });
        assert_eq!(
            rows_from(&body),
            [
                AnalyticsRow { name: "/blog/a".into(), visitors: 9 },
                AnalyticsRow { name: "/".into(), visitors: 4 }
            ]
        );
    }
}
