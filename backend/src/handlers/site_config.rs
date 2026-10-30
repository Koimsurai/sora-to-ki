//! 站台設定：後台與 MCP 改的那一層（`site_settings` 表的 `site` 這個 key）。
//!
//! 資料庫是唯一來源。環境變數（SITE_NAME、SITE_AUTHOR、SITE_DESCRIPTION）只在這筆設定還不存在時
//! 寫進來當種子一次，之後改設定一律走 `PUT /api/admin/site/config`（後台、MCP 都打這支）。
//! 網址（SITE_URL）刻意不在這裡：它是部署層的事，在後台改錯會讓整站的連結一起壞掉。
//!
//! 讀的頻率很高（RSS、信件、分享圖每次都要站名），所以啟動時讀進記憶體，寫入時一起更新，
//! [`current`] 不碰資料庫。

use std::sync::{
    LazyLock,
    atomic::{AtomicUsize, Ordering},
};

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

/// 全新安裝時預設關掉的頁面（照 [`TOGGLEABLE_PAGES`] 的順序），初次設定的精靈也從這裡開始：
///   · 設備頁要先選模式（內建圖紙、自己的圖紙）才有東西可看
///   · 照片頁要接 NAS 或上傳資料夾
/// 既有的站升級上來不會被關掉任何一頁（見 [`load_or_seed`]）。
const OFF_ON_FRESH_INSTALL: [&str; 2] = ["setup", "photos"];

const NAME_MAX: usize = 60;
const DESCRIPTION_MAX: usize = 300;
const EMAIL_MAX: usize = 120;
/// GitHub 帳號名的長度上限（GitHub 自己的規則）
const GITHUB_MAX: usize = 39;

/// 存在資料庫裡的那一份
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiteSettings {
    pub name: String,
    /// 空字串＝跟站名一樣
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub disabled_pages: Vec<String>,
    /// 聯絡信箱（關於選單、朋友頁、留言頁）。
    ///
    /// `None`＝從來沒設過，退回環境變數 `SITE_EMAIL`；`Some("")`＝刻意清空。
    /// 這兩個欄位是設定表建好之後才加的：既有的站不會再跑種子，靠這個退路接上環境變數，
    /// 升級上來不會有一段聯絡方式不見的空窗。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// GitHub 帳號名（關於選單的連結、航行日誌的貢獻圖、首頁 JSON-LD 的 sameAs）。規則同 `email`，退路是 `SITE_GITHUB`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub github: Option<String>,
    /// 預設語系：不帶前綴的網址、文章的原文、沒翻譯時退回的語言。規則同 `email`，退路是 `SITE_DEFAULT_LOCALE`，再退回繁中
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_locale: Option<String>,
    /// 有開的語系（一定包含預設語系）。規則同 `email`，退路是 `SITE_LOCALES`（逗號分隔），再退回全部
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locales: Option<Vec<String>>,
    /// 預設天體（主題）：讀者沒在頂欄選過時看到的那顆，分享圖也畫這顆。`None`＝土星
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
}

/// 站上支援的語系（介面有翻譯的那五個），順序就是語系選單的順序。前端在 src/lib/locales.ts
pub const SUPPORTED_LOCALES: [&str; 5] = ["zh-TW", "zh-CN", "en", "ja", "ko"];

/// 能選的天體（主題），順序就是頂欄天體選單的順序。前端在 src/lib/theme.ts
pub const THEMES: [&str; 4] = ["saturn", "neptune", "blackhole", "betelgeuse"];

/// 預設天體在 [`THEMES`] 裡的位置。分享圖每畫一個點都要問顏色，不能每次都複製整份設定，
/// 所以另外存一份，跟 [`CURRENT`] 一起更新
static THEME: AtomicUsize = AtomicUsize::new(0);

/// 預設天體（分享圖用）
pub fn theme() -> &'static str {
    THEMES[THEME.load(Ordering::Relaxed)]
}

/// 只換分享圖讀的那份預設天體（測試與樣張用）
#[cfg(test)]
pub fn set_theme_for_test(theme: &str) {
    THEME.store(THEMES.iter().position(|t| *t == theme).unwrap_or(0), Ordering::Relaxed);
}

/// 字串 → 能選的天體（大小寫不拘）
fn theme_of(t: Option<&str>) -> Option<&'static str> {
    let t = t?.trim();
    THEMES.iter().copied().find(|s| s.eq_ignore_ascii_case(t))
}

/// 字串 → 支援的語系（大小寫不拘）
fn supported(l: &str) -> Option<&'static str> {
    SUPPORTED_LOCALES.iter().copied().find(|s| s.eq_ignore_ascii_case(l.trim()))
}

