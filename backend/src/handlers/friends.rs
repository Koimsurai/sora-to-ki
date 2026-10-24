//! `GET /api/friends`：朋友頁的星。朋友清單寫死在這裡（不收外部傳來的網址，免得變成可以被濫用的代理），
//! 每個朋友順手去抓他的 RSS／Atom，只取最新一篇的標題、連結、日期。
//! 回應由路由層快取一小時；抓不到（對方站掛了、還沒有 feed）就是沒有最新一篇，不算錯。

use std::time::Duration;

use axum::Json;
use axum::extract::State;
use regex::Regex;
use serde::Serialize;

use crate::state::AppState;

/// 一位朋友：站名、網址、一句介紹（照對方站上寫的）、feed 的位址
#[derive(Debug, Clone)]
pub struct Friend {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub desc: &'static str,
    pub feed: Option<&'static str>,
}

/// 朋友清單：加朋友就在這裡加一筆（站名與介紹照對方站上寫的）
pub const FRIENDS: &[Friend] = &[
    Friend {
        id: "doraeyi",
        name: "Liam",
        url: "https://blog.doraeyi.com",
        desc: "前端工程師的偵探手記",
        feed: Some("https://blog.doraeyi.com/rss.xml"),
    },
    Friend {
        id: "sao-x",
        name: "影の書庫",
        url: "https://blog.sao-x.com",
        desc: "潛伏於陰影中的書庫，收藏著程式、技術與日常的筆記。",
        feed: Some("https://blog.sao-x.com/rss.xml"),
    },
];

/// 最新一篇
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
    pub latest: Option<FriendPost>,
}

/// 抓 feed 的逾時：對方站慢不能拖住整頁
const FEED_TIMEOUT: Duration = Duration::from_secs(8);
/// feed 最多讀多少（位元組）：只要第一篇，讀太多是浪費
const FEED_MAX_BYTES: usize = 512 * 1024;

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

/// 從 RSS（`<item>`）或 Atom（`<entry>`）抓第一篇的標題、連結、日期
pub fn first_post(xml: &str) -> Option<FriendPost> {
    static ITEM: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"(?s)<(item|entry)\b[^>]*>(.*?)</(?:item|entry)>").expect("固定的正規式")
    });
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
    let item = ITEM.captures(xml)?.get(2)?.as_str();
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

async fn fetch_latest(http: &reqwest::Client, feed: &str) -> Option<FriendPost> {
    let res = http.get(feed).timeout(FEED_TIMEOUT).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let bytes = res.bytes().await.ok()?;
    let head = &bytes[..bytes.len().min(FEED_MAX_BYTES)];
    first_post(&String::from_utf8_lossy(head))
}

/// 每個朋友各抓一次 feed（同時抓，一個站慢不會拖住其他人），清單照原本的順序
pub async fn collect(http: &reqwest::Client, friends: &'static [Friend]) -> Vec<FriendStar> {
    let mut set = tokio::task::JoinSet::new();
    for (i, f) in friends.iter().enumerate() {
        let http = http.clone();
        set.spawn(async move {
            let latest = match f.feed {
                Some(feed) => fetch_latest(&http, feed).await,
                None => None,
            };
            (i, latest)
        });
    }
    let mut latest: Vec<Option<FriendPost>> = vec![None; friends.len()];
    while let Some(done) = set.join_next().await {
        if let Ok((i, post)) = done
            && let Some(slot) = latest.get_mut(i)
        {
            *slot = post;
        }
    }
    friends
        .iter()
        .zip(latest)
        .map(|(f, latest)| FriendStar {
            id: f.id.to_string(),
            name: f.name.to_string(),
            url: f.url.to_string(),
            desc: f.desc.to_string(),
            has_feed: f.feed.is_some(),
            latest,
        })
        .collect()
}

/// `GET /api/friends`
#[utoipa::path(get, path = "/api/friends", tag = "home",
    responses((status = 200, description = "朋友頁的星：每位朋友與他最新一篇（從他的 RSS 抓），快取一小時", body = Vec<FriendStar>)))]
pub async fn friends(State(state): State<AppState>) -> Json<Vec<FriendStar>> {
    Json(collect(&state.http, FRIENDS).await)
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
    fn reads_the_first_rss_item() {
        let p = first_post(RSS).unwrap();
        assert_eq!(p.title, "手機滑文章會卡？兇手是紙紋");
        assert_eq!(p.url.as_deref(), Some("https://blog.example/a"));
        assert_eq!(p.date.as_deref(), Some("Fri, 23 Oct 2026 08:47:38 GMT"));
    }

    #[test]
    fn reads_the_first_atom_entry() {
        let p = first_post(ATOM).unwrap();
        assert_eq!(p.title, "A & B");
        assert_eq!(p.url.as_deref(), Some("https://blog.example/b"));
        assert_eq!(p.date.as_deref(), Some("2026-10-22T07:38:44Z"));
    }

    #[test]
    fn rejects_feeds_without_a_usable_first_item() {
        assert_eq!(first_post("<rss><channel><title>x</title></channel></rss>"), None);
        assert_eq!(first_post("<rss><item><title>  </title></item></rss>"), None);
        assert_eq!(first_post("<rss><item><link>https://x</link></item></rss>"), None);
        // 連結不是 http(s) 的不給（例如 javascript:）
        let p =
            first_post("<rss><item><title>t</title><link>javascript:alert(1)</link></item></rss>").unwrap();
        assert_eq!(p.url, None);
        assert_eq!(p.date, None);
    }

    #[test]
    fn unescapes_entities_and_cdata() {
        assert_eq!(unescape(" <![CDATA[ a<b ]]> "), "a<b");
        assert_eq!(unescape("&lt;x&gt; &quot;y&quot; &#39;z&apos; &amp;amp;"), "<x> \"y\" 'z' &amp;");
    }

    /// 測試用的朋友清單：位址指到 mock server（collect 要 'static，所以 leak 掉，測試結束就沒了）
    fn friends_at(base: &str) -> &'static [Friend] {
        let leak = |s: String| -> &'static str { Box::leak(s.into_boxed_str()) };
        Box::leak(
            vec![
                Friend {
                    id: "a",
                    name: "A",
                    url: "https://a.example",
                    desc: "a",
                    feed: Some(leak(format!("{base}/a.xml"))),
                },
                Friend {
                    id: "b",
                    name: "B",
                    url: "https://b.example",
                    desc: "b",
                    feed: Some(leak(format!("{base}/b.xml"))),
                },
                Friend { id: "c", name: "C", url: "https://c.example", desc: "c", feed: None },
            ]
            .into_boxed_slice(),
        )
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
        let stars = collect(&reqwest::Client::new(), friends_at(&server.uri())).await;
        assert_eq!(stars.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
        assert_eq!(stars[0].latest.as_ref().map(|p| p.title.as_str()), Some("手機滑文章會卡？兇手是紙紋"));
        assert!(stars[0].has_feed);
        assert_eq!(stars[1].latest, None);
        assert!(stars[1].has_feed);
        assert_eq!(stars[2].latest, None);
        assert!(!stars[2].has_feed);
    }
}
