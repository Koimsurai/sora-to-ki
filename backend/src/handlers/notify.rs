//! 通知：站長回覆時寄信給原留言者，以及給站長自己的 webhook。
//!
//! **回覆信**只在站長回覆時寄（後台的回覆，或站長登入後在前台回覆），而且原留言者在表單上勾了
//! 「站長回覆時寄信通知我」（migration 0037 的 `notify_reply`）。email 欄誰都能亂填，所以預設不寄。
//! 信用留言當時的語系寫，附退訂連結（`/unsubscribe?reply=<notify_token>`）；退訂會把同一個信箱的
//! 勾選全部拿掉。寄信走 Resend（跟電子報、友鏈回信同一組設定），沒設就靜靜跳過。
//!
//! **webhook** 的網址存在 `site_settings` 的 `notify`（不在公開的站台設定裡：Discord 的 webhook
//! 網址本身就是密鑰）。依網址送不同格式：Discord、Slack 各送它們的，其他（ntfy、n8n、自己的服務）
//! 送通用 JSON。內容不帶 email 與 IP。
//!
//! 兩種通知都是發完就算：失敗記一行 warn，不影響留言或申請本身。

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    auth::OwnerAuth,
    error::{AppError, Problem},
    handlers::site_config::{default_locale, locale_prefix},
    identity::{site_author, site_name, site_url},
    state::AppState,
    util::escape_html,
};

const SETTINGS_KEY: &str = "notify";
const URL_MAX: usize = 500;
/// 通知裡留言內容最多放幾個字（Discord 一則上限 2000）
const EXCERPT_MAX: usize = 300;

// ── 設定 ──────────────────────────────────────────────────────────────

/// 後台的通知設定
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, utoipa::ToSchema)]
pub struct NotifySettings {
    /// 空字串是沒設
    #[serde(default)]
    pub webhook_url: String,
    /// 新留言（含待審）
    #[serde(default = "yes")]
    pub on_comment: bool,
    /// 友鏈申請
    #[serde(default = "yes")]
    pub on_friend: bool,
}

const fn yes() -> bool {
    true
}

/// 還沒存過時：沒有網址，兩類都開著（跟 serde 缺欄位時一樣，derive 的 Default 會給 false）
impl Default for NotifySettings {
    fn default() -> Self {
        Self { webhook_url: String::new(), on_comment: true, on_friend: true }
    }
}

async fn load(state: &AppState) -> NotifySettings {
    sqlx::query_scalar::<_, String>("SELECT value FROM site_settings WHERE key = ?")
        .bind(SETTINGS_KEY)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// 網址只收 http(s)，長度有上限；內網位址可以（自架的 n8n、ntfy 常在同一台）
fn check_url(url: &str) -> Result<(), Problem> {
    if url.is_empty() {
        return Ok(());
    }
    if url.len() > URL_MAX {
        return Err(Problem::new("url_too_long", "URL is too long").param("max", URL_MAX));
    }
    match reqwest::Url::parse(url) {
        Ok(u) if matches!(u.scheme(), "http" | "https") && u.host_str().is_some() => Ok(()),
        _ => Err(Problem::new("webhook_url_invalid", "Webhook URL must start with http:// or https://")),
    }
}

/// `GET /api/admin/notify` —— 通知設定，加上寄信那條管道有沒有設好
#[utoipa::path(get, path = "/api/admin/notify", tag = "admin", security(("bearer" = [])),
    responses((status = 200, description = "通知設定（動態 JSON）"), (status = 401, description = "未授權")))]
pub async fn admin_get(State(state): State<AppState>, _auth: OwnerAuth) -> Response {
    let s = load(&state).await;
    Json(json!({ "settings": s, "mail_ready": mail_ready() })).into_response()
}

/// `PUT /api/admin/notify`
#[utoipa::path(put, path = "/api/admin/notify", tag = "admin", security(("bearer" = [])),
    request_body = NotifySettings,
    responses(
        (status = 200, description = "存好的通知設定（動態 JSON）"),
        (status = 400, body = crate::handlers::admin::ErrorResponse, description = "網址不對"),
        (status = 401, description = "未授權"),
        (status = 415, body = crate::handlers::admin::ErrorResponse, description = "content-type 不是 application/json"),
        (status = 422, body = crate::handlers::admin::ErrorResponse, description = "body 欄位型別不符"),
    ))]