/// 預設語系與有開的語系：設定 → 環境變數 → 繁中、全部。有開的照 SUPPORTED_LOCALES 排，一定含預設語系
fn locales_of(s: &SiteSettings) -> (String, Vec<String>) {
    let default = s
        .default_locale
        .clone()
        .or_else(|| std::env::var("SITE_DEFAULT_LOCALE").ok())
        .and_then(|l| supported(&l))
        .unwrap_or("zh-TW");
    let wanted: Vec<&str> = s.locales.clone().map_or_else(
        || {
            std::env::var("SITE_LOCALES")
                .ok()
                .map(|v| v.split(',').filter_map(supported).collect::<Vec<_>>())
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| SUPPORTED_LOCALES.to_vec())
        },
        |v| v.iter().filter_map(|l| supported(l)).collect(),
    );
    let enabled = SUPPORTED_LOCALES
        .iter()
        .filter(|l| **l == default || wanted.contains(l))
        .map(|l| (*l).to_string())
        .collect();
    (default.to_string(), enabled)
}

/// 預設語系（RSS、分享圖、信件用）
pub fn default_locale() -> String {
    current().map_or_else(|| locales_of(&SiteSettings::default()).0, |s| locales_of(&s).0)
}

/// 某個語系的網址前綴：預設語系沒有前綴，其他是小寫（zh-tw、zh-cn、en、ja、ko）
pub fn locale_prefix(locale: &str) -> String {
    if locale.eq_ignore_ascii_case(&default_locale()) { String::new() } else { locale.to_ascii_lowercase() }
}

/// 設定裡沒有就看環境變數（見 `SiteSettings::email`）
fn or_env(value: Option<String>, key: &str) -> String {
    value.unwrap_or_else(|| std::env::var(key).map(|v| v.trim().to_string()).unwrap_or_default())
}

static CURRENT: LazyLock<RwLock<Option<SiteSettings>>> = LazyLock::new(|| RwLock::new(None));

/// 記憶體裡的設定。啟動完成前（或測試沒有載入時）是 `None`，呼叫端退回環境變數。
pub fn current() -> Option<SiteSettings> {
    CURRENT.read().clone()
}

