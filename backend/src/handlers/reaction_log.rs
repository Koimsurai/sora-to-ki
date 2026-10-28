//! 愛心與反應的事件紀錄（migration 0029 的 `reaction_events`）。
//!
//! 前台的計數器（`post_reactions.count`、`comments.likes`、`thoughts.likes`…）照舊是顯示的數字；
//! 這裡另外把每一次按下、收回記一筆，後台才看得到「什麼時候、哪一篇、讀者從哪裡來」。
//!
//! 不記身分：沒有 IP、沒有 User-Agent 原文。脈絡只留這幾樣：
//!   - 國家：Cloudflare 的 `CF-IPCountry`（nginx 的 `/api/` 照原樣轉過來）
//!   - 來源網站：前台在 `X-Visit-Referrer` 帶這次是從哪個網站連進來的（只有主機名）
//!   - 語系：前台在 `X-Visit-Locale` 帶讀者當時在哪個語系
//!   - 手機或電腦：看 User-Agent 判斷，只留結論
//!
//! 寫紀錄失敗不影響那次按讚：記一行 warn 就算了，讀者那邊照常 +1。

use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{error::AppError, state::AppState};

/// 語系白名單（跟前台 `src/lib/locales` 一樣）
const LOCALES: [&str; 5] = ["zh-TW", "zh-CN", "en", "ja", "ko"];

/// 一次互動的脈絡（都可能沒有）
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct VisitCtx {
    pub country: Option<String>,
    pub referrer: Option<String>,
    pub device: Option<&'static str>,
    pub locale: Option<String>,
}

impl VisitCtx {
    /// 從請求標頭取脈絡。每一欄都只收合格的值，其他當沒帶
    #[must_use]
    pub fn from_headers(h: &HeaderMap) -> Self {
        let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).map(str::trim).filter(|s| !s.is_empty());
        // XX 是 Cloudflare 判斷不出來，T1 是 Tor：兩個都不是國家
        let country = get("cf-ipcountry")
            .filter(|c| c.len() == 2 && c.bytes().all(|b| b.is_ascii_alphabetic()))
            .map(str::to_ascii_uppercase)
            .filter(|c| c != "XX" && c != "T1");
        let referrer = get("x-visit-referrer").map(str::to_ascii_lowercase).filter(|r| {
            r.len() <= 100
                && r.contains('.')
                && r.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
        });
        let device = get("user-agent")
            .map(|ua| if ua.contains("Mobi") || ua.contains("Android") { "mobile" } else { "desktop" });
        let locale = get("x-visit-locale").filter(|l| LOCALES.contains(l)).map(str::to_string);
        Self { country, referrer, device, locale }
    }
}

