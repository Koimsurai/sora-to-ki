use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::FromRow;

use crate::{
    error::AppError,
    handlers::excerpt_links::{self, ExcerptLink},
    state::AppState,
};

// ── 多語系（對齊 Express index.js 的常數與 helper）─────────────────────────
pub(crate) const I18N_LOCALES: [&str; 5] = ["zh-TW", "zh-CN", "en", "ja", "ko"];

/// LOCALE_COLUMN_SUFFIX：語系 → 譯文欄的後綴。原稿那個語系不讀這裡（一律讀本體欄位，
/// 看 source_language），所以每個語系都有自己的後綴，繁中也是（英文原稿的站要補繁中譯文）。
pub(crate) fn locale_suffix(locale: &str) -> Option<&'static str> {
    match locale {
        "zh-TW" => Some("zh_tw"),
        "zh-CN" => Some("zh_cn"),
        "en" => Some("en"),
        "ja" => Some("ja"),
        "ko" => Some("ko"),
        _ => None,
    }
}

/// parseLocale：把 ?lang= 正規化成 canonical locale，無法辨識回 None。
pub(crate) fn parse_locale(raw: Option<&str>) -> Option<&'static str> {
    match raw?.to_lowercase().as_str() {
        "zh-tw" | "zh-hant" => Some("zh-TW"),
        "zh-cn" | "zh-hans" => Some("zh-CN"),
        "en" => Some("en"),
        "ja" => Some("ja"),
        "ko" => Some("ko"),
        _ => None,
    }
}

/// posts 一列（含全部 i18n 欄位；用 `SELECT p.*` 取，FromRow 依名對應、忽略多餘欄位）。
///
/// **欄位序 = posts 表宣告序**（見 `PRAGMA table_info(posts)`），因為 admin 端點的
/// `AdminPostFull` 照這個順序出 JSON，要對齊舊 `row_to_json`（DB 欄位序）的 key 序。
#[derive(Debug, FromRow)]
pub struct PostRow {
    pub(crate) id: i64,
    /// 網址用的英文 slug（canonical）。舊資料可能為 NULL → 前端退回用 id。
    pub(crate) slug: Option<String>,
    pub(crate) title: String,
    pub(crate) content: String,
    pub(crate) excerpt: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) status: String,
    pub(crate) author: Option<String>,
    pub(crate) view_count: i64,
    pub(crate) likes: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: Option<String>,
    pub(crate) layout_type: Option<String>,
    pub(crate) excerpt_zh_cn: Option<String>,
    pub(crate) title_ja: Option<String>,
    pub(crate) content_ja: Option<String>,
    pub(crate) excerpt_ja: Option<String>,
    pub(crate) title_en: Option<String>,
    pub(crate) content_en: Option<String>,
    pub(crate) excerpt_en: Option<String>,
    pub(crate) source_language: Option<String>,
    pub(crate) title_zh_cn: Option<String>,
    pub(crate) content_zh_cn: Option<String>,
    pub(crate) series_name: Option<String>,
    pub(crate) series_order: Option<i64>,
    pub(crate) title_ko: Option<String>,
    pub(crate) content_ko: Option<String>,
    // 欄位可為 NULL（`allow_comments INTEGER DEFAULT 1`，舊列理論上可能沒值）。
    // NULL 在舊 JS 語意等同「允許」（`null !== 0 && null !== false`）→ 見 allow_comments()。
    pub(crate) allow_comments: Option<bool>,
    pub(crate) excerpt_ko: Option<String>,
    // 內容格式：'markdown'（預設）| 'mdx'。舊列/未設 → NULL → 前端當 markdown。
    #[sqlx(default)]
    pub(crate) format: Option<String>,
    /// 摘要裡連到章節的句子（JSON，依語系分開；見 `excerpt_links` 模組）。
    #[sqlx(default)]
    pub(crate) excerpt_links: Option<String>,
    /// 排程發佈的時間（UTC）；只有 status = 'scheduled' 才有值。見 `post_lifecycle`
    #[sqlx(default)]
    pub(crate) publish_at: Option<String>,
    /// 排程時勾了「發佈時推送電子報」
    #[sqlx(default)]
    pub(crate) newsletter_pending: Option<i64>,
    /// 丟進回收的時間（UTC）與丟之前的狀態
    #[sqlx(default)]
    pub(crate) trashed_at: Option<String>,
    #[sqlx(default)]
    pub(crate) trashed_from: Option<String>,
    /// 繁中譯文（原稿不是繁中時才用得到；0036）
    #[sqlx(default)]
    pub(crate) title_zh_tw: Option<String>,
    #[sqlx(default)]
    pub(crate) content_zh_tw: Option<String>,
    #[sqlx(default)]
    pub(crate) excerpt_zh_tw: Option<String>,
    // GROUP_CONCAT(t.name)；無 tag 時為 NULL
    pub(crate) tags: Option<String>,
}

impl PostRow {
    /// DB 可為 NULL，但 API 對外恆為 boolean：NULL → true（對齊舊行為，null 視為允許）。
    pub(crate) fn allow_comments(&self) -> bool {
        self.allow_comments.unwrap_or(true)
    }
}

