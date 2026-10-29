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
/// 每篇文章那張表取幾篇
const POSTS_N: usize = 10;

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
    /// `today`、`3d`、`7d`、`30d`（預設）或 `6mo`
    pub period: Option<String>,
}

/// 期間 → (名稱, 天數, 走勢圖的時間粒度)。只收這幾種，其他一律當 30 天。
/// 天數 0 是「今天」：台北的午夜到現在，一小時一格。
/// 半年用週：一天一格的話 180 根柱子擠在一起，看不出起伏。
fn period_spec(period: Option<&str>) -> (&'static str, i64, &'static str) {
    match period {
        Some("today") => ("today", 0, "time:hour"),
        Some("3d") => ("3d", 3, "time:day"),
        Some("7d") => ("7d", 7, "time:day"),
        Some("6mo") => ("6mo", 182, "time:week"),
        _ => ("30d", 30, "time:day"),
    }
}

/// 這一段與上一段的日期（含頭含尾，`yyyy-MM-dd`）。這一段是到昨天為止的 N 天（跟 Plausible 的
/// `7d`／`30d` 一樣不含今天），上一段緊接在它前面、一樣長，用來算「比上一段多還是少」
fn date_ranges(days: i64, today: chrono::NaiveDate) -> ([String; 2], [String; 2]) {
    let day = |n: i64| (today - chrono::TimeDelta::days(n)).to_string();
    ([day(days), day(1)], [day(days * 2), day(days + 1)])
}

/// 「今天」這一段與上一段（帶時區的時間點）：今天午夜到現在，比的是昨天午夜到同一個時刻。
/// 拿整個昨天來比的話，白天看永遠是跌的。結束點寫到現在而不是今天結束，走勢圖才不會多出還沒到的那幾個小時
fn today_ranges(now: chrono::NaiveDateTime) -> ([String; 2], [String; 2]) {
    let at = |t: chrono::NaiveDateTime| format!("{}+08:00", t.format("%Y-%m-%dT%H:%M:%S"));
    let midnight = now.date().and_time(chrono::NaiveTime::MIN);
    let day = chrono::TimeDelta::days(1);
    ([at(midnight), at(now)], [at(midnight - day), at(now - day)])
}

/// 台北的現在（Plausible 站台設的時區）
fn now_taipei() -> chrono::NaiveDateTime {
    (chrono::Utc::now() + chrono::TimeDelta::hours(8)).naive_utc()
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
    /// 每次造訪平均看幾頁
    pub views_per_visit: f64,
}

/// 走勢圖的一格。`date` 是那一格的起點（`yyyy-MM-dd`，週粒度時是那週的第一天；
/// 小時粒度時是 `yyyy-MM-dd HH:mm`）
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

/// 一篇文章這段期間的表現。各語系的同一篇合在一起算；捲動與停留照人數加權平均
#[derive(Debug, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct PostPerf {
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    pub slug: String,
    pub title: String,
    #[specta(type = specta_typescript::Number)]
    pub visitors: i64,
    /// 平均捲到全文的幾成（0–100）：畫面底邊到過的最遠處 ÷ 頁高，跳到底部也算。資料不夠時是 null
    pub scroll_depth: Option<f64>,
    /// 平均停留，秒（分頁在背景的時間不算）。資料不夠時是 null
    pub time_on_page: Option<f64>,
    /// 讀完要幾分鐘（util::read_minutes，跟前台一樣）
    #[specta(type = specta_typescript::Number)]
    pub read_minutes: i64,
    /// 文章頁的 ❤️ 總數（不限期間）
    #[specta(type = specta_typescript::Number)]
    pub hearts: i64,
    /// 已核准的留言數（不限期間）
    #[specta(type = specta_typescript::Number)]
    pub comments: i64,
}

/// 一個來源與從它進站時先看的那幾頁
#[derive(Debug, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct SourceEntries {
    pub source: String,
    #[specta(type = specta_typescript::Number)]
    pub visitors: i64,
    pub entries: Vec<AnalyticsRow>,
}

