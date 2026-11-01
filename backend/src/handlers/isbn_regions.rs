//! 用 ISBN 查書時，照書號的國別先問那個國家的國家圖書館：Google Books 與 Open Library 對英文書
//! 很齊，日文書、韓文書常常沒有、或只有羅馬拼音的書名。
//!
//! - 日本（978-4）：國立國會圖書館的 OpenSearch，不用金鑰，一律開著
//! - 韓國（978-89、979-11）：國立中央圖書館的 ISBN 書誌 API，要一把免費的金鑰（`NLK_API_KEY`）
//!
//! 台灣的書號（978-957、978-986、978-626）走既有的國圖新書書目索引（handlers/tw_isbn.rs）。
//! 這兩個國圖都不給封面；同一本 Google 有的話，封面在合併時從 Google 那筆補（`merge_with_ncl`）。

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Value, json};

use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Region {
    Japan,
    Korea,
}

/// 書號的國別。吃 ISBN-10 或 ISBN-13（只有數字，或含 X）
pub(crate) fn region(isbn: &str) -> Option<Region> {
    let thirteen = if isbn.len() == 10 { format!("978{isbn}") } else { isbn.to_string() };
    if thirteen.starts_with("9784") {
        Some(Region::Japan)
    } else if thirteen.starts_with("97889") || thirteen.starts_with("97911") {
        Some(Region::Korea)
    } else {
        None
    }
}

const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

static ITEM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)<item>(.*?)</item>").expect("固定的正規式"));
static PAGES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+)\s*p").expect("固定的正規式"));

/// `<name ...>值</name>` 的值（屬性不管）
fn tag(item: &str, name: &str) -> Option<String> {
    let start = item.find(&format!("<{name}"))?;
    let open_end = item[start..].find('>')? + start + 1;
    let end = item[open_end..].find(&format!("</{name}>"))? + open_end;
    let v = crate::handlers::link_preview::decode_entities(item[open_end..end].trim());
    Some(v).filter(|s| !s.is_empty())
}

/// 國會圖書館 OpenSearch 的一筆 → 書的搜尋結果。卷數（巻一）接在書名後面，不然整套漫畫都同名
pub(crate) fn ndl_book(item: &str, isbn: &str) -> Option<Value> {
    let title = tag(item, "dc:title")?;
    let title = match tag(item, "dcndl:volume") {
        Some(v) => format!("{title} {v}"),
        None => title,
    };
    // 作者在 dc:creator 是「姓/名」或「姓, 名」，日文名字接起來；有拉丁字母的（外國作者）留著逗號
    let authors = tag(item, "dc:creator")
        .map(|a| {
            let a = a.replace('/', "");
            if a.chars().any(|c| c.is_ascii_alphabetic()) { a } else { a.replace(", ", "") }
        })
        .unwrap_or_default();
    let pages = tag(item, "dc:extent").and_then(|e| PAGES.captures(&e)?.get(1)?.as_str().parse::<i64>().ok());
    Some(json!({
        "isbn": isbn,
        "title": title,
        "authors": authors,
        "publisher": tag(item, "dc:publisher").unwrap_or_default(),
        "published_date": tag(item, "dcterms:issued").map(|d| d.replace('.', "-")).unwrap_or_default(),
        "description": "",
        "cover_url": "",
        "page_count": pages,
        "language": "ja",
        "categories": "",
        "source": "ndl",
    }))
}

async fn ndl(state: &AppState, isbn: &str) -> Result<Vec<Value>, String> {
    let url = format!("{}/api/opensearch?isbn={isbn}", state.external.ndl);
    let r = state
        .http
        .get(url)
        .header("User-Agent", crate::identity::user_agent("books"))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Couldn't reach the National Diet Library".to_string())?;
    if !r.status().is_success() {
        return Err(format!("The National Diet Library answered {}", r.status().as_u16()));
    }
    let xml = r.text().await.map_err(|_| "The National Diet Library sent nothing".to_string())?;
    // 同一本常有好幾筆（紙本、電子、不同館藏）：只留第一筆
    Ok(ITEM.captures_iter(&xml).find_map(|c| ndl_book(&c[1], isbn)).into_iter().collect())
}