/// 取某後綴的 (title, content, excerpt) 三元組。
fn i18n_trio<'a>(row: &'a PostRow, sfx: &str) -> (Option<&'a str>, Option<&'a str>, Option<&'a str>) {
    match sfx {
        "en" => (row.title_en.as_deref(), row.content_en.as_deref(), row.excerpt_en.as_deref()),
        "zh_cn" => (row.title_zh_cn.as_deref(), row.content_zh_cn.as_deref(), row.excerpt_zh_cn.as_deref()),
        "zh_tw" => (row.title_zh_tw.as_deref(), row.content_zh_tw.as_deref(), row.excerpt_zh_tw.as_deref()),
        "ja" => (row.title_ja.as_deref(), row.content_ja.as_deref(), row.excerpt_ja.as_deref()),
        "ko" => (row.title_ko.as_deref(), row.content_ko.as_deref(), row.excerpt_ko.as_deref()),
        _ => (None, None, None),
    }
}

fn source_lang(row: &PostRow) -> &str {
    row.source_language.as_deref().unwrap_or("zh-TW")
}

/// 非空字串才算「有內容」（對齊 JS 的 `!t` truthy 檢查：null 與 '' 都視為無）。
fn nonempty(s: Option<&str>) -> Option<&str> {
    s.filter(|v| !v.is_empty())
}

/// getLocaleContent：回 (title, content, excerpt)；該 locale 無內容回 None。
fn locale_content(row: &PostRow, locale: &str) -> Option<(String, String, String)> {
    let source = source_lang(row);
    if locale == source {
        return Some((row.title.clone(), row.content.clone(), row.excerpt.clone().unwrap_or_default()));
    }
    let sfx = locale_suffix(locale)?;
    let (t, c, e) = i18n_trio(row, sfx);
    let t = nonempty(t)?;
    let c = nonempty(c)?;
    let excerpt = nonempty(e).unwrap_or("").to_string();
    Some((t.to_string(), c.to_string(), excerpt))
}

/// `locale_content` 的 SQL 版：「這篇有沒有該 locale 的內容」，給各種 COUNT 用。
///
/// **必須跟上面的 `locale_content` 同語意**（locale == source 一律算有；其餘要 title 與
/// content 都非空），否則計數會跟列表對不起來：列表 `continue` 掉沒譯文的文章，計數卻照算，
/// 讀者就會看到「分類寫 4 篇、點進去 0 篇」「分頁說有 11 篇卻翻到空白頁」。
///
/// locale 一律先過 `parse_locale`，是白名單裡的 `&'static str`，直接內插無注入風險。
/// 分享圖（handlers/og）畫手記星軌用：這個語系看得到的已發布文章，由新到舊，
/// `(id, 標題, 內文字數)`。跟 `list_posts` 同一套語系規則，手記頁畫的是同一片天
pub(crate) async fn sky_list(
    pool: &sqlx::SqlitePool,
    locale: &str,
) -> Result<Vec<(i64, String, usize)>, sqlx::Error> {
    let sql = format!(
        "SELECT p.*, NULL AS tags FROM posts p WHERE p.status = 'published' AND {} ORDER BY p.created_at DESC",
        locale_available_sql(locale, "p")
    );
    let rows = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql.as_str())).fetch_all(pool).await?;
    Ok(rows
        .iter()
        .filter_map(|r| locale_content(r, locale).map(|(t, c, _)| (r.id, t, c.chars().count())))
        .collect())
}

pub(crate) fn locale_available_sql(locale: &str, alias: &str) -> String {
    let is_source = format!("COALESCE({alias}.source_language, 'zh-TW') = '{locale}'");
    match locale_suffix(locale) {
        // 認不得的語系沒有譯文欄可查：只有 source_language 相符才算有內容
        None => format!("({is_source})"),
        Some(sfx) => format!(
            "({is_source} OR (COALESCE({alias}.title_{sfx}, '') <> '' \
             AND COALESCE({alias}.content_{sfx}, '') <> ''))"
        ),
    }
}

/// availableLocales：列出該文實際有內容的 locale（source 永遠在最前）。
fn available_locales(row: &PostRow) -> Vec<String> {
    available_locales_with_source(row, source_lang(row))
}

/// 同上，但 source 由呼叫端給。admin 端點對 source_language 的預設規則跟公開端點不同
/// （admin 會把空字串也視為缺、退回 zh-TW），所以不能共用 `source_lang`。
pub(crate) fn available_locales_with_source(row: &PostRow, source: &str) -> Vec<String> {
    let source = source.to_string();
    let mut list = vec![source.clone()];
    for loc in I18N_LOCALES {
        if loc == source {
            continue;
        }
        if let Some(sfx) = locale_suffix(loc) {
            let (t, c, _) = i18n_trio(row, sfx);
            if nonempty(t).is_some() && nonempty(c).is_some() {
                list.push(loc.to_string());
            }
        }
    }
    list
}

use crate::util::split_tags;

// ── GET /api/posts（分頁列表）────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    page: Option<String>,
    limit: Option<String>,
    search: Option<String>,
    tag: Option<String>,
    category: Option<String>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
    lang: Option<String>,
}

fn parse_int(s: Option<&str>, default: i64) -> i64 {
    s.and_then(|v| v.trim().parse::<i64>().ok()).unwrap_or(default)
}

