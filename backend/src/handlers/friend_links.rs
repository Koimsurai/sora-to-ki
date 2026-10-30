//! 友鏈申請與審核（2026-10 後台提案）。
//!
//! - `POST /api/friends/apply`：朋友頁上的申請表單。公開、無認證，所以防濫用寫在這裡：
//!   IP 黑名單（跟留言共用）、同一個 IP 一天最多 [`APPLY_PER_IP_PER_DAY`] 份、
//!   隱藏欄位（honeypot）、長度上限、網址要能通過 `net_guard`、已經在名單上的網站不收第二份。
//! - `/api/admin/friends…`：後台審核。收下、等對方加回來再說、退回，可以回信給對方留的信箱。
//!
//! **送出時不去抓對方的網站**：那會讓任何人都能叫這台機器去連任意網址。
//! 自動檢查（[`run_checks`]）由站長在後台按下去才跑，而且一樣過 `net_guard`。

use std::collections::BTreeMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, SqlitePool};

use crate::error::Problem;
use crate::handlers::friends::{FriendPost, recent_posts};
use crate::state::AppState;

/// 同一個 IP 一天最多送幾份
pub const APPLY_PER_IP_PER_DAY: i64 = 3;
const NAME_MAX: usize = 40;
const DESC_MAX: usize = 120;
const MESSAGE_MAX: usize = 500;
const URL_MAX: usize = 300;
const EMAIL_MAX: usize = 120;
/// 「最近有在寫」的門檻
pub const RECENT_DAYS: i64 = 90;
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
/// 一頁最多讀多少：只要找 feed 連結與有沒有連回來，讀太多是浪費
const PAGE_MAX_BYTES: usize = 512 * 1024;

pub const STATUSES: &[&str] = &["pending", "waiting", "approved", "rejected"];

// ── 驗證 ──────────────────────────────────────────────────────────────

/// 驗過、整理過的一份申請
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Application {
    pub name: String,
    pub url: String,
    pub description: String,
    pub feed_url: Option<String>,
    pub email: Option<String>,
    pub message: Option<String>,
}

/// 網址要是 http(s)、不能指到內網，長度有上限。根路徑的結尾斜線拿掉（`https://a.com/` → `https://a.com`）
pub fn clean_url(raw: &str) -> Result<String, Problem> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(Problem::new("url_empty", "URL is empty"));
    }
    if s.chars().count() > URL_MAX {
        return Err(Problem::new("url_too_long", "URL is too long").param("max", URL_MAX));
    }
    let (url, _) = crate::net_guard::validate_url(s)
        .ok_or_else(|| Problem::new("url_invalid", "URL must be a public site starting with http(s)"))?;
    Ok(url
        .strip_suffix('/')
        .filter(|u| u.matches('/').count() == 2)
        .map_or_else(|| url.clone(), str::to_string))
}

/// 網址的 host，小寫、拿掉開頭的 www.（判斷「是不是同一個網站」用）
pub fn host_of(url: &str) -> Option<String> {
    let host = reqwest::Url::parse(url).ok()?.host_str()?.to_ascii_lowercase();
    Some(host.strip_prefix("www.").unwrap_or(&host).to_string())
}