pub async fn admin_put(
    State(state): State<AppState>,
    _auth: OwnerAuth,
    crate::error::JsonBody(mut body): crate::error::JsonBody<NotifySettings>,
) -> Result<Response, AppError> {
    body.webhook_url = body.webhook_url.trim().to_string();
    if let Err(p) = check_url(&body.webhook_url) {
        return Ok(p.respond(StatusCode::BAD_REQUEST));
    }
    let raw = json!(body).to_string();
    sqlx::query(
        "INSERT INTO site_settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(SETTINGS_KEY)
    .bind(raw)
    .execute(&state.pool)
    .await?;
    Ok(Json(json!({ "settings": body, "mail_ready": mail_ready() })).into_response())
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct TestBody {
    /// 還沒存的網址也能先試
    #[serde(default)]
    webhook_url: String,
}

/// `POST /api/admin/notify/test` —— 送一則測試，回對方的狀態碼或錯誤
#[utoipa::path(post, path = "/api/admin/notify/test", tag = "admin", security(("bearer" = [])),
    request_body = TestBody,
    responses(
        (status = 200, description = "送出的結果（動態 JSON）"),
        (status = 400, body = crate::handlers::admin::ErrorResponse, description = "網址不對"),
        (status = 401, description = "未授權"),
        (status = 415, body = crate::handlers::admin::ErrorResponse, description = "content-type 不是 application/json"),
        (status = 422, body = crate::handlers::admin::ErrorResponse, description = "body 欄位型別不符"),
    ))]
pub async fn admin_test(
    State(state): State<AppState>,
    _auth: OwnerAuth,
    crate::error::JsonBody(body): crate::error::JsonBody<TestBody>,
) -> Response {
    let url = body.webhook_url.trim();
    if url.is_empty() {
        return Problem::new("webhook_url_empty", "Webhook URL is empty").respond(StatusCode::BAD_REQUEST);
    }
    if let Err(p) = check_url(url) {
        return p.respond(StatusCode::BAD_REQUEST);
    }
    let copy = owner_copy(&default_locale());
    let event = Event { kind: "test", text: copy.test.to_string(), data: json!({}) };
    match send_webhook(&state, url, &event).await {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(e) => Json(json!({ "ok": false, "error": e })).into_response(),
    }
}

// ── webhook ───────────────────────────────────────────────────────────

/// 一則要送給站長的通知
#[derive(Debug, Clone)]
pub struct Event {
    /// comment／friend／test（通用 JSON 的 `event`）
    kind: &'static str,
    /// 給人看的那一段（Discord、Slack 只送這個）
    text: String,
    /// 通用 JSON 的 `data`
    data: Value,
}

#[derive(Debug, PartialEq, Eq)]
enum Flavor {
    Discord,
    Slack,
    Generic,
}

fn flavor(url: &str) -> Flavor {
    let host = reqwest::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_ascii_lowercase));
    match host.as_deref() {
        Some("discord.com" | "discordapp.com" | "ptb.discord.com" | "canary.discord.com") => Flavor::Discord,
        Some("hooks.slack.com") => Flavor::Slack,
        _ => Flavor::Generic,
    }
}

/// Slack 的 mrkdwn 只要跳脫這三個字元，讀者寫的 `<!channel>` 就不會變成提及
fn slack_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn payload(flavor: &Flavor, event: &Event) -> Value {
    match flavor {
        // allowed_mentions 空的：讀者在留言裡寫 @everyone 也不會真的提及
        Flavor::Discord => json!({
            "username": site_name(),
            "content": event.text,
            "allowed_mentions": { "parse": [] },
        }),
        Flavor::Slack => json!({ "text": slack_escape(&event.text) }),
        Flavor::Generic => json!({
            "event": event.kind,
            "site": site_url(),
            "text": event.text,
            "data": event.data,
        }),
    }
}

async fn send_webhook(state: &AppState, url: &str, event: &Event) -> Result<(), String> {
    let res = state
        .http
        .post(url)
        .timeout(std::time::Duration::from_secs(10))
        .json(&payload(&flavor(url), event))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status().is_success() { Ok(()) } else { Err(format!("HTTP {}", res.status().as_u16())) }
}

