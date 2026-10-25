//! 分享圖（`GET /api/og/{file}?l=<語系>`）。
//!
//! - `/api/og/<文章 id>.png`：文章。背景是手記的星軌，亮的是這一篇自己那道。
//! - `/api/og/<頁>.png`：各頁（`PAGES`）。背景是那一頁自己的畫面（`og/scenes/`）。
//!
//! 每張都是 APNG：背景逐格畫（`scenes`）、字那一層用 takumi 排一次、疊起來編碼（`apng`）。
//! 字的語系照 `?l=`，頁名與副標直接讀前端的 `src/locales/*/common.json`，不另外抄一份。
//!
//! ## 為什麼字用 takumi 排
//!
//! 舊版手工組 SVG 字串再光柵化，而 SVG **沒有排版引擎**——`<text>` 不會換行，自己算斷行的
//! 那份程式在線上產出過壞圖：逗號被推到行首、`CTranslate2` 被切在字母中間、英文標題 56 個字
//! 只顯示 48 個（它數字元不數寬度）。takumi 內含 taffy（flexbox）、parley（文字排版）與
//! icu_segmenter（斷行規則），這些都由引擎處理。
//!
//! ## 字型
//!
//! ⚠ takumi **不吃系統字型**。CJK 一定要自己註冊，否則中文全部變成豆腐——而且**不會報錯**，
//! 只是圖裡沒有字。容器裡的 `fonts-noto-cjk` 仍然要裝，只是改由我們讀檔案。見 `load_fonts`。

mod apng;
mod canvas;
mod scenes;

use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use parking_lot::Mutex;
use serde::Deserialize;
use takumi::prelude::*;

use crate::handlers::posts::{parse_locale, sky_list};
use crate::state::AppState;
// 模板是字串組裝，所以標題要轉義（改用 node tree 就不需要，但模板會變成一大串 builder 呼叫）
use crate::util::escape_html;

use scenes::{About, Log, Notes, Saturn, Scene, SkyPost};

/// 主標與副標：跟前端 `lib/blogReading.ts` 的 `splitTitle` 同一套規則——全形冒號，
/// 或半形冒號後面接空白（`Rust 1.85:2024` 那種不拆）。兩邊任一段是空的就不拆
fn split_title(title: &str) -> (&str, Option<&str>) {
    let cut = title.char_indices().find_map(|(i, c)| match c {
        '：' => Some((i, c.len_utf8())),
        ':' if title[i + 1..].starts_with(char::is_whitespace) => Some((i, 1)),
        _ => None,
    });
    let Some((at, len)) = cut else { return (title, None) };
    let (main, sub) = (title[..at].trim(), title[at + len..].trim());
    if main.is_empty() || sub.is_empty() { (title, None) } else { (main, Some(sub)) }
}

// ── 語系 ───────────────────────────────────────────────────────

/// 站上的五個語系 → 語系檔、takumi 的語言標記、Noto CJK 裡對應的字形版本
/// （同一個字在繁中、簡中、日文、韓文的寫法不一樣，`.ttc` 裡四套都有）
struct Locale {
    code: &'static str,
    json: &'static str,
    lang: &'static str,
    cjk: &'static str,
}

const LOCALES: [Locale; 5] = [
    Locale {
        code: "zh-TW",
        json: include_str!("../../../src/locales/zh-TW/common.json"),
        lang: "zh-Hant",
        cjk: "TC",
    },
    Locale {
        code: "zh-CN",
        json: include_str!("../../../src/locales/zh-CN/common.json"),
        lang: "zh-Hans",
        cjk: "SC",
    },
    Locale { code: "en", json: include_str!("../../../src/locales/en/common.json"), lang: "en", cjk: "TC" },
    Locale { code: "ja", json: include_str!("../../../src/locales/ja/common.json"), lang: "ja", cjk: "JP" },
    Locale { code: "ko", json: include_str!("../../../src/locales/ko/common.json"), lang: "ko", cjk: "KR" },
];

static STRINGS: LazyLock<HashMap<&'static str, serde_json::Value>> = LazyLock::new(|| {
    LOCALES
        .iter()
        .map(|l| {
            (
                l.code,
                serde_json::from_str(l.json).expect("src/locales 的 JSON 由前端的測試把關，壞了編不到這裡"),
            )
        })
        .collect()
});

