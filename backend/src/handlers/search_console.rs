//! Google Search Console：讀者在 Google 搜了什麼才點進來（後台「流量」頁用）。
//!
//! 用服務帳號（service account）認證，不是 OAuth 登入：後端在背景跑，沒有人能按「允許」。
//! 服務帳號要先在 Search Console 的「使用者和權限」加成使用者（唯讀就夠）。
//!
//! 設定（`.env.backend` 與 docker-compose）：
//!   - `GSC_SERVICE_ACCOUNT_FILE`：服務帳號 JSON 金鑰檔在容器裡的路徑（compose 以唯讀掛進來）。
//!     沒設的話回 `configured: false`，後台顯示怎麼設，不算錯誤。
//!   - `GSC_SITE`：選填，預設 `sc-domain:<SITE_URL 的 host>`（網域資源）。
//!
//! 換來的存取權杖一小時有效，快取在記憶體裡，到期前一分鐘才重換。

use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::state::AppState;

const TIMEOUT: Duration = Duration::from_secs(10);
const SCOPE: &str = "https://www.googleapis.com/auth/webmasters.readonly";

/// 存取權杖與它什麼時候到期
static TOKEN: Mutex<Option<(String, Instant)>> = Mutex::new(None);

fn key_file() -> Option<String> {
    std::env::var("GSC_SERVICE_ACCOUNT_FILE").ok().filter(|s| !s.trim().is_empty())
}

fn site() -> String {
    std::env::var("GSC_SITE")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("sc-domain:{}", crate::identity::site_host()))
}

#[derive(Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
    #[serde(default = "default_token_uri")]
    token_uri: String,
}

fn default_token_uri() -> String {
    "https://oauth2.googleapis.com/token".into()
}

#[derive(Serialize)]
struct Claims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    iat: i64,
    exp: i64,
}

/// 拿一把能用的存取權杖：快取裡的還沒到期就用它，否則用服務帳號簽一張 JWT 去換
async fn token(state: &AppState, file: &str) -> Result<String, String> {
    if let Some((t, until)) = TOKEN.lock().as_ref()
        && Instant::now() < *until
    {
        return Ok(t.clone());
    }
    let raw = tokio::fs::read_to_string(file).await.map_err(|e| format!("讀不到服務帳號金鑰檔：{e}"))?;
    let sa: ServiceAccount =
        serde_json::from_str(&raw).map_err(|e| format!("服務帳號金鑰檔格式不對：{e}"))?;
    let now = crate::util::now_secs();
    let claims =
        Claims { iss: &sa.client_email, scope: SCOPE, aud: &sa.token_uri, iat: now, exp: now + 3600 };
    let key = jsonwebtoken::EncodingKey::from_rsa_pem(sa.private_key.as_bytes())
        .map_err(|e| format!("服務帳號的私鑰讀不懂：{e}"))?;
    let jwt = jsonwebtoken::encode(&jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256), &claims, &key)
        .map_err(|e| format!("簽 JWT 失敗：{e}"))?;
    let resp = state
        .http
        .post(&sa.token_uri)
        .timeout(TIMEOUT)
        .form(&[("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"), ("assertion", jwt.as_str())])
        .send()
        .await
        .map_err(|e| format!("連不到 Google：{e}"))?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| format!("Google 的回應讀不懂：{e}"))?;
    let Some(access) = body["access_token"].as_str() else {
        return Err(format!(
            "Google 不給權杖（{status}）：{}",
            body["error_description"].as_str().unwrap_or("")
        ));
    };
    let ttl = body["expires_in"].as_u64().unwrap_or(3600).saturating_sub(60);
    *TOKEN.lock() = Some((access.to_string(), Instant::now() + Duration::from_secs(ttl)));
    Ok(access.to_string())
}

