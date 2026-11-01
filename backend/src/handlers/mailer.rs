//! Newsletter mailer（resend 硬骨頭）。移植 Express `mailer.js` + `/admin/posts/:id/send-newsletter`。
//!
//! Express 用 `resend` npm SDK 的 `batch.send`。改用 reqwest 直打 Resend batch API。
//! 每封信是 `{from, headers, html, subject, text, to}`，有設 `NEWSLETTER_REPLY_TO` 再加 `reply_to`。
//!
//! **`reply_to` 一定要帶。** 寄件位址在 `send.` 子網域（Resend 的寄信網域），那裡沒有 MX、收不了信：
//! 不帶的話讀者或友鏈申請人按「回覆」會被退信，站長什麼都收不到。Express 版傳的是 `reply_to`、
//! SDK 讀的卻是 `replyTo`，所以從來沒送出去過；搬到 Rust 時照抄了那個行為，2026-10 才補上。
//! 驗證方式：`RESEND_BASE_URL` 指本地 mock、比對實際 wire body（不真寄）。

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Map, Value, json};

use crate::state::AppState;
use crate::ui_text::{fill, site_text};
use crate::util::{encode_uri_component, escape_html};

const BATCH_SIZE: usize = 100;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).ok().filter(|s| !s.is_empty()).unwrap_or_else(|| default.to_string())
}
/// 寄件人（`NEWSLETTER_FROM`，例如 `站名 <hello@send.example.com>`）。
/// 沒有預設值：網域要先在 Resend 驗證過才寄得出去，猜一個只會換來退信。
pub(crate) fn newsletter_from() -> Option<String> {
    std::env::var("NEWSLETTER_FROM").ok().filter(|s| !s.trim().is_empty())
}
/// 信末的署名：站名，作者名跟站名不同時再接上作者
pub(crate) fn signature() -> String {
    let (name, author) = (crate::identity::site_name(), crate::identity::site_author());
    if author == name { name } else { format!("{name} · {author}") }
}
/// 對方按「回覆」時寄到哪裡（見檔頭：寄件位址本身收不了信）
fn reply_to() -> Option<String> {
    std::env::var("NEWSLETTER_REPLY_TO").ok().filter(|s| !s.trim().is_empty())
}
/// 寄一封信給一個人（友鏈審核的回信用）：HTML 版加純文字版（不顯示 HTML 的信件軟體看後者）。
/// 沒設 RESEND_API_KEY 回錯，由呼叫端轉告站長。
pub(crate) async fn send_one(
    state: &AppState,
    to: &str,
    subject: &str,
    text: &str,
    html: &str,
) -> Result<(), String> {
    let key =
        std::env::var("RESEND_API_KEY").ok().filter(|k| !k.is_empty()).ok_or("RESEND_API_KEY is not set")?;
    let from = newsletter_from().ok_or("NEWSLETTER_FROM is not set")?;
    let mut body = json!({ "from": from, "to": [to], "subject": subject, "text": text, "html": html });
    if let Some(r) = reply_to() {
        body["reply_to"] = json!(r);
    }
    let resp = state
        .http
        .post(format!("{}/emails", resend_base_url()))
        .header("Authorization", format!("Bearer {key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        return Ok(());
    }
    let body = resp.text().await.unwrap_or_default();
    Err(serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
        .unwrap_or(body))
}

fn resend_base_url() -> String {
    // 對齊 SDK：process.env.RESEND_BASE_URL || 'https://api.resend.com'
    env_or("RESEND_BASE_URL", "https://api.resend.com")
}

fn post_url(site: &str, post_id: &Value) -> String {
    format!("{site}/blog/{}", crate::util::js_interp(post_id))
}
fn unsubscribe_url(site: &str, token: &str) -> String {
    format!("{site}/unsubscribe?token={}", encode_uri_component(token))
}

struct Sub {
    email: String,
    name: Option<String>,
    token: String,
}
struct Post {
    id: Value,
    title: String,
    excerpt: Option<String>,
}

// 信件是站長寄的，用站台的預設語系寫（訂閱者沒有存語系；文章本來就是那個語系寫的）
fn say(key: &str, vars: &[(&str, &str)]) -> String {
    fill(&site_text(key), vars)
}

/// `<html lang>` 與內文字型：同一個漢字在繁中、簡中、日文、韓文的字形不一樣，字型要選對那一套
fn mail_lang() -> (&'static str, &'static str) {
    let locale = crate::ui_text::locale_of(&crate::handlers::site_config::default_locale());
    let fonts = match locale.cjk {
        "SC" => "'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',Georgia,serif",
        "JP" => "'Noto Serif JP','Source Han Serif JP','Hiragino Mincho ProN','Yu Mincho',Georgia,serif",
        "KR" => "'Noto Serif KR','Source Han Serif KR','AppleMyungjo','Batang',Georgia,serif",
        _ => "'Noto Serif TC','Source Han Serif TC','Songti TC','PMingLiU',Georgia,serif",
    };
    (locale.lang, fonts)
}

fn render_subject(post: &Post) -> String {
    say("mail.newPost.subject", &[("title", &post.title), ("site", &crate::identity::site_name())])
}

fn render_text(site: &str, post: &Post, sub: &Sub) -> String {
    let url = post_url(site, &post.id);
    let unsub = unsubscribe_url(site, &sub.token);
    [
        post.title.clone(),
        String::new(),
        post.excerpt.clone().unwrap_or_default(),
        String::new(),
        say("mail.readMoreText", &[("url", &url)]),
        String::new(),
        format!("— {}", signature()),
        String::new(),
        say("mail.unsubscribeText", &[("url", &unsub)]),
    ]
    .join("\n")
}

fn render_email(site: &str, post: &Post, sub: &Sub) -> String {
    let title = escape_html(&post.title);
    // escapeHtml(post.excerpt||'').slice(0,320)（UTF-16 前綴）
    let excerpt = crate::util::js_substring_prefix(&escape_html(post.excerpt.as_deref().unwrap_or("")), 320);
    let url = post_url(site, &post.id);
    let unsub = unsubscribe_url(site, &sub.token);
    let greeting = match &sub.name {
        Some(n) if !n.is_empty() => say("mail.greetingNamed", &[("name", &escape_html(n))]),
        _ => say("mail.greeting", &[]),
    };
    // post.excerpt && post.excerpt.length > 320 ? '…' : ''（原始 excerpt UTF-16 長度）
    let ellipsis = match &post.excerpt {
        Some(e) if !e.is_empty() && e.encode_utf16().count() > 320 => "…",
        _ => "",
    };
    // excerpt 區塊：excerpt(escaped+sliced 非空) ? <p>…</p> : ''
    let excerpt_block = if excerpt.is_empty() {
        String::new()
    } else {
        format!(
            // data-part 是給測試找段落用的固定標記（信件客戶端會忽略它）：樣式改版時測試不必跟著改
            "<p data-part=\"excerpt\" style=\"margin:0 0 28px 0;font-size:15px;line-height:1.85;color:rgba(241,236,227,0.7);\">\n          {excerpt}{ellipsis}\n        </p>"
        )
    };
    let site_bare = site.strip_prefix("https://").or_else(|| site.strip_prefix("http://")).unwrap_or(site);
    let brand = escape_html(&crate::identity::site_name());
    let (lang, fonts) = mail_lang();
    let preheader = say("mail.newPost.preheader", &[("excerpt", &excerpt), ("site", &brand)]);
    let kicker = say("mail.newPost.kicker", &[]);
    let read_more = say("mail.readMore", &[]);
    let thanks = say("mail.thanks", &[("site", &brand)]);
    let unsubscribe = say("mail.unsubscribe", &[]);
    let all_posts = say("mail.allPosts", &[]);

    // 跟站上翻新後（2026-10）同一套：黑底（--ground）、紙色的宋體字（--paper）、琥珀點（--amber）、
    // 等寬字加點線底線的連結。信件客戶端不吃外部 CSS 與網頁字型，全部寫 inline、字型只用本機有的。
    // （這段說明寫在 Rust 這邊，不放進信裡的 HTML 註解：那會原樣寄給每個訂閱者）
    format!(
        r#"<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:{fonts};color:#f1ece3;">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">
{preheader}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- header -->
      <tr><td style="padding:0 0 36px 0;">
        <a href="{site}" style="color:#f1ece3;text-decoration:none;font-size:20px;letter-spacing:0.01em;">{brand}</a>
      </td></tr>

      <!-- post -->
      <tr><td style="padding:28px 0 0 0;border-top:1px solid rgba(241,236,227,0.1);">
        <p style="margin:0 0 16px 0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;letter-spacing:0.06em;color:rgba(241,236,227,0.4);">
          <span style="color:#e9c17a;">●</span>&nbsp; {kicker}
        </p>
        <h1 style="margin:0 0 18px 0;font-size:26px;line-height:1.45;color:#f1ece3;font-weight:600;">
          {title}
        </h1>
        {excerpt_block}
        <p style="margin:0;">
          <a href="{url}" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;letter-spacing:0.06em;color:#e9c17a;text-decoration:none;border-bottom:1px dotted rgba(233,193,122,0.6);padding-bottom:2px;">{read_more} →</a>
        </p>
      </td></tr>

      <!-- greeting -->
      <tr><td style="padding:44px 0 0 0;font-size:13px;line-height:1.8;color:rgba(241,236,227,0.55);">
        {greeting}
        <br>
        {thanks}
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:24px 0 0 0;">
        <p style="margin:0;padding-top:20px;border-top:1px solid rgba(241,236,227,0.1);font-size:11px;line-height:1.8;color:rgba(241,236,227,0.4);">
          You're receiving this because you subscribed at
          <a href="{site}" style="color:rgba(241,236,227,0.7);text-decoration:underline;">{site_bare}</a>.
        </p>
        <p style="margin:8px 0 0 0;font-size:11px;line-height:1.8;">
          <a href="{unsub}" style="color:rgba(241,236,227,0.7);text-decoration:underline;">{unsubscribe}</a>
          <span style="color:rgba(241,236,227,0.4);">&nbsp;·&nbsp;</span>
          <a href="{site}/blog" style="color:rgba(241,236,227,0.7);text-decoration:underline;">{all_posts}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"#
    )
}

/// 友鏈審核回信的主旨（純文字，不轉義）
pub(crate) fn friend_reply_subject(site_name: &str) -> String {
    say("mail.friend.subject", &[("name", site_name)])
}

/// 友鏈審核的回信：站長寫的那段放中間，前面標明是哪個站的申請，後面署名與朋友頁連結。
/// 版型跟新文章通知信同一套（見 [`render_email`]）。回傳 (HTML, 純文字)。主旨見 [`friend_reply_subject`]
pub(crate) fn render_friend_reply(site: &str, site_name: &str, reply: &str) -> (String, String) {
    let name = escape_html(site_name);
    // 空一行是分段，單一個換行是段內換行
    let body = reply
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| {
            format!(
                "<p style=\"margin:0 0 18px 0;font-size:16px;line-height:1.85;color:#f1ece3;\">{}</p>",
                escape_html(p).replace('\n', "<br>")
            )
        })
        .collect::<Vec<_>>()
        .join("\n        ");
    let site_bare = site.strip_prefix("https://").or_else(|| site.strip_prefix("http://")).unwrap_or(site);
    let brand = escape_html(&crate::identity::site_name());
    let signature = signature();
    let signature_html = escape_html(&signature);
    let (lang, fonts) = mail_lang();
    let title = say("mail.friend.subject", &[("name", &name)]);
    let kicker = say("mail.friend.kicker", &[("name", &name)]);
    let friends_page = say("mail.friend.page", &[]);
    let footer = say(
        "mail.friend.footer",
        &[(
            "site",
            &format!(
                r#"<a href="{site}/friends" style="color:rgba(241,236,227,0.7);text-decoration:underline;">{site_bare}</a>"#
            ),
        )],
    );
    let html = format!(
        r#"<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0c;font-family:{fonts};color:#f1ece3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0c;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding:0 0 36px 0;">
        <a href="{site}" style="color:#f1ece3;text-decoration:none;font-size:20px;letter-spacing:0.01em;">{brand}</a>
      </td></tr>

      <tr><td style="padding:28px 0 0 0;border-top:1px solid rgba(241,236,227,0.1);">
        <p style="margin:0 0 20px 0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;letter-spacing:0.06em;color:rgba(241,236,227,0.4);">
          <span style="color:#e9c17a;">●</span>&nbsp; {kicker}
        </p>
        {body}
      </td></tr>

      <tr><td style="padding:16px 0 0 0;font-size:14px;line-height:1.8;color:rgba(241,236,227,0.55);">
        — {signature_html}
      </td></tr>
      <tr><td style="padding:12px 0 0 0;">
        <a href="{site}/friends" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;letter-spacing:0.06em;color:#e9c17a;text-decoration:none;border-bottom:1px dotted rgba(233,193,122,0.6);padding-bottom:2px;">{friends_page} →</a>
      </td></tr>

      <tr><td style="padding:40px 0 0 0;">
        <p style="margin:0;padding-top:20px;border-top:1px solid rgba(241,236,227,0.1);font-size:11px;line-height:1.8;color:rgba(241,236,227,0.4);">
          {footer}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"#
    );
    let text = format!("{}\n\n— {signature}\n{site}/friends", reply.trim());
    (html, text)
}