#[derive(Debug, Default, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AnalyticsResponse {
    /// 後端有沒有設 `PLAUSIBLE_API_KEY`；沒設時其他欄位都是空的
    pub configured: bool,
    pub period: String,
    /// 這一段的日期（含頭含尾，`yyyy-MM-dd`）
    pub start: String,
    pub end: String,
    /// 最近五分鐘的訪客（Plausible 的 realtime）；查不到時是 null，不影響其他欄位
    #[specta(type = Option<specta_typescript::Number>)]
    pub realtime: Option<i64>,
    pub totals: AnalyticsTotals,
    /// 上一段（緊接在前、一樣長）的總數，算漲跌用
    pub previous: AnalyticsTotals,
    pub series: Vec<AnalyticsPoint>,
    /// 每篇文章（看的人最多的前幾篇）
    pub posts: Vec<PostPerf>,
    /// 前幾大來源，各帶從它進站時先看的那幾頁
    pub entries: Vec<SourceEntries>,
    /// Google 搜尋字詞（Search Console）
    pub search: crate::handlers::search_console::SearchTerms,
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
/// （visitors, visits, pageviews, bounce_rate, visit_duration, views_per_visit）
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
        views_per_visit: at(5).as_f64().unwrap_or(0.0),
    }
}

/// 網址裡的文章：`/blog/<slug 或 id>`，前面可以有語系（`/en/blog/…`）；不是文章頁回 None
fn post_key(path: &str) -> Option<String> {
    let mut segs = path.split(['?', '#']).next()?.split('/').filter(|s| !s.is_empty());
    let first = segs.next()?;
    let blog = if first == "blog" { first } else { segs.next()? };
    if blog != "blog" {
        return None;
    }
    let key = segs.next()?;
    segs.next().is_none().then(|| key.to_string())
}

/// 各頁的訪客、捲動、停留 → 每篇文章一列（各語系合併、照人數加權），看的人多的在前
fn merge_posts(body: &Value) -> Vec<(String, i64, Option<f64>, Option<f64>)> {
    // key → (訪客, 捲動×人數, 有捲動資料的人數, 停留×人數, 有停留資料的人數)
    let mut acc: Vec<(String, i64, f64, i64, f64, i64)> = Vec::new();
    for r in results(body) {
        let Some(key) = r["dimensions"][0].as_str().and_then(post_key) else { continue };
        let m = &r["metrics"];
        let v = int(&m[0]);
        let i = acc.iter().position(|a| a.0 == key).unwrap_or_else(|| {
            acc.push((key, 0, 0.0, 0, 0.0, 0));
            acc.len() - 1
        });
        let a = &mut acc[i];
        a.1 += v;
        #[allow(clippy::cast_precision_loss, reason = "訪客數遠小於 2^52")]
        if let Some(sd) = m[1].as_f64() {
            a.2 += sd * v as f64;
            a.3 += v;
        }
        #[allow(clippy::cast_precision_loss, reason = "訪客數遠小於 2^52")]
        if let Some(t) = m[2].as_f64() {
            a.4 += t * v as f64;
            a.5 += v;
        }
    }
    acc.sort_by_key(|a| std::cmp::Reverse(a.1));
    #[allow(clippy::cast_precision_loss, reason = "訪客數遠小於 2^52")]
    let avg = |sum: f64, n: i64| (n > 0).then(|| (sum / n as f64 * 10.0).round() / 10.0);
    acc.into_iter().map(|(k, v, sd, sdn, t, tn)| (k, v, avg(sd, sdn), avg(t, tn))).collect()
}

/// 來源 × 進站頁 → 前 `top` 個來源（照 `sources` 的順序），每個帶前 `per` 個進站頁
fn group_entries(sources: &[AnalyticsRow], body: &Value, top: usize, per: usize) -> Vec<SourceEntries> {
    sources
        .iter()
        .take(top)
        .map(|s| SourceEntries {
            source: s.name.clone(),
            visitors: s.visitors,
            entries: results(body)
                .iter()
                .filter(|r| r["dimensions"][0].as_str() == Some(s.name.as_str()))
                .take(per)
                .map(|r| AnalyticsRow {
                    name: r["dimensions"][1].as_str().unwrap_or_default().to_string(),
                    visitors: int(&r["metrics"][0]),
                })
                .collect(),
        })
        .collect()
}