/// 照設定送出去（沒設網址、那一類關著就不送）；在背景送，不擋呼叫端
fn fire(state: &AppState, event: Event, wanted: fn(&NotifySettings) -> bool) {
    let state = state.clone();
    tokio::spawn(async move {
        let s = load(&state).await;
        if s.webhook_url.is_empty() || !wanted(&s) {
            return;
        }
        if let Err(e) = send_webhook(&state, &s.webhook_url, &event).await {
            tracing::warn!("[notify] webhook ({}) failed: {e}", event.kind);
        }
    });
}

/// 字數截斷（照字元，不切壞多位元組字），超過補上「…」
fn excerpt(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

/// 新留言（站長自己的不算）
pub fn comment_created(state: &AppState, target: Target, author: &str, content: &str, pending: bool) {
    let state2 = state.clone();
    let (author, content) = (author.to_string(), excerpt(content, EXCERPT_MAX));
    tokio::spawn(async move {
        let locale = default_locale();
        let copy = owner_copy(&locale);
        let place = target.describe(&state2, &locale).await;
        let head = if pending { copy.comment_pending } else { copy.comment };
        let admin = format!("{}/admin/comments", site_url());
        let text = format!("{}\n{author}：{content}\n{admin}", head.replace("{where}", &place.label));
        let data = json!({
            "where": place.label,
            "url": place.url,
            "author": author,
            "content": content,
            "status": if pending { "pending" } else { "approved" },
            "admin_url": admin,
        });
        fire(&state2, Event { kind: "comment", text, data }, |s| s.on_comment);
    });
}

/// 新的友鏈申請
pub fn friend_applied(state: &AppState, name: &str, url: &str, message: Option<&str>) {
    let copy = owner_copy(&default_locale());
    let admin = format!("{}/admin/friends", site_url());
    let note = message.map(|m| excerpt(m, EXCERPT_MAX)).filter(|m| !m.is_empty());
    let mut text = copy.friend.replace("{name}", name).replace("{url}", url);
    if let Some(m) = &note {
        text = format!("{text}\n{m}");
    }
    text = format!("{text}\n{admin}");
    let data = json!({ "name": name, "url": url, "message": note, "admin_url": admin });
    fire(state, Event { kind: "friend", text, data }, |s| s.on_friend);
}

// ── 回覆信 ────────────────────────────────────────────────────────────

/// 留言掛在哪裡
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Post(String),
    Thought(String),
    Page(String),
}

struct Place {
    label: String,
    url: String,
}

impl Target {
    #[must_use]
    pub fn from_columns(post_id: Option<i64>, thought_id: Option<i64>, page: Option<String>) -> Option<Self> {
        post_id
            .map(|i| Self::Post(i.to_string()))
            .or_else(|| thought_id.map(|i| Self::Thought(i.to_string())))
            .or_else(|| page.map(Self::Page))
    }

    /// 給人看的名字與網址（照讀者的語系）
    async fn describe(&self, state: &AppState, locale: &str) -> Place {
        let copy = owner_copy(locale);
        let prefix = locale_prefix(locale);
        let base = if prefix.is_empty() { site_url() } else { format!("{}/{prefix}", site_url()) };
        match self {
            Self::Post(id) => {
                // 有這個語系的譯名就用譯名
                let col = format!("title_{}", locale.to_ascii_lowercase().replace('-', "_"));
                let sql = if crate::handlers::posts::I18N_LOCALES.contains(&locale) {
                    format!("SELECT COALESCE(NULLIF({col}, ''), title) FROM posts WHERE id = ?")
                } else {
                    "SELECT title FROM posts WHERE id = ?".to_string()
                };
                let title = sqlx::query_scalar::<_, String>(sqlx::AssertSqlSafe(sql.as_str()))
                    .bind(id)
                    .fetch_optional(&state.pool)
                    .await
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                Place { label: title, url: format!("{base}/blog/{id}") }
            }
            Self::Thought(id) => {
                let content = sqlx::query_scalar::<_, String>("SELECT content FROM thoughts WHERE id = ?")
                    .bind(id)
                    .fetch_optional(&state.pool)
                    .await
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                Place {
                    label: format!("{}「{}」", copy.thought, excerpt(&content, 20)),
                    url: format!("{base}/thinking/{id}"),
                }
            }
            Self::Page(_) => Place { label: copy.messages.to_string(), url: format!("{base}/messages") },
        }
    }
}