fn locale_of(code: &str) -> &'static Locale {
    LOCALES.iter().find(|l| l.code == code).unwrap_or(&LOCALES[0])
}

/// 語系檔裡 `a.b.c` 那一條；這個語系沒有就退回繁中
fn text(locale: &str, key: &str) -> String {
    let find = |code: &str| {
        let mut v = STRINGS.get(code)?;
        for part in key.split('.') {
            v = v.get(part)?;
        }
        v.as_str().map(str::to_string)
    };
    find(locale).or_else(|| find("zh-TW")).unwrap_or_default()
}

// ── 頁面 ───────────────────────────────────────────────────────

/// 有分享圖的頁：網址上的名字、頁名（語系檔的 key）、頁名旁那行等寬英文（`data/siteSections.ts`
/// 的 caps）、副標（頁面上那一句，都是站長自己寫的）。前端的 `seo/seoMeta.ts` 用同一組名字
struct Page {
    key: &'static str,
    name: &'static str,
    caps: &'static str,
    sub: &'static str,
}

const PAGES: [Page; 12] = [
    Page { key: "home", name: "", caps: "KOIMSURAI", sub: "og.tagline" },
    Page { key: "notes", name: "siteNav.notes", caps: "NOTES", sub: "blog.subtitle" },
    Page { key: "moments", name: "siteNav.moments", caps: "MOMENTS", sub: "thinking.subtitle" },
    Page { key: "works", name: "siteNav.works", caps: "WORK", sub: "works.subtitle" },
    Page { key: "collection", name: "siteNav.collection", caps: "COLLECTION", sub: "collection.subtitle" },
    Page { key: "about", name: "siteNav.aboutAll", caps: "ABOUT", sub: "aboutFall.title" },
    Page { key: "setup", name: "siteNav.setup", caps: "SETUP", sub: "setup.subtitle" },
    Page { key: "log", name: "siteNav.log", caps: "LOG", sub: "log.subtitle" },
    Page { key: "messages", name: "siteNav.messages", caps: "MESSAGES", sub: "messages.subtitle" },
    Page { key: "photos", name: "siteNav.photos", caps: "PHOTOS", sub: "photos.subtitle" },
    Page { key: "friends", name: "siteNav.friends", caps: "FRIENDS", sub: "friends.subtitle" },
    Page { key: "colophon", name: "siteNav.colophon", caps: "COLOPHON", sub: "colophon.subtitle" },
];

/// 不需要資料的背景，整個進程算一次
static SATURN: LazyLock<Saturn> = LazyLock::new(Saturn::new);

// ── 字那一層 ───────────────────────────────────────────────────

/// 一張卡上的字。`kicker` 是標題上面那行琥珀色的小字（分類 · 日期，或頁名的英文）
struct Card<'a> {
    kicker: &'a str,
    title: &'a str,
    sub: Option<&'a str>,
    /// 左上角要不要寫站名：首頁那張的大標就是站名，只留網址
    brand: bool,
    /// Noto CJK 的字形版本（TC／SC／JP／KR）
    cjk: &'a str,
}

