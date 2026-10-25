//! OG 圖產生（`GET /api/og/:id.png`）。
//!
//! ## 為什麼從 resvg 換成 takumi
//!
//! 舊版是 Express 時代留下來的做法：手工組一段 SVG 字串 → resvg 光柵化。
//! 問題不在 resvg（它光柵化得很好），在 **SVG 沒有排版引擎**——`<text>` 不會換行，
//! 所以斷行得自己算。那份自製的 `wrap_title` 是「數 UTF-16 單位、滿 16 個就換行」，
//! 而它在線上產出過壞圖：
//!
//!   · `,在 Windows 上撞穿整條` —— 逗號被推到行首。CJK 排版的基本禁則（標點不能起首）
//!     它完全不知道。
//!   · `ct2rs × CTr…` —— `CTranslate2` 被切在字母中間。它不認得單字邊界。
//!   · 英文標題更慘：16 個字元一行，`Why I switched f` / `rom VS Code to Z` /
//!     `ed and never loo`，56 個字只顯示 48 個。因為它數的是「字元」而不是「寬度」，
//!     而一個 CJK 字的寬度大約是一個拉丁字母的兩倍。
//!
//! takumi 內含 taffy（flexbox）、parley（文字排版）與 icu_segmenter（斷行規則），
//! 上面三件事都由引擎處理。換過去之後 `wrap_title` 連同它那批對拍測試整個刪掉——
//! 那些測試釘的是「我們自己算得跟 JS 一樣」，而現在根本不需要自己算。
//!
//! ## 字型
//!
//! ⚠ takumi **不吃系統字型**（跟 resvg 的 fontdb 不同）。CJK 一定要自己註冊，
//! 否則中文全部變成豆腐——而且**不會報錯**，只是圖裡沒有字。
//! 容器裡的 `fonts-noto-cjk` 仍然要裝，只是改由我們讀檔案。見 `load_cjk_font`。

use std::sync::Arc;