fn trimmed(v: Option<&str>) -> Option<String> {
    v.map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn within(code: &'static str, field: &str, v: Option<String>, max: usize) -> Result<Option<String>, Problem> {
    match v {
        Some(s) if s.chars().count() > max => {
            Err(Problem::new(code, format!("{field} can be at most {max} characters")).param("max", max))
        }
        other => Ok(other),
    }
}

/// 驗一份申請（公開表單與站長手動新增共用）
pub fn validate(
    name: Option<&str>,
    url: Option<&str>,
    description: Option<&str>,
    feed_url: Option<&str>,
    email: Option<&str>,
    message: Option<&str>,
) -> Result<Application, Problem> {
    let name = within("name_too_long", "Site name", trimmed(name), NAME_MAX)?
        .ok_or_else(|| Problem::new("name_empty", "Site name is empty"))?;
    let url = clean_url(url.unwrap_or_default())?;
    let description =
        within("description_too_long", "Description", trimmed(description), DESC_MAX)?.unwrap_or_default();
    let feed_url = trimmed(feed_url)
        .map(|f| clean_url(&f))
        .transpose()
        .map_err(|e| Problem::new("feed_url_invalid", format!("RSS: {e}")))?;
    let email = within("email_too_long", "Email", trimmed(email), EMAIL_MAX)?;
    if let Some(e) = &email {
        let ok =
            e.split_once('@').is_some_and(|(a, d)| !a.is_empty() && d.contains('.') && !d.starts_with('.'))
                && !e.chars().any(char::is_whitespace);
        if !ok {
            return Err(Problem::new("email_invalid", "Email doesn't look right"));
        }
    }
    let message = within("message_too_long", "Message", trimmed(message), MESSAGE_MAX)?;
    Ok(Application { name, url, description, feed_url, email, message })
}

/// 收下時給的 slug：網址的 host（拿掉 www.），非英數字換成 `-`
pub fn slug_for(url: &str) -> Option<String> {
    let host = host_of(url)?;
    let slug: String = host.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let slug = slug.trim_matches('-').to_string();
    (!slug.is_empty()).then_some(slug)
}

// ── 自動檢查 ──────────────────────────────────────────────────────────

/// 一項自動檢查的結果
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct FriendCheck {
    /// reachable | https | feed | recent | backlink（後台照它換成站長的語言，`label` 是英文的備用）
    pub key: String,
    pub label: String,
    pub ok: bool,
    /// 英文說明；`code` 有值時後台換成站長的語言（`errors.friendCheck.<code>`），`params` 填進去
    pub detail: String,
    /// 舊的檢查結果（存在資料庫裡的）沒有這兩欄
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
}

fn check(key: &str, label: &str, ok: bool, detail: Detail) -> FriendCheck {
    FriendCheck {
        key: key.into(),
        label: label.into(),
        ok,
        detail: detail.english,
        code: detail.code.into(),
        params: detail.params,
    }
}

/// 一項檢查的說明：英文一份、代號一個、要填進翻譯的值
struct Detail {
    code: &'static str,
    english: String,
    params: BTreeMap<String, String>,
}

fn detail(code: &'static str, english: impl Into<String>) -> Detail {
    Detail { code, english: english.into(), params: BTreeMap::new() }
}

impl Detail {
    fn with(mut self, key: &str, value: impl std::fmt::Display) -> Self {
        self.params.insert(key.into(), value.to_string());
        self
    }
}

/// 抓不到一頁的原因
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FetchFail {
    BadUrl,
    Timeout,
    Unreachable,
    PrivateNetwork,
}

impl FetchFail {
    fn detail(self) -> Detail {
        match self {
            Self::BadUrl => detail("fetch_bad_url", "Can't fetch this URL"),
            Self::Timeout => detail("fetch_timeout", "Timed out"),
            Self::Unreachable => detail("fetch_unreachable", "Can't connect"),
            Self::PrivateNetwork => detail("fetch_private", "Points to a private network"),
        }
    }
}

struct Page {
    status: u16,
    ms: u128,
    body: String,
}

/// 安全地抓一頁：過 net_guard、連線後再驗一次實際的 IP（擋 DNS rebinding 與轉址進內網）、
/// 只讀前 [`PAGE_MAX_BYTES`]
async fn fetch_page(http: &reqwest::Client, raw: &str) -> Result<Page, FetchFail> {
    let (url, _) = crate::net_guard::validate_url(raw).ok_or(FetchFail::BadUrl)?;
    let started = Instant::now();
    let mut resp = http
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (compatible; koimsurai-friend-check)")
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| if e.is_timeout() { FetchFail::Timeout } else { FetchFail::Unreachable })?;
    if let Some(addr) = resp.remote_addr()
        && crate::net_guard::is_blocked_ip(&addr.ip())
    {
        return Err(FetchFail::PrivateNetwork);
    }
    let ms = started.elapsed().as_millis();
    let status = resp.status().as_u16();
    let mut buf: Vec<u8> = Vec::new();
    while buf.len() < PAGE_MAX_BYTES {
        match resp.chunk().await {
            Ok(Some(chunk)) => buf.extend_from_slice(&chunk),
            _ => break,
        }
    }
    buf.truncate(PAGE_MAX_BYTES);
    Ok(Page { status, ms, body: String::from_utf8_lossy(&buf).into_owned() })
}

/// 從首頁的 `<link rel="alternate" type="application/rss+xml" href="…">` 找 feed（相對網址照首頁補齊）
pub fn discover_feed(html: &str, base: &str) -> Option<String> {
    static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<link\b[^>]*>").expect("固定的正規式"));
    static TYPE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?i)\btype\s*=\s*["']application/(rss|atom)\+xml["']"#).expect("固定的正規式")
    });
    static HREF: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?i)\bhref\s*=\s*["']([^"']+)["']"#).expect("固定的正規式"));
    let tag = LINK.find_iter(html).map(|m| m.as_str()).find(|t| TYPE.is_match(t))?;
    let href = HREF.captures(tag)?.get(1)?.as_str();
    let joined = reqwest::Url::parse(base).ok()?.join(href).ok()?;
    matches!(joined.scheme(), "http" | "https").then(|| joined.to_string())
}

