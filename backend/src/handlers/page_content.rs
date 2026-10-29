//! 頁面內容：關於、作品、航行日誌、此站點的問答、設備這幾頁由站長填的資料（`page_content` 表，一頁一列）。
//!
//! 頁面的設計寫在前端，這裡只存「填進去的東西」。每一頁一個型別、一對 API：
//! 公開的 `GET /api/pages/<頁>` 給前台 SSR 讀，`PUT /api/admin/pages/<頁>` 給後台與 MCP 寫（整份覆蓋）。
//! 還沒填過的頁面讀到的是空的那一份（[`Default`]），前台照空狀態畫。
//!
//! 文字欄位是 [`I18n`]：語系 → 字。預設語系（zh-TW）以外都可以不填，前台退回預設語系。

use std::collections::BTreeMap;

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use sqlx::SqlitePool;

use crate::{auth::AdminAuth, error::AppError, error::JsonBody, state::AppState};

/// 前台的五個語系（`src/lib/locales.ts`）
const LOCALES: [&str; 5] = ["zh-TW", "zh-CN", "en", "ja", "ko"];

/// 一段可以多語的文字：語系 → 字
pub type I18n = BTreeMap<String, String>;

/// 一個欄位最多幾個字（防止貼錯整篇文章進來，不是排版限制）
const TEXT_MAX: usize = 600;

fn check_i18n(field: &str, v: &I18n) -> Result<(), String> {
    for (lang, text) in v {
        if !LOCALES.contains(&lang.as_str()) {
            return Err(format!("{field}：不認得的語系 {lang}"));
        }
        if text.chars().count() > TEXT_MAX {
            return Err(format!("{field}（{lang}）超過 {TEXT_MAX} 字"));
        }
    }
    Ok(())
}

fn check_text(field: &str, v: &str, max: usize) -> Result<(), String> {
    if v.chars().count() > max { Err(format!("{field} 超過 {max} 字")) } else { Ok(()) }
}

fn check_count<T>(field: &str, v: &[T], max: usize) -> Result<(), String> {
    if v.len() > max { Err(format!("{field} 最多 {max} 筆")) } else { Ok(()) }
}

// ── 關於 ─────────────────────────────────────────────────────────────

/// 關於頁：往下掉經過的每一年、地表的技能、第一層的經歷、地心的一句話
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct AboutContent {
    #[serde(default)]
    pub chapters: Vec<AboutChapter>,
    #[serde(default)]
    pub skills: Vec<AboutSkillGroup>,
    #[serde(default)]
    pub jobs: Vec<AboutJob>,
    #[serde(default)]
    pub quote: Option<AboutQuote>,
}

