//! `GET /api/friends`：朋友頁的星。名單在 `friend_links` 表（status = 'approved'），
//! 由後台的友鏈審核收下（見 `friend_links`）；這裡不收任何外部傳來的網址，免得變成可以被濫用的代理——
//! 會被抓 feed 的只有站長收下的那幾位。
//! 每個朋友順手去抓他的 RSS／Atom，取最近幾篇的標題、連結、日期（朋友頁把每篇畫成他軌道上的一個信標）。
//! feed 各自快取一小時（[`FEED_TTL_MS`]）；名單本身每次都讀 DB，收下一位朋友馬上就出現。
//! 抓不到（對方站掛了、還沒有 feed）就是沒有文章，不算錯。

use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use parking_lot::Mutex;
use regex::Regex;
use serde::Serialize;

use crate::error::AppError;
use crate::state::AppState;
use crate::util::now_ms;

/// 一位朋友：站名、網址、一句介紹（照對方站上寫的）、feed 的位址
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Friend {
    /// 決定朋友頁上那顆星的軌道；舊的兩位沿用原本寫死的 id，位置不變
    pub slug: String,
    pub name: String,
    pub url: String,
    pub desc: String,
    pub feed: Option<String>,
}

/// 朋友頁上的名單：收下的，照後台排的順序
pub async fn approved(pool: &sqlx::SqlitePool) -> sqlx::Result<Vec<Friend>> {
    sqlx::query_as::<_, Friend>(
        "SELECT COALESCE(slug, 'f' || id) AS slug, name, url, description AS desc, feed_url AS feed \
         FROM friend_links WHERE status = 'approved' ORDER BY sort_order, id",
    )
    .fetch_all(pool)
    .await
}

/// 一篇文章
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type, utoipa::ToSchema)]
pub struct FriendPost {
    pub title: String,
    pub url: Option<String>,
    /// feed 上寫的日期，原樣（RSS 是 RFC 2822、Atom 是 ISO 8601，前端的 Date 兩種都吃）
    pub date: Option<String>,
}

/// `GET /api/friends` 的一筆
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type, utoipa::ToSchema)]
pub struct FriendStar {
    pub id: String,
    pub name: String,
    pub url: String,
    pub desc: String,
    /// 有沒有 feed（沒有的是一顆安靜的星）
    pub has_feed: bool,
    /// 最近幾篇，照 feed 上的順序（新的在前）；最多 `POSTS_MAX` 篇
    pub posts: Vec<FriendPost>,
}

/// 抓 feed 的逾時：對方站慢不能拖住整頁
const FEED_TIMEOUT: Duration = Duration::from_secs(8);
/// feed 最多讀多少（位元組）：只要前幾篇，讀太多是浪費
const FEED_MAX_BYTES: usize = 512 * 1024;
/// 每位朋友最多回幾篇
pub const POSTS_MAX: usize = 8;
/// 同一個 feed 多久抓一次。原本整個回應由路由層快取一小時，現在名單改讀 DB、
/// 快取下放到每個 feed，間隔照舊
pub const FEED_TTL_MS: i64 = 60 * 60 * 1000;

/// 一個 feed 的快取：(抓的時間, 最近幾篇)
type CachedFeed = (i64, Vec<FriendPost>);

/// feed 位址 → 快取。抓失敗（空的）也記，對方站掛了不會被每個讀者各打一次
static FEED_CACHE: LazyLock<Mutex<HashMap<String, CachedFeed>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn unescape(s: &str) -> String {
    let s = s.trim();
    let s = s.strip_prefix("<![CDATA[").and_then(|x| x.strip_suffix("]]>")).unwrap_or(s);
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
        .trim()
        .to_string()
}

/// 從 RSS（`<item>`）或 Atom（`<entry>`）抓前 `POSTS_MAX` 篇的標題、連結、日期（沒有標題的那篇跳過）
pub fn recent_posts(xml: &str) -> Vec<FriendPost> {
    static ITEM: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"(?s)<(item|entry)\b[^>]*>(.*?)</(?:item|entry)>").expect("固定的正規式")
    });
    ITEM.captures_iter(xml)
        .filter_map(|c| c.get(2).and_then(|m| post_of(m.as_str())))
        .take(POSTS_MAX)
        .collect()
}