/// `GET /api/posts` 的單篇摘要。`title`/`excerpt` 已依 `?lang=` 取好該語系內容。
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct PostListItem {
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    pub slug: Option<String>,
    pub title: String,
    pub excerpt: String,
    /// 該語系內文的前 260 個 UTF-16 code unit（= JS `content.substring(0,260)`）。
    /// 列表卡片顯示的是內文截斷而非 AI 摘要（見 Blog.tsx NoteCard），但整篇 content
    /// 進列表要多 ~188KB，所以只送前端截斷所需的長度。
    pub content_preview: String,
    /// 該語系內文的長度（字元數）。手記列表用它決定那篇文章的星軌拖多長。
    #[specta(type = specta_typescript::Number)]
    pub content_length: i64,
    /// 該語系內文要讀幾分鐘（`util::read_minutes`，跟文章頁用同一套規則）。
    #[specta(type = specta_typescript::Number)]
    pub read_minutes: i64,
    pub category: Option<String>,
    pub status: String,
    pub author: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub view_count: i64,
    #[specta(type = specta_typescript::Number)]
    pub likes: i64,
    /// `post_reactions` 裡 ❤️ 的數量——列表卡片的愛心顯示這個，不是上面的 `likes`。
    ///
    /// 兩個數字並存是有歷史的：`posts.likes` 是舊的按讚計數器（`/api/posts/:id/like`），
    /// 而文章頁下方的 emoji 反應列另外存在 `post_reactions`。同一顆愛心在列表卡片走
    /// 前者、在文章頁的反應列走後者，於是同一篇文章會出現兩個不一樣的數字——使用者
    /// 看到的「愛心沒有同步」就是這個。
    ///
    /// 統一成以 `post_reactions.❤️` 為準。`likes` 欄位留著不動（舊資料還在，而且
    /// `/api/posts/:id/like` 還有其他呼叫端），但前端不再顯示它。
    #[specta(type = specta_typescript::Number)]
    pub heart_count: i64,
    pub layout_type: Option<String>,
    pub allow_comments: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub source_language: String,
    pub available_locales: Vec<String>,
    pub tags: Vec<String>,
}