/// 一年（一章）。畫面上只有年份、標題、副標與一句話
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct AboutChapter {
    /// `2004`、`2019-2021`；`NOW` 會照語系顯示成「現在」
    pub year: String,
    #[serde(default)]
    pub title: I18n,
    #[serde(default)]
    pub subtitle: I18n,
    #[serde(default)]
    pub line: I18n,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct AboutSkillGroup {
    #[serde(default)]
    pub label: I18n,
    #[serde(default)]
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct AboutJob {
    /// `2025/7 — Now`（Now 會照語系換）
    pub period: String,
    #[serde(default)]
    pub title: I18n,
    #[serde(default)]
    pub role: I18n,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct AboutQuote {
    /// 換行就是畫面上的換行
    pub text: String,
    #[serde(default)]
    pub cite: String,
}

impl AboutContent {
    fn validate(&self) -> Result<(), String> {
        check_count("章節", &self.chapters, 40)?;
        for c in &self.chapters {
            check_text("年份", &c.year, 20)?;
            check_i18n("章節標題", &c.title)?;
            check_i18n("章節副標", &c.subtitle)?;
            check_i18n("章節那一句", &c.line)?;
        }
        check_count("技能分組", &self.skills, 20)?;
        for g in &self.skills {
            check_i18n("分組名稱", &g.label)?;
            check_count("技能", &g.items, 80)?;
            for s in &g.items {
                check_text("技能", s, 60)?;
            }
        }
        check_count("經歷", &self.jobs, 30)?;
        for j in &self.jobs {
            check_text("期間", &j.period, 40)?;
            check_i18n("職稱", &j.title)?;
            check_i18n("單位", &j.role)?;
        }
        if let Some(q) = &self.quote {
            check_text("引言", &q.text, 300)?;
            check_text("出處", &q.cite, 80)?;
        }
        Ok(())
    }
}

// ── 航行日誌 ─────────────────────────────────────────────────────────

/// 航行日誌：軌跡與任務計時器的起點、軌跡上的里程碑（貢獻圖、程式時數、遊戲是整合抓的，不在這裡）
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct LogContent {
    /// 站點誕生的那一刻，帶時區（`2025-04-01T00:00:00+08:00`）：計時器從這裡數。
    /// 空的＝第一篇文章那天（讀的時候補上，存的還是空的）
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub milestones: Vec<LogMilestone>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct LogMilestone {
    /// `YYYY-MM-DD`
    pub date: String,
    /// 0 小點、1 中點、2 標在軌跡上
    #[serde(default)]
    pub level: u8,
    #[serde(default)]
    pub text: I18n,
}

fn is_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

impl LogContent {
    fn validate(&self) -> Result<(), String> {
        if !self.start.is_empty() && chrono::DateTime::parse_from_rfc3339(&self.start).is_err() {
            return Err("起點要是帶時區的時間（例如 2025-04-01T00:00:00+08:00），或留空".into());
        }
        check_count("里程碑", &self.milestones, 200)?;
        for m in &self.milestones {
            if !is_date(&m.date) {
                return Err(format!("里程碑的日期要是 YYYY-MM-DD：{}", m.date));
            }
            if m.level > 2 {
                return Err("里程碑的等級只有 0、1、2".into());
            }
            check_i18n("里程碑", &m.text)?;
        }
        Ok(())
    }
}

/// 起點沒填：第一篇發佈的文章那天；連文章都沒有就是今天
async fn default_start(pool: &SqlitePool) -> Result<String, AppError> {
    let first: Option<String> =
        sqlx::query_scalar("SELECT substr(MIN(created_at), 1, 10) FROM posts WHERE status = 'published'")
            .fetch_one(pool)
            .await?;
    let date = first
        .filter(|d| is_date(d))
        .unwrap_or_else(|| chrono::Utc::now().date_naive().format("%Y-%m-%d").to_string());
    Ok(format!("{date}T00:00:00Z"))
}

/// 航行日誌分享圖要的：起點那天（照起點自己的時區）與里程碑的日期。日期寫壞的那幾筆略過
pub async fn log_dates(pool: &SqlitePool) -> Result<(chrono::NaiveDate, Vec<chrono::NaiveDate>), AppError> {
    let log: LogContent = load(pool, "log").await?;
    let start_at = if log.start.is_empty() { default_start(pool).await? } else { log.start };
    let start = chrono::DateTime::parse_from_rfc3339(&start_at)
        .map_or_else(|_| chrono::Utc::now().date_naive(), |t| t.date_naive());
    let milestones = log
        .milestones
        .iter()
        .filter_map(|m| chrono::NaiveDate::parse_from_str(&m.date, "%Y-%m-%d").ok())
        .collect();
    Ok((start, milestones))
}

// ── 讀寫 ─────────────────────────────────────────────────────────────

async fn load<T: DeserializeOwned + Default>(pool: &SqlitePool, key: &str) -> Result<T, AppError> {
    let raw = sqlx::query_scalar::<_, String>("SELECT value FROM page_content WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    match raw {
        Some(raw) => Ok(serde_json::from_str(&raw).map_err(anyhow::Error::from)?),
        None => Ok(T::default()),
    }
}

async fn save<T: Serialize>(pool: &SqlitePool, key: &str, value: &T) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO page_content (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(key)
    .bind(serde_json::to_string(value).map_err(anyhow::Error::from)?)
    .execute(pool)
    .await?;
    // 頁面在 ISR 快取裡，改完要清；首頁的那一行字也讀這裡，所以整站清
    tokio::spawn(crate::revalidate::fire());
    Ok(())
}

fn bad_request(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
}

/// `GET /api/pages/about` —— 公開：關於頁的內容。沒填過是空的那一份
#[utoipa::path(get, path = "/api/pages/about", tag = "pages", responses((status = 200, body = AboutContent)))]
pub async fn get_about(State(state): State<AppState>) -> Result<Json<AboutContent>, AppError> {
    Ok(Json(load(&state.pool, "about").await?))
}

/// `PUT /api/admin/pages/about` —— 整份覆蓋關於頁的內容（後台與 MCP），回傳存好的那份
#[utoipa::path(put, path = "/api/admin/pages/about", tag = "pages", request_body = AboutContent,
    security(("bearer" = [])),
    responses(
        (status = 200, body = AboutContent),
        (status = 400, description = "欄位不合法（太長、太多筆、不認得的語系）"),
        (status = 401, description = "需要登入"),
    ))]
pub async fn put_about(
    State(state): State<AppState>,
    _auth: AdminAuth,
    JsonBody(body): JsonBody<AboutContent>,
) -> Result<Response, AppError> {
    if let Err(msg) = body.validate() {
        return Ok(bad_request(&msg));
    }
    save(&state.pool, "about", &body).await?;
    Ok(Json(body).into_response())
}

/// `GET /api/pages/log` —— 公開：航行日誌的起點與里程碑。起點沒填就是第一篇文章那天
#[utoipa::path(get, path = "/api/pages/log", tag = "pages", responses((status = 200, body = LogContent)))]
pub async fn get_log(State(state): State<AppState>) -> Result<Json<LogContent>, AppError> {
    let mut log: LogContent = load(&state.pool, "log").await?;
    if log.start.is_empty() {
        log.start = default_start(&state.pool).await?;
    }
    Ok(Json(log))
}

/// `PUT /api/admin/pages/log` —— 整份覆蓋航行日誌的內容（後台與 MCP），回傳存好的那份
#[utoipa::path(put, path = "/api/admin/pages/log", tag = "pages", request_body = LogContent,
    security(("bearer" = [])),
    responses(
        (status = 200, body = LogContent),
        (status = 400, description = "欄位不合法（日期格式、等級、太長、不認得的語系）"),
        (status = 401, description = "需要登入"),
    ))]