fn mail_ready() -> bool {
    std::env::var("RESEND_API_KEY").is_ok_and(|k| !k.trim().is_empty())
        && crate::handlers::mailer::newsletter_from().is_some()
}

/// 站長回覆了 `parent_id` 那則留言：原留言者勾了通知、留了信箱、不是站長自己，就寄一封信
pub fn owner_replied(state: &AppState, parent_id: i64, reply: &str) {
    if !mail_ready() {
        return;
    }
    let state = state.clone();
    let reply = reply.to_string();
    tokio::spawn(async move {
        if let Err(e) = send_reply_mail(&state, parent_id, &reply).await {
            tracing::warn!("[notify] reply mail for comment {parent_id} failed: {e}");
        }
    });
}

#[derive(sqlx::FromRow)]
struct Parent {
    content: String,
    email: Option<String>,
    is_admin: Option<i64>,
    notify_reply: Option<i64>,
    notify_token: Option<String>,
    locale: Option<String>,
    post_id: Option<i64>,
    thought_id: Option<i64>,
    page: Option<String>,
}

async fn send_reply_mail(state: &AppState, parent_id: i64, reply: &str) -> Result<(), String> {
    let p = sqlx::query_as::<_, Parent>(
        "SELECT content, email, is_admin, notify_reply, notify_token, locale, post_id, thought_id, page \
         FROM comments WHERE id = ?",
    )
    .bind(parent_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("parent comment not found")?;
    let to = p.email.as_deref().map(str::trim).unwrap_or_default();
    let owner = crate::identity::owner_email();
    if p.notify_reply != Some(1)
        || p.is_admin == Some(1)
        || to.is_empty()
        || owner.as_deref().is_some_and(|o| o.eq_ignore_ascii_case(to))
    {
        return Ok(());
    }
    let token = p.notify_token.ok_or("no notify token")?;
    let locale = p
        .locale
        .filter(|l| crate::handlers::posts::I18N_LOCALES.contains(&l.as_str()))
        .unwrap_or_else(default_locale);
    let target = Target::from_columns(p.post_id, p.thought_id, p.page).ok_or("comment has no target")?;
    let place = target.describe(state, &locale).await;
    let mail = render_reply(&locale, &place.label, &place.url, &p.content, reply, &token);
    crate::handlers::mailer::send_one(state, to, &mail.subject, &mail.text, &mail.html).await
}

struct Mail {
    subject: String,
    text: String,
    html: String,
}

/// 段落：空一行分段、單一個換行是段內換行（跟友鏈回信一樣）
fn paragraphs(s: &str, style: &str) -> String {
    s.split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| format!("<p style=\"{style}\">{}</p>", escape_html(p).replace('\n', "<br>")))
        .collect::<Vec<_>>()
        .join("\n        ")
}