/// 建每封信的 wire object：`{from, headers, html, subject, text, to}`，有設回覆位址再加 `reply_to`（見檔頭）。
fn build_email_object(site: &str, from: &str, subject: &str, post: &Post, sub: &Sub) -> Value {
    let unsub = unsubscribe_url(site, &sub.token);
    let mut headers = Map::new();
    headers.insert("List-Unsubscribe".into(), json!(format!("<{unsub}>")));
    headers.insert("List-Unsubscribe-Post".into(), json!("List-Unsubscribe=One-Click"));
    let mut m = Map::new();
    m.insert("from".into(), json!(from));
    m.insert("headers".into(), Value::Object(headers));
    m.insert("html".into(), json!(render_email(site, post, sub)));
    m.insert("subject".into(), json!(subject));
    m.insert("text".into(), json!(render_text(site, post, sub)));
    m.insert("to".into(), json!([sub.email]));
    if let Some(r) = reply_to() {
        m.insert("reply_to".into(), json!(r));
    }
    Value::Object(m)
}

/// sendNewsletter：分批（100/批）打 Resend batch API。回 (sent, failed, errors)。
async fn send_newsletter(state: &AppState, post: &Post, subs: &[Sub]) -> (i64, i64, Vec<String>) {
    // getResend()：RESEND_API_KEY 未設 → 特殊回傳
    let key = match std::env::var("RESEND_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => return (0, 0, vec!["RESEND_API_KEY not configured".to_string()]),
    };
    if subs.is_empty() {
        return (0, 0, vec![]);
    }
    let Some(from) = newsletter_from() else {
        return (0, 0, vec!["NEWSLETTER_FROM not configured".to_string()]);
    };
    let site = crate::identity::site_url();
    let subject = render_subject(post);
    let base = resend_base_url();
    let (mut sent, mut failed) = (0i64, 0i64);
    let mut errors: Vec<String> = Vec::new();

    for chunk in subs.chunks(BATCH_SIZE) {
        // 這一批的人數（BATCH_SIZE 是 100，永遠遠小於 i64::MAX）
        let n = i64::try_from(chunk.len()).unwrap_or(i64::MAX);
        let payload: Vec<Value> =
            chunk.iter().map(|s| build_email_object(&site, &from, &subject, post, s)).collect();
        let resp = state
            .http
            .post(format!("{base}/emails/batch"))
            .header("Authorization", format!("Bearer {key}"))
            .header("x-batch-validation", "strict")
            .json(&payload)
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => sent += n,
            Ok(r) => {
                failed += n;
                // error.message || JSON.stringify(error)：取上游 body 的 .message
                let body = r.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body)
                    .ok()
                    .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
                    .unwrap_or(body);
                errors.push(msg);
            }
            Err(e) => {
                failed += n;
                errors.push(e.to_string());
            }
        }
    }
    (sent, failed, errors)
}