/// 國立中央圖書館 ISBN 書誌 API 的一筆
pub(crate) fn nlk_book(d: &Value, isbn: &str) -> Option<Value> {
    let s = |k: &str| {
        d.get(k).and_then(Value::as_str).map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
    };
    let title = s("TITLE")?;
    // 出版預定日是 YYYYMMDD
    let date = s("PUBLISH_PREDATE")
        .filter(|d| d.len() == 8)
        .map(|d| format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..]))
        .unwrap_or_default();
    Some(json!({
        "isbn": isbn,
        "title": title,
        "authors": s("AUTHOR").unwrap_or_default(),
        "publisher": s("PUBLISHER").unwrap_or_default(),
        "published_date": date,
        "description": "",
        "cover_url": s("TITLE_URL").unwrap_or_default(),
        "page_count": s("PAGE").and_then(|p| p.trim_end_matches('p').trim().parse::<i64>().ok()),
        "language": "ko",
        "categories": "",
        "source": "nlk",
    }))
}

async fn nlk(state: &AppState, isbn: &str, key: &str) -> Result<Vec<Value>, String> {
    let url = format!(
        "{}/seoji/SearchApi.do?cert_key={}&result_style=json&page_no=1&page_size=1&isbn={isbn}",
        state.external.nlk,
        crate::util::encode_uri_component(key)
    );
    let r = state
        .http
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Couldn't reach the National Library of Korea".to_string())?;
    let v: Value = r
        .json()
        .await
        .map_err(|_| "The National Library of Korea sent something that isn't JSON".to_string())?;
    if v.get("RESULT").and_then(Value::as_str) == Some("ERROR") {
        let msg = v.get("ERR_MESSAGE").and_then(Value::as_str).unwrap_or("error");
        return Err(format!("National Library of Korea: {msg}"));
    }
    let docs = v.get("docs").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(docs.iter().filter_map(|d| nlk_book(d, isbn)).take(1).collect())
}

/// 照書號的國別查那個國家的圖書館。不是日韓的書、或韓國沒設金鑰，回空的。
/// 第二個值是上游壞掉時給後台看的警告
pub(crate) async fn lookup(state: &AppState, isbn: &str) -> (Vec<Value>, Option<String>) {
    let result = match region(isbn) {
        Some(Region::Japan) => ndl(state, isbn).await,
        Some(Region::Korea) => match crate::integrations::var("NLK_API_KEY") {
            Some(key) => nlk(state, isbn, &key).await,
            None => Ok(vec![]),
        },
        None => Ok(vec![]),
    };
    match result {
        Ok(books) => (books, None),
        Err(e) => {
            tracing::warn!(error = %e, "books search: national library lookup failed");
            (vec![], Some(e))
        }
    }
}