/// 字那一層的 HTML：**底是透明的**，背景由 `scenes` 逐格畫好再疊上來。
/// 版面照設計畫布的 OgImage（字在左、圖在右），字型與顏色照翻新後的站：
/// 思源宋體（容器裡是同一套字的 Noto Serif CJK）、暖白字、琥珀色的 Fira Code 小字。
///
/// ⚠ 根節點要自己撐滿畫布（`width/height: 100%`）——takumi 不會替你做，
///   忘了的話內容會擠在左上角。
///
/// ⚠ 省略號要靠 `text-overflow: ellipsis`，**不是** `line-clamp` 自己加的。
///   這是試出來的，三種寫法的實際結果：
///     `line-clamp:3` 單獨用            → 正確截成三行，但**沒有省略號**
///     `max-lines:3; block-ellipsis:auto` → 完全沒截，變五行把頁尾擠出畫面
///     `…; continue:discard`            → 整段 style 被丟掉（字級／顏色全失效）
///   所以是 `line-clamp` + `text-overflow:ellipsis`。動這兩行之前先跑 `產生樣張`。
///
/// 讓背景在字底下淡掉的那片漸層不在這裡，在 `apng::compose`：見那邊的註解。
fn build_html(card: &Card) -> String {
    let serif = format!("'Noto Serif CJK {}'", card.cjk);
    let sans = format!("'Noto Sans CJK {}'", card.cjk);
    let brand = if card.brand {
        format!(
            r#"<span style="font-family:{serif}; font-size:30px; font-weight:700; color:#f1ece3;">宙と木</span>"#
        )
    } else {
        String::new()
    };
    let sub = card.sub.map_or_else(String::new, |s| {
        format!(
            r#"<div style="font-size:26px; line-height:1.45; color:rgba(241,236,227,0.7); line-clamp:2; text-overflow:ellipsis;">{}</div>"#,
            escape_html(s)
        )
    });
    format!(
        r#"<div style="width:100%; height:100%; display:flex; position:relative; font-family:{serif};">
  <div style="position:absolute; left:72px; top:64px; bottom:64px; width:620px;
    display:flex; flex-direction:column; justify-content:space-between;">
    <div style="display:flex; flex-direction:row; align-items:baseline; gap:14px;">
      {brand}
      <span style="font-family:'Fira Code'; font-size:15px; letter-spacing:0.16em; color:rgba(241,236,227,0.45);">koimsurai.com</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="font-family:'Fira Code',{sans}; font-size:18px; letter-spacing:0.12em; color:#e9c17a;">{kicker}</div>
      <div style="font-size:54px; font-weight:700; line-height:1.25; color:#f1ece3; line-clamp:3; text-overflow:ellipsis; text-wrap:balance;">{title}</div>
      {sub}
    </div>
  </div>
</div>"#,
        kicker = escape_html(card.kicker),
        title = escape_html(card.title.trim()),
    )
}

/// 文章的卡：分類是空的時候退回「手記」那個字，日期寫成 `2026/10/13`
fn post_card_html(title: &str, category: Option<&str>, date: &str, locale: &str) -> String {
    let fallback = text(locale, "siteNav.notes");
    let cat = category.filter(|c| !c.is_empty()).unwrap_or(&fallback);
    let date = date.replace('-', "/");
    let kicker = if date.is_empty() { cat.to_string() } else { format!("{cat} · {date}") };
    let (main, sub) = split_title(title.trim());
    build_html(&Card { kicker: &kicker, title: main, sub, brand: true, cjk: locale_of(locale).cjk })
}

fn page_card_html(page: &Page, locale: &str) -> String {
    let home = page.name.is_empty();
    let title = if home { "宙と木".to_string() } else { text(locale, page.name) };
    let sub = text(locale, page.sub);
    build_html(&Card {
        kicker: page.caps,
        title: &title,
        sub: Some(sub.as_str()).filter(|s| !s.is_empty()),
        brand: !home,
        cjk: locale_of(locale).cjk,
    })
}

// ── 字型與產圖 ─────────────────────────────────────────────────

/// Debian 的 `fonts-noto-cjk` 裝出來的路徑。標題是宋體 700、分類那行的中文退回黑體。
/// 每個字重都要有檔案——少了的話 takumi 會用合成粗體（font-synthesis），中文的合成粗體很糊。
///
/// ⚠ 這裡刻意**不 panic**。字型讀不到時仍然要能出圖，只是中文會變豆腐——
/// 而那至少還看得出「圖有產出、字型掛了」，比整條端點 500 好查。
const CJK_FONTS: [&str; 3] = [
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
];

/// 分類、日期、網址那幾行的等寬字，跟站上同一套（`@fontsource-variable/fira-code` 的拉丁子集，
/// 授權 OFL，見同目錄的 FiraCode-OFL.txt）。只有 35 KB，直接編進執行檔，不用動容器
const FIRA_CODE: &[u8] = include_bytes!("../../assets/fonts/FiraCode-latin.woff2");