pub async fn put_log(
    State(state): State<AppState>,
    _auth: AdminAuth,
    JsonBody(body): JsonBody<LogContent>,
) -> Result<Response, AppError> {
    if let Err(msg) = body.validate() {
        return Ok(bad_request(&msg));
    }
    save(&state.pool, "log", &body).await?;
    Ok(Json(body).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tw(s: &str) -> I18n {
        BTreeMap::from([("zh-TW".to_string(), s.to_string())])
    }

    #[test]
    fn 空的關於頁是合法的() {
        assert_eq!(AboutContent::default().validate(), Ok(()));
    }

    #[test]
    fn 不認得的語系與太長的字都擋下來() {
        let mut c = AboutContent {
            chapters: vec![AboutChapter { year: "2004".into(), title: tw("出生"), ..Default::default() }],
            ..Default::default()
        };
        assert_eq!(c.validate(), Ok(()));
        c.chapters[0].line = BTreeMap::from([("fr".to_string(), "x".to_string())]);
        assert!(c.validate().unwrap_err().contains("fr"));
        c.chapters[0].line = tw(&"字".repeat(TEXT_MAX + 1));
        assert!(c.validate().is_err());
    }

    #[test]
    fn 日誌的起點要帶時區_里程碑的日期與等級要對() {
        let ok = LogContent {
            start: "2025-04-01T00:00:00+08:00".into(),
            milestones: vec![LogMilestone { date: "2025-04-01".into(), level: 2, text: tw("誕生") }],
        };
        assert_eq!(ok.validate(), Ok(()));
        assert_eq!(LogContent::default().validate(), Ok(()), "起點留空＝第一篇文章那天");
        for bad in [
            LogContent { start: "2025-04-01".into(), ..ok.clone() },
            LogContent {
                milestones: vec![LogMilestone { date: "2025/4/1".into(), ..ok.milestones[0].clone() }],
                ..ok.clone()
            },
            LogContent {
                milestones: vec![LogMilestone { level: 3, ..ok.milestones[0].clone() }],
                ..ok.clone()
            },
        ] {
            assert!(bad.validate().is_err(), "{bad:?}");
        }
    }

    #[test]
    fn 舊資料缺欄位也讀得進來() {
        let c: AboutContent = serde_json::from_str(r#"{"chapters":[{"year":"2004"}]}"#).unwrap();
        assert_eq!(c.chapters[0].year, "2004");
        assert!(c.skills.is_empty() && c.quote.is_none());
    }
}