/// 後台「來源」頁的即時檢查：拿一本確定存在的韓國書查一次
pub(crate) async fn check_nlk(state: &AppState) -> Result<(), String> {
    let key = crate::integrations::var("NLK_API_KEY").ok_or("Not set")?;
    nlk(state, "9788937460449", &key).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn 書號的國別() {
        assert_eq!(region("9784088725093"), Some(Region::Japan));
        assert_eq!(region("4088725093"), Some(Region::Japan), "ISBN-10 也認得");
        assert_eq!(region("9788937460449"), Some(Region::Korea));
        assert_eq!(region("9791190000000"), Some(Region::Korea));
        assert_eq!(region("9789571234567"), None, "台灣的走國圖索引");
        assert_eq!(region("9780262033848"), None);
    }

    /// 國會圖書館 OpenSearch 真正回的一筆（2026-11 實際打過，只留用得到的）
    const NDL_ITEM: &str = r#"<title>ONE PIECE</title>
      <author>尾田/栄一郎,尾田栄一郎∥著</author>
      <dc:title>ONE PIECE</dc:title>
      <dc:creator>尾田/栄一郎</dc:creator>
      <dcndl:volume>巻一</dcndl:volume>
      <dc:publisher>集英社</dc:publisher>
      <dcterms:issued>1997.12</dcterms:issued>
      <dc:extent>207p ; 18cm</dc:extent>
      <dc:identifier xsi:type="dcndl:ISBN">4-08-872509-3</dc:identifier>"#;

    #[test]
    fn 國會圖書館的一筆() {
        let b = ndl_book(NDL_ITEM, "9784088725093").expect("讀得出來");
        assert_eq!(b["title"], "ONE PIECE 巻一", "卷數接在書名後");
        assert_eq!(b["authors"], "尾田栄一郎");
        assert_eq!(b["publisher"], "集英社");
        assert_eq!(b["published_date"], "1997-12");
        assert_eq!(b["page_count"], 207);
        assert_eq!(b["isbn"], "9784088725093", "用查的那個書號，不是它自己寫的 ISBN-10");
        let comma = NDL_ITEM.replace("尾田/栄一郎", "夏目, 漱石");
        assert_eq!(ndl_book(&comma, "x").expect("讀得出來")["authors"], "夏目漱石");
        let western = NDL_ITEM.replace("尾田/栄一郎", "Orwell, George");
        assert_eq!(ndl_book(&western, "x").expect("讀得出來")["authors"], "Orwell, George");
    }

    #[test]
    fn 國立中央圖書館的一筆() {
        let d = json!({ "TITLE": "채식주의자", "AUTHOR": "한강 지음", "PUBLISHER": "창비", "PUBLISH_PREDATE": "20071030",
                        "TITLE_URL": "https://image.example/cover.jpg", "PAGE": "247 p" });
        let b = nlk_book(&d, "9788936433598").expect("讀得出來");
        assert_eq!(b["title"], "채식주의자");
        assert_eq!(b["published_date"], "2007-10-30");
        assert_eq!(b["page_count"], 247);
        assert_eq!(b["cover_url"], "https://image.example/cover.jpg");
        assert!(nlk_book(&json!({ "TITLE": "" }), "x").is_none());
    }

    async fn state_on(server: &MockServer) -> AppState {
        let mut st = crate::state::test_state().await;
        st.external = std::sync::Arc::new(crate::state::ExternalUrls::all_pointing_at(&server.uri()));
        st
    }

    #[tokio::test]
    async fn 日本的書問國會圖書館_韓國的書沒金鑰就不問() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/ndl/api/opensearch"))
            .and(query_param("isbn", "9784088725093"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(format!("<rss><channel><item>{NDL_ITEM}</item></channel></rss>")),
            )
            .mount(&server)
            .await;
        let st = state_on(&server).await;
        let (books, warn) = lookup(&st, "9784088725093").await;
        assert_eq!((books.len(), warn), (1, None));

        crate::integrations::set_for_test("NLK_API_KEY", None);
        let (books, _) = lookup(&st, "9788937460449").await;
        assert_eq!(books.len(), 0);
        assert_eq!(server.received_requests().await.expect("wiremock").len(), 1, "沒金鑰不該打韓國那支");
    }

    #[tokio::test]
    async fn 韓國的金鑰錯了回報對方的訊息() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/nlk/seoji/SearchApi.do"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "RESULT": "ERROR", "ERR_CODE": "011", "ERR_MESSAGE": "유효하지 않은 인증키 값입니다."
            })))
            .mount(&server)
            .await;
        crate::integrations::set_for_test("NLK_API_KEY", Some("bad"));
        let st = state_on(&server).await;
        let (books, warn) = lookup(&st, "9788937460449").await;
        assert_eq!(books.len(), 0);
        assert!(warn.is_some_and(|w| w.contains("인증키")));
        assert!(check_nlk(&st).await.is_err());
    }
}