/// feed 上最新的一篇日期（RSS 是 RFC 2822、Atom 是 RFC 3339；兩種都看不懂就跳過那篇）
pub fn latest_date(posts: &[FriendPost]) -> Option<DateTime<Utc>> {
    posts
        .iter()
        .filter_map(|p| p.date.as_deref())
        .filter_map(|d| {
            DateTime::parse_from_rfc2822(d.trim())
                .or_else(|_| DateTime::parse_from_rfc3339(d.trim()))
                .ok()
                .map(|t| t.with_timezone(&Utc))
        })
        .max()
}

/// 頁面裡有沒有連到這個站（找 host 字串就好：友鏈頁上的連結、文字都算）
pub fn links_back(html: &str, our_host: &str) -> bool {
    !our_host.is_empty() && html.to_ascii_lowercase().contains(&our_host.to_ascii_lowercase())
}

/// mx-space 系的前端（Shiro、Shiroi、Yohaku）友鏈清單是瀏覽器打開後才從 API 載入的，
/// 伺服器回的 HTML 裡根本沒有那份清單，照 HTML 找一定判成沒放。那些前端會把 API 位址寫在
/// `window.__ENV` 的 `NEXT_PUBLIC_API_URL`，友鏈固定在 `{API}/links/all`（v2、v3 都是）
pub fn mx_space_links_url(html: &str) -> Option<String> {
    static API: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#""NEXT_PUBLIC_API_URL"\s*:\s*"(https?://[^"\s]+)""#).expect("固定的正規式")
    });
    if !html.contains("mx-space") {
        return None;
    }
    let api = API.captures(html)?.get(1)?.as_str().trim_end_matches('/');
    Some(format!("{api}/links/all"))
}

/// 五項自動檢查。回傳結果，以及首頁上找到的 feed（申請時沒填 feed 的話用這個）
pub async fn run_checks(
    http: &reqwest::Client,
    url: &str,
    feed_url: Option<&str>,
    our_host: &str,
    now: DateTime<Utc>,
) -> (Vec<FriendCheck>, Option<String>) {
    let home = fetch_page(http, url).await;
    let mut out = Vec::with_capacity(5);

    let reachable = matches!(&home, Ok(p) if (200..300).contains(&p.status));
    out.push(match &home {
        Ok(p) => check(
            "reachable",
            "Site is reachable",
            reachable,
            detail("reachable_status", format!("{} · {} ms", p.status, p.ms))
                .with("status", p.status)
                .with("ms", p.ms),
        ),
        Err(e) => check("reachable", "Site is reachable", false, e.detail()),
    });

    let https = url.starts_with("https://");
    out.push(check(
        "https",
        "HTTPS",
        https && reachable,
        if !https {
            detail("https_no", "Not HTTPS")
        } else if reachable {
            detail("https_ok", "Valid certificate, connection OK")
        } else {
            detail("https_unknown", "Can't connect, can't tell")
        },
    ));

    let html = home.as_ref().map(|p| p.body.as_str()).unwrap_or_default();
    let discovered = if feed_url.is_none() { discover_feed(html, url) } else { None };
    let feed = feed_url.map(String::from).or_else(|| discovered.clone());
    let posts = match &feed {
        Some(f) => match fetch_page(http, f).await {
            Ok(p) if (200..300).contains(&p.status) => recent_posts(&p.body),
            _ => Vec::new(),
        },
        None => Vec::new(),
    };
    let latest = latest_date(&posts);
    out.push(match (&feed, posts.len()) {
        (None, _) => {
            check("feed", "RSS works", false, detail("feed_missing", "No RSS link on the home page"))
        }
        (Some(_), 0) => {
            check("feed", "RSS works", false, detail("feed_empty", "Can't fetch it, or it has no posts"))
        }
        (Some(_), n) => check(
            "feed",
            "RSS works",
            true,
            match latest {
                None => detail("feed_count", format!("{n} posts")).with("count", n),
                Some(d) => {
                    let date = d.format("%Y.%m.%d");
                    detail("feed_count_latest", format!("{n} posts · latest {date}"))
                        .with("count", n)
                        .with("date", date)
                }
            },
        ),
    });

    out.push(match latest {
        Some(d) => check(
            "recent",
            "Updated in the last three months",
            (now - d).num_days() <= RECENT_DAYS,
            detail("", d.format("%Y.%m.%d").to_string()),
        ),
        None => check(
            "recent",
            "Updated in the last three months",
            false,
            detail("recent_unknown", "Can't tell when the latest post was"),
        ),
    });

    // 首頁沒有就看友鏈頁常見的位置（同一個站底下）
    let mut back = links_back(html, our_host).then(|| detail("backlink_home", "On the home page"));
    if back.is_none()
        && reachable
        && let Ok(base) = reqwest::Url::parse(url)
    {
        for p in ["/friends", "/links", "/link"] {
            let Ok(u) = base.join(p) else { continue };
            if let Ok(page) = fetch_page(http, u.as_str()).await
                && (200..300).contains(&page.status)
                && links_back(&page.body, our_host)
            {
                back = Some(detail("backlink_page", format!("On {p}")).with("path", p));
                break;
            }
        }
    }
    // 還是沒有：mx-space 的友鏈在 API 裡（見 mx_space_links_url）。API 位址是對方 HTML 寫的，
    // 一樣走 fetch_page，過 net_guard
    if back.is_none()
        && let Some(api) = mx_space_links_url(html)
        && let Ok(page) = fetch_page(http, &api).await
        && (200..300).contains(&page.status)
        && links_back(&page.body, our_host)
    {
        back = Some(detail("backlink_mx", "In their mx-space friends list"));
    }
    out.push(match back {
        Some(where_) => check("backlink", "Links back here", true, where_),
        None => check(
            "backlink",
            "Links back here",
            false,
            detail("backlink_missing", format!("{our_host} isn't on the home page, /friends or /links"))
                .with("host", our_host),
        ),
    });

    (out, discovered)
}