/// 一次撈完這一頁所有文章的 ❤️ 數，避免每篇一個查詢。
///
/// 不把它 JOIN 進列表主查詢，是因為那個查詢是 `SELECT p.*` 直接餵給 `PostRow`，而
/// `PostRow` 的欄位序被 admin 端點的 JSON key 序綁著（見 `PostRow` 的註解）。多一個
/// 輕量查詢比動那個結構安全。
async fn heart_counts(state: &AppState, ids: &[i64]) -> std::collections::HashMap<i64, i64> {
    if ids.is_empty() {
        return std::collections::HashMap::new();
    }
    // id 是 DB 來的 i64，不是使用者輸入，所以內插進 IN (...) 沒有注入面；
    // sqlx 沒有辦法 bind 一個可變長度的清單。
    let placeholders = ids.iter().map(std::string::ToString::to_string).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT post_id, count FROM post_reactions \
         WHERE emoji = '❤️' AND post_id IN ({placeholders})"
    );
    sqlx::query_as::<_, (i64, i64)>(sqlx::AssertSqlSafe(sql.as_str()))
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect()
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct Pagination {
    #[specta(type = specta_typescript::Number)]
    pub page: i64,
    #[specta(type = specta_typescript::Number)]
    pub limit: i64,
    #[specta(type = specta_typescript::Number)]
    pub total: i64,
    #[serde(rename = "totalPages")]
    #[specta(type = specta_typescript::Number)]
    pub total_pages: i64,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct PostsListResponse {
    pub message: String,
    pub posts: Vec<PostListItem>,
    pub locale: Option<String>,
    pub pagination: Pagination,
}

/// `GET /api/posts` —— 公開分頁列表（過濾 / 排序 / 多語）。SQL 與分頁邏輯照抄 Express。
#[utoipa::path(
    get, path = "/api/posts", tag = "posts",
    params(
        ("page" = Option<String>, Query), ("limit" = Option<String>, Query),
        ("sortBy" = Option<String>, Query), ("search" = Option<String>, Query),
        ("tag" = Option<String>, Query), ("category" = Option<String>, Query),
        ("lang" = Option<String>, Query, description = "語系（zh-TW/en/ja/ko/zh-cn）"),
    ),
    responses((status = 200, body = PostsListResponse)),
)]
pub async fn list_posts(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<PostsListResponse>, AppError> {
    // 公開列表只有已發佈的。以前會照 ?status= 讀，任何人帶 ?status=draft 就看得到草稿
    // （排程與回收上線之後還會看到還沒發的、已經丟掉的）；後台有自己的 /api/admin/posts。
    let status = "published";
    let page = parse_int(q.page.as_deref(), 1);
    let limit = parse_int(q.limit.as_deref(), 10);
    let offset = (page - 1) * limit;
    let requested_locale = parse_locale(q.lang.as_deref());

    // 動態 WHERE（status → search → tag → category → 語系），列表與 count 共用、bind 順序一致。
    // 語系要在 SQL 裡先濾再切頁：在 Rust 裡濾的話，一頁抓到的文章剛好都沒譯文，那頁就是空的。
    let mut filter = String::from(" WHERE p.status = ?");
    if q.search.is_some() {
        filter.push_str(" AND (p.title LIKE ? OR p.content LIKE ?)");
    }
    if q.tag.is_some() {
        filter.push_str(
            " AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id \
             WHERE pt.post_id = p.id AND t.name = ?)",
        );
    }
    if q.category.is_some() {
        filter.push_str(" AND p.category = ?");
    }
    if let Some(loc) = requested_locale {
        filter.push_str(" AND ");
        filter.push_str(&locale_available_sql(loc, "p"));
    }

    // 標籤用相關子查詢取，不 JOIN + GROUP BY：GROUP BY 會讓 SQLite 先把**每一篇**的整列
    // （含五個語系的全文）放進暫存 B-tree 排序，排完才套 LIMIT——實測 33ms → 2.4ms。
    // 帶 ?tag= 時 tags 也是那篇的全部標籤（以前 JOIN 過濾之後只剩被篩的那一個）。
    let mut sql = String::from(
        "SELECT p.*, (SELECT GROUP_CONCAT(t.name) FROM post_tags pt JOIN tags t ON t.id = pt.tag_id \
         WHERE pt.post_id = p.id) AS tags FROM posts p",
    );
    sql.push_str(&filter);
    match q.sort_by.as_deref() {
        Some("oldest") => sql.push_str(" ORDER BY p.created_at ASC"),
        Some("popular") => sql.push_str(" ORDER BY p.view_count DESC, p.created_at DESC"),
        _ => sql.push_str(" ORDER BY p.created_at DESC"),
    }
    sql.push_str(" LIMIT ? OFFSET ?");

    let mut query = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql.as_str())).bind(status);
    if let Some(s) = &q.search {
        let like = format!("%{s}%");
        query = query.bind(like.clone()).bind(like);
    }
    if let Some(t) = &q.tag {
        query = query.bind(t.clone());
    }
    if let Some(c) = &q.category {
        query = query.bind(c.clone());
    }
    let rows = query.bind(limit).bind(offset).fetch_all(&state.pool).await?;

    // count 跟列表同一組條件，total 才會等於翻完所有頁實際拿到的篇數
    let count_sql = format!("SELECT COUNT(*) FROM posts p{filter}");
    let mut count_q = sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(count_sql.as_str())).bind(status);
    if let Some(s) = &q.search {
        let like = format!("%{s}%");
        count_q = count_q.bind(like.clone()).bind(like);
    }
    if let Some(t) = &q.tag {
        count_q = count_q.bind(t.clone());
    }
    if let Some(c) = &q.category {
        count_q = count_q.bind(c.clone());
    }
    let total: i64 = count_q.fetch_one(&state.pool).await?;

    let hearts = heart_counts(&state, &rows.iter().map(|r| r.id).collect::<Vec<_>>()).await;

    let mut posts = Vec::new();
    for row in &rows {
        let content = match requested_locale {
            Some(loc) => locale_content(row, loc),
            None => Some((row.title.clone(), row.content.clone(), row.excerpt.clone().unwrap_or_default())),
        };
        // SQL 已經濾過語系，這裡照理不會是 None；locale_available_sql 跟 locale_content 不同步時才會發生
        let Some((title, locale_content_str, excerpt)) = content else {
            continue;
        };
        posts.push(PostListItem {
            id: row.id,
            slug: row.slug.clone(),
            title,
            excerpt,
            content_preview: crate::util::js_substring_prefix(&locale_content_str, 260),
            content_length: i64::try_from(locale_content_str.chars().count()).unwrap_or(i64::MAX),
            read_minutes: crate::util::read_minutes(&locale_content_str),
            category: row.category.clone(),
            status: row.status.clone(),
            author: row.author.clone(),
            view_count: row.view_count,
            likes: row.likes,
            heart_count: hearts.get(&row.id).copied().unwrap_or(0),
            layout_type: row.layout_type.clone(),
            allow_comments: row.allow_comments(),
            created_at: row.created_at.clone(),
            updated_at: row.updated_at.clone(),
            source_language: source_lang(row).to_string(),
            available_locales: available_locales(row),
            tags: split_tags(row.tags.as_deref()),
        });
    }

    let total_pages = if limit > 0 { (total + limit - 1) / limit } else { 0 };

    Ok(Json(PostsListResponse {
        message: "success".into(),
        posts,
        locale: requested_locale.map(String::from),
        pagination: Pagination { page, limit, total, total_pages },
    }))
}

// ── GET /api/posts/:id（單篇）─────────────────────────────────────────────
#[derive(Debug, Deserialize)]
pub struct LangQuery {
    lang: Option<String>,
}

/// `GET /api/posts/:id` 成功回應。欄位序對齊舊 `json!` 的 key 序。
/// 404 路徑（找不到 / 該語系無內容）仍是各自的錯誤 JSON，不走這個型別。
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct PostDetailResponse {
    pub message: String,
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    /// canonical 網址用的 slug；前端拿它把非 canonical 的網址 301 過去。
    pub slug: Option<String>,
    pub title: String,
    pub content: String,
    pub excerpt: String,
    /// 摘要裡連到章節的句子（這個語系的；摘要裡找不到的已濾掉）。
    pub excerpt_links: Vec<ExcerptLink>,
    pub category: Option<String>,
    pub status: String,
    pub author: Option<String>,
    #[specta(type = specta_typescript::Number)]
    pub view_count: i64,
    #[specta(type = specta_typescript::Number)]
    pub likes: i64,
    pub layout_type: Option<String>,
    pub allow_comments: bool,
    /// 內容格式：'markdown'（預設）| 'mdx'。前端據此選渲染管線。
    pub format: Option<String>,
    pub series_name: Option<String>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub series_order: Option<i64>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub locale: String,
    pub source_language: String,
    pub is_source: bool,
    pub available_locales: Vec<String>,
    pub tags: Vec<String>,
}