fn load_fonts() -> Fonts {
    let mut fonts = Fonts::default();
    if let Err(e) = fonts.register(FontResource::new(FIRA_CODE.to_vec())) {
        tracing::error!("[OG] Fira Code 註冊失敗: {e}");
    }
    let mut loaded = 0usize;
    for path in CJK_FONTS {
        match std::fs::read(path) {
            // register 回傳它註冊到的 family 清單（.ttc 一個檔可能含多個），這裡只在意成敗
            Ok(bytes) => match fonts.register(FontResource::new(bytes)) {
                Ok(families) => {
                    tracing::info!("[OG] 載入字型 {path}（{} 個 family）", families.len());
                    loaded += 1;
                }
                Err(e) => tracing::error!("[OG] 字型註冊失敗 {path}: {e}"),
            },
            Err(e) => tracing::error!("[OG] 讀不到字型 {path}: {e}"),
        }
    }
    if loaded == 0 {
        // 這一行要夠大聲：症狀是「OG 圖裡的中文全變方框」，而端點仍然回 200
        tracing::error!("[OG] 一個 CJK 字型都沒載到——OG 圖的中文會是豆腐。容器裝了 fonts-noto-cjk 嗎？");
    }
    fonts
}

static FONTS: LazyLock<Fonts> = LazyLock::new(load_fonts);

/// 字那一層，RGBA（非預乘），底是透明的。
///
/// ⚠ `lang` **不會**消掉 render 時 stderr 上那幾行 `ICU4X data error: No segmentation model
/// for language: ja`——那是 parley 在字型層決定語言標記時發出的，跟這裡是兩條路徑。它是無害的：
/// 斷行仍然正確，缺的只是日文的「詞典式斷詞」。分享圖有快取，每張實際只會 render 一次。
fn render_overlay(html: &str, locale: &str) -> anyhow::Result<Vec<u8>> {
    let node = Node::from_html(html, FromHtmlOptions::default())
        .map_err(|e| anyhow::anyhow!("takumi from_html: {e}"))?;
    let options = RenderOptions::builder()
        .viewport(Viewport::new(apng::SIZE))
        .node(node)
        .fonts(&FONTS)
        .lang(Lang::parse(locale_of(locale).lang).ok())
        .build();
    let image = takumi::render(options).map_err(|e| anyhow::anyhow!("takumi render: {e}"))?;
    let raw = image.into_raw();
    anyhow::ensure!(raw.len() == apng::W * apng::H * 4, "takumi 畫出來的尺寸不對（{} bytes）", raw.len());
    Ok(raw)
}

/// 字 → 疊在每一格背景上 → APNG（CPU 密集，呼叫端丟 spawn_blocking）
fn render(html: &str, locale: &str, scene: &dyn Scene) -> anyhow::Result<Vec<u8>> {
    let overlay = render_overlay(html, locale)?;
    apng::encode(scene.frames(), scene.frame_ms(), |i| apng::compose(&scene.frame(i), &overlay))
}

/// 這一頁的背景。`sky` 是手記星軌要用的文章清單（只有 notes 用得到）
fn page_scene(key: &str, sky: &[SkyPost]) -> Box<dyn Scene> {
    match key {
        "notes" => Box::new(Notes::new(sky, 0)),
        "about" => Box::new(About::new()),
        "log" => Box::new(Log::new()),
        // 其他頁的背景移植完之前，先用首頁的土星
        _ => Box::new(SaturnRef),
    }
}

/// 把共用的那顆土星包成 `Box<dyn Scene>`（它本身是 static，不能搬進 Box）
struct SaturnRef;
impl Scene for SaturnRef {
    fn frames(&self) -> usize {
        SATURN.frames()
    }
    fn frame_ms(&self) -> u32 {
        SATURN.frame_ms()
    }
    fn frame(&self, index: usize) -> tiny_skia::Pixmap {
        SATURN.frame(index)
    }
}

// ── 快取與 HTTP ────────────────────────────────────────────────

struct CachedOg {
    png: Arc<Vec<u8>>,
    etag: String,
    /// 內容的指紋：標題、時間戳、文章清單一變就不一樣，快取跟著失效
    key: String,
}

/// 一個「位置」（哪一篇或哪一頁 × 語系）一張。動畫一張約幾百 KB；沒有上限的話只會長不會縮
static CACHE: LazyLock<Mutex<HashMap<String, CachedOg>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
const CACHE_MAX: usize = 64;