/// 依 post_id 載入文章標題/摘要 + active 訂閱者並寄送電子報。回 (sent, failed, errors)。
/// 無 active 訂閱者 → (0, 0, [])。呼叫端負責 requireAdmin / 狀態 / RESEND 設定檢查。
/// 供 admin 建/改文「發佈即推送」與手動 route 共用底層 `send_newsletter`。
pub(crate) async fn dispatch_newsletter(
    state: &AppState,
    post_id: i64,
) -> Result<(i64, i64, Vec<String>), String> {
    let row = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT title, excerpt FROM posts WHERE id = ?",
    )
    .bind(post_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    let (title, excerpt) = row.ok_or_else(|| "post not found".to_string())?;
    let subs = sqlx::query_as::<_, (String, Option<String>, String)>(
        "SELECT email, name, unsubscribe_token FROM newsletter_subscribers WHERE status = ? AND unsubscribe_token IS NOT NULL",
    )
    .bind("active")
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    if subs.is_empty() {
        return Ok((0, 0, vec![]));
    }
    let subs: Vec<Sub> = subs.into_iter().map(|(email, name, token)| Sub { email, name, token }).collect();
    let post = Post { id: json!(post_id), title: title.unwrap_or_default(), excerpt };
    Ok(send_newsletter(state, &post, &subs).await)
}