/// 一個搜尋字詞：點了幾次、出現幾次、點擊率（0–1）、平均排名
#[derive(Debug, Serialize, PartialEq, specta::Type, utoipa::ToSchema)]
pub struct SearchQueryRow {
    pub query: String,
    #[specta(type = specta_typescript::Number)]
    pub clicks: i64,
    #[specta(type = specta_typescript::Number)]
    pub impressions: i64,
    pub ctr: f64,
    pub position: f64,
}

#[derive(Debug, Default, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SearchTerms {
    /// 後端有沒有設 `GSC_SERVICE_ACCOUNT_FILE`
    pub configured: bool,
    /// 查詢失敗的原因；成功是 null
    pub error: Option<String>,
    pub queries: Vec<SearchQueryRow>,
}

fn rows_from(body: &Value) -> Vec<SearchQueryRow> {
    #[allow(clippy::cast_possible_truncation, reason = "點擊與曝光數遠小於 2^53")]
    let int = |v: &Value| v.as_f64().map_or(0, |f| f.round() as i64);
    body["rows"]
        .as_array()
        .map(|rows| {
            rows.iter()
                .map(|r| SearchQueryRow {
                    query: r["keys"][0].as_str().unwrap_or_default().to_string(),
                    clicks: int(&r["clicks"]),
                    impressions: int(&r["impressions"]),
                    ctr: r["ctr"].as_f64().unwrap_or(0.0),
                    position: r["position"].as_f64().unwrap_or(0.0),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// 期間內的熱門搜尋字詞（照點擊數排）。日期是 `yyyy-MM-dd`；Google 的資料大約晚兩三天
pub async fn top_queries(state: &AppState, start: &str, end: &str, limit: u32) -> SearchTerms {
    let Some(file) = key_file() else {
        return SearchTerms::default();
    };
    let result = async {
        let token = token(state, &file).await?;
        // 網域資源是 `sc-domain:…`，要當成一段路徑編碼（冒號、斜線都得逸出）
        let mut url = reqwest::Url::parse("https://www.googleapis.com/webmasters/v3/sites/")
            .map_err(|e| format!("Search Console 的網址組不起來：{e}"))?;
        url.path_segments_mut()
            .map_err(|()| "Search Console 的網址組不起來".to_string())?
            .pop_if_empty()
            .push(&site())
            .push("searchAnalytics")
            .push("query");
        let resp = state
            .http
            .post(url)
            .bearer_auth(token)
            .timeout(TIMEOUT)
            .json(&json!({ "startDate": start, "endDate": end, "dimensions": ["query"], "rowLimit": limit }))
            .send()
            .await
            .map_err(|e| format!("連不到 Search Console：{e}"))?;
        let status = resp.status();
        let body: Value = resp.json().await.map_err(|e| format!("Search Console 的回應讀不懂：{e}"))?;
        if !status.is_success() {
            return Err(format!(
                "Search Console 回了 {status}：{}",
                body["error"]["message"].as_str().unwrap_or("")
            ));
        }
        Ok(rows_from(&body))
    }
    .await;
    match result {
        Ok(queries) => SearchTerms { configured: true, error: None, queries },
        Err(error) => {
            tracing::warn!(%error, "Search Console 查詢失敗");
            SearchTerms { configured: true, error: Some(error), queries: Vec::new() }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_query_rows() {
        let body = json!({ "rows": [
            { "keys": ["frigate furbo"], "clicks": 12.0, "impressions": 340.0, "ctr": 0.035, "position": 6.2 },
            { "keys": ["zed 編輯器"], "clicks": 0.0, "impressions": 15.0, "ctr": 0.0, "position": 21.0 },
        ]});
        assert_eq!(
            rows_from(&body),
            vec![
                SearchQueryRow {
                    query: "frigate furbo".into(),
                    clicks: 12,
                    impressions: 340,
                    ctr: 0.035,
                    position: 6.2
                },
                SearchQueryRow {
                    query: "zed 編輯器".into(),
                    clicks: 0,
                    impressions: 15,
                    ctr: 0.0,
                    position: 21.0
                },
            ]
        );
        assert!(rows_from(&json!({})).is_empty(), "沒有資料時 Google 不回 rows");
    }
}