/// 記一筆。`kind`：post／site／comment／thought；`delta`：+1 按下、-1 收回
pub async fn record(
    state: &AppState,
    kind: &str,
    target_id: Option<i64>,
    value: &str,
    delta: i64,
    ctx: &VisitCtx,
) {
    let res = sqlx::query(
        "INSERT INTO reaction_events (kind, target_id, value, delta, country, referrer, device, locale) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(kind)
    .bind(target_id)
    .bind(value)
    .bind(delta)
    .bind(&ctx.country)
    .bind(&ctx.referrer)
    .bind(ctx.device)
    .bind(&ctx.locale)
    .execute(&state.pool)
    .await;
    if let Err(e) = res {
        tracing::warn!(error = %e, kind, "反應紀錄寫入失敗");
    }
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ReactionsQuery {
    /// 最近幾筆（預設 100，最多 500）
    pub limit: Option<i64>,
}

/// 一筆紀錄。`target_title`：文章是標題、留言是它所在那篇的標題、碎念是內文開頭
#[derive(Debug, Serialize, FromRow, specta::Type, utoipa::ToSchema)]
pub struct ReactionLogEvent {
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    pub created_at: String,
    pub kind: String,
    #[specta(type = Option<specta_typescript::Number>)]
    pub target_id: Option<i64>,
    pub target_title: Option<String>,
    pub value: String,
    #[specta(type = specta_typescript::Number)]
    pub delta: i64,
    pub country: Option<String>,
    pub referrer: Option<String>,
    pub device: Option<String>,
    pub locale: Option<String>,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct ReactionLogResponse {
    /// 第一筆紀錄的時間；還沒有任何紀錄是 null
    pub since: Option<String>,
    /// 開始記錄之前文章收到的愛心（現在的總數減掉紀錄裡的 ❤️，不會小於 0）
    #[specta(type = specta_typescript::Number)]
    pub before_post_hearts: i64,
    /// 開始記錄之前首頁的印記
    #[specta(type = specta_typescript::Number)]
    pub before_site: i64,
    pub events: Vec<ReactionLogEvent>,
}

/// `GET /api/admin/reactions?limit=100` —— requireAdmin。最近的紀錄（新的在前）與開始記錄之前的總數
#[utoipa::path(get, path = "/api/admin/reactions", tag = "admin", security(("bearer" = [])),
    params(ReactionsQuery),
    responses((status = 200, body = ReactionLogResponse), (status = 401, description = "未授權")))]
pub async fn admin_reactions(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    Query(q): Query<ReactionsQuery>,
) -> Result<Json<ReactionLogResponse>, AppError> {
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    let events: Vec<ReactionLogEvent> = sqlx::query_as(
        "SELECT e.id, e.created_at, e.kind, e.target_id, e.value, e.delta, e.country, e.referrer, e.device, e.locale, \
           CASE e.kind \
             WHEN 'post' THEN (SELECT title FROM posts WHERE id = e.target_id) \
             WHEN 'comment' THEN (SELECT p.title FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = e.target_id) \
             WHEN 'thought' THEN (SELECT substr(content, 1, 40) FROM thoughts WHERE id = e.target_id) \
           END AS target_title \
         FROM reaction_events e ORDER BY e.id DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;
    let since: Option<String> =
        sqlx::query_scalar("SELECT MIN(created_at) FROM reaction_events").fetch_one(&state.pool).await?;
    let hearts_now: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(count), 0) FROM post_reactions WHERE emoji = '❤️'")
            .fetch_one(&state.pool)
            .await?;
    let hearts_logged: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(delta), 0) FROM reaction_events WHERE kind = 'post' AND value = '❤️'",
    )
    .fetch_one(&state.pool)
    .await?;
    let site_now: i64 =
        sqlx::query_scalar("SELECT COALESCE((SELECT count FROM site_counters WHERE key = 'site_likes'), 0)")
            .fetch_one(&state.pool)
            .await?;
    let site_logged: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(delta), 0) FROM reaction_events WHERE kind = 'site'")
            .fetch_one(&state.pool)
            .await?;
    Ok(Json(ReactionLogResponse {
        since,
        before_post_hearts: (hearts_now - hearts_logged).max(0),
        before_site: (site_now - site_logged).max(0),
        events,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.insert(*k, HeaderValue::from_str(v).expect("測試用的標頭值"));
        }
        h
    }

    #[test]
    fn keeps_only_well_formed_context() {
        let ctx = VisitCtx::from_headers(&headers(&[
            ("cf-ipcountry", "tw"),
            ("x-visit-referrer", "T.co"),
            ("x-visit-locale", "ja"),
            ("user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148"),
        ]));
        assert_eq!(
            ctx,
            VisitCtx {
                country: Some("TW".into()),
                referrer: Some("t.co".into()),
                device: Some("mobile"),
                locale: Some("ja".into()),
            }
        );
    }

    #[test]
    fn drops_values_that_are_not_what_they_claim() {
        let ctx = VisitCtx::from_headers(&headers(&[
            ("cf-ipcountry", "XX"),
            ("x-visit-referrer", "https://evil.example/path?q=1"),
            ("x-visit-locale", "fr"),
            ("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
        ]));
        assert_eq!(ctx, VisitCtx { device: Some("desktop"), ..VisitCtx::default() });
        assert_eq!(VisitCtx::from_headers(&headers(&[("cf-ipcountry", "T1")])).country, None, "Tor 不是國家");
        assert_eq!(VisitCtx::from_headers(&HeaderMap::new()), VisitCtx::default());
    }
}