/// `GET /api/posts/:id` —— 公開單篇（多語；找不到 / 該語無內容皆回對應 404）。
#[utoipa::path(
    get, path = "/api/posts/{id}", tag = "posts",
    params(("id" = String, Path), ("lang" = Option<String>, Query, description = "語系")),
    responses((status = 200, body = PostDetailResponse), (status = 404, description = "找不到 / 該語系無內容")),
)]
pub async fn get_post(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<LangQuery>,
) -> Result<Response, AppError> {
    // 路徑參數可以是 slug、數字 id、或**改名前的舊 slug**（三者都要能進站）：
    //   1) 先當 slug 找 → 2) 純數字就當 id 找 → 3) 查 post_slug_history 的舊 slug。
    // 回應一律帶上目前的 canonical slug，前端據此把非 canonical 的網址 301 過去。
    let row = sqlx::query_as::<_, PostRow>(
        "SELECT p.*, GROUP_CONCAT(t.name) as tags \
         FROM posts p \
         LEFT JOIN post_tags pt ON p.id = pt.post_id \
         LEFT JOIN tags t ON pt.tag_id = t.id \
         WHERE p.slug = ? \
         GROUP BY p.id",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let row = if let Some(r) = row {
        Some(r)
    } else {
        // 數字 → 當 id；否則查舊 slug 對應的 post_id
        let by_id = id.parse::<i64>().ok();
        let resolved_id = match by_id {
            Some(n) => Some(n),
            None => {
                sqlx::query_scalar::<_, i64>("SELECT post_id FROM post_slug_history WHERE old_slug = ?")
                    .bind(&id)
                    .fetch_optional(&state.pool)
                    .await?
            }
        };
        match resolved_id {
            Some(n) => {
                sqlx::query_as::<_, PostRow>(
                    "SELECT p.*, GROUP_CONCAT(t.name) as tags \
                     FROM posts p \
                     LEFT JOIN post_tags pt ON p.id = pt.post_id \
                     LEFT JOIN tags t ON pt.tag_id = t.id \
                     WHERE p.id = ? \
                     GROUP BY p.id",
                )
                .bind(n)
                .fetch_optional(&state.pool)
                .await?
            }
            None => None,
        }
    };

    // 沒發佈的（草稿、排程、回收）對讀者就是不存在：id 是流水號，猜得到。
    // 回應跟真的不存在一模一樣，不透露「這個 id 有東西只是還沒發」。
    let Some(row) = row.filter(|r| r.status == "published") else {
        // 對齊 Express：404 + {"message":"Post not found"}
        return Ok((StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response());
    };

    let source = source_lang(&row).to_string();
    let requested = parse_locale(q.lang.as_deref()).unwrap_or(source.as_str());

    let Some((title, content, excerpt)) = locale_content(&row, requested) else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(json!({
                "message": "Post not available in requested locale",
                "locale": requested,
                "available_locales": available_locales(&row),
            })),
        )
            .into_response());
    };

    let is_source = requested == source;
    let excerpt_links = excerpt_links::for_locale(row.excerpt_links.as_deref(), requested, &excerpt);
    Ok(Json(PostDetailResponse {
        message: "success".into(),
        slug: row.slug.clone(),
        id: row.id,
        title,
        content,
        excerpt,
        excerpt_links,
        category: row.category.clone(),
        status: row.status.clone(),
        author: row.author.clone(),
        view_count: row.view_count,
        likes: row.likes,
        layout_type: row.layout_type.clone(),
        allow_comments: row.allow_comments(),
        format: row.format.clone(),
        series_name: row.series_name.clone(),
        series_order: row.series_order,
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
        locale: requested.to_string(),
        source_language: source.clone(),
        is_source,
        available_locales: available_locales(&row),
        tags: split_tags(row.tags.as_deref()),
    })
    .into_response())
}