/// 一個 `<item>`／`<entry>` 的內容 → 一篇
fn post_of(item: &str) -> Option<FriendPost> {
    static TITLE: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"(?s)<title\b[^>]*>(.*?)</title>").expect("固定的正規式"));
    static LINK_TEXT: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"(?s)<link\b[^>]*>(.*?)</link>").expect("固定的正規式"));
    static LINK_HREF: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r#"<link\b[^>]*\bhref="([^"]+)"[^>]*/?>"#).expect("固定的正規式")
    });
    static DATE: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"(?s)<(pubDate|published|updated)\b[^>]*>(.*?)</(?:pubDate|published|updated)>")
            .expect("固定的正規式")
    });
    let title = unescape(TITLE.captures(item)?.get(1)?.as_str());
    if title.is_empty() {
        return None;
    }
    let url = LINK_TEXT
        .captures(item)
        .and_then(|c| c.get(1))
        .map(|m| unescape(m.as_str()))
        .filter(|s| !s.is_empty())
        .or_else(|| LINK_HREF.captures(item).and_then(|c| c.get(1)).map(|m| unescape(m.as_str())))
        .filter(|s| s.starts_with("https://") || s.starts_with("http://"));
    let date =
        DATE.captures(item).and_then(|c| c.get(2)).map(|m| unescape(m.as_str())).filter(|s| !s.is_empty());
    Some(FriendPost { title, url, date })
}

async fn fetch_posts(http: &reqwest::Client, feed: &str) -> Vec<FriendPost> {
    let Ok(res) = http.get(feed).timeout(FEED_TIMEOUT).send().await else {
        return Vec::new();
    };
    if !res.status().is_success() {
        return Vec::new();
    }
    let Ok(bytes) = res.bytes().await else {
        return Vec::new();
    };
    let head = &bytes[..bytes.len().min(FEED_MAX_BYTES)];
    recent_posts(&String::from_utf8_lossy(head))
}

/// 有快取（一小時內）就用快取，沒有才去抓
async fn cached_posts(http: &reqwest::Client, feed: &str) -> Vec<FriendPost> {
    let hit =
        FEED_CACHE.lock().get(feed).filter(|(at, _)| now_ms() - at < FEED_TTL_MS).map(|(_, p)| p.clone());
    if let Some(posts) = hit {
        return posts;
    }
    let posts = fetch_posts(http, feed).await;
    FEED_CACHE.lock().insert(feed.to_string(), (now_ms(), posts.clone()));
    posts
}

/// 每個朋友各抓一次 feed（同時抓，一個站慢不會拖住其他人），清單照原本的順序
pub async fn collect(http: &reqwest::Client, friends: &[Friend]) -> Vec<FriendStar> {
    let mut set = tokio::task::JoinSet::new();
    for (i, f) in friends.iter().enumerate() {
        let http = http.clone();
        let feed = f.feed.clone();
        set.spawn(async move {
            let posts = match feed {
                Some(feed) => cached_posts(&http, &feed).await,
                None => Vec::new(),
            };
            (i, posts)
        });
    }
    let mut posts: Vec<Vec<FriendPost>> = vec![Vec::new(); friends.len()];
    while let Some(done) = set.join_next().await {
        if let Ok((i, got)) = done
            && let Some(slot) = posts.get_mut(i)
        {
            *slot = got;
        }
    }
    friends
        .iter()
        .zip(posts)
        .map(|(f, posts)| FriendStar {
            id: f.slug.clone(),
            name: f.name.clone(),
            url: f.url.clone(),
            desc: f.desc.clone(),
            has_feed: f.feed.is_some(),
            posts,
        })
        .collect()
}

/// `GET /api/friends`
#[utoipa::path(get, path = "/api/friends", tag = "home",
    responses((status = 200, description = "朋友頁的星：每位朋友與他最近幾篇（從他的 RSS 抓，每個 feed 快取一小時）", body = Vec<FriendStar>)))]