/// `POST /api/admin/posts/:id/send-newsletter` —— requireAdmin。
#[utoipa::path(post, path = "/api/admin/posts/{id}/send-newsletter", tag = "admin", security(("bearer" = [])),
    params(("id" = String, Path)),
    responses((status = 200, description = "電子報寄送結果（動態 JSON）"), (status = 400, description = "只有已發佈文章可寄送"), (status = 401, description = "未授權"), (status = 404, description = "文章不存在"), (status = 500, description = "RESEND_API_KEY 未設定或伺服器錯誤")))]
pub async fn send_newsletter_route(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    Path(id): Path<String>,
) -> Response {
    // isMailerConfigured()
    if std::env::var("RESEND_API_KEY").ok().as_ref().is_none_or(String::is_empty) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "RESEND_API_KEY not configured on server" })),
        )
            .into_response();
    }
    let row = sqlx::query_as::<_, (i64, Option<String>, Option<String>, Option<String>)>(
        "SELECT id, title, excerpt, status FROM posts WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await;
    let (post_id, title, excerpt, status) = match row {
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "post not found" }))).into_response();
        }
        Ok(Some(r)) => r,
    };
    if status.as_deref() != Some("published") {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "only published posts can be sent" })))
            .into_response();
    }
    let post = Post { id: json!(post_id), title: title.unwrap_or_default(), excerpt };

    let subs = sqlx::query_as::<_, (String, Option<String>, String)>(
        "SELECT email, name, unsubscribe_token FROM newsletter_subscribers WHERE status = ? AND unsubscribe_token IS NOT NULL",
    )
    .bind("active")
    .fetch_all(&state.pool)
    .await;
    let subs = match subs {
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        Ok(rows) => rows,
    };
    if subs.is_empty() {
        return Json(json!({ "sent": 0, "failed": 0, "message": "no active subscribers" })).into_response();
    }
    let subs: Vec<Sub> = subs.into_iter().map(|(email, name, token)| Sub { email, name, token }).collect();
    let (sent, failed, errors) = send_newsletter(&state, &post, &subs).await;
    Json(json!({ "message": "newsletter dispatched", "sent": sent, "failed": failed, "errors": errors }))
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::render_friend_reply;

    /// 預設語系是英文的站：兩種信從主旨到頁尾都不能出現中文，`<html lang>` 也跟著換
    #[test]
    fn 預設語系是英文時信裡沒有中文() {
        crate::handlers::site_config::set_default_locale_for_test("en");
        let han = |s: &str| s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c));
        let post =
            super::Post { id: serde_json::json!(7), title: "Title".into(), excerpt: Some("Excerpt".into()) };
        let sub = super::Sub { email: "a@b.c".into(), name: Some("Ann".into()), token: "t".into() };
        let site = "https://example.com";
        let email = super::render_email(site, &post, &sub);
        assert!(!han(&email), "{email}");
        assert!(email.contains(r#"<html lang="en">"#));
        assert!(email.contains("Hi Ann,"));
        for s in [super::render_subject(&post), super::render_text(site, &post, &sub)] {
            assert!(!han(&s), "{s}");
        }
        let (html, text) = render_friend_reply(site, "Ink", "OK");
        assert!(!han(&html) && !han(&text), "{html}");
        assert_eq!(super::friend_reply_subject("Ink"), "About your link request for “Ink”");
    }

    #[test]
    fn 友鏈回信_站長的字照原樣分段_而且會跳脫() {
        let (html, text) = render_friend_reply(
            "https://koimsurai.com",
            "Ink<Codes>",
            "收下了！\n已經加上去。\n\n<b>謝謝</b>",
        );
        // 空一行是分段、單一個換行是段內換行
        assert!(html.contains("收下了！<br>已經加上去。</p>"), "{html}");
        // 站長打的字與對方的站名都不能被當成 HTML
        assert!(html.contains("&lt;b&gt;謝謝&lt;/b&gt;"));
        assert!(html.contains("友鏈申請 · Ink&lt;Codes&gt;"));
        assert!(!html.contains("<b>謝謝"));
        assert!(html.contains("https://koimsurai.com/friends"), "要有朋友頁的連結");
        // 純文字版：原文、署名、朋友頁
        assert_eq!(
            text,
            format!(
                "收下了！\n已經加上去。\n\n<b>謝謝</b>\n\n— {}\nhttps://koimsurai.com/friends",
                super::signature()
            )
        );
    }
}