// ── GET /api/posts/:id/reactions ─────────────────────────────────────────
#[derive(Debug, Serialize, FromRow, specta::Type, utoipa::ToSchema)]
pub struct ReactionRow {
    pub emoji: String,
    #[specta(type = specta_typescript::Number)]
    pub count: i64,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct ReactionsResponse {
    pub reactions: Vec<ReactionRow>,
}

/// `GET /api/posts/:id/reactions` —— 公開純讀。
#[utoipa::path(
    get, path = "/api/posts/{id}/reactions", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, body = ReactionsResponse)),
)]
pub async fn post_reactions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ReactionsResponse>, AppError> {
    let reactions = sqlx::query_as::<_, ReactionRow>(
        "SELECT emoji, count FROM post_reactions WHERE post_id = ? AND count > 0 ORDER BY count DESC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ReactionsResponse { reactions }))
}

// ── GET /api/posts/:id/comments ──────────────────────────────────────────
/// 公開的留言一列（文章與碎念共用）。**不含留言者的 email 與 IP**：這是公開端點，
/// 那兩欄只給後台（`admin::AdminCommentRow`）。欄位順序對齊 live 表 `SELECT *` 的展開順序（少了那兩欄）。
#[derive(Debug, Serialize, FromRow, specta::Type, utoipa::ToSchema)]
pub struct CommentRow {
    #[specta(type = specta_typescript::Number)]
    pub id: i64,
    // thought 留言的 post_id 為 NULL（createComment 只填 thought_id）；blog 留言為文章 id。
    // Option 對兩者都正確：Some→數字、None→null。
    #[specta(type = Option<specta_typescript::Number>)]
    pub post_id: Option<i64>,
    pub author: String,
    pub content: String,
    #[specta(type = specta_typescript::Number)]
    pub likes: i64,
    pub created_at: String,
    #[specta(type = specta_typescript::Number)]
    pub is_admin: i64,
    pub website: Option<String>,
    pub status: Option<String>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub parent_id: Option<i64>,
    pub avatar_url: Option<String>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub thought_id: Option<i64>,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct CommentsResponse {
    pub message: String,
    pub comments: Vec<CommentRow>,
}

impl CommentsResponse {
    pub fn new(comments: Vec<CommentRow>) -> Self {
        Self { message: "success".into(), comments }
    }
}

/// `GET /api/posts/:id/comments` —— 公開純讀（只列 approved）。
#[utoipa::path(
    get, path = "/api/posts/{id}/comments", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, body = CommentsResponse)),
)]
pub async fn post_comments(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<CommentsResponse>, AppError> {
    let comments = sqlx::query_as::<_, CommentRow>(
        "SELECT id, post_id, author, content, likes, created_at, is_admin, website, status, parent_id, avatar_url, thought_id \
         FROM comments WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(CommentsResponse::new(comments)))
}

// ── 計數寫入（公開）────────────────────────────────────────────────────────
/// `POST /api/posts/:id/view` —— view_count + 1。
#[utoipa::path(
    post, path = "/api/posts/{id}/view", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "瀏覽數 +1（動態 JSON）")),
)]
pub async fn post_view(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match sqlx::query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => crate::error::internal_error(StatusCode::BAD_REQUEST, e),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "Post not found" }))).into_response()
        }
        Ok(_) => Json(json!({ "message": "success", "view_count_incremented": true })).into_response(),
    }
}

/// 共用：對 posts.likes 做 +1/-1（unlike 限 likes>0），回更新後 likes 或對應 404。
async fn adjust_post_likes(state: &AppState, id: &str, like: bool) -> Response {
    let (sql, not_found) = if like {
        ("UPDATE posts SET likes = likes + 1 WHERE id = ?", "Post not found")
    } else {
        ("UPDATE posts SET likes = likes - 1 WHERE id = ? AND likes > 0", "Post not found or cannot unlike")
    };
    match sqlx::query(sql).bind(id).execute(&state.pool).await {
        Err(e) => return crate::error::internal_error(StatusCode::BAD_REQUEST, e),
        Ok(r) if r.rows_affected() == 0 => {
            return (StatusCode::NOT_FOUND, Json(json!({ "message": not_found }))).into_response();
        }
        Ok(_) => {}
    }
    match sqlx::query_scalar::<_, i64>("SELECT likes FROM posts WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
    {
        Ok(likes) => Json(json!({ "message": "success", "likes": likes })).into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

/// `POST /api/posts/:id/like`
#[utoipa::path(
    post, path = "/api/posts/{id}/like", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "文章讚 +1（動態 JSON）")),
)]
pub async fn post_like(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    adjust_post_likes(&state, &id, true).await
}