use axum::{
    extract::{Path, Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use parking_lot::Mutex;
use takumi::prelude::*;

use crate::state::AppState;
// 模板是字串組裝，所以標題仍然要轉義——這點跟 SVG 時代一樣。
// （改用 node tree 就不需要，但那樣模板會變成一大串 builder 呼叫，比較難讀。）
use crate::util::escape_html;

use super::og_sky::{self, H as OG_HEIGHT, Scene, W as OG_WIDTH};

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

/// 一張卡上的字。`kicker` 是標題上面那行琥珀色的小字（分類 · 日期）
struct Card<'a> {
    kicker: &'a str,
    title: &'a str,
    sub: Option<&'a str>,
    /// 左上角要不要寫站名：站台預設圖的大標就是站名，那張只留網址
    brand: bool,
}

/// 字那一層的 HTML：**底是透明的**，背景（土星、軌道、星）由 `og_sky` 逐格畫好再疊上來。
/// 版面照設計畫布的 OgImage（字在左、圖在右），字型與顏色照翻新後的站：
/// 思源宋體（容器裡是同一套字的 Noto Serif CJK）、暖白字、琥珀色的 Fira Code 小字。
///
/// ⚠ 根節點要自己撐滿畫布（`width/height: 100%`）——takumi 不會替你做，
///   忘了的話內容會擠在左上角。
///
/// ⚠ `line-clamp` 按**實際寬度**斷行、而且只在合法的斷點斷（標點不起首、單字不切半）。
///
/// ⚠ 省略號要靠 `text-overflow: ellipsis`，**不是** `line-clamp` 自己加的。
///   這是試出來的，三種寫法的實際結果：
///     `line-clamp:3` 單獨用            → 正確截成三行，但**沒有省略號**
///     `max-lines:3; block-ellipsis:auto` → 完全沒截，變五行把頁尾擠出畫面
///     `…; continue:discard`            → 整段 style 被丟掉（字級／顏色全失效）
///   所以是 `line-clamp` + `text-overflow:ellipsis`。動這兩行之前先跑 `產生樣張`。
///
/// 讓軌道線在字底下淡掉的那片漸層不在這裡，在 `og_sky::compose`：見那邊的註解。
fn build_html(card: &Card) -> String {
    let brand = if card.brand {
        r#"<span style="font-family:'Noto Serif CJK TC'; font-size:30px; font-weight:700; color:#f1ece3;">宙と木</span>"#
    } else {
        ""
    };
    let sub = card.sub.map_or_else(String::new, |s| {
        format!(
            r#"<div style="font-size:26px; line-height:1.45; color:rgba(241,236,227,0.7); line-clamp:2; text-overflow:ellipsis;">{}</div>"#,
            escape_html(s)
        )
    });
    format!(
        r#"<div style="width:100%; height:100%; display:flex; position:relative; font-family:'Noto Serif CJK TC';">
  <div style="position:absolute; left:72px; top:64px; bottom:64px; width:620px;
    display:flex; flex-direction:column; justify-content:space-between;">
    <div style="display:flex; flex-direction:row; align-items:baseline; gap:14px;">
      {brand}
      <span style="font-family:'Fira Code'; font-size:15px; letter-spacing:0.16em; color:rgba(241,236,227,0.45);">koimsurai.com</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div style="font-family:'Fira Code','Noto Sans CJK TC'; font-size:18px; letter-spacing:0.12em; color:#e9c17a;">{kicker}</div>
      <div style="font-size:54px; font-weight:700; line-height:1.25; color:#f1ece3; line-clamp:3; text-overflow:ellipsis; text-wrap:balance;">{title}</div>
      {sub}
    </div>
  </div>
</div>"#,
        kicker = escape_html(card.kicker),
        title = escape_html(card.title.trim()),
    )
}

/// 文章的卡：分類是空的時候退回「手記」，日期寫成 `2026/10/13`
fn post_card_html(title: &str, category: Option<&str>, date: &str) -> String {
    let cat = category.filter(|c| !c.is_empty()).unwrap_or("手記");
    let date = date.replace('-', "/");
    let kicker = if date.is_empty() { cat.to_string() } else { format!("{cat} · {date}") };
    let (main, sub) = split_title(title.trim());
    build_html(&Card { kicker: &kicker, title: main, sub, brand: true })
}

/// 進程級狀態：字型與背景（載一次共用）+ OG 快取。
struct OgState {
    fonts: Fonts,
    /// 背景不會因文章而變：土星與軌道只算一次（第一次產圖時）
    scene: std::sync::LazyLock<Scene>,
    cache: Mutex<std::collections::HashMap<i64, CachedOg>>,
}
struct CachedOg {
    png: Arc<Vec<u8>>,
    etag: String,
    key: String,
}
static OG: std::sync::OnceLock<OgState> = std::sync::OnceLock::new();

/// 快取最多留幾篇。動畫一張約幾百 KB，全站文章都被爬過一輪也不會吃掉太多記憶體，
/// 但沒有上限的話它只會長不會縮
const CACHE_MAX: usize = 48;

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

fn load_cjk_font() -> Fonts {
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

fn og_state() -> &'static OgState {
    OG.get_or_init(|| OgState {
        fonts: load_cjk_font(),
        scene: std::sync::LazyLock::new(Scene::new),
        cache: Mutex::new(std::collections::HashMap::new()),
    })
}

/// 字那一層 → 疊在每一格背景上 → APNG（CPU 密集，呼叫端丟 spawn_blocking）。
fn render_og(html: &str, fonts: &Fonts, scene: &Scene) -> anyhow::Result<Vec<u8>> {
    let overlay = render_overlay(html, fonts)?;
    og_sky::encode_apng(|i| og_sky::compose(&scene.frame(i), &overlay))
}

/// 字那一層，RGBA（非預乘），底是透明的。
fn render_overlay(html: &str, fonts: &Fonts) -> anyhow::Result<Vec<u8>> {
    let node = Node::from_html(html, FromHtmlOptions::default())
        .map_err(|e| anyhow::anyhow!("takumi from_html: {e}"))?;
    // 宣告內容語言。OG 端點用的是預設語系的標題，而站上的預設是 zh-Hant。
    //
    // ⚠ 這**不會**消掉 render 時 stderr 上那幾行
    //   `ICU4X data error: No segmentation model for language: ja`。
    //   我原本以為會，實測沒有——那是 parley 在字型層決定語言標記時發出的，
    //   跟這裡設的 lang 是兩條路徑。
    //
    //   它是無害的：斷行仍然正確（實測標點沒有跑到行首、單字沒有被切開），
    //   缺的只是日文的「詞典式斷詞」——而中文標題本來就用不到那個。
    //   之所以不去壓掉它：那要嘛換掉 icu 的 data provider、要嘛把 stderr 蓋掉，
    //   兩個都比這行雜訊更糟。OG 有快取，每篇文章實際只會 render 一次。
    let lang = Lang::parse("zh-Hant").ok();
    let options = RenderOptions::builder()
        .viewport(Viewport::new(og_sky::SIZE))
        .node(node)
        .fonts(fonts)
        .lang(lang)
        .build();
    let image = takumi::render(options).map_err(|e| anyhow::anyhow!("takumi render: {e}"))?;
    let raw = image.into_raw();
    anyhow::ensure!(raw.len() == OG_WIDTH * OG_HEIGHT * 4, "takumi 畫出來的尺寸不對（{} bytes）", raw.len());
    Ok(raw)
}

/// ETag 用的雜湊。FNV-1a：不需要相依、跨版本永遠決定性（ETag 會被客戶端與 CDN
/// 存著，換 Rust 版本就變值的話等於每次升級都讓全站的圖失效）。
///
/// ⚠️ 這裡原本是 `base64(cacheKey).slice(0, 12)`（照抄 Express）。那是**壞的**：
/// 12 個 base64 字元只編碼 9 個 byte，而 cacheKey 是 `{id}::{時間戳}::{標題}`——
/// 前 9 個 byte 只到 `1::2026-0`。也就是說標題與大部分時間戳從來沒有進入 ETag，
/// 同一篇文章改標題前後算出來是同一個值（實測驗證過）。
///
/// 後果不是「少了最佳化」而是**讀者看到舊圖**：站長改標題後伺服器端快取會失效並
/// 重新產圖，但 ETag 沒變 → 下一個帶著舊 ETag 來的讀者拿到 304 →
/// 他的瀏覽器繼續用舊圖，而且不會再問第二次。
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

/// `GET /api/og/:file`（axum 不支援 `:id.png` 部分參數）——非 `.png` 後綴回 404。
#[utoipa::path(get, path = "/api/og/{file}", tag = "media",
    params(("file" = String, Path)),
    responses((status = 200, description = "OG 圖（PNG）"), (status = 304, description = "Not Modified（ETag 命中）"), (status = 404, description = "找不到"), (status = 500, description = "OG 產生失敗")))]