/// 每篇文章補上標題、閱讀時間、愛心與留言（資料庫裡找不到的那篇——改過網址又沒留舊網址——略過）
async fn posts_from(state: &AppState, merged: Vec<(String, i64, Option<f64>, Option<f64>)>) -> Vec<PostPerf> {
    let mut out = Vec::new();
    for (key, visitors, scroll_depth, time_on_page) in merged.into_iter().take(POSTS_N) {
        let row: Option<(i64, Option<String>, String, String)> = sqlx::query_as(
            "SELECT id, slug, title, content FROM posts WHERE slug = ? OR CAST(id AS TEXT) = ? LIMIT 1",
        )
        .bind(&key)
        .bind(&key)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();
        let Some((id, slug, title, content)) = row else { continue };
        let hearts: i64 = sqlx::query_scalar(
            "SELECT COALESCE((SELECT count FROM post_reactions WHERE post_id = ? AND emoji = '❤️'), 0)",
        )
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
        let comments: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM comments WHERE post_id = ? AND status = 'approved'")
                .bind(id)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0);
        out.push(PostPerf {
            id,
            slug: slug.unwrap_or(key),
            title,
            visitors,
            scroll_depth,
            time_on_page,
            read_minutes: crate::util::read_minutes(&content),
            hearts,
            comments,
        });
    }
    out
}

/// 走勢：結果只有「有資料的那幾格」，沒人來的日子不會出現。
/// 有 `meta.time_labels`（請求帶 include.time_labels）就照它補成連續的格子，空的補 0；
/// 舊版 Plausible 不認得那個選項的話退回只畫有資料的格子。
fn series_from(body: &Value, hourly: bool) -> Vec<AnalyticsPoint> {
    let point = |r: &Value| {
        let m = r["metrics"].as_array();
        let at = |i: usize| m.and_then(|m| m.get(i)).unwrap_or(&Value::Null);
        AnalyticsPoint {
            date: bucket_of(r["dimensions"][0].as_str().unwrap_or_default(), hourly),
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
            let date = bucket_of(label, hourly);
            rows.iter().find(|p| p.date == date).map_or(
                AnalyticsPoint { date, visitors: 0, pageviews: 0 },
                |p| AnalyticsPoint { date: p.date.clone(), visitors: p.visitors, pageviews: p.pageviews },
            )
        })
        .collect()
}

/// 時間格的標籤只留日期：`time:day` 回 `2026-10-26`，有些版本或粒度會帶時間。
/// 小時粒度留到分（`2026-10-26 14:00`），不然一天的 24 格會全部變成同一天
fn bucket_of(label: &str, hourly: bool) -> String {
    label.get(..if hourly { 16 } else { 10 }).unwrap_or(label).to_string()
}