/// `POST /api/posts/:id/unlike`
#[utoipa::path(
    post, path = "/api/posts/{id}/unlike", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "文章取消讚（動態 JSON）")),
)]
pub async fn post_unlike(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    adjust_post_likes(&state, &id, false).await
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct ReactionBody {
    emoji: Option<String>,
    delta: Option<i64>,
}

/// `POST /api/posts/:id/reactions` —— emoji 反應 upsert（clamp 0）。
#[utoipa::path(
    post, path = "/api/posts/{id}/reactions", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "emoji 反應 upsert（動態 JSON）")),
)]
pub async fn post_reaction(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
    crate::error::JsonBody(body): crate::error::JsonBody<ReactionBody>,
) -> Response {
    const ALLOWED: [&str; 6] = ["👍", "❤️", "🎉", "🚀", "🤔", "😂"];
    let emoji = body.emoji.unwrap_or_default();
    if !ALLOWED.contains(&emoji.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalid emoji" }))).into_response();
    }
    let d: i64 = if body.delta == Some(-1) { -1 } else { 1 };
    if let Err(e) = sqlx::query(
        "INSERT INTO post_reactions (post_id, emoji, count, updated_at) \
         VALUES (?, ?, MAX(0, ?), datetime('now')) \
         ON CONFLICT(post_id, emoji) DO UPDATE SET count = MAX(0, count + ?), updated_at = datetime('now')",
    )
    .bind(&id)
    .bind(&emoji)
    .bind(d)
    .bind(d)
    .execute(&state.pool)
    .await
    {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    let ctx = super::reaction_log::VisitCtx::from_headers(&headers);
    super::reaction_log::record(&state, "post", id.parse().ok(), &emoji, d, &ctx).await;
    let count =
        sqlx::query_scalar::<_, i64>("SELECT count FROM post_reactions WHERE post_id = ? AND emoji = ?")
            .bind(&id)
            .bind(&emoji)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten()
            .unwrap_or(0);
    Json(json!({ "emoji": emoji, "count": count })).into_response()
}

/// `POST /api/comments/:id/like` —— comments.likes + 1。
#[utoipa::path(
    post, path = "/api/comments/{id}/like", tag = "posts",
    params(("id" = String, Path)),
    responses((status = 200, description = "留言讚 +1（動態 JSON）")),
)]
pub async fn comment_like(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: axum::http::HeaderMap,
) -> Response {
    match sqlx::query("UPDATE comments SET likes = likes + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => return crate::error::internal_error(StatusCode::BAD_REQUEST, e),
        Ok(r) if r.rows_affected() == 0 => {
            return (StatusCode::NOT_FOUND, Json(json!({ "message": "Comment not found" }))).into_response();
        }
        Ok(_) => {
            let ctx = super::reaction_log::VisitCtx::from_headers(&headers);
            super::reaction_log::record(&state, "comment", id.parse().ok(), "like", 1, &ctx).await;
        }
    }
    match sqlx::query_scalar::<_, i64>("SELECT likes FROM comments WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.pool)
        .await
    {
        Ok(likes) => Json(json!({ "message": "success", "likes": likes })).into_response(),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

// ════════════════ posts 狀態切換（MCP 的 set_post_status）════════════════

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct StatusBody {
    status: Option<String>,
}

/// `PATCH /api/posts/:id/status`（requireAdmin）—— 僅 published|draft。
#[utoipa::path(
    patch, path = "/api/posts/{id}/status", tag = "posts", security(("bearer" = [])),
    params(("id" = String, Path)),
    responses((status = 200, description = "更新文章狀態（動態 JSON）"), (status = 401, description = "未授權")),
)]
pub async fn patch_post_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _auth: crate::auth::AdminAuth,
    crate::error::JsonBody(b): crate::error::JsonBody<StatusBody>,
) -> Response {
    let status = b.status.unwrap_or_default();
    if status != "published" && status != "draft" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "無效的狀態值，必須是 published 或 draft" })),
        )
            .into_response();
    }
    match sqlx::query("UPDATE posts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&status)
        .bind(&id)
        .execute(&state.pool)
        .await
    {
        Err(e) => crate::error::internal_error(StatusCode::BAD_REQUEST, e),
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "message": "找不到文章" }))).into_response()
        }
        Ok(r) => {
            // 直接改成發佈／草稿：原本的排程時間與回收紀錄都作廢
            let lc = crate::handlers::post_lifecycle::Lifecycle {
                status: status.clone(),
                publish_at: None,
                newsletter_pending: false,
            };
            if let Ok(n) = id.parse::<i64>()
                && let Err(e) = crate::handlers::post_lifecycle::store_lifecycle(&state.pool, n, &lc).await
            {
                return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
            }
            Json(json!({ "message": "狀態更新成功", "status": status, "changes": r.rows_affected() }))
                .into_response()
        }
    }
}

#[cfg(test)]
mod locale_tests {
    use super::*;

    /// 語系代碼 → 欄位後綴。
    ///
    /// ⚠ 一段一筆斷言，而不是只驗「認得的回 Some、不認得的回 None」。
    /// 理由是 cargo-mutants 的結果：刪掉 `"zh-CN"` 那一條 match arm，**沒有任何測試會紅**
    /// ——而那等於「全站的簡體中文譯文一起消失」（`locale_content` 走到 `locale_suffix(locale)?`
    /// 就回 None，SQL 那邊也只剩 source 判斷）。畫面上不會報錯，只是簡中讀者看到的全是原文。
    #[test]
    fn locale_suffix_每個語系各自對到自己的欄位後綴() {
        assert_eq!(locale_suffix("zh-CN"), Some("zh_cn"));
        assert_eq!(locale_suffix("en"), Some("en"));
        assert_eq!(locale_suffix("ja"), Some("ja"));
        assert_eq!(locale_suffix("ko"), Some("ko"));
        // 繁中也有自己的譯文欄（0036）：英文原稿的站補繁中譯文就寫在這裡
        assert_eq!(locale_suffix("zh-TW"), Some("zh_tw"));
        assert_eq!(locale_suffix("de"), None);
        assert_eq!(locale_suffix(""), None);
    }

    /// `?lang=` 的正規化。同樣一個語系一筆——刪掉 `"zh-tw" | "zh-hant"` 或
    /// `"zh-cn" | "zh-hans"` 任一條原本都不會被抓到（cargo-mutants 指出的）。
    /// 那兩條壞掉的後果是「帶了 lang 參數等於沒帶」，讀者永遠拿到原文。
    #[test]
    fn parse_locale_認得的別名都正規化得出來() {
        assert_eq!(parse_locale(Some("zh-TW")), Some("zh-TW"));
        assert_eq!(parse_locale(Some("zh-Hant")), Some("zh-TW"));
        assert_eq!(parse_locale(Some("zh-CN")), Some("zh-CN"));
        assert_eq!(parse_locale(Some("zh-Hans")), Some("zh-CN"));
        assert_eq!(parse_locale(Some("en")), Some("en"));
        assert_eq!(parse_locale(Some("ja")), Some("ja"));
        assert_eq!(parse_locale(Some("ko")), Some("ko"));
        // 大小寫不敏感（`to_lowercase` 之後比對）
        assert_eq!(parse_locale(Some("ZH-tw")), Some("zh-TW"));
        assert_eq!(parse_locale(Some("EN")), Some("en"));
        // 認不得與缺席都回 None
        assert_eq!(parse_locale(Some("de")), None);
        assert_eq!(parse_locale(Some("")), None);
        assert_eq!(parse_locale(None), None);
    }