/// ETag 用的雜湊。FNV-1a：不需要相依、跨版本永遠決定性（ETag 會被客戶端與 CDN
/// 存著，換 Rust 版本就變值的話等於每次升級都讓全站的圖失效）。
///
/// ⚠️ 這裡原本是 `base64(cacheKey).slice(0, 12)`（照抄 Express）。那是**壞的**：
/// 12 個 base64 字元只編碼 9 個 byte，標題與大部分時間戳從來沒有進入 ETag，
/// 改標題前後算出來是同一個值 → 讀者拿到 304、一直看到舊圖。
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x1000_0000_01b3);
    }
    h
}

fn text_resp(code: StatusCode, body: &'static str) -> Response {
    (code, [(header::CONTENT_TYPE, "text/html; charset=utf-8")], body).into_response()
}

fn png_resp(png: &[u8], etag: String) -> Response {
    (
        [
            (header::CONTENT_TYPE, "image/png".to_string()),
            (header::ETAG, etag),
            (header::CACHE_CONTROL, "public, max-age=300, s-maxage=86400".to_string()),
        ],
        png.to_vec(),
    )
        .into_response()
}

#[derive(Deserialize)]
pub struct OgQuery {
    /// 語系（zh-TW／zh-CN／en／ja／ko），沒給或不認得就是繁中
    l: Option<String>,
}

/// 文章清單 → 星軌參數，加上清單的指紋（新文章、改標題都會讓手記的那片天不一樣）
fn sky_of(list: &[(i64, String, usize)]) -> (Vec<SkyPost>, u64) {
    let max_len = list.iter().map(|p| p.2).max().unwrap_or(1);
    let sky = list.iter().map(|(_, t, n)| SkyPost::of(t, *n, max_len)).collect();
    let sig = fnv1a(&list.iter().map(|(id, t, n)| format!("{id}:{n}:{t}")).collect::<Vec<_>>().join("|"));
    (sky, sig)
}

/// `GET /api/og/{file}`（axum 不支援 `:id.png` 部分參數）——非 `.png` 後綴、不認得的頁回 404。
#[utoipa::path(get, path = "/api/og/{file}", tag = "media",
    params(("file" = String, Path, description = "`<文章 id>.png` 或 `<頁>.png`"), ("l" = Option<String>, Query, description = "語系")),
    responses((status = 200, description = "分享圖（APNG）"), (status = 304, description = "Not Modified（ETag 命中）"), (status = 404, description = "找不到"), (status = 500, description = "產生失敗")))]
pub async fn og_png(
    State(state): State<AppState>,
    Path(file): Path<String>,
    Query(q): Query<OgQuery>,
    headers: HeaderMap,
) -> Response {
    let Some(stem) = file.strip_suffix(".png") else {
        return text_resp(StatusCode::NOT_FOUND, "not found");
    };
    let locale = parse_locale(q.l.as_deref()).unwrap_or("zh-TW");
    let inm = headers.get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok()).map(String::from);

    // 位置、內容指紋、字那一層的 HTML、背景
    let prepared = if let Ok(id) = stem.parse::<i64>() {
        prepare_post(&state, id, locale).await
    } else if let Some(page) = PAGES.iter().find(|p| p.key == stem) {
        Some(prepare_page(&state, page, locale).await)
    } else {
        None
    };
    let Some((slot, key, html, scene)) = prepared else {
        return text_resp(StatusCode::NOT_FOUND, "not found");
    };

    if let Some(c) = CACHE.lock().get(&slot).filter(|c| c.key == key) {
        if inm.as_deref() == Some(c.etag.as_str()) {
            return StatusCode::NOT_MODIFIED.into_response();
        }
        return png_resp(&c.png, c.etag.clone());
    }

    let loc = locale.to_string();
    let png = match tokio::task::spawn_blocking(move || render(&html, &loc, scene.as_ref())).await {
        Ok(Ok(p)) => Arc::new(p),
        Ok(Err(e)) => {
            tracing::error!("[OG] 產圖失敗 ({slot}): {e}");
            return text_resp(StatusCode::INTERNAL_SERVER_ERROR, "og generation failed");
        }
        Err(e) => {
            tracing::error!("[OG] 產圖 task 掛了 ({slot}): {e}");
            return text_resp(StatusCode::INTERNAL_SERVER_ERROR, "og generation failed");
        }
    };
    let etag = format!("\"og-{:016x}\"", fnv1a(&format!("{slot}::{key}")));
    {
        let mut cache = CACHE.lock();
        // 滿了就隨便丟一張（不追蹤誰最久沒用）：被丟掉的那張下次再算一次就好
        if cache.len() >= CACHE_MAX
            && !cache.contains_key(&slot)
            && let Some(evict) = cache.keys().next().cloned()
        {
            cache.remove(&evict);
        }
        cache.insert(slot, CachedOg { png: png.clone(), etag: etag.clone(), key });
    }
    png_resp(&png, etag)
}