fn set_current(s: SiteSettings) {
    let theme = theme_of(s.theme.as_deref()).and_then(|t| THEMES.iter().position(|x| *x == t)).unwrap_or(0);
    THEME.store(theme, Ordering::Relaxed);
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
///
/// 全新安裝（同樣以 `users` 是空的判斷，不管有沒有設 `SITE_DISABLED_PAGES`）還會清掉
/// 遷移寫進去的原作者朋友。
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

    let (users,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users").fetch_one(pool).await?;
    let fresh = users == 0;
    if fresh {
        // 遷移 0022 把原作者的兩位朋友寫進了每一個資料庫；全新的站不該一開門就掛著別人的朋友。
        // 只清那兩筆（還沒開機過，不會有別的）
        sqlx::query("DELETE FROM friend_links WHERE slug IN ('doraeyi', 'sao-x')").execute(pool).await?;
    }
    let disabled_pages = if let Ok(raw) = std::env::var("SITE_DISABLED_PAGES") {
        // 不認得的 key 直接略過：種子寫壞不該讓伺服器起不來，之後在後台改得回來
        let wanted: Vec<&str> = raw.split(',').map(str::trim).collect();
        TOGGLEABLE_PAGES.iter().filter(|p| wanted.contains(p)).map(|p| (*p).to_string()).collect()
    } else if fresh {
        OFF_ON_FRESH_INSTALL.iter().map(|p| (*p).to_string()).collect()
    } else {
        Vec::new()
    };
    let seed = SiteSettings {
        name: crate::identity::env_site_name(),
        author: crate::identity::env_site_author().unwrap_or_default(),
        description: crate::identity::env_site_description().unwrap_or_default(),
        disabled_pages,
        // 留 None：讀的時候會退回 SITE_EMAIL／SITE_GITHUB，在後台改過才寫進來
        email: None,
        github: None,
        default_locale: None,
        locales: None,
        theme: None,
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
    /// 聯絡信箱；空字串＝沒有
    pub email: String,
    /// GitHub 帳號名；空字串＝沒有
    pub github: String,
    /// 預設語系（不帶前綴的網址）
    pub default_locale: String,
    /// 有開的語系，照語系選單的順序；一定含預設語系
    pub locales: Vec<String>,
    /// 預設天體（saturn、neptune、blackhole、betelgeuse）：讀者沒選過時看到的那顆
    pub theme: String,
}

impl From<SiteSettings> for SiteConfig {
    fn from(s: SiteSettings) -> Self {
        let author = if s.author.is_empty() { s.name.clone() } else { s.author.clone() };
        let (default_locale, locales) = locales_of(&s);
        Self {
            url: crate::identity::site_url(),
            name: s.name,
            author,
            description: s.description,
            disabled_pages: s.disabled_pages,
            email: or_env(s.email, "SITE_EMAIL"),
            github: or_env(s.github, "SITE_GITHUB"),
            default_locale,
            locales,
            theme: theme_of(s.theme.as_deref()).unwrap_or(THEMES[0]).to_string(),
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
    /// 聯絡信箱；空字串＝清空（不再退回環境變數）
    pub email: Option<String>,
    /// GitHub 帳號名（不是網址）；空字串＝清空
    pub github: Option<String>,
    /// 預設語系（zh-TW、zh-CN、en、ja、ko）。⚠ 改了之後全站網址整批換：原本不帶前綴的會多一個前綴
    pub default_locale: Option<String>,
    /// 有開的語系（整份換掉）；預設語系一定會在裡面
    pub locales: Option<Vec<String>>,
    /// 預設天體（saturn、neptune、blackhole、betelgeuse）
    pub theme: Option<String>,
}

/// 把 body 套到現有的設定上。錯誤訊息直接給後台與 MCP 顯示，所以寫成人看得懂的句子
fn apply(mut s: SiteSettings, body: SiteConfigUpdate) -> Result<SiteSettings, String> {
    let bad_locale = |l: &str| format!("沒有「{l}」這個語系，能選的是：{}", SUPPORTED_LOCALES.join("、"));
    if let Some(l) = &body.default_locale {
        s.default_locale = Some(supported(l).ok_or_else(|| bad_locale(l))?.to_string());
    }
    if let Some(ls) = &body.locales {
        if let Some(bad) = ls.iter().find(|l| supported(l).is_none()) {
            return Err(bad_locale(bad));
        }
        // 照語系選單的順序存（預設語系不在裡面也沒關係，讀的時候一定會補上）
        s.locales = Some(
            SUPPORTED_LOCALES
                .iter()
                .filter(|l| ls.iter().any(|x| x.eq_ignore_ascii_case(l)))
                .map(|l| (*l).to_string())
                .collect(),
        );
    }
    if let Some(t) = &body.theme {
        let t = theme_of(Some(t))
            .ok_or_else(|| format!("沒有「{t}」這個天體，能選的是：{}", THEMES.join("、")))?;
        s.theme = Some(t.to_string());
    }
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
    if let Some(email) = body.email {
        let email = email.trim();
        if email.chars().count() > EMAIL_MAX {
            return Err(format!("信箱最多 {EMAIL_MAX} 個字"));
        }
        if !email.is_empty() && !email.contains('@') {
            return Err("信箱的格式不對".into());
        }
        s.email = Some(email.to_string());
    }
    if let Some(github) = body.github {
        // 貼了整個網址或帶 @ 的也收：只留帳號名
        let github = github.trim().trim_start_matches("https://github.com/").trim_start_matches('@');
        let github = github.trim_end_matches('/');
        let valid = github.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if !valid || github.len() > GITHUB_MAX {
            return Err("GitHub 帳號名只能有英數字與連字號，最多 39 個字".into());
        }
        s.github = Some(github.to_string());
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
            email: None,
            github: None,
            default_locale: None,
            locales: None,
            theme: None,
        }
    }

    #[test]
    fn 天體只收認得的_沒設過是土星() {
        assert_eq!(SiteConfig::from(base()).theme, "saturn");
        let s =
            apply(base(), SiteConfigUpdate { theme: Some("Neptune".into()), ..Default::default() }).unwrap();
        assert_eq!(s.theme.as_deref(), Some("neptune"), "大小寫不拘，存成標準寫法");
        assert_eq!(SiteConfig::from(s).theme, "neptune");
        let err = apply(base(), SiteConfigUpdate { theme: Some("mars".into()), ..Default::default() });
        assert!(err.unwrap_err().contains("mars"));
    }

    #[test]
    fn 語系只收支援的_有開的照選單順序存() {
        let s = apply(
            base(),
            SiteConfigUpdate {
                default_locale: Some("EN".into()),
                locales: Some(vec!["ja".into(), "en".into()]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.default_locale.as_deref(), Some("en"), "大小寫不拘，存成標準寫法");
        assert_eq!(s.locales, Some(vec!["en".into(), "ja".into()]));
        let err = apply(base(), SiteConfigUpdate { default_locale: Some("fr".into()), ..Default::default() });
        assert!(err.unwrap_err().contains("fr"));
    }

    #[test]
    fn 有開的語系一定含預設語系() {
        let s =
            SiteSettings { default_locale: Some("ko".into()), locales: Some(vec!["en".into()]), ..base() };
        let c = SiteConfig::from(s);
        assert_eq!(c.default_locale, "ko");
        assert_eq!(c.locales, vec!["en".to_string(), "ko".to_string()]);
    }

    #[test]
    fn 信箱與_github_清空要存成空字串_不是退回環境變數() {
        let s = apply(
            base(),
            SiteConfigUpdate {
                email: Some(String::new()),
                github: Some(String::new()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(s.email.as_deref(), Some(""));
        assert_eq!(s.github.as_deref(), Some(""));
    }

    #[test]
    fn github_貼網址或帶_at_也只留帳號名() {
        for input in ["https://github.com/Koimsurai/", "@Koimsurai", " Koimsurai "] {
            let s =
                apply(base(), SiteConfigUpdate { github: Some(input.into()), ..Default::default() }).unwrap();
            assert_eq!(s.github.as_deref(), Some("Koimsurai"), "{input}");
        }
        assert!(
            apply(base(), SiteConfigUpdate { github: Some("a/b".into()), ..Default::default() }).is_err()
        );
        assert!(
            apply(base(), SiteConfigUpdate { email: Some("nope".into()), ..Default::default() }).is_err()
        );
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