    /// 建一個只填了指定 i18n 欄位的 row（其餘走預設）。
    ///
    /// 走 DB 往返而不是手寫 31 個欄位的 struct literal：欄位加減時這裡不用跟著改，
    /// 而且順便確認 `PostRow` 的 `FromRow` 對得上真正的 schema。
    async fn row_with(
        pool: &sqlx::SqlitePool,
        source: &str,
        i18n: &[(&str, Option<&str>, Option<&str>)],
    ) -> PostRow {
        sqlx::query(
            "INSERT INTO posts (id, title, content, status, created_at, source_language) \
             VALUES (1, '原文標題', '原文內容', 'published', '2026-01-01 00:00:00', ?)",
        )
        .bind(source)
        .execute(pool)
        .await
        .unwrap();
        for (sfx, title, content) in i18n {
            let up = format!("UPDATE posts SET title_{sfx} = ?, content_{sfx} = ? WHERE id = 1");
            sqlx::query(sqlx::AssertSqlSafe(up.as_str()))
                .bind(title)
                .bind(content)
                .execute(pool)
                .await
                .unwrap();
        }
        // ⚠ 要補 `NULL as tags`：`PostRow` 的 tags 不是真欄位，正式查詢是
        //   `GROUP_CONCAT(t.name) as tags` 湊出來的，裸 `SELECT *` 會 ColumnNotFound。
        sqlx::query_as::<_, PostRow>("SELECT p.*, NULL as tags FROM posts p WHERE p.id = 1")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn memory_pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    /// 「有標題但沒內文」不算該語系可用。
    ///
    /// ⚠ cargo-mutants 指出把 `&&` 換成 `||` 沒有任何測試會紅。那個改動的後果很具體：
    /// 語系切換器會列出該語系、讀者點下去，`locale_content` 卻因為要求 title 與 content
    /// 都非空而回 None —— 也就是「選單說有、點進去沒有」。
    #[tokio::test]
    async fn available_locales_只認標題與內文都在的語系() {
        let pool = memory_pool().await;
        let row = row_with(
            &pool,
            "zh-TW",
            &[
                ("en", Some("English title"), Some("English body")), // 兩者都有 → 算
                ("ja", Some("日本語タイトル"), None),                // 只有標題 → 不算
                ("ko", None, Some("한국어 본문")),                   // 只有內文 → 不算
                ("zh_cn", Some(""), Some("")),                       // 空字串等同沒有
            ],
        )
        .await;

        let locales = available_locales_with_source(&row, "zh-TW");
        assert_eq!(locales, vec!["zh-TW".to_string(), "en".to_string()], "只有 source 與 en 該被列出");
    }

    /// **`locale_content`（Rust，列表用）與 `locale_available_sql`（SQL，計數用）必須同語意。**
    ///
    /// 這是 `locale_available_sql` 的註解點名、但先前沒有任何測試盯著的不變式。
    /// 兩邊漂掉的症狀寫在那段註解裡：「分類寫 4 篇、點進去 0 篇」「分頁說有 11 篇卻翻到空白頁」
    /// ——列表 `continue` 掉沒譯文的文章，計數卻照算。
    ///
    /// 做法是把同一列同時餵給兩邊：Rust 直接呼叫，SQL 則把述詞放進 `SELECT` 讓 SQLite 自己算。
    /// 涵蓋各種「部分翻譯」的組合 × 五個語系。
    #[tokio::test]
    async fn rust_與_sql_對同一列的判斷必須一致() {
        /// (來源語, 各語系的 (欄位後綴, 標題, 內文), 這一組在測什麼)
        type Case<'a> = (&'a str, &'a [(&'a str, Option<&'a str>, Option<&'a str>)], &'a str);
        let cases: &[Case<'_>] = &[
            ("zh-TW", &[], "完全沒有譯文"),
            ("zh-TW", &[("en", Some("t"), Some("c"))], "只有英文完整"),
            ("zh-TW", &[("ja", Some("t"), None)], "日文只有標題"),
            ("zh-TW", &[("ko", None, Some("c"))], "韓文只有內文"),
            ("zh-TW", &[("zh_cn", Some(""), Some(""))], "簡中是空字串"),
            ("en", &[("zh_cn", Some("t"), Some("c"))], "來源語是英文"),
            (
                "zh-TW",
                &[
                    ("en", Some("t"), Some("c")),
                    ("ja", Some("t"), Some("c")),
                    ("ko", Some("t"), Some("c")),
                    ("zh_cn", Some("t"), Some("c")),
                ],
                "全語系齊全",
            ),
        ];

        for (source, i18n, why) in cases {
            let pool = memory_pool().await;
            let row = row_with(&pool, source, i18n).await;
            for locale in I18N_LOCALES {
                let rust_says = locale_content(&row, locale).is_some();
                let sql = format!("SELECT {} FROM posts WHERE id = 1", locale_available_sql(locale, "posts"));
                let sql_says: i64 =
                    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.as_str())).fetch_one(&pool).await.unwrap();
                assert_eq!(
                    rust_says,
                    sql_says == 1,
                    "{why}：locale={locale} 時 Rust 說 {rust_says}、SQL 說 {}——\
                     兩邊漂掉就會出現「分類寫 N 篇、點進去 0 篇」",
                    sql_says == 1,
                );
            }
        }
    }
}
