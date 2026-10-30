//! 全站 RSS（`/rss`，app-level 非 /api）。移植 index.js 的 /rss。
//! 行為清理註記：Express 的 `new Date(created_at)`（無 'Z'）在 TZ=Asia/Taipei 下把 DB 的
//! UTC 時間誤當本地時間（pubDate 偏 8h）；此處採正確版（當 UTC 解析），退役後無對拍對象。

use std::fmt::Write as _;

use axum::{
    extract::{Query, State},
    http::header,
    response::{IntoResponse, Response},
};

use crate::handlers::posts::{locale_available_sql, locale_suffix, parse_locale};
use crate::state::AppState;
use crate::util::{escape_html, js_date_to_utc_string, js_substring_prefix};

#[derive(serde::Deserialize)]
pub struct RssQuery {
    lang: Option<String>,
}

#[utoipa::path(get, path = "/rss", tag = "misc",
    responses((status = 200, description = "全站 RSS feed（XML）")))]
pub async fn site_rss(State(state): State<AppState>, Query(q): Query<RssQuery>) -> Response {
    // ?lang=en|ja|ko|zh-CN|zh-TW → 出該語系的標題/摘要與 /<prefix>/blog/… 連結；沒帶或認不得就是站台的預設語系。
    let default = crate::handlers::site_config::default_locale();
    let locale = parse_locale(q.lang.as_deref()).or_else(|| parse_locale(Some(&default))).unwrap_or("zh-TW");
    let sfx = locale_suffix(locale);
    // 每篇的原文語系不一定一樣：這個語系就是原文的那幾篇讀本體欄位，其他篇讀譯文欄位（沒有就退回本體）。
    // 欄位名由 allowlist 決定（parse_locale → locale_suffix），沒有使用者輸入進 SQL。
    let is_source = format!("COALESCE(p.source_language, 'zh-TW') = '{locale}'");
    let pick = |col: &str| match sfx {
        Some(s) => {
            format!("CASE WHEN {is_source} THEN p.{col} ELSE COALESCE(NULLIF(p.{col}_{s}, ''), p.{col}) END")
        }
        None => format!("p.{col}"),
    };
    let (title_col, excerpt_col, content_col) = (pick("title"), pick("excerpt"), pick("content"));
    // 這個語系看不到的文章（不是原文、也沒有譯文）不進 feed——訂閱日文卻收到中文全文，體感是壞掉的。
    let lang_filter = format!(" AND {}", locale_available_sql(locale, "p"));
    // 網址前綴跟著站台設定的預設語系走（預設語系不帶前綴）
    let url_prefix = match crate::handlers::site_config::locale_prefix(locale) {
        p if p.is_empty() => p,
        p => format!("/{p}"),
    };
    let self_q = if url_prefix.is_empty() { String::new() } else { format!("?lang={locale}") };
    let site_url = crate::identity::site_url();
    let author_fallback = crate::identity::site_author();
    type Row = (
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    );
    // ⚠ slug 不能省。以前這裡是 /blog/{id}，slug 遷移之後每一條連結都會吃一次 301——
    // 對 RSS 讀者是多一跳，對搜尋引擎是整份 feed 都指向非 canonical 網址。
    let sql = format!(
        "SELECT p.id, p.slug, {title_col}, {excerpt_col}, {content_col}, p.created_at, p.updated_at, p.author, p.category, \
                GROUP_CONCAT(t.name) as tags \
         FROM posts p \
         LEFT JOIN post_tags pt ON p.id = pt.post_id \
         LEFT JOIN tags t ON pt.tag_id = t.id \
         WHERE p.status = 'published'{lang_filter} \
         GROUP BY p.id ORDER BY p.created_at DESC LIMIT 30"
    );
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql)).fetch_all(&state.pool).await;
    let Ok(rows) = rows else {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            "Internal Server Error",
        )
            .into_response();
    };

    let now_str = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let last_build = rows.first().map_or_else(
        || js_date_to_utc_string(Some(&now_str)),
        |r| js_date_to_utc_string(r.6.as_deref().or(r.5.as_deref())),
    );

    static TAG_RE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"<[^>]+>").expect("字面 regex"));
    static MD_RE: std::sync::LazyLock<regex::Regex> =
        std::sync::LazyLock::new(|| regex::Regex::new(r"[#*`>\-\n]").expect("字面 regex"));

    let items: Vec<String> = rows
        .iter()
        .map(|(id, slug, title, excerpt, content, created_at, _updated_at, author, category, tags)| {
            // desc = excerpt || content 去 HTML/markdown、trim、slice(0,300)
            let desc = if let Some(e) = excerpt.as_deref().filter(|s| !s.is_empty()) { e.to_string() } else {
                let c = content.as_deref().unwrap_or("");
                let no_tag = TAG_RE.replace_all(c, "");
                let no_md = MD_RE.replace_all(&no_tag, " ");
                js_substring_prefix(no_md.trim(), 300)
            };
            let cats: String = tags
                .as_deref()
                .unwrap_or("")
                .split(',')
                .filter(|t| !t.trim().is_empty())
                .fold(String::new(), |mut acc, t| {
                    let _ = write!(acc, "<category>{}</category>", escape_html(t.trim()));
                    acc
                });
            let cat_line = category
                .as_deref()
                .filter(|c| !c.is_empty())
                .map(|c| format!("<category>{}</category>", escape_html(c)))
                .unwrap_or_default();
            let ident = slug.as_deref().filter(|s| !s.is_empty()).map_or_else(|| id.to_string(), str::to_string);
            let link = format!("{site_url}{url_prefix}/blog/{ident}");
            format!(
                "    <item>\n      <title>{}</title>\n      <link>{link}</link>\n      <guid isPermaLink=\"true\">{link}</guid>\n      <description>{}</description>\n      <author>{}</author>\n      <pubDate>{}</pubDate>\n      {}\n      {}\n    </item>",
                escape_html(title.as_deref().unwrap_or("")),
                escape_html(&desc),
                escape_html(author.as_deref().filter(|a| !a.is_empty()).unwrap_or(&author_fallback)),
                js_date_to_utc_string(created_at.as_deref()),
                cat_line,
                cats,
            )
        })
        .collect();

    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n  <channel>\n    <title>{title}</title>\n    <link>{site_url}{url_prefix}/blog</link>\n    <description>{description}</description>\n    <language>{locale}</language>\n    <lastBuildDate>{last_build}</lastBuildDate>\n    <generator>{generator}</generator>\n    <atom:link href=\"{site_url}/rss{self_q}\" rel=\"self\" type=\"application/rss+xml\"/>\n{}\n  </channel>\n</rss>",
        items.join("\n"),
        title = escape_html(&crate::identity::site_name()),
        description = escape_html(&crate::identity::site_description()),
        generator = crate::identity::SOFTWARE,
    );
    ([(header::CONTENT_TYPE, "application/rss+xml; charset=utf-8")], xml).into_response()
}
