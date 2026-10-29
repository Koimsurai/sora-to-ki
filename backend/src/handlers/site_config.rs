//! 站台設定：後台與 MCP 改的那一層（`site_settings` 表的 `site` 這個 key）。
//!
//! 資料庫是唯一來源。環境變數（SITE_NAME、SITE_AUTHOR、SITE_DESCRIPTION）只在這筆設定還不存在時
//! 寫進來當種子一次，之後改設定一律走 `PUT /api/admin/site/config`（後台、MCP 都打這支）。
//! 網址（SITE_URL）刻意不在這裡：它是部署層的事，在後台改錯會讓整站的連結一起壞掉。
//!
//! 讀的頻率很高（RSS、信件、分享圖每次都要站名），所以啟動時讀進記憶體，寫入時一起更新，
//! [`current`] 不碰資料庫。

use std::sync::LazyLock;

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;

use crate::{auth::AdminAuth, error::AppError, error::JsonBody, state::AppState};

/// `site_settings` 裡這份設定的 key
const KEY: &str = "site";

/// 可以關掉的頁面（前端頁面登記表 `data/siteSections` 裡 toggleable 的那些，順序也要一樣，
/// 前端有測試比對）。
///
/// 主要分區裡的碎念、作品、收藏可以關（首頁土星跟著少一條軌道）；手記與關於不行：
/// 手記是 RSS、電子報、文章頁的根，關於是「關於」選單的家。
pub const TOGGLEABLE_PAGES: [&str; 9] =
    ["moments", "works", "collection", "setup", "log", "messages", "photos", "friends", "colophon"];

/// 全新安裝時預設關掉的頁面：設備頁要站長自己的手繪圖紙才有東西可看。
/// 既有的站升級上來不會被關掉任何一頁（見 [`load_or_seed`]）。
const OFF_ON_FRESH_INSTALL: [&str; 1] = ["setup"];

const NAME_MAX: usize = 60;
const DESCRIPTION_MAX: usize = 300;

/// 存在資料庫裡的那一份
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiteSettings {
    pub name: String,
    /// 空字串＝跟站名一樣
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub disabled_pages: Vec<String>,
}

static CURRENT: LazyLock<RwLock<Option<SiteSettings>>> = LazyLock::new(|| RwLock::new(None));

/// 記憶體裡的設定。啟動完成前（或測試沒有載入時）是 `None`，呼叫端退回環境變數。
pub fn current() -> Option<SiteSettings> {
    CURRENT.read().clone()
}

fn set_current(s: SiteSettings) {
    *CURRENT.write() = Some(s);
}