fn render_reply(locale: &str, place: &str, url: &str, original: &str, reply: &str, token: &str) -> Mail {
    let c = reader_copy(locale);
    let site = site_url();
    let author = site_author();
    let unsub = format!(
        "{site}{}/unsubscribe?reply={}",
        match locale_prefix(locale) {
            p if p.is_empty() => p,
            p => format!("/{p}"),
        },
        crate::util::encode_uri_component(token)
    );
    let subject = c.subject.replace("{author}", &author);
    let yours = c.yours.replace("{where}", place);
    let theirs = c.reply.replace("{author}", &author);
    let signature = crate::handlers::mailer::signature();
    let mono = "font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;";
    let label =
        format!("margin:0 0 10px 0;{mono}font-size:12px;letter-spacing:0.06em;color:rgba(241,236,227,0.5);");
    let quoted = paragraphs(
        &excerpt(original, 600),
        "margin:0 0 12px 0;font-size:15px;line-height:1.8;color:rgba(241,236,227,0.7);",
    );
    let answer = paragraphs(reply, "margin:0 0 18px 0;font-size:16px;line-height:1.85;color:#f1ece3;");
    let brand = escape_html(&site_name());
    let html = format!(
        r#"<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{subject_html}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:'Noto Serif TC','Source Han Serif TC','Songti TC','PMingLiU',Georgia,serif;color:#f1ece3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding:0 0 36px 0;">
        <a href="{site}" style="color:#f1ece3;text-decoration:none;font-size:20px;letter-spacing:0.01em;">{brand}</a>
      </td></tr>

      <tr><td style="padding:28px 0 8px 0;border-top:1px solid rgba(241,236,227,0.1);">
        <p style="{label}">{yours_html}</p>
        {quoted}
      </td></tr>

      <tr><td style="padding:16px 0 0 0;">
        <p style="{label}"><span style="color:#e9c17a;">●</span>&nbsp; {theirs_html}</p>
        {answer}
      </td></tr>

      <tr><td style="padding:4px 0 0 0;font-size:14px;line-height:1.8;color:rgba(241,236,227,0.55);">
        — {signature_html}
      </td></tr>
      <tr><td style="padding:12px 0 0 0;">
        <a href="{url_html}" style="{mono}font-size:13px;letter-spacing:0.06em;color:#e9c17a;text-decoration:none;border-bottom:1px dotted rgba(233,193,122,0.6);padding-bottom:2px;">{open}</a>
      </td></tr>

      <tr><td style="padding:40px 0 0 0;">
        <p style="margin:0;padding-top:20px;border-top:1px solid rgba(241,236,227,0.1);font-size:11px;line-height:1.8;color:rgba(241,236,227,0.4);">
          {why} <a href="{unsub_html}" style="color:rgba(241,236,227,0.7);text-decoration:underline;">{stop}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"#,
        lang = c.html_lang,
        subject_html = escape_html(&subject),
        yours_html = escape_html(&yours),
        theirs_html = escape_html(&theirs),
        signature_html = escape_html(&signature),
        url_html = escape_html(url),
        unsub_html = escape_html(&unsub),
        open = c.open,
        why = c.why,
        stop = c.stop,
    );
    let text = format!(
        "{yours}\n{}\n\n{theirs}\n{}\n\n— {signature}\n{url}\n\n{}\n{}: {unsub}",
        excerpt(original, 600),
        reply.trim(),
        c.why,
        c.stop,
    );
    Mail { subject, text, html }
}

// ── 字串 ──────────────────────────────────────────────────────────────

/// 寄給讀者的回覆信
struct ReaderCopy {
    html_lang: &'static str,
    subject: &'static str,
    yours: &'static str,
    reply: &'static str,
    open: &'static str,
    why: &'static str,
    stop: &'static str,
}

fn reader_copy(locale: &str) -> ReaderCopy {
    match locale {
        "zh-CN" => ReaderCopy {
            html_lang: "zh-Hans",
            subject: "{author} 回复了你的留言",
            yours: "你在〈{where}〉的留言",
            reply: "{author} 的回复",
            open: "去看看 →",
            why: "你留言时勾选了「站长回复时发邮件通知我」，所以收到这封邮件。",
            stop: "不再接收回复通知",
        },
        "en" => ReaderCopy {
            html_lang: "en",
            subject: "{author} replied to your comment",
            yours: "Your comment on “{where}”",
            reply: "{author}'s reply",
            open: "Read it →",
            why: "You're getting this because you ticked “Email me when the author replies”.",
            stop: "Stop reply emails",
        },
        "ja" => ReaderCopy {
            html_lang: "ja",
            subject: "{author} があなたのコメントに返信しました",
            yours: "「{where}」へのあなたのコメント",
            reply: "{author} の返信",
            open: "見に行く →",
            why: "コメント時に「管理人が返信したらメールで知らせる」にチェックしたため、このメールが届いています。",
            stop: "返信通知を止める",
        },
        "ko" => ReaderCopy {
            html_lang: "ko",
            subject: "{author}님이 댓글에 답글을 달았습니다",
            yours: "〈{where}〉에 남긴 댓글",
            reply: "{author}님의 답글",
            open: "보러 가기 →",
            why: "댓글을 남길 때 「운영자가 답글을 달면 메일로 알림」을 선택하셔서 이 메일을 받았습니다.",
            stop: "답글 알림 끄기",
        },
        _ => ReaderCopy {
            html_lang: "zh-Hant",
            subject: "{author} 回覆了你的留言",
            yours: "你在〈{where}〉的留言",
            reply: "{author} 的回覆",
            open: "去看看 →",
            why: "你留言時勾了「站長回覆時寄信通知我」，所以收到這封信。",
            stop: "不再收到回覆通知",
        },
    }
}