pub async fn og_png(State(state): State<AppState>, Path(file): Path<String>, req: Request) -> Response {
    let Some(id) = file.strip_suffix(".png") else {
        // 只處理 /og/:id.png；其他後綴 → 404（原委派 Express，已退役）
        return text_resp(StatusCode::NOT_FOUND, "not found");
    };
    let inm = req.headers().get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok()).map(String::from);

    let row = sqlx::query_as::<_, (i64, Option<String>, Option<String>, Option<String>, Option<String>)>(
        "SELECT id, title, category, created_at, updated_at FROM posts WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await;
    // err || !row → 404 'not found'
    let Ok(Some((post_id, title, category, created_at, updated_at))) = row else {
        return text_resp(StatusCode::NOT_FOUND, "not found");
    };
    let title = title.unwrap_or_default();
    // cacheKey = `${id}::${updated_at || created_at}::${title}`（js truthy：空字串也 fallback）
    let stamp = updated_at.filter(|s| !s.is_empty()).or_else(|| created_at.clone()).unwrap_or_default();
    let cache_key = format!("{post_id}::{stamp}::{title}");

    let og = og_state();
    {
        let cache = og.cache.lock();
        if let Some(c) = cache.get(&post_id)
            && c.key == cache_key
        {
            if inm.as_deref() == Some(c.etag.as_str()) {
                return StatusCode::NOT_MODIFIED.into_response();
            }
            return (
                [
                    (header::CONTENT_TYPE, "image/png".to_string()),
                    (header::ETAG, c.etag.clone()),
                    (header::CACHE_CONTROL, "public, max-age=300, s-maxage=86400".to_string()),
                ],
                c.png.as_ref().clone(),
            )
                .into_response();
        }
    }

    // date = (created_at || '').slice(0,10)
    let date = crate::util::js_substring_prefix(created_at.as_deref().unwrap_or(""), 10);
    let html = post_card_html(&title, category.as_deref(), &date);
    let png = match tokio::task::spawn_blocking(move || {
        let og = og_state();
        render_og(&html, &og.fonts, &og.scene)
    })
    .await
    {
        Ok(Ok(p)) => Arc::new(p),
        Ok(Err(e)) => {
            tracing::error!("[OG] 產圖失敗 (post {post_id}): {e}");
            return text_resp(StatusCode::INTERNAL_SERVER_ERROR, "og generation failed");
        }
        Err(e) => {
            tracing::error!("[OG] 產圖 task 掛了 (post {post_id}): {e}");
            return text_resp(StatusCode::INTERNAL_SERVER_ERROR, "og generation failed");
        }
    };
    let etag = format!("\"og-{post_id}-{:016x}\"", fnv1a(&cache_key));
    {
        let mut cache = og.cache.lock();
        // 滿了就隨便丟一篇（不追蹤誰最久沒用）：被丟掉的那篇下次再算一次就好
        if cache.len() >= CACHE_MAX
            && !cache.contains_key(&post_id)
            && let Some(&evict) = cache.keys().next()
        {
            cache.remove(&evict);
        }
        cache.insert(post_id, CachedOg { png: png.clone(), etag: etag.clone(), key: cache_key });
    }
    (
        [
            (header::CONTENT_TYPE, "image/png".to_string()),
            (header::ETAG, etag),
            (header::CACHE_CONTROL, "public, max-age=300, s-maxage=86400".to_string()),
        ],
        png.as_ref().clone(),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ETag 的雜湊必須涵蓋**整個** cache key。
    ///
    /// 回歸測試：原本是 `base64(cacheKey).slice(0, 12)`，而 12 個 base64 字元
    /// 只編碼 9 個 byte——cacheKey 是 `{id}::{時間戳}::{標題}`，前 9 個 byte
    /// 只到 `1::2026-0`。下面前兩組在舊寫法下算出來是**同一個值**。
    #[test]
    fn etag_雜湊要涵蓋整個_cache_key() {
        let a = fnv1a("1::2026-08-03 20:00:00::公開文章");
        let b = fnv1a("1::2026-02-01 00:00:00::改過的標題");
        let c = fnv1a("1::2026-08-03 20:00:00::公開文章 "); // 只差一個空白
        assert_ne!(a, b, "改了標題與時間戳卻算出同一個 ETag——讀者會一直看到舊圖");
        assert_ne!(a, c, "只差一個字元也要換值");
        // 同樣的輸入永遠是同樣的輸出（ETag 存在客戶端與 CDN，不能每次重啟就變）
        assert_eq!(a, fnv1a("1::2026-08-03 20:00:00::公開文章"));
        // 空字串也要能算（沒有標題、沒有時間戳的文章）
        assert_ne!(fnv1a(""), fnv1a("1::::"));
    }

    /// 標題直接來自使用者輸入，`</div>` 之類的東西不能把模板打斷。
    #[test]
    fn 標題裡的標籤不會逃出模板() {
        let html = post_card_html("</div><script>alert(1)</script>：<b>副標</b>", None, "2026-08-09");
        assert!(!html.contains("<script>") && !html.contains("<b>"), "原始標籤進了模板：{html}");
        assert!(html.contains("&lt;script&gt;") && html.contains("&lt;b&gt;"));
    }

    /// 分類是空的時候要退回「手記」（沿用 Express 的行為）；日期寫成斜線。
    #[test]
    fn 空分類退回手記() {
        assert!(post_card_html("t", None, "d").contains("手記"));
        assert!(post_card_html("t", Some(""), "d").contains("手記"));
        assert!(post_card_html("t", Some("技術"), "2026-10-13").contains("技術 · 2026/10/13"));
        assert!(post_card_html("t", Some("技術"), "").contains(">技術<"), "沒有日期就不要留一個孤零零的 ·");
    }

    /// 主標／副標的拆法要跟前端 `splitTitle` 一致（那邊的測試在 `lib/blogReading.test.ts`）。
    #[test]
    fn 主標副標照前端的規則拆() {
        assert_eq!(
            split_title("為什麼我開始使用 Zed 編輯器：從 VS Code 搬家"),
            ("為什麼我開始使用 Zed 編輯器", Some("從 VS Code 搬家"))
        );
        assert_eq!(split_title("CrowdSec: 取代 fail2ban"), ("CrowdSec", Some("取代 fail2ban")));
        // 半形冒號後面沒有空白：版本號、時間，不拆
        assert_eq!(split_title("Rust 1.85:2024 edition"), ("Rust 1.85:2024 edition", None));
        // 任一邊是空的也不拆
        assert_eq!(split_title("：只有副標"), ("：只有副標", None));
        assert_eq!(split_title("只有主標："), ("只有主標：", None));
        assert_eq!(split_title(""), ("", None));
    }

    /// ⚠ 這是換掉 resvg 之後最重要的一條：**真的把圖畫出來**。
    ///
    /// 舊版的測試釘的是「SVG 字串長得對」，但那證明不了圖畫得出來——
    /// 模板寫壞、字型沒載到、takumi API 換了，SVG 字串測試通通照過。
    /// 這條走完整條路徑（HTML → 排版 → 光柵化 → 疊上背景 → APNG），並檢查輸出真的是
    /// 1200×630、會動的 PNG。只編前幾格：整段 180 格在 debug 建置下要跑很久，
    /// 而格與格之間走的是同一段程式。
    #[test]
    fn 長標題也畫得出正確尺寸的_apng() {
        let fonts = load_cjk_font();
        let scene = Scene::new();
        // 遠超過三行的標題：舊版會在這裡把字元硬切掉，新版交給 line-clamp
        let long = "把 NLLB 翻譯接進 Rust,在 Windows 上撞穿整條工具鏈：ct2rs × CTranslate2 的 protobuf 撞名、CRT 之爭、關閉死鎖與 NVIDIA 崩潰";
        let overlay = render_overlay(&post_card_html(long, Some("位元築夢"), "2026-07-21"), &fonts)
            .expect("長標題要畫得出來");
        let png =
            og_sky::encode_frames(3, |i| og_sky::compose(&scene.frame(i), &overlay)).expect("要編得出來");
        // PNG magic
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a], "輸出不是 PNG");
        // IHDR 的寬高（big-endian u32，位移 16/20）
        let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
        let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
        assert_eq!((w as usize, h as usize), (OG_WIDTH, OG_HEIGHT), "尺寸不對");
        // acTL（動畫控制）要在第一個 IDAT 之前，不然瀏覽器把它當成一般的 PNG
        let pos = |tag: &[u8]| png.windows(4).position(|c| c == tag);
        let (actl, idat) = (pos(b"acTL").expect("沒有 acTL：不是 APNG"), pos(b"IDAT").expect("沒有 IDAT"));
        assert!(actl < idat);
        // 一格只存變動的像素：後面兩格（fdAT）加起來要遠小於第一格（IDAT）
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

    /// 背景要真的會動，而且最後一格接得回第一格（衛星、閃的星都走完整數圈）。
    #[test]
    fn 背景會動而且首尾接得起來() {
        let scene = Scene::new();
        let (a, b) = (scene.frame(0), scene.frame(og_sky::FRAMES / 2));
        assert!(
            a.iter().zip(&b).any(|(p, q)| (0..3).any(|c| (p[c] - q[c]).abs() > 0.5)),
            "半圈後的畫面跟第一格一模一樣：沒有在動"
        );
        // 第 FRAMES 格（＝下一圈的第 0 格）應該跟第 0 格一樣
        let wrap = scene.frame(og_sky::FRAMES);
        let max = a
            .iter()
            .zip(&wrap)
            .flat_map(|(p, q)| (0..3).map(move |c| (p[c] - q[c]).abs()))
            .fold(0.0f32, f32::max);
        assert!(max < 0.5, "繞完一圈接不回第一格（最大色差 {max}）");
    }

    /// 空標題、空日期也不能炸——資料庫裡真的有這種列。
    #[test]
    fn 空輸入不會_panic() {
        let fonts = load_cjk_font();
        assert!(render_overlay(&post_card_html("", None, ""), &fonts).is_ok());
    }

    /// 站台的預設分享圖（不是文章的頁面用它）：`public/og-default-v3.png`。
    /// 改了模板或背景就重跑一次並提交（release 建置，debug 要跑很久）：
    ///
    ///   cargo nextest run --release --run-ignored only -E 'test(產生站台預設分享圖)'
    #[test]
    #[ignore = "產生 public/ 底下的靜態檔，改模板時手動跑"]
    fn 產生站台預設分享圖() {
        let fonts = load_cjk_font();
        let html = build_html(&Card {
            kicker: "KOIMSURAI",
            title: "宙と木",
            sub: Some("閱讀筆記、作品紀錄與系統實驗"),
            brand: false,
        });
        let png = render_og(&html, &fonts, &Scene::new()).unwrap();
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/og-default-v3.png");
        std::fs::write(&path, &png).unwrap();
        println!("{} → {} bytes", path.display(), png.len());
    }

    /// 把幾張樣張寫到 `/tmp/og-preview/`，用眼睛看。
    ///
    /// 這條**不是斷言**，是工具——排版對不對（有沒有壓到邊、標點有沒有跑到行首、
    /// 長標題截在哪）只有看得出來。改動模板時跑它：
    ///
    ///   cargo nextest run --release --run-ignored only -E 'test(產生樣張)' --no-capture
    #[test]
    #[ignore = "產生樣張供人工檢視，不做斷言"]
    fn 產生樣張() {
        let fonts = load_cjk_font();
        let scene = Scene::new();
        let dir = std::path::Path::new("/tmp/og-preview");
        std::fs::create_dir_all(dir).unwrap();
        let cases: [(&str, &str, Option<&str>); 6] = [
            (
                "cjk-long",
                "把 NLLB 翻譯接進 Rust,在 Windows 上撞穿整條工具鏈：ct2rs × CTranslate2 的 protobuf 撞名、CRT 之爭、關閉死鎖與 NVIDIA 崩潰",
                Some("位元築夢"),
            ),
            ("cjk-short", "為什麼我從 VS Code 換到 Zed", Some("技術")),
            ("latin-long", "Why I switched from VS Code to Zed and never looked back", Some("Tech")),
            ("mixed", "CrowdSec 取代 fail2ban：從一次被掃到脫褲子說起", None),
            (
                "subtitle",
                "用 Frigate + Home Assistant 自製 Furbo 寵物保母：本機 AI 寫貓咪日記，但分不出我的兩隻貓",
                Some("位元築夢"),
            ),
            ("empty", "", None),
        ];
        for (name, title, cat) in cases {
            let png = render_og(&post_card_html(title, cat, "2026-08-09"), &fonts, &scene).unwrap();
            let path = dir.join(format!("{name}.png"));
            std::fs::write(&path, &png).unwrap();
            println!("{} → {}", path.display(), png.len());
        }
    }
}