/// 讀出設定放進記憶體；資料庫裡還沒有的話用環境變數寫一份種子。
///
/// 種子關掉哪些頁面：
///   1. 有設 `SITE_DISABLED_PAGES`（逗號分隔，**空字串也算有設**＝一頁都不關）就照它。
///      部署腳本、agent、E2E 要明確指定的時候用這個，不靠下面的猜測。
///   2. 沒設就看寫種子的當下 `users` 表有沒有人：有人＝既有的站升級上來，所有頁面照舊開著；
///      沒人＝全新安裝，關掉 [`OFF_ON_FRESH_INSTALL`]。
///      所以這支要排在 `auth::bootstrap_admin` 之前（它會在空的 users 表建第一個管理員）。
pub async fn load_or_seed(pool: &SqlitePool) -> Result<SiteSettings, AppError> {
    if let Some(raw) = sqlx::query_scalar::<_, String>("SELECT value FROM site_settings WHERE key = ?")
        .bind(KEY)
        .fetch_optional(pool)
        .await?
    {
        let s: SiteSettings = serde_json::from_str(&raw).map_err(anyhow::Error::from)?;
        set_current(s.clone());
        return Ok(s);
    }

    let disabled_pages = if let Ok(raw) = std::env::var("SITE_DISABLED_PAGES") {
        // 不認得的 key 直接略過：種子寫壞不該讓伺服器起不來，之後在後台改得回來
        let wanted: Vec<&str> = raw.split(',').map(str::trim).collect();
        TOGGLEABLE_PAGES.iter().filter(|p| wanted.contains(p)).map(|p| (*p).to_string()).collect()
    } else {
        let (users,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users").fetch_one(pool).await?;
        if users == 0 { OFF_ON_FRESH_INSTALL.iter().map(|p| (*p).to_string()).collect() } else { Vec::new() }
    };
    let seed = SiteSettings {
        name: crate::identity::env_site_name(),
        author: crate::identity::env_site_author().unwrap_or_default(),
        description: crate::identity::env_site_description().unwrap_or_default(),
        disabled_pages,
    };
    // OR IGNORE：兩個程序同時開機的話，以先寫進去的那份為準
    sqlx::query("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)")
        .bind(KEY)
        .bind(serde_json::to_string(&seed).map_err(anyhow::Error::from)?)
        .execute(pool)
        .await?;
    reload(pool).await
}

/// 種子寫完之後再讀一次（OR IGNORE 時讀到的是別人寫的那份）
async fn reload(pool: &SqlitePool) -> Result<SiteSettings, AppError> {
    let raw = sqlx::query_scalar::<_, String>("SELECT value FROM site_settings WHERE key = ?")
        .bind(KEY)
        .fetch_one(pool)
        .await?;
    let s: SiteSettings = serde_json::from_str(&raw).map_err(anyhow::Error::from)?;
    set_current(s.clone());
    Ok(s)
}

/// `GET /api/site/config` 的回應：資料庫那份加上部署層的網址
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SiteConfig {
    /// 站台網址（SITE_URL），唯讀
    pub url: String,
    pub name: String,
    /// 作者名；沒另外設就跟站名一樣
    pub author: String,
    pub description: String,
    /// 關掉的頁面（data/siteSections 的 key）
    pub disabled_pages: Vec<String>,
}

impl From<SiteSettings> for SiteConfig {
    fn from(s: SiteSettings) -> Self {
        let author = if s.author.is_empty() { s.name.clone() } else { s.author };
        Self {
            url: crate::identity::site_url(),
            name: s.name,
            author,
            description: s.description,
            disabled_pages: s.disabled_pages,
        }
    }
}

/// `PUT /api/admin/site/config` 的 body：只改有帶的欄位
#[derive(Debug, Default, Deserialize, utoipa::ToSchema)]
pub struct SiteConfigUpdate {
    pub name: Option<String>,
    /// 空字串＝跟站名一樣
    pub author: Option<String>,
    pub description: Option<String>,
    /// 整份換掉（不是增減）。只收 TOGGLEABLE_PAGES 裡的 key
    pub disabled_pages: Option<Vec<String>>,
}

/// 把 body 套到現有的設定上。錯誤訊息直接給後台與 MCP 顯示，所以寫成人看得懂的句子
fn apply(mut s: SiteSettings, body: SiteConfigUpdate) -> Result<SiteSettings, String> {
    if let Some(name) = body.name {
        let name = name.trim();
        if name.is_empty() {
            return Err("站名不能是空的".into());
        }
        if name.chars().count() > NAME_MAX {
            return Err(format!("站名最多 {NAME_MAX} 個字"));
        }
        s.name = name.to_string();
    }
    if let Some(author) = body.author {
        let author = author.trim();
        if author.chars().count() > NAME_MAX {
            return Err(format!("作者名最多 {NAME_MAX} 個字"));
        }
        s.author = author.to_string();
    }
    if let Some(description) = body.description {
        let description = description.trim();
        if description.chars().count() > DESCRIPTION_MAX {
            return Err(format!("介紹最多 {DESCRIPTION_MAX} 個字"));
        }
        s.description = description.to_string();
    }
    if let Some(pages) = body.disabled_pages {
        if let Some(bad) = pages.iter().find(|p| !TOGGLEABLE_PAGES.contains(&p.as_str())) {
            return Err(format!("沒有「{bad}」這一頁可以關，能關的是：{}", TOGGLEABLE_PAGES.join("、")));
        }
        // 照 TOGGLEABLE_PAGES 的順序、去掉重複：同一份設定存起來永遠長一樣
        s.disabled_pages = TOGGLEABLE_PAGES
            .iter()
            .filter(|p| pages.iter().any(|q| q == *p))
            .map(|p| (*p).to_string())
            .collect();
    }
    Ok(s)
}

async fn loaded(pool: &SqlitePool) -> Result<SiteSettings, AppError> {
    match current() {
        Some(s) => Ok(s),
        None => load_or_seed(pool).await,
    }
}

/// `GET /api/site/config` —— 公開：前端 SSR 每次渲染都要（站名、哪幾頁關掉了）。
#[utoipa::path(get, path = "/api/site/config", tag = "site", responses((status = 200, body = SiteConfig)))]
pub async fn get_site_config(State(state): State<AppState>) -> Result<Json<SiteConfig>, AppError> {
    Ok(Json(loaded(&state.pool).await?.into()))
}

/// `PUT /api/admin/site/config` —— 改站台設定（後台與 MCP）。只改有帶的欄位，回傳改完的整份。
#[utoipa::path(put, path = "/api/admin/site/config", tag = "site", request_body = SiteConfigUpdate,
    security(("bearer" = [])),
    responses(
        (status = 200, body = SiteConfig),
        (status = 400, description = "欄位不合法（站名空白、太長、沒有這一頁）"),
        (status = 401, description = "需要登入"),
    ))]