/// 排行：dimensions 第一個是名字，metrics 第一個是訪客數。
/// 查不到國家的訪客（區網裡連進來的，nginx 看到的是路由器的私有 IP）Plausible 存成兩個 NUL
/// （ClickHouse 的 `FixedString(2)`），API 原樣回出來；去掉之後是空字串，前端顯示成「不明」
fn rows_from(body: &Value) -> Vec<AnalyticsRow> {
    results(body)
        .iter()
        .map(|r| AnalyticsRow {
            name: r["dimensions"][0].as_str().unwrap_or_default().trim_matches('\0').to_string(),
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
    let (period, days, bucket) = period_spec(q.period.as_deref());
    let now = now_taipei();
    let (range, prev_range, start, end) = if days == 0 {
        let (now_range, prev) = today_ranges(now);
        let today = now.date().to_string();
        (json!(now_range), json!(prev), today.clone(), today)
    } else {
        let ([start, end], prev) = date_ranges(days, now.date());
        (json!([start, end]), json!(prev), start, end)
    };
    let site = site_id();
    let dashboard_url = format!("{}/{site}", state.external.plausible);
    let Some(key) = api_key() else {
        return Json(AnalyticsResponse {
            period: period.into(),
            start,
            end,
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
    let totals_body = |range: Value| {
        json!({
            "site_id": site,
            "date_range": range,
            "metrics": ["visitors", "visits", "pageviews", "bounce_rate", "visit_duration", "views_per_visit"],
        })
    };

    let (
        totals,
        previous,
        series,
        pages,
        sources,
        countries,
        devices,
        post_pages,
        source_entry,
        live,
        search,
    ) = tokio::join!(
        query(&state, &key, totals_body(range.clone())),
        query(&state, &key, totals_body(prev_range)),
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
        // 文章頁的捲動與停留：各語系分開回，下面合併（一篇最多五個語系，取 300 列夠用）
        query(
            &state,
            &key,
            json!({
                "site_id": site,
                "date_range": range,
                "metrics": ["visitors", "scroll_depth", "time_on_page"],
                "dimensions": ["event:page"],
                "filters": [["contains", "event:page", ["/blog/"]]],
                "order_by": [["visitors", "desc"]],
                "pagination": { "limit": 300 },
            }),
        ),
        query(
            &state,
            &key,
            json!({
                "site_id": site,
                "date_range": range,
                "metrics": ["visitors"],
                "dimensions": ["visit:source", "visit:entry_page"],
                "order_by": [["visitors", "desc"]],
                "pagination": { "limit": 100 },
            }),
        ),
        realtime(&state, &key, &site),
        crate::handlers::search_console::top_queries(&state, &start, &end, 15),
    );

    // 任一個查詢失敗多半是同一個原因（key 錯、site_id 錯、Plausible 掛了），回第一個就夠
    let results = [totals, previous, series, pages, sources, countries, devices, post_pages, source_entry];
    if let Some(error) = results.iter().find_map(|r| r.as_ref().err()) {
        tracing::warn!(%error, "Plausible 查詢失敗");
        return (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response();
    }
    let [totals, previous, series, pages, sources, countries, devices, post_pages, source_entry] =
        results.map(Result::unwrap_or_default);
    let sources = rows_from(&sources);

    Json(AnalyticsResponse {
        configured: true,
        period: period.into(),
        start,
        end,
        realtime: live,
        totals: totals_from(&totals),
        previous: totals_from(&previous),
        series: series_from(&series, bucket == "time:hour"),
        posts: posts_from(&state, merge_posts(&post_pages)).await,
        entries: group_entries(&sources, &source_entry, 4, 5),
        search,
        pages: rows_from(&pages),
        sources,
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
        assert_eq!(period_spec(Some("today")), ("today", 0, "time:hour"));
        assert_eq!(period_spec(Some("3d")), ("3d", 3, "time:day"));
        assert_eq!(period_spec(Some("7d")), ("7d", 7, "time:day"));
        assert_eq!(period_spec(Some("6mo")), ("6mo", 182, "time:week"));
        assert_eq!(period_spec(Some("all")), ("30d", 30, "time:day"));
        assert_eq!(period_spec(None), ("30d", 30, "time:day"));
    }

    #[test]
    fn totals_follow_requested_metric_order() {
        let body = json!({ "results": [{ "metrics": [12, 15, 40, 61.5, 93, 2.7], "dimensions": [] }] });
        assert_eq!(
            totals_from(&body),
            AnalyticsTotals {
                visitors: 12,
                visits: 15,
                pageviews: 40,
                bounce_rate: 61.5,
                visit_duration: 93.0,
                views_per_visit: 2.7,
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
        let s = series_from(&body, false);
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
            series_from(&body, false),
            [AnalyticsPoint { date: "2026-10-25".into(), visitors: 1, pageviews: 2 }]
        );
    }

    #[test]
    fn hourly_series_keeps_the_hour() {
        let body = json!({
            "results": [{ "metrics": [4, 6], "dimensions": ["2026-10-29 01:00:00"] }],
            "meta": { "time_labels": ["2026-10-29 00:00:00", "2026-10-29 01:00:00"] },
        });
        assert_eq!(
            series_from(&body, true),
            [
                AnalyticsPoint { date: "2026-10-29 00:00".into(), visitors: 0, pageviews: 0 },
                AnalyticsPoint { date: "2026-10-29 01:00".into(), visitors: 4, pageviews: 6 },
            ]
        );
    }

    #[test]
    fn today_compares_with_yesterday_up_to_the_same_time() {
        let now = chrono::NaiveDate::from_ymd_opt(2026, 11, 1)
            .and_then(|d| d.and_hms_opt(13, 5, 9))
            .expect("合法時間");
        let (now_range, prev) = today_ranges(now);
        assert_eq!(
            now_range,
            ["2026-11-01T00:00:00+08:00".to_string(), "2026-11-01T13:05:09+08:00".to_string()]
        );
        assert_eq!(
            prev,
            ["2026-10-31T00:00:00+08:00".to_string(), "2026-10-31T13:05:09+08:00".to_string()],
            "跨月"
        );
    }

    #[test]
    fn date_ranges_end_yesterday_and_previous_is_right_before() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 28).expect("合法日期");
        let (now, prev) = date_ranges(7, today);
        assert_eq!(now, ["2026-10-21".to_string(), "2026-10-27".to_string()]);
        assert_eq!(prev, ["2026-10-14".to_string(), "2026-10-20".to_string()]);
        let (now, prev) = date_ranges(30, today);
        assert_eq!(now, ["2026-09-28".to_string(), "2026-10-27".to_string()], "跨月");
        assert_eq!(prev, ["2026-08-29".to_string(), "2026-09-27".to_string()]);
    }

    #[test]
    fn post_key_reads_article_paths_in_every_locale() {
        assert_eq!(post_key("/blog/zed").as_deref(), Some("zed"));
        assert_eq!(post_key("/zh-cn/blog/zed").as_deref(), Some("zed"));
        assert_eq!(post_key("/en/blog/77?ref=x").as_deref(), Some("77"));
        assert_eq!(post_key("/blog"), None, "列表不是文章");
        assert_eq!(post_key("/zh-cn/blog/"), None);
        assert_eq!(post_key("/about"), None);
        assert_eq!(post_key("/blog/zed/extra"), None);
    }

    #[test]
    fn merge_posts_combines_locales_weighted_by_visitors() {
        let body = json!({ "results": [
            { "metrics": [100, 40, 20], "dimensions": ["/zh-cn/blog/a"] },
            { "metrics": [300, 60, 60], "dimensions": ["/blog/b"] },
            { "metrics": [100, 80, null], "dimensions": ["/en/blog/a"] },
            { "metrics": [50, null, null], "dimensions": ["/blog"] },
        ] });
        assert_eq!(
            merge_posts(&body),
            vec![
                ("b".into(), 300, Some(60.0), Some(60.0)),
                // 捲動：(40×100 + 80×100) / 200；停留只有中文那 100 人有資料
                ("a".into(), 200, Some(60.0), Some(20.0)),
            ]
        );
    }

    #[test]
    fn group_entries_follows_source_order() {
        let sources = vec![
            AnalyticsRow { name: "Twitter".into(), visitors: 30 },
            AnalyticsRow { name: "Google".into(), visitors: 5 },
        ];
        let body = json!({ "results": [
            { "metrics": [20], "dimensions": ["Twitter", "/zh-cn"] },
            { "metrics": [4], "dimensions": ["Google", "/blog/a"] },
            { "metrics": [10], "dimensions": ["Twitter", "/en"] },
            { "metrics": [1], "dimensions": ["Bing", "/"] },
        ] });
        let g = group_entries(&sources, &body, 4, 1);
        assert_eq!(g.len(), 2);
        assert_eq!((g[0].source.as_str(), g[0].visitors), ("Twitter", 30));
        assert_eq!(
            g[0].entries,
            vec![AnalyticsRow { name: "/zh-cn".into(), visitors: 20 }],
            "每個來源只取前 per 個"
        );
        assert_eq!(g[1].entries, vec![AnalyticsRow { name: "/blog/a".into(), visitors: 4 }]);
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

    #[test]
    fn 查不到國家的那兩個_nul_變成空字串() {
        // 實際的樣子：區網連進來的訪客沒有國家，Plausible 回 "\u0000\u0000"。
        // 原樣送到前端的話不是空字串，Intl.DisplayNames 拿到它會丟 RangeError，整個流量頁掛掉
        let body = json!({ "results": [
            { "metrics": [9], "dimensions": ["\u{0}\u{0}"] },
            { "metrics": [3], "dimensions": ["TW"] },
        ] });
        assert_eq!(
            rows_from(&body),
            [
                AnalyticsRow { name: String::new(), visitors: 9 },
                AnalyticsRow { name: "TW".into(), visitors: 3 }
            ]
        );
    }
}