/// 這個站的 host（SITE_URL），找對方有沒有連回來用
fn our_host() -> String {
    crate::identity::site_host()
}

// ── 公開：送出申請 ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ApplyBody {
    name: Option<String>,
    url: Option<String>,
    description: Option<String>,
    feed_url: Option<String>,
    email: Option<String>,
    message: Option<String>,
    /// 隱藏欄位：真人看不到也不會填，填了的是機器人
    website: Option<String>,
}

/// 已經在名單上（還在審、等等、或已經是朋友）的同一個網站
async fn duplicate_of(pool: &SqlitePool, url: &str) -> sqlx::Result<bool> {
    let Some(host) = host_of(url) else { return Ok(false) };
    let urls = sqlx::query_scalar::<_, String>(
        "SELECT url FROM friend_links WHERE status IN ('pending', 'waiting', 'approved')",
    )
    .fetch_all(pool)
    .await?;
    Ok(urls.iter().any(|u| host_of(u).as_deref() == Some(host.as_str())))
}

/// `POST /api/friends/apply`
#[utoipa::path(post, path = "/api/friends/apply", tag = "home", request_body = ApplyBody,
    responses(
        (status = 201, description = "收到申請"),
        (status = 400, description = "欄位不對"),
        (status = 403, description = "IP 在黑名單上"),
        (status = 409, description = "這個網站已經在名單上或還在審"),
        (status = 429, description = "同一個 IP 一天送太多份"),
    ))]