pub async fn update_site_config(
    State(state): State<AppState>,
    _auth: AdminAuth,
    JsonBody(body): JsonBody<SiteConfigUpdate>,
) -> Result<Response, AppError> {
    let next = match apply(loaded(&state.pool).await?, body) {
        Ok(s) => s,
        Err(msg) => return Ok((StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()),
    };
    sqlx::query(
        "INSERT INTO site_settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(KEY)
    .bind(serde_json::to_string(&next).map_err(anyhow::Error::from)?)
    .execute(&state.pool)
    .await?;
    set_current(next.clone());
    // 站名與選單在每一頁的 SSR 裡，整站的快取都要清
    tokio::spawn(crate::revalidate::fire());
    Ok(Json(SiteConfig::from(next)).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> SiteSettings {
        SiteSettings {
            name: "站".into(),
            author: String::new(),
            description: String::new(),
            disabled_pages: vec![],
        }
    }

    #[test]
    fn 只改有帶的欄位_前後空白去掉() {
        let s =
            apply(base(), SiteConfigUpdate { name: Some("  新站名 ".into()), ..Default::default() }).unwrap();
        assert_eq!(s.name, "新站名");
        assert_eq!(s.description, "", "沒帶的欄位不動");
    }

    #[test]
    fn 站名不能空白也不能太長() {
        assert!(apply(base(), SiteConfigUpdate { name: Some("   ".into()), ..Default::default() }).is_err());
        let long = "字".repeat(NAME_MAX + 1);
        assert!(apply(base(), SiteConfigUpdate { name: Some(long), ..Default::default() }).is_err());
    }

    #[test]
    fn 關掉的頁面只收認得的_照固定順序去重() {
        let s = apply(
            base(),
            SiteConfigUpdate {
                disabled_pages: Some(vec!["friends".into(), "setup".into(), "friends".into()]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.disabled_pages, vec!["setup", "friends"]);
        let err = apply(
            base(),
            SiteConfigUpdate { disabled_pages: Some(vec!["notes".into()]), ..Default::default() },
        )
        .unwrap_err();
        assert!(err.contains("notes"), "{err}");
    }

    #[test]
    fn 作者空白時回應裡跟站名一樣() {
        let c = SiteConfig::from(SiteSettings { author: String::new(), ..base() });
        assert_eq!(c.author, "站");
        let c = SiteConfig::from(SiteSettings { author: "人".into(), ..base() });
        assert_eq!(c.author, "人");
    }
}