/// 給站長的 webhook（照站台的預設語系），以及留言位置的名稱
struct OwnerCopy {
    comment: &'static str,
    comment_pending: &'static str,
    friend: &'static str,
    test: &'static str,
    thought: &'static str,
    messages: &'static str,
}

fn owner_copy(locale: &str) -> OwnerCopy {
    match locale {
        "zh-CN" => OwnerCopy {
            comment: "新留言：{where}",
            comment_pending: "新留言（待审）：{where}",
            friend: "新的友链申请：{name}（{url}）",
            test: "测试通知：webhook 接好了。",
            thought: "碎念",
            messages: "留言页",
        },
        "en" => OwnerCopy {
            comment: "New comment: {where}",
            comment_pending: "New comment (awaiting review): {where}",
            friend: "New friend link request: {name} ({url})",
            test: "Test notification: the webhook works.",
            thought: "Moment",
            messages: "Guestbook",
        },
        "ja" => OwnerCopy {
            comment: "新しいコメント：{where}",
            comment_pending: "新しいコメント（承認待ち）：{where}",
            friend: "相互リンクの申請：{name}（{url}）",
            test: "テスト通知：webhook はつながっています。",
            thought: "つぶやき",
            messages: "掲示板",
        },
        "ko" => OwnerCopy {
            comment: "새 댓글: {where}",
            comment_pending: "새 댓글(검토 대기): {where}",
            friend: "새 링크 교환 신청: {name} ({url})",
            test: "테스트 알림: webhook이 연결되었습니다.",
            thought: "단상",
            messages: "방명록",
        },
        _ => OwnerCopy {
            comment: "新留言：{where}",
            comment_pending: "新留言（待審）：{where}",
            friend: "新的友鏈申請：{name}（{url}）",
            test: "測試通知：webhook 接好了。",
            thought: "碎念",
            messages: "留言頁",
        },
    }
}

// ── 退訂 ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct UnsubscribeBody {
    token: Option<String>,
}

/// `POST /api/comments/notify/unsubscribe` —— 回覆信裡的退訂：同一個信箱的勾選全部拿掉
#[utoipa::path(post, path = "/api/comments/notify/unsubscribe", tag = "posts",
    request_body = UnsubscribeBody,
    responses(
        (status = 200, description = "退訂好了（動態 JSON）"),
        (status = 404, body = crate::handlers::admin::ErrorResponse, description = "連結無效"),
        (status = 415, body = crate::handlers::admin::ErrorResponse, description = "content-type 不是 application/json"),
        (status = 422, body = crate::handlers::admin::ErrorResponse, description = "body 欄位型別不符"),
    ))]
pub async fn unsubscribe(
    State(state): State<AppState>,
    crate::error::JsonBody(body): crate::error::JsonBody<UnsubscribeBody>,
) -> Result<Response, AppError> {
    let token = body.token.unwrap_or_default();
    let email = if token.is_empty() {
        None
    } else {
        sqlx::query_scalar::<_, String>("SELECT email FROM comments WHERE notify_token = ?")
            .bind(&token)
            .fetch_optional(&state.pool)
            .await?
    };
    let Some(email) = email.filter(|e| !e.trim().is_empty()) else {
        return Ok(Problem::new("unsubscribe_invalid", "This link is no longer valid")
            .respond(StatusCode::NOT_FOUND));
    };
    sqlx::query("UPDATE comments SET notify_reply = 0 WHERE email = ? COLLATE NOCASE")
        .bind(email.trim())
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "message": "success" })).into_response())
}