/// 位置、內容指紋、字那一層的 HTML、背景
type Prepared = (String, String, String, Box<dyn Scene>);

async fn prepare_post(state: &AppState, id: i64, locale: &str) -> Option<Prepared> {
    let (post_id, title, category, created_at, updated_at) =
        sqlx::query_as::<_, (i64, Option<String>, Option<String>, Option<String>, Option<String>)>(
            "SELECT id, title, category, created_at, updated_at FROM posts WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .ok()??;
    // 這個語系的手記清單裡有它就用它的譯名與位置；沒有（沒譯、還沒發布）就退回繁中的清單
    let mut list = sky_list(&state.pool, locale).await.unwrap_or_default();
    let mut text_locale = locale;
    if !list.iter().any(|p| p.0 == post_id) {
        list = sky_list(&state.pool, "zh-TW").await.unwrap_or_default();
        text_locale = "zh-TW";
    }
    let found = list.iter().position(|p| p.0 == post_id);
    let lit = found.unwrap_or(0);
    let title = found.map_or_else(|| title.unwrap_or_default(), |i| list[i].1.clone());
    // 分類的譯名在 categories 表（name_en…）；沒有譯名就用原名
    let category = match (category.as_deref(), crate::handlers::posts::locale_suffix(text_locale)) {
        (Some(c), Some(sfx)) if !c.is_empty() => {
            let sql = format!("SELECT name_{sfx} FROM categories WHERE name = ?");
            let localized = sqlx::query_scalar::<_, Option<String>>(sqlx::AssertSqlSafe(sql.as_str()))
                .bind(c)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten()
                .flatten()
                .filter(|s| !s.is_empty());
            localized.or(category)
        }
        _ => category,
    };
    let date = crate::util::js_substring_prefix(created_at.as_deref().unwrap_or(""), 10);
    let stamp = updated_at.filter(|s| !s.is_empty()).or(created_at).unwrap_or_default();
    let (sky, sig) = sky_of(&list);
    let html = post_card_html(&title, category.as_deref(), &date, text_locale);
    let key = format!("{stamp}::{title}::{}::{sig:x}", category.unwrap_or_default());
    Some((format!("post:{post_id}:{locale}"), key, html, Box::new(Notes::new(&sky, lit))))
}

async fn prepare_page(state: &AppState, page: &Page, locale: &str) -> Prepared {
    let (sky, sig) = if page.key == "notes" {
        sky_of(&sky_list(&state.pool, locale).await.unwrap_or_default())
    } else {
        (Vec::new(), 0)
    };
    let html = page_card_html(page, locale);
    // 頁名與副標改了（語系檔跟著部署）快取也要失效：指紋直接用 HTML
    let key = format!("{:x}::{sig:x}", fnv1a(&html));
    (format!("page:{}:{locale}", page.key), key, html, page_scene(page.key, &sky))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ETag 的雜湊必須涵蓋**整個**字串（回歸：舊版只吃前 9 個 byte，改標題 ETag 不變）。
    #[test]
    fn etag_雜湊要涵蓋整個_cache_key() {
        let a = fnv1a("1::2026-08-03 20:00:00::公開文章");
        let b = fnv1a("1::2026-02-01 00:00:00::改過的標題");
        let c = fnv1a("1::2026-08-03 20:00:00::公開文章 "); // 只差一個空白
        assert_ne!(a, b, "改了標題與時間戳卻算出同一個 ETag——讀者會一直看到舊圖");
        assert_ne!(a, c, "只差一個字元也要換值");
        assert_eq!(a, fnv1a("1::2026-08-03 20:00:00::公開文章"));
        assert_ne!(fnv1a(""), fnv1a("1::::"));
    }

    /// 標題直接來自使用者輸入，`</div>` 之類的東西不能把模板打斷。
    #[test]
    fn 標題裡的標籤不會逃出模板() {
        let html =
            post_card_html("</div><script>alert(1)</script>：<b>副標</b>", None, "2026-08-09", "zh-TW");
        assert!(!html.contains("<script>") && !html.contains("<b>"), "原始標籤進了模板：{html}");
        assert!(html.contains("&lt;script&gt;") && html.contains("&lt;b&gt;"));
    }

    /// 分類是空的時候退回「手記」（照語系）；日期寫成斜線。
    #[test]
    fn 空分類退回手記() {
        assert!(post_card_html("t", None, "d", "zh-TW").contains("手記"));
        assert!(post_card_html("t", Some(""), "d", "en").contains("Notes"));
        assert!(post_card_html("t", Some("技術"), "2026-10-13", "zh-TW").contains("技術 · 2026/10/13"));
        assert!(
            post_card_html("t", Some("技術"), "", "zh-TW").contains(">技術<"),
            "沒有日期就不要留一個孤零零的 ·"
        );
    }

    /// 主標／副標的拆法要跟前端 `splitTitle` 一致（那邊的測試在 `lib/blogReading.test.ts`）。
    #[test]
    fn 主標副標照前端的規則拆() {
        assert_eq!(
            split_title("為什麼我開始使用 Zed 編輯器：從 VS Code 搬家"),
            ("為什麼我開始使用 Zed 編輯器", Some("從 VS Code 搬家"))
        );
        assert_eq!(split_title("CrowdSec: 取代 fail2ban"), ("CrowdSec", Some("取代 fail2ban")));
        assert_eq!(split_title("Rust 1.85:2024 edition"), ("Rust 1.85:2024 edition", None));
        assert_eq!(split_title("：只有副標"), ("：只有副標", None));
        assert_eq!(split_title("只有主標："), ("只有主標：", None));
        assert_eq!(split_title(""), ("", None));
    }

    /// 每一頁在每個語系都要拿得到頁名與副標——語系檔改了 key 名，這裡會先紅，
    /// 不會等到分享圖上出現一塊空白才發現。
    #[test]
    fn 每頁每個語系都有頁名與副標() {
        for l in &LOCALES {
            for p in &PAGES {
                for key in [p.name, p.sub].into_iter().filter(|k| !k.is_empty()) {
                    let v = STRINGS[l.code].pointer(&format!("/{}", key.replace('.', "/")));
                    assert!(
                        v.and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty()),
                        "{} 沒有 {key}",
                        l.code
                    );
                }
            }
        }
    }

    /// 走完整條路徑（HTML → 排版 → 光柵化 → 疊上背景 → APNG），檢查輸出真的是
    /// 1200×630、會動、而且後面的格只存差異。只編三格：整段在 debug 建置下要跑很久，
    /// 而格與格之間走的是同一段程式。
    #[test]
    fn 長標題也畫得出正確尺寸的_apng() {
        let sky: Vec<SkyPost> =
            (0..20).map(|i| SkyPost::of(&format!("第 {i} 篇"), 1000 + i * 300, 7000)).collect();
        let scene = Notes::new(&sky, 3);
        let long = "把 NLLB 翻譯接進 Rust,在 Windows 上撞穿整條工具鏈：ct2rs × CTranslate2 的 protobuf 撞名、CRT 之爭、關閉死鎖與 NVIDIA 崩潰";
        let overlay = render_overlay(&post_card_html(long, Some("位元築夢"), "2026-07-21", "zh-TW"), "zh-TW")
            .expect("長標題要畫得出來");
        // 從拖軌跡的那段開始取，三格之間才有東西在動
        let png =
            apng::encode(3, 100, |i| apng::compose(&scene.frame(i + 100), &overlay)).expect("要編得出來");
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a], "輸出不是 PNG");
        let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
        let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
        assert_eq!((w, h), apng::SIZE, "尺寸不對");
        // acTL（動畫控制）要在第一個 IDAT 之前，不然瀏覽器把它當成一般的 PNG
        let pos = |tag: &[u8]| png.windows(4).position(|c| c == tag);
        let (actl, idat) = (pos(b"acTL").expect("沒有 acTL：不是 APNG"), pos(b"IDAT").expect("沒有 IDAT"));
        assert!(actl < idat);
        let bytes_of = |tag: &[u8]| -> usize {
            let (mut at, mut sum) = (8, 0);
            while at + 8 <= png.len() {
                let len = u32::from_be_bytes([png[at], png[at + 1], png[at + 2], png[at + 3]]) as usize;
                if &png[at + 4..at + 8] == tag {
                    sum += len;
                }
                at += 12 + len;
            }
            sum
        };
        let (first, rest) = (bytes_of(b"IDAT"), bytes_of(b"fdAT"));
        assert!(
            rest > 0 && rest * 5 < first,
            "後面的格沒有只存差異：第一格 {first} bytes，後兩格 {rest} bytes"
        );
    }

    /// 背景要真的會動，而且最後一格接得回第一格。
    #[test]
    fn 背景會動而且首尾接得起來() {
        let sky: Vec<SkyPost> = (0..12).map(|i| SkyPost::of(&format!("p{i}"), 500 * (i + 1), 6000)).collect();
        let scenes: [Box<dyn Scene>; 4] = [
            Box::new(Saturn::new()),
            Box::new(Notes::new(&sky, 0)),
            Box::new(About::new()),
            Box::new(Log::new()),
        ];
        for scene in scenes {
            let n = scene.frames();
            let (a, b) = (scene.frame(0), scene.frame(n * 3 / 5));
            assert_ne!(a.data(), b.data(), "一圈裡的畫面跟第一格一模一樣：沒有在動");
            let last = scene.frame(n - 1);
            let diff = a.data().iter().zip(last.data()).filter(|(p, q)| p.abs_diff(**q) > 24).count();
            assert!(diff < 2000, "最後一格跟第一格差太多（{diff} 個色值），循環會跳一下");
        }
    }

    /// 空標題、空日期、沒有文章也不能炸——資料庫裡真的有這種列。
    #[test]
    fn 空輸入不會_panic() {
        assert!(render_overlay(&post_card_html("", None, "", "ja"), "ja").is_ok());
        assert_eq!(Notes::new(&[], 0).frame(0).data().len(), apng::W * apng::H * 4);
    }

    /// 把樣張寫到 `/tmp/og-preview/`，用眼睛看（不是斷言，是工具）。改動模板或背景時跑它：
    ///
    ///   cargo nextest run --release --run-ignored only -E 'test(產生樣張)' --no-capture
    ///
    /// `OG_PREVIEW=notes,home` 只產這幾張（`post` 是文章）；`OG_LOCALES=en,ja` 換語系（預設繁中）。
    #[test]
    #[ignore = "產生樣張供人工檢視，不做斷言"]
    fn 產生樣張() {
        let dir = std::path::Path::new("/tmp/og-preview");
        std::fs::create_dir_all(dir).unwrap();
        let only = std::env::var("OG_PREVIEW").ok();
        let wanted = |k: &str| only.as_deref().is_none_or(|o| o.split(',').any(|x| x == k));
        let locales = std::env::var("OG_LOCALES").unwrap_or_else(|_| "zh-TW".into());
        let sky: Vec<SkyPost> =
            (0..48).map(|i| SkyPost::of(&format!("篇 {i}"), 800 + (i * 977) % 9000, 9800)).collect();
        for loc in locales.split(',') {
            for page in PAGES.iter().filter(|p| wanted(p.key)) {
                let png =
                    render(&page_card_html(page, loc), loc, page_scene(page.key, &sky).as_ref()).unwrap();
                let path = dir.join(format!("{}-{loc}.png", page.key));
                std::fs::write(&path, &png).unwrap();
                println!("{} → {} bytes", path.display(), png.len());
            }
            if wanted("post") {
                let title =
                    "用 Frigate + Home Assistant 自製 Furbo 寵物保母：本機 AI 寫貓咪日記，但分不出我的兩隻貓";
                let png = render(
                    &post_card_html(title, Some("位元築夢"), "2026-10-13", loc),
                    loc,
                    &Notes::new(&sky, 5),
                )
                .unwrap();
                let path = dir.join(format!("post-{loc}.png"));
                std::fs::write(&path, &png).unwrap();
                println!("{} → {} bytes", path.display(), png.len());
            }
        }
    }
}