pub async fn friends(State(state): State<AppState>) -> Result<Json<Vec<FriendStar>>, AppError> {
    let list = approved(&state.pool).await?;
    Ok(Json(collect(&state.http, &list).await))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const RSS: &str = r#"<?xml version="1.0"?><rss><channel><title>Blog</title>
        <item><title><![CDATA[手機滑文章會卡？兇手是紙紋]]></title><link>https://blog.example/a</link>
        <pubDate>Fri, 23 Oct 2026 08:47:38 GMT</pubDate></item>
        <item><title>舊的</title></item></channel></rss>"#;

    const ATOM: &str = r#"<feed><title>Feed</title><entry><title type="text">A &amp; B</title>
        <link rel="alternate" href="https://blog.example/b"/><updated>2026-10-22T07:38:44Z</updated></entry></feed>"#;

    #[test]
    fn reads_rss_items_in_feed_order() {
        let posts = recent_posts(RSS);
        assert_eq!(posts.len(), 2);
        assert_eq!(posts[0].title, "手機滑文章會卡？兇手是紙紋");
        assert_eq!(posts[0].url.as_deref(), Some("https://blog.example/a"));
        assert_eq!(posts[0].date.as_deref(), Some("Fri, 23 Oct 2026 08:47:38 GMT"));
        assert_eq!(posts[1].title, "舊的");
        assert_eq!(posts[1].url, None);
    }

    #[test]
    fn reads_atom_entries() {
        let posts = recent_posts(ATOM);
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].title, "A & B");
        assert_eq!(posts[0].url.as_deref(), Some("https://blog.example/b"));
        assert_eq!(posts[0].date.as_deref(), Some("2026-10-22T07:38:44Z"));
    }

    #[test]
    fn keeps_at_most_posts_max() {
        let xml = "<item><title>0</title></item>".repeat(20);
        let posts = recent_posts(&xml);
        assert_eq!(posts.len(), POSTS_MAX);
        assert_eq!(posts[0].title, "0");
    }

    #[test]
    fn skips_items_without_a_usable_title() {
        let none: Vec<FriendPost> = Vec::new();
        assert_eq!(recent_posts("<rss><channel><title>x</title></channel></rss>"), none);
        assert_eq!(recent_posts("<rss><item><link>https://x</link></item></rss>"), none);
        let posts = recent_posts("<rss><item><title>  </title></item><item><title>ok</title></item></rss>");
        assert_eq!(posts.iter().map(|p| p.title.as_str()).collect::<Vec<_>>(), ["ok"]);
        // 連結不是 http(s) 的不給（例如 javascript:）
        let posts = recent_posts("<rss><item><title>t</title><link>javascript:alert(1)</link></item></rss>");
        assert_eq!(posts[0].url, None);
        assert_eq!(posts[0].date, None);
    }

    #[test]
    fn unescapes_entities_and_cdata() {
        assert_eq!(unescape(" <![CDATA[ a<b ]]> "), "a<b");
        assert_eq!(unescape("&lt;x&gt; &quot;y&quot; &#39;z&apos; &amp;amp;"), "<x> \"y\" 'z' &amp;");
    }

    /// 測試用的朋友清單：位址指到 mock server
    fn friends_at(base: &str) -> Vec<Friend> {
        let f = |slug: &str, feed: Option<String>| Friend {
            slug: slug.into(),
            name: slug.to_uppercase(),
            url: format!("https://{slug}.example"),
            desc: slug.into(),
            feed,
        };
        vec![f("a", Some(format!("{base}/a.xml"))), f("b", Some(format!("{base}/b.xml"))), f("c", None)]
    }

    #[tokio::test]
    async fn collects_every_friend_in_order() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/a.xml"))
            .respond_with(ResponseTemplate::new(200).set_body_string(RSS))
            .mount(&server)
            .await;
        // b 的站掛了：沒有最新一篇，但人還在
        Mock::given(method("GET"))
            .and(path("/b.xml"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;
        let stars = collect(&reqwest::Client::new(), &friends_at(&server.uri())).await;
        assert_eq!(stars.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
        assert_eq!(
            stars[0].posts.iter().map(|p| p.title.as_str()).collect::<Vec<_>>(),
            ["手機滑文章會卡？兇手是紙紋", "舊的"]
        );
        assert!(stars[0].has_feed);
        assert_eq!(stars[1].posts.len(), 0);
        assert!(stars[1].has_feed);
        assert_eq!(stars[2].posts.len(), 0);
        assert!(!stars[2].has_feed);
    }

    /// 名單改成每次讀 DB 之後，快取在 feed 這一層：同一個 feed 一小時內只抓一次，
    /// 不然每個打開朋友頁的讀者都會讓這台機器去敲每位朋友的站一次
    #[tokio::test]
    async fn 同一個_feed_一小時內只抓一次() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/once.xml"))
            .respond_with(ResponseTemplate::new(200).set_body_string(RSS))
            .expect(1)
            .mount(&server)
            .await;
        let list = vec![Friend {
            slug: "once".into(),
            name: "Once".into(),
            url: "https://once.example".into(),
            desc: String::new(),
            feed: Some(format!("{}/once.xml", server.uri())),
        }];
        let http = reqwest::Client::new();
        let first = collect(&http, &list).await;
        let second = collect(&http, &list).await;
        assert_eq!(first[0].posts, second[0].posts, "第二次要拿到一樣的文章（從快取）");
        assert_eq!(second[0].posts.len(), 2);
    }
}