pub async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    crate::error::JsonBody(b): crate::error::JsonBody<ApplyBody>,
) -> Response {
    // 機器人：假裝收到了，不存、也不告訴它哪裡露餡
    if b.website.as_deref().is_some_and(|w| !w.trim().is_empty()) {
        return (StatusCode::CREATED, Json(json!({ "message": "Received" }))).into_response();
    }
    let app = match validate(
        b.name.as_deref(),
        b.url.as_deref(),
        b.description.as_deref(),
        b.feed_url.as_deref(),
        b.email.as_deref(),
        b.message.as_deref(),
    ) {
        Ok(a) => a,
        Err(e) => return e.respond(StatusCode::BAD_REQUEST),
    };
    if host_of(&app.url).is_some_and(|h| h == our_host()) {
        return Problem::new("own_site", "That's this site's own URL").respond(StatusCode::BAD_REQUEST);
    }

    let ip = crate::handlers::comments::client_ip(&headers);
    let pool = &state.pool;
    let blocked = sqlx::query_scalar::<_, i64>("SELECT id FROM ip_blacklist WHERE ip = ?")
        .bind(&ip)
        .fetch_optional(pool)
        .await;
    match blocked {
        Ok(Some(_)) => {
            return Problem::new("network_blocked", "Applications can't be sent from this network right now")
                .respond(StatusCode::FORBIDDEN);
        }
        Ok(None) => {}
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
    if !ip.is_empty() {
        let today = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM friend_links WHERE ip = ? AND created_at >= datetime('now', '-1 day')",
        )
        .bind(&ip)
        .fetch_one(pool)
        .await;
        match today {
            Ok(n) if n >= APPLY_PER_IP_PER_DAY => {
                return Problem::new("too_many_today", "Too many applications today, try again tomorrow")
                    .respond(StatusCode::TOO_MANY_REQUESTS);
            }
            Ok(_) => {}
            Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        }
    }
    match duplicate_of(pool, &app.url).await {
        Ok(true) => {
            return Problem::new("already_listed", "This site is already listed or under review")
                .respond(StatusCode::CONFLICT);
        }
        Ok(false) => {}
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }

    let r = sqlx::query(
        "INSERT INTO friend_links (name, url, description, feed_url, email, message, status, ip) \
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    )
    .bind(&app.name)
    .bind(&app.url)
    .bind(&app.description)
    .bind(&app.feed_url)
    .bind(&app.email)
    .bind(&app.message)
    .bind(&ip)
    .execute(pool)
    .await;
    match r {
        Ok(r) => (StatusCode::CREATED, Json(json!({ "message": "Received", "id": r.last_insert_rowid() })))
            .into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

// ── 後台 ──────────────────────────────────────────────────────────────

#[derive(Debug, FromRow)]
struct DbRow {
    id: i64,
    slug: Option<String>,
    name: String,
    url: String,
    description: String,
    feed_url: Option<String>,
    email: Option<String>,
    message: Option<String>,
    status: String,
    checks: Option<String>,
    checked_at: Option<String>,
    sort_order: i64,
    created_at: String,
    reviewed_at: Option<String>,
}

/// 後台的一列（申請者的 IP 不給前端）
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminFriendRow {
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    pub slug: Option<String>,
    pub name: String,
    pub url: String,
    pub description: String,
    pub feed_url: Option<String>,
    pub email: Option<String>,
    pub message: Option<String>,
    /// pending | waiting | approved | rejected
    pub status: String,
    /// 最近一次自動檢查；還沒檢查過是空陣列
    pub checks: Vec<FriendCheck>,
    pub checked_at: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub sort_order: i64,
    pub created_at: String,
    pub reviewed_at: Option<String>,
}

impl From<DbRow> for AdminFriendRow {
    fn from(r: DbRow) -> Self {
        Self {
            id: r.id,
            slug: r.slug,
            name: r.name,
            url: r.url,
            description: r.description,
            feed_url: r.feed_url,
            email: r.email,
            message: r.message,
            status: r.status,
            checks: r.checks.as_deref().and_then(|c| serde_json::from_str(c).ok()).unwrap_or_default(),
            checked_at: r.checked_at,
            sort_order: r.sort_order,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at,
        }
    }
}

#[derive(Debug, Default, Serialize, specta::Type, utoipa::ToSchema)]
pub struct FriendCounts {
    #[specta(type = specta_typescript::Number)]
    pub pending: i64,
    #[specta(type = specta_typescript::Number)]
    pub waiting: i64,
    #[specta(type = specta_typescript::Number)]
    pub approved: i64,
    #[specta(type = specta_typescript::Number)]
    pub rejected: i64,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminFriendsResponse {
    pub friends: Vec<AdminFriendRow>,
    pub counts: FriendCounts,
}

const SELECT_ROW: &str = "SELECT id, slug, name, url, description, feed_url, email, message, status, checks, \
     checked_at, sort_order, created_at, reviewed_at FROM friend_links";

async fn load(pool: &SqlitePool, id: i64) -> sqlx::Result<Option<AdminFriendRow>> {
    let sql = format!("{SELECT_ROW} WHERE id = ?");
    Ok(sqlx::query_as::<_, DbRow>(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(Into::into))
}

/// `GET /api/admin/friends` —— 全部（新的在前；朋友照排序）
#[utoipa::path(get, path = "/api/admin/friends", tag = "admin", security(("bearer" = [])),
    responses((status = 200, body = AdminFriendsResponse), (status = 401, description = "未授權")))]
pub async fn admin_friends(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
) -> Result<Json<AdminFriendsResponse>, crate::error::AppError> {
    let sql = format!(
        "{SELECT_ROW} ORDER BY CASE status WHEN 'approved' THEN 1 ELSE 0 END, \
         CASE status WHEN 'approved' THEN sort_order END, created_at DESC, id DESC"
    );
    let rows = sqlx::query_as::<_, DbRow>(sqlx::AssertSqlSafe(sql.as_str())).fetch_all(&state.pool).await?;
    let mut counts = FriendCounts::default();
    for r in &rows {
        match r.status.as_str() {
            "pending" => counts.pending += 1,
            "waiting" => counts.waiting += 1,
            "approved" => counts.approved += 1,
            "rejected" => counts.rejected += 1,
            _ => {}
        }
    }
    Ok(Json(AdminFriendsResponse { friends: rows.into_iter().map(Into::into).collect(), counts }))
}

/// 收下時：沒有 slug 就給一個（跟別人撞了就接上 id），排到朋友的最後面
async fn on_approve(pool: &SqlitePool, id: i64, url: &str) -> sqlx::Result<()> {
    let base = slug_for(url).unwrap_or_else(|| format!("f{id}"));
    let taken = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM friend_links WHERE slug = ? AND id <> ?")
        .bind(&base)
        .bind(id)
        .fetch_one(pool)
        .await?;
    let slug = if taken > 0 { format!("{base}-{id}") } else { base };
    sqlx::query(
        "UPDATE friend_links SET slug = COALESCE(slug, ?), \
         sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM friend_links WHERE status = 'approved' AND id <> ?) \
         WHERE id = ?",
    )
    .bind(&slug)
    .bind(id)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CreateFriendBody {
    name: Option<String>,
    url: Option<String>,
    description: Option<String>,
    feed_url: Option<String>,
}

/// `POST /api/admin/friends` —— 站長直接加一位朋友（不經過申請）
#[utoipa::path(post, path = "/api/admin/friends", tag = "admin", security(("bearer" = [])), request_body = CreateFriendBody,
    responses((status = 201, body = AdminFriendRow), (status = 400, description = "欄位不對"), (status = 401, description = "未授權")))]
pub async fn admin_create_friend(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    crate::error::JsonBody(b): crate::error::JsonBody<CreateFriendBody>,
) -> Response {
    let app = match validate(
        b.name.as_deref(),
        b.url.as_deref(),
        b.description.as_deref(),
        b.feed_url.as_deref(),
        None,
        None,
    ) {
        Ok(a) => a,
        Err(e) => return e.respond(StatusCode::BAD_REQUEST),
    };
    let id = match sqlx::query(
        "INSERT INTO friend_links (name, url, description, feed_url, status, reviewed_at) \
         VALUES (?, ?, ?, ?, 'approved', datetime('now'))",
    )
    .bind(&app.name)
    .bind(&app.url)
    .bind(&app.description)
    .bind(&app.feed_url)
    .execute(&state.pool)
    .await
    {
        Ok(r) => r.last_insert_rowid(),
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if let Err(e) = on_approve(&state.pool, id, &app.url).await {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    tokio::spawn(crate::revalidate::fire());
    match load(&state.pool, id).await {
        Ok(Some(row)) => (StatusCode::CREATED, Json(row)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct UpdateFriendBody {
    name: Option<String>,
    url: Option<String>,
    description: Option<String>,
    /// 空字串 = 清掉
    feed_url: Option<String>,
    status: Option<String>,
    sort_order: Option<i64>,
    /// 回信：寄到對方留的信箱（沒留信箱的不能回）
    reply: Option<String>,
}

/// `PATCH /api/admin/friends/:id` —— 審核（改狀態、可附回信）與編輯
#[utoipa::path(patch, path = "/api/admin/friends/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = i64, Path)), request_body = UpdateFriendBody,
    responses(
        (status = 200, description = "更新後的那一列，回信有寄的話附 mail 結果"),
        (status = 400, description = "欄位不對"),
        (status = 401, description = "未授權"),
        (status = 404, description = "找不到"),
    ))]
pub async fn admin_update_friend(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    crate::error::PathParam(id): crate::error::PathParam<i64>,
    crate::error::JsonBody(b): crate::error::JsonBody<UpdateFriendBody>,
) -> Response {
    let before = match load(&state.pool, id).await {
        Ok(Some(r)) => r,
        Ok(None) => return friend_missing(),
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if let Some(s) = &b.status
        && !STATUSES.contains(&s.as_str())
    {
        return Problem::new("status_invalid", format!("Invalid status: {s}"))
            .param("status", s.as_str())
            .respond(StatusCode::BAD_REQUEST);
    }
    // 有帶的欄位跟原本的合起來再驗一次，規則跟申請表單一樣
    let feed = match b.feed_url.as_deref() {
        None => before.feed_url.clone(),
        Some(f) if f.trim().is_empty() => None,
        Some(f) => Some(f.to_string()),
    };
    let app = match validate(
        Some(b.name.as_deref().unwrap_or(&before.name)),
        Some(b.url.as_deref().unwrap_or(&before.url)),
        Some(b.description.as_deref().unwrap_or(&before.description)),
        feed.as_deref(),
        before.email.as_deref(),
        None,
    ) {
        Ok(a) => a,
        Err(e) => return e.respond(StatusCode::BAD_REQUEST),
    };
    let reply = b.reply.as_deref().map(str::trim).filter(|r| !r.is_empty());
    if reply.is_some() && before.email.is_none() {
        return Problem::new("reply_no_email", "They didn't leave an email, so you can't reply")
            .respond(StatusCode::BAD_REQUEST);
    }
    let status = b.status.clone().unwrap_or_else(|| before.status.clone());
    let status_changed = status != before.status;

    let r = sqlx::query(
        "UPDATE friend_links SET name = ?, url = ?, description = ?, feed_url = ?, status = ?, \
         sort_order = COALESCE(?, sort_order), \
         reviewed_at = CASE WHEN ? THEN datetime('now') ELSE reviewed_at END WHERE id = ?",
    )
    .bind(&app.name)
    .bind(&app.url)
    .bind(&app.description)
    .bind(&app.feed_url)
    .bind(&status)
    .bind(b.sort_order)
    .bind(status_changed)
    .bind(id)
    .execute(&state.pool)
    .await;
    if let Err(e) = r {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    if status_changed
        && status == "approved"
        && let Err(e) = on_approve(&state.pool, id, &app.url).await
    {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    // 朋友頁的名單變了（收下、拿掉、或是朋友的資料改了）就請前端清快取
    if before.status == "approved" || status == "approved" {
        tokio::spawn(crate::revalidate::fire());
    }

    let mail = match (reply, before.email.as_deref()) {
        (Some(text), Some(to)) => {
            let subject = format!("關於「{}」的友鏈申請", app.name);
            let (html, plain) =
                crate::handlers::mailer::render_friend_reply(&crate::identity::site_url(), &app.name, text);
            Some(match crate::handlers::mailer::send_one(&state, to, &subject, &plain, &html).await {
                Ok(()) => json!({ "sent": true }),
                Err(e) => json!({ "sent": false, "error": e }),
            })
        }
        _ => None,
    };
    match load(&state.pool, id).await {
        Ok(Some(row)) => Json(json!({ "friend": row, "mail": mail })).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// `DELETE /api/admin/friends/:id`
#[utoipa::path(delete, path = "/api/admin/friends/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = i64, Path)),
    responses((status = 200, description = "已刪除"), (status = 401, description = "未授權"), (status = 404, description = "找不到")))]
pub async fn admin_delete_friend(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    crate::error::PathParam(id): crate::error::PathParam<i64>,
) -> Response {
    let was_friend = match load(&state.pool, id).await {
        Ok(Some(r)) => r.status == "approved",
        Ok(None) => return friend_missing(),
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    if let Err(e) = sqlx::query("DELETE FROM friend_links WHERE id = ?").bind(id).execute(&state.pool).await {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    if was_friend {
        tokio::spawn(crate::revalidate::fire());
    }
    Json(json!({ "message": "Deleted" })).into_response()
}

fn friend_missing() -> Response {
    Problem::new("friend_missing", "Application not found").respond(StatusCode::NOT_FOUND)
}

/// `POST /api/admin/friends/:id/check` —— 跑一次自動檢查並存起來
#[utoipa::path(post, path = "/api/admin/friends/{id}/check", tag = "admin", security(("bearer" = [])),
    params(("id" = i64, Path)),
    responses((status = 200, body = AdminFriendRow), (status = 401, description = "未授權"), (status = 404, description = "找不到")))]
pub async fn admin_check_friend(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    crate::error::PathParam(id): crate::error::PathParam<i64>,
) -> Response {
    let row = match load(&state.pool, id).await {
        Ok(Some(r)) => r,
        Ok(None) => return friend_missing(),
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let (checks, discovered) =
        run_checks(&state.http, &row.url, row.feed_url.as_deref(), &our_host(), Utc::now()).await;
    let r = sqlx::query(
        "UPDATE friend_links SET checks = ?, checked_at = datetime('now'), feed_url = COALESCE(feed_url, ?) WHERE id = ?",
    )
    .bind(serde_json::to_string(&checks).unwrap_or_default())
    .bind(&discovered)
    .bind(id)
    .execute(&state.pool)
    .await;
    if let Err(e) = r {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    match load(&state.pool, id).await {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(url: &str) -> Application {
        validate(Some("站"), Some(url), None, None, None, None).unwrap()
    }

    #[test]
    fn 網址整理_根路徑拿掉結尾斜線_其他照舊() {
        assert_eq!(ok("https://a.example/").url, "https://a.example");
        assert_eq!(ok("  https://a.example  ").url, "https://a.example");
        assert_eq!(ok("https://a.example/blog/").url, "https://a.example/blog/");
    }

    #[test]
    fn 網址要是公開的_http_s() {
        for bad in [
            "",
            "ftp://a.example",
            "javascript:alert(1)",
            "http://127.0.0.1",
            "http://localhost:3000",
            "http://10.0.0.1",
        ] {
            assert!(validate(Some("站"), Some(bad), None, None, None, None).is_err(), "{bad} 不該收");
        }
        assert!(
            validate(
                Some("站"),
                Some(&format!("https://a.example/{}", "x".repeat(400))),
                None,
                None,
                None,
                None
            )
            .is_err()
        );
    }

    #[test]
    fn 必填與長度() {
        assert_eq!(
            validate(None, Some("https://a.example"), None, None, None, None).unwrap_err().code,
            "name_empty"
        );
        assert!(validate(Some("  "), Some("https://a.example"), None, None, None, None).is_err());
        assert!(validate(Some(&"名".repeat(41)), Some("https://a.example"), None, None, None, None).is_err());
        assert!(
            validate(Some(&"名".repeat(40)), Some("https://a.example"), None, None, None, None).is_ok(),
            "40 個字剛好可以"
        );
        assert!(
            validate(Some("站"), Some("https://a.example"), Some(&"介".repeat(121)), None, None, None)
                .is_err()
        );
        assert!(
            validate(Some("站"), Some("https://a.example"), None, None, None, Some(&"話".repeat(501)))
                .is_err()
        );
    }

    #[test]
    fn 信箱只擋明顯不對的() {
        let with = |e: &str| validate(Some("站"), Some("https://a.example"), None, None, Some(e), None);
        assert!(with("me@a.example").is_ok());
        assert!(with("  ").unwrap().email.is_none(), "空白當成沒填");
        for bad in ["me", "me@", "@a.example", "me@nodot", "me @a.example", "me@.example"] {
            assert!(with(bad).is_err(), "{bad} 不該收");
        }
    }

    #[test]
    fn feed_也要是公開網址() {
        let with = |f: &str| validate(Some("站"), Some("https://a.example"), None, Some(f), None, None);
        assert_eq!(
            with("https://a.example/rss.xml").unwrap().feed_url.as_deref(),
            Some("https://a.example/rss.xml")
        );
        assert_eq!(with("http://192.168.0.1/rss").unwrap_err().code, "feed_url_invalid");
    }

    #[test]
    fn host_與_slug() {
        assert_eq!(host_of("https://WWW.Blog.Example/x").as_deref(), Some("blog.example"));
        assert_eq!(slug_for("https://blog.doraeyi.com").as_deref(), Some("blog-doraeyi-com"));
        assert_eq!(slug_for("https://www.a.example").as_deref(), Some("a-example"));
    }

    #[test]
    fn mx_space_的友鏈在_api_裡_從_html_找出位址() {
        // 實際的樣子（inkcodes.com，Yohaku 主題）：API 位址寫在 window.__ENV，HTML 裡沒有友鏈清單
        let html = r#"<script>window.__ENV = {"NEXT_PUBLIC_API_URL":"https://api.inkcodes.com/api/v3","NEXT_PUBLIC_GATEWAY_URL":"https://api.inkcodes.com"}</script>
            <script>console.info("%c Mix Space %c https://github.com/mx-space")</script>"#;
        assert_eq!(mx_space_links_url(html).as_deref(), Some("https://api.inkcodes.com/api/v3/links/all"));
        // 結尾多一條斜線也一樣
        let slash = html.replace("/api/v3\"", "/api/v2/\"");
        assert_eq!(mx_space_links_url(&slash).as_deref(), Some("https://api.inkcodes.com/api/v2/links/all"));
        // 不是 mx-space 的 Next.js 站（一樣有 NEXT_PUBLIC_API_URL）不去猜
        assert_eq!(mx_space_links_url(r#"{"NEXT_PUBLIC_API_URL":"https://api.example"}"#), None);
        // 位址不是 http(s) 的不收
        assert_eq!(mx_space_links_url(r#"mx-space {"NEXT_PUBLIC_API_URL":"javascript:alert(1)"}"#), None);
    }

    #[test]
    fn 從首頁找_feed_相對網址照首頁補齊() {
        let html = r#"<head><link rel="stylesheet" href="/a.css">
            <link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml"></head>"#;
        assert_eq!(discover_feed(html, "https://a.example").as_deref(), Some("https://a.example/rss.xml"));
        let atom = r"<LINK href='https://feeds.example/atom' TYPE='application/atom+xml' rel=alternate>";
        assert_eq!(discover_feed(atom, "https://a.example").as_deref(), Some("https://feeds.example/atom"));
        assert_eq!(discover_feed(r#"<link rel="icon" href="/f.ico">"#, "https://a.example"), None);
        assert_eq!(
            discover_feed(
                r#"<link type="application/rss+xml" href="javascript:alert(1)">"#,
                "https://a.example"
            ),
            None,
            "javascript: 不是 feed"
        );
    }

    #[test]
    fn 最新一篇的日期_兩種格式都看得懂() {
        let p = |d: Option<&str>| FriendPost { title: "t".into(), url: None, date: d.map(String::from) };
        let posts = [
            p(Some("Fri, 23 Oct 2026 08:47:38 GMT")),
            p(Some("2026-10-24T07:38:44Z")),
            p(Some("亂寫")),
            p(None),
        ];
        assert_eq!(latest_date(&posts).map(|d| d.to_rfc3339()), Some("2026-10-24T07:38:44+00:00".into()));
        assert_eq!(latest_date(&[p(None)]), None);
    }

    #[test]
    fn 有沒有連回來_不分大小寫() {
        assert!(links_back(r#"<a href="https://Koimsurai.com">宙と木</a>"#, "koimsurai.com"));
        assert!(!links_back("<a href=\"https://other.example\">", "koimsurai.com"));
        assert!(!links_back("anything", ""), "不知道自己的 host 時不能算有連回來");
    }
}