/// 回覆的人是不是站長（前台登入的站長回覆也算）
pub async fn is_owner(state: &AppState, headers: &axum::http::HeaderMap) -> bool {
    crate::auth::require_admin(headers, state).await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 依網址判斷格式() {
        assert_eq!(flavor("https://discord.com/api/webhooks/1/abc"), Flavor::Discord);
        assert_eq!(flavor("https://discordapp.com/api/webhooks/1/abc"), Flavor::Discord);
        assert_eq!(flavor("https://hooks.slack.com/services/T/B/x"), Flavor::Slack);
        assert_eq!(flavor("https://ntfy.sh/mytopic"), Flavor::Generic);
        assert_eq!(flavor("http://192.168.1.10:5678/webhook/x"), Flavor::Generic);
        // 網址裡提到 discord 不等於是 Discord
        assert_eq!(flavor("https://evil.example/discord.com"), Flavor::Generic);
    }

    #[test]
    fn 讀者寫的提及不會變成真的提及() {
        let e = Event { kind: "comment", text: "@everyone <!channel>".into(), data: json!({}) };
        let d = payload(&Flavor::Discord, &e);
        assert_eq!(d["allowed_mentions"]["parse"], json!([]));
        let s = payload(&Flavor::Slack, &e);
        assert_eq!(s["text"], "@everyone &lt;!channel&gt;");
        let g = payload(&Flavor::Generic, &e);
        assert_eq!(g["event"], "comment");
    }

    #[test]
    fn 網址只收_http_s() {
        assert!(check_url("").is_ok(), "空的是關掉");
        assert!(check_url("https://discord.com/api/webhooks/1/a").is_ok());
        assert!(check_url("http://10.0.0.2:8080/hook").is_ok(), "內網可以");
        assert!(check_url("ftp://example.com").is_err());
        assert!(check_url("javascript:alert(1)").is_err());
        assert!(check_url(&format!("https://a.example/{}", "x".repeat(URL_MAX))).is_err());
    }

    #[test]
    fn 截斷照字元_不切壞中文() {
        assert_eq!(excerpt("  短的  ", 10), "短的");
        assert_eq!(excerpt("一二三四五", 3), "一二三…");
    }

    #[test]
    fn 設定缺欄位時兩類通知預設開() {
        let s: NotifySettings = serde_json::from_str(r#"{"webhook_url":"https://x.example"}"#).unwrap();
        assert!(s.on_comment && s.on_friend);
        assert_eq!(
            NotifySettings::default(),
            serde_json::from_str::<NotifySettings>("{}").unwrap(),
            "沒存過跟缺欄位一樣"
        );
        let off: NotifySettings = serde_json::from_str(r#"{"on_friend":false}"#).unwrap();
        assert!(off.on_comment && !off.on_friend && off.webhook_url.is_empty());
    }

    #[test]
    fn 回覆信_內容會跳脫_退訂連結帶語系前綴() {
        let m = render_reply(
            "en",
            "Post <1>",
            "https://x.example/en/blog/1",
            "hi <b>",
            "thanks\n\nbye",
            "tok123",
        );
        assert!(m.html.contains("Post &lt;1&gt;"));
        assert!(m.html.contains("hi &lt;b&gt;"));
        assert!(!m.html.contains("<b>"));
        assert!(m.html.contains("/unsubscribe?reply=tok123"));
        assert!(m.text.contains("thanks\n\nbye"));
        assert!(m.subject.ends_with("replied to your comment"));
    }

    #[test]
    fn 每個語系的字串都有() {
        for l in ["zh-TW", "zh-CN", "en", "ja", "ko"] {
            let r = reader_copy(l);
            assert!(
                r.subject.contains("{author}") && r.yours.contains("{where}") && r.reply.contains("{author}")
            );
            let o = owner_copy(l);
            assert!(o.comment.contains("{where}") && o.comment_pending.contains("{where}"));
            assert!(o.friend.contains("{name}") && o.friend.contains("{url}"));
        }
    }

    #[test]
    fn 留言位置從欄位判斷() {
        assert_eq!(Target::from_columns(Some(3), None, None), Some(Target::Post("3".into())));
        assert_eq!(Target::from_columns(None, Some(4), None), Some(Target::Thought("4".into())));
        assert_eq!(
            Target::from_columns(None, None, Some("messages".into())),
            Some(Target::Page("messages".into()))
        );
        assert_eq!(Target::from_columns(None, None, None), None);
    }
}
