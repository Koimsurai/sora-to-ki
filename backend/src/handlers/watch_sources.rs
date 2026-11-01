//! 依地區挑的觀看紀錄來源：Bangumi（中日）、AniList 與 MyAnimeList（全球的動畫圈）、Letterboxd（電影）。
//!
//! 都是「讀站長公開的清單」：給帳號名就能讀，不必 OAuth（Bangumi 的私人收藏另外給 token，
//! MyAnimeList 要一個 Client ID）。讀進來的寫進既有的觀看紀錄，收藏頁不用分辨來源：
//! - 影集、動畫 → `tv_history`，一集一列。這幾個平台給的是「看到第幾集」，就補上到那一集為止
//!   的每一集，收藏頁的集數才對得起來；動畫的 `genres` 記成 `anime`，前台顯示成「動畫」
//! - 電影（含動畫電影）→ `film_history`
//!
//! 片名照站台的預設語系挑：中文站用 Bangumi 的中文名、日文站用原文、其他用英文或羅馬拼音。
//! 第一次同步拉完整的清單，之後只看最近更新的那一頁——各平台的清單都是照更新時間排的。

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Value, json};
use sqlx::{SqliteConnection, SqlitePool};

use crate::integrations;
use crate::state::AppState;

/// 一部影集或動畫看到哪裡
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Series {
    pub title: String,
    /// 看到第幾集；看完的是總集數
    pub progress: u32,
    /// `YYYY-MM-DD`，最近一次更新進度的那天
    pub date: String,
    pub cover: Option<String>,
    pub anime: bool,
}

/// 看過的一部電影
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Film {
    pub title: String,
    pub date: String,
    pub cover: Option<String>,
    pub year: Option<i64>,
    pub tmdb_id: Option<i64>,
    /// 1–5（四捨五入）
    pub rating: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum Entry {
    Series(Series),
    Film(Film),
}

/// 集數補到多少為止：防止平台給了一個離譜的數字，一口氣寫進幾萬列
const MAX_EPISODES: u32 = 2000;

/// 寫進一部影集到 `progress` 為止還沒有的集數；回傳新寫了幾集
async fn upsert_series(conn: &mut SqliteConnection, source: &str, s: &Series) -> u32 {
    let mut added = 0;
    for ep in 1..=s.progress.min(MAX_EPISODES) {
        let label = format!("E{ep:02}");
        // 同一集已經有了（不管哪天寫的）就不再寫：進度往前走時只補新的那幾集
        let done = sqlx::query(
            "INSERT INTO tv_history (series_name, episode_label, watched_date, source, poster_url, genres) \
             SELECT ?, ?, ?, ?, ?, ? \
             WHERE NOT EXISTS (SELECT 1 FROM tv_history WHERE series_name = ? AND episode_label = ?)",
        )
        .bind(&s.title)
        .bind(&label)
        .bind(&s.date)
        .bind(source)
        .bind(s.cover.as_deref())
        .bind(s.anime.then_some("anime"))
        .bind(&s.title)
        .bind(&label)
        .execute(&mut *conn)
        .await;
        if done.is_ok_and(|r| r.rows_affected() > 0) {
            added += 1;
        }
    }
    added
}

async fn upsert_film(conn: &mut SqliteConnection, source: &str, f: &Film) -> bool {
    sqlx::query(
        "INSERT OR IGNORE INTO film_history (title, watched_date, rating, source, tmdb_id, poster_url, release_year) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&f.title)
    .bind(&f.date)
    .bind(f.rating)
    .bind(source)
    .bind(f.tmdb_id)
    .bind(f.cover.as_deref())
    .bind(f.year)
    .execute(conn)
    .await
    .is_ok_and(|r| r.rows_affected() > 0)
}

/// 整輪包在一個交易裡：第一次同步一個帳號動輒上萬集，一集一個交易要等一分鐘以上
pub(crate) async fn write_all(pool: &SqlitePool, source: &str, entries: &[Entry]) -> Result<u32, String> {
    let failed = |e: sqlx::Error| format!("Couldn't save to the database: {e}");
    let mut tx = pool.begin().await.map_err(failed)?;
    let mut n = 0;
    for e in entries {
        n += match e {
            Entry::Series(s) => upsert_series(&mut tx, source, s).await,
            Entry::Film(f) => u32::from(upsert_film(&mut tx, source, f).await),
        };
    }
    tx.commit().await.map_err(failed)?;
    Ok(n)
}

/// 片名照站台的預設語系挑。`local` 是中文名（Bangumi 的 name_cn），`native` 是原文，`english` 是英文或羅馬拼音
fn pick_title(locale: &str, local: Option<&str>, native: Option<&str>, english: Option<&str>) -> String {
    let ok = |s: Option<&str>| s.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let order = if locale.starts_with("zh") {
        [local, native, english]
    } else if locale == "ja" {
        [native, english, local]
    } else {
        [english, native, local]
    };
    order.into_iter().find_map(ok).unwrap_or_default()
}

fn locale() -> String {
    crate::handlers::site_config::default_locale()
}

/// 時間戳的前十個字（`2026-10-31T21:38:53+08:00` → `2026-10-31`）
fn date_of(s: &str) -> Option<String> {
    let d = s.get(..10)?;
    (d.len() == 10 && d.as_bytes()[4] == b'-').then(|| d.to_string())
}

fn epoch_date(secs: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(secs, 0).map(|d| d.format("%Y-%m-%d").to_string())
}

fn u32_of(v: Option<&Value>) -> u32 {
    v.and_then(Value::as_u64).and_then(|n| u32::try_from(n).ok()).unwrap_or(0)
}

async fn get_json(req: reqwest::RequestBuilder, what: &str) -> Result<Value, String> {
    let r = req
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| format!("Couldn't reach {what}"))?;
    let status = r.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("{what} doesn't know that user (or the list is private)"));
    }
    if !status.is_success() {
        return Err(format!("{what} answered {}", status.as_u16()));
    }
    r.json().await.map_err(|_| format!("{what} sent something that isn't JSON"))
}

/// 第一次同步（還沒有任何一輪的紀錄）拉完整清單，之後只看最近的
async fn first_sync(pool: &SqlitePool, key: &str) -> bool {
    integrations::last_record(pool, key).await.is_none_or(|r| !r.ok)
}

// ── Bangumi ──────────────────────────────────────────────────────────────

/// Bangumi 的條目類型：2 動畫、6 三次元（日劇、陸劇…）
const BGM_ANIME: u8 = 2;
const BGM_REAL: u8 = 6;
const BGM_BOOK: u8 = 1;

/// `/v0/users/{u}/collections` 的一筆 → 我們的紀錄。只收「看過」(2) 與「在看」(3)
pub(crate) fn bangumi_entry(c: &Value, locale: &str) -> Option<Entry> {
    let kind = c.get("type").and_then(Value::as_u64)?;
    if kind != 2 && kind != 3 {
        return None;
    }
    let subject = c.get("subject")?;
    let title = pick_title(
        locale,
        subject.get("name_cn").and_then(Value::as_str),
        subject.get("name").and_then(Value::as_str),
        None,
    );
    if title.is_empty() {
        return None;
    }
    let date = date_of(c.get("updated_at").and_then(Value::as_str)?)?;
    let cover = subject
        .pointer("/images/common")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let eps = u32_of(subject.get("eps"));
    if eps == 1 {
        let year = subject.get("date").and_then(Value::as_str).and_then(|d| d.get(..4)?.parse().ok());
        let rating = c.get("rate").and_then(Value::as_i64).filter(|r| *r > 0).map(|r| (r + 1) / 2);
        return Some(Entry::Film(Film { title, date, cover, year, tmdb_id: None, rating }));
    }
    let watched = u32_of(c.get("ep_status"));
    // 看過的常常只按了「看過」、沒一集一集點：當作看完
    let progress = if kind == 2 { watched.max(eps).max(1) } else { watched };
    let anime = c.get("subject_type").and_then(Value::as_u64) == Some(u64::from(BGM_ANIME));
    (progress > 0).then_some(Entry::Series(Series { title, progress, date, cover, anime }))
}

async fn bangumi_sync(state: &AppState) -> Result<u32, String> {
    let user = integrations::var("BANGUMI_USERNAME").ok_or("The Bangumi username is missing")?;
    let token = integrations::var("BANGUMI_TOKEN");
    let pages = if first_sync(&state.pool, "bangumi").await { 20 } else { 1 };
    let locale = locale();
    let (mut entries, mut books) = (Vec::new(), Vec::new());
    // 書（1）也一起：想讀、讀過、在讀都收，進書架（handlers/read_sources.rs）
    for subject_type in [BGM_ANIME, BGM_REAL, BGM_BOOK] {
        let kinds: &[u8] = if subject_type == BGM_BOOK { &[3, 2, 1] } else { &[3, 2] };
        for &kind in kinds {
            for page in 0..pages {
                let url = format!(
                    "{}/v0/users/{}/collections?subject_type={subject_type}&type={kind}&limit=50&offset={}",
                    state.external.bangumi_api,
                    crate::util::encode_uri_component(&user),
                    page * 50
                );
                let mut req =
                    state.http.get(url).header("User-Agent", crate::identity::user_agent("bangumi"));
                if let Some(t) = &token {
                    req = req.bearer_auth(t);
                }
                let data = get_json(req, "Bangumi").await?;
                let list = data.get("data").and_then(Value::as_array).cloned().unwrap_or_default();
                if subject_type == BGM_BOOK {
                    books.extend(
                        list.iter().filter_map(|c| crate::handlers::read_sources::bangumi_book(c, &locale)),
                    );
                } else {
                    entries.extend(list.iter().filter_map(|c| bangumi_entry(c, &locale)));
                }
                if list.len() < 50 {
                    break;
                }
            }
        }
    }
    let n = crate::handlers::read_sources::write_books(&state.pool, "bangumi", &books).await?;
    Ok(n + write_all(&state.pool, "bangumi", &entries).await?)
}

// ── AniList ─────────────────────────────────────────────────────────────

const ANILIST_QUERY: &str = "query($u:String){MediaListCollection(userName:$u,type:ANIME,\
status_in:[CURRENT,COMPLETED,REPEATING]){lists{entries{progress updatedAt status \
media{format episodes title{romaji native english} coverImage{large} startDate{year}}}}}}";

pub(crate) fn anilist_entry(e: &Value, locale: &str) -> Option<Entry> {
    let media = e.get("media")?;
    let title = pick_title(
        locale,
        None,
        media.pointer("/title/native").and_then(Value::as_str),
        media
            .pointer("/title/english")
            .and_then(Value::as_str)
            .or_else(|| media.pointer("/title/romaji")?.as_str()),
    );
    if title.is_empty() {
        return None;
    }
    let date = epoch_date(e.get("updatedAt").and_then(Value::as_i64)?)?;
    let cover = media.pointer("/coverImage/large").and_then(Value::as_str).map(str::to_string);
    if media.get("format").and_then(Value::as_str) == Some("MOVIE") {
        let year = media.pointer("/startDate/year").and_then(Value::as_i64);
        return Some(Entry::Film(Film { title, date, cover, year, tmdb_id: None, rating: None }));
    }
    let watched = u32_of(e.get("progress"));
    let progress = if e.get("status").and_then(Value::as_str) == Some("COMPLETED") {
        watched.max(u32_of(media.get("episodes"))).max(1)
    } else {
        watched
    };
    (progress > 0).then_some(Entry::Series(Series { title, progress, date, cover, anime: true }))
}

async fn anilist_sync(state: &AppState) -> Result<u32, String> {
    let user = integrations::var("ANILIST_USERNAME").ok_or("The AniList username is missing")?;
    let req = state
        .http
        .post(&state.external.anilist_api)
        .header("accept", "application/json")
        .json(&json!({ "query": ANILIST_QUERY, "variables": { "u": user } }));
    let data = get_json(req, "AniList").await?;
    if let Some(msg) = data.pointer("/errors/0/message").and_then(Value::as_str) {
        return Err(format!("AniList: {msg}"));
    }
    let locale = locale();
    let entries: Vec<Entry> = data
        .pointer("/data/MediaListCollection/lists")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|l| l.get("entries").and_then(Value::as_array).cloned().unwrap_or_default())
        .filter_map(|e| anilist_entry(&e, &locale))
        .collect();
    write_all(&state.pool, "anilist", &entries).await
}

// ── MyAnimeList ─────────────────────────────────────────────────────────

pub(crate) fn mal_entry(d: &Value, locale: &str) -> Option<Entry> {
    let node = d.get("node")?;
    let status = d.get("list_status")?;
    let title = pick_title(
        locale,
        None,
        node.pointer("/alternative_titles/ja").and_then(Value::as_str),
        node.pointer("/alternative_titles/en")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .or_else(|| node.get("title")?.as_str()),
    );
    if title.is_empty() {
        return None;
    }
    let date = date_of(status.get("updated_at").and_then(Value::as_str)?)?;
    let cover = node
        .pointer("/main_picture/large")
        .or_else(|| node.pointer("/main_picture/medium"))
        .and_then(Value::as_str)
        .map(str::to_string);
    if node.get("media_type").and_then(Value::as_str) == Some("movie") {
        let year = node.pointer("/start_season/year").and_then(Value::as_i64);
        let rating = status.get("score").and_then(Value::as_i64).filter(|s| *s > 0).map(|s| (s + 1) / 2);
        return Some(Entry::Film(Film { title, date, cover, year, tmdb_id: None, rating }));
    }
    let watched = u32_of(status.get("num_episodes_watched"));
    let progress = if status.get("status").and_then(Value::as_str) == Some("completed") {
        watched.max(u32_of(node.get("num_episodes"))).max(1)
    } else {
        watched
    };
    (progress > 0).then_some(Entry::Series(Series { title, progress, date, cover, anime: true }))
}

async fn mal_sync(state: &AppState) -> Result<u32, String> {
    let user = integrations::var("MAL_USERNAME").ok_or("The MyAnimeList username is missing")?;
    let client = integrations::var("MAL_CLIENT_ID").ok_or("The MyAnimeList Client ID is missing")?;
    let pages = if first_sync(&state.pool, "mal").await { 10 } else { 1 };
    let locale = locale();
    let mut entries = Vec::new();
    for status in ["watching", "completed"] {
        for page in 0..pages {
            let url = format!(
                "{}/v2/users/{}/animelist?status={status}&sort=list_updated_at&limit=100&offset={}\
                 &fields=list_status,num_episodes,media_type,start_season,alternative_titles,main_picture",
                state.external.mal_api,
                crate::util::encode_uri_component(&user),
                page * 100
            );
            let data =
                get_json(state.http.get(url).header("X-MAL-CLIENT-ID", &client), "MyAnimeList").await?;
            let list = data.get("data").and_then(Value::as_array).cloned().unwrap_or_default();
            entries.extend(list.iter().filter_map(|d| mal_entry(d, &locale)));
            if data.pointer("/paging/next").is_none() {
                break;
            }
        }
    }
    write_all(&state.pool, "mal", &entries).await
}

// ── Letterboxd ──────────────────────────────────────────────────────────

static ITEM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?s)<item>(.*?)</item>").expect("固定的正規式"));
static POSTER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"<img src="([^"]+)""#).expect("固定的正規式"));

fn tag<'a>(item: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let start = item.find(&open)? + open.len();
    let end = item[start..].find(&format!("</{name}>"))? + start;
    Some(item[start..end].trim()).filter(|s| !s.is_empty())
}

/// RSS 裡的一則 → 一部看過的電影。片單、影評這類沒有片名或觀看日的跳過
pub(crate) fn letterboxd_entry(item: &str) -> Option<Film> {
    let title = crate::handlers::link_preview::decode_entities(tag(item, "letterboxd:filmTitle")?);
    let date = tag(item, "letterboxd:watchedDate").map(str::to_string)?;
    let rating = tag(item, "letterboxd:memberRating").and_then(|r| r.parse::<f64>().ok()).map(f64::round);
    Some(Film {
        title,
        date,
        cover: POSTER.captures(item).map(|c| crate::handlers::link_preview::decode_entities(&c[1])),
        year: tag(item, "letterboxd:filmYear").and_then(|y| y.parse().ok()),
        tmdb_id: tag(item, "tmdb:movieId").and_then(|id| id.parse().ok()),
        // 0.5–5 顆星四捨五入成整數（同一個欄位的其他來源也是 1–5）
        #[allow(clippy::cast_possible_truncation, reason = "0.5–5 四捨五入後是 1–5")]
        rating: rating.map(|r| r as i64).filter(|r| *r > 0),
    })
}

async fn letterboxd_sync(state: &AppState) -> Result<u32, String> {
    let user = integrations::var("LETTERBOXD_USERNAME").ok_or("The Letterboxd username is missing")?;
    let url = format!("{}/{}/rss/", state.external.letterboxd, crate::util::encode_uri_component(&user));
    let r = state
        .http
        .get(url)
        .header("User-Agent", crate::identity::user_agent("letterboxd"))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Couldn't reach Letterboxd".to_string())?;
    if r.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Letterboxd doesn't know that user".into());
    }
    if !r.status().is_success() {
        return Err(format!("Letterboxd answered {}", r.status().as_u16()));
    }
    let xml = r.text().await.map_err(|_| "Letterboxd sent an empty feed".to_string())?;
    let entries: Vec<Entry> =
        ITEM.captures_iter(&xml).filter_map(|c| letterboxd_entry(&c[1])).map(Entry::Film).collect();
    write_all(&state.pool, "letterboxd", &entries).await
}

// ── 排程 ────────────────────────────────────────────────────────────────

/// 跑一輪並記下結果（worker 與後台的「立刻同步」共用）。不是這裡的來源回 `None`
pub async fn sync_and_record(state: &AppState, key: &str) -> Option<Result<u32, String>> {
    let result = match key {
        "bangumi" => bangumi_sync(state).await,
        "anilist" => anilist_sync(state).await,
        "mal" => mal_sync(state).await,
        "letterboxd" => letterboxd_sync(state).await,
        _ => return None,
    };
    if let Err(e) = &result {
        tracing::warn!("[{key}] sync failed: {e}");
    }
    integrations::record(&state.pool, key, result.clone()).await;
    Some(result)
}

/// 四個來源各一個 worker，開關在後台（`ENABLE_*_SYNC`）。六小時一輪；起跑時間錯開，不同時打出去
pub fn spawn_all(state: &AppState) {
    for (i, (key, var)) in [
        ("bangumi", "ENABLE_BANGUMI_SYNC"),
        ("anilist", "ENABLE_ANILIST_SYNC"),
        ("mal", "ENABLE_MAL_SYNC"),
        ("letterboxd", "ENABLE_LETTERBOXD_SYNC"),
    ]
    .into_iter()
    .enumerate()
    {
        let delay = 60 + 20 * u64::try_from(i).unwrap_or(0);
        crate::worker::spawn_periodic(state.clone(), key, var, delay, 6 * 3600, move |s| async move {
            let _ = sync_and_record(&s, key).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // 形狀照各平台真正回的（2026-11 實際打過），只留用得到的欄位

    fn bangumi_doing() -> Value {
        json!({
            "updated_at": "2026-10-31T21:38:53+08:00",
            "subject": {
                "date": "2023-09-29",
                "images": { "common": "https://lain.bgm.tv/r/400/pic/cover/l/frieren.jpg" },
                "name": "葬送のフリーレン",
                "name_cn": "葬送的芙莉莲",
                "eps": 28
            },
            "ep_status": 5, "subject_type": 2, "type": 3, "rate": 0
        })
    }

    #[test]
    fn bangumi_在看的照看到的集數_中文站用中文名() {
        let Some(Entry::Series(s)) = bangumi_entry(&bangumi_doing(), "zh-TW") else { panic!("該是影集") };
        assert_eq!(
            (s.title.as_str(), s.progress, s.date.as_str(), s.anime),
            ("葬送的芙莉莲", 5, "2026-10-31", true)
        );
        let Some(Entry::Series(s)) = bangumi_entry(&bangumi_doing(), "ja") else { panic!("該是影集") };
        assert_eq!(s.title, "葬送のフリーレン", "日文站用原文");
    }

    #[test]
    fn bangumi_看過的沒點集數當作看完_一集的是電影_想看的不收() {
        let mut done = bangumi_doing();
        done["type"] = json!(2);
        done["ep_status"] = json!(0);
        let Some(Entry::Series(s)) = bangumi_entry(&done, "zh-TW") else { panic!("該是影集") };
        assert_eq!(s.progress, 28);

        let mut movie = done.clone();
        movie["subject"]["eps"] = json!(1);
        movie["rate"] = json!(6);
        let Some(Entry::Film(f)) = bangumi_entry(&movie, "zh-TW") else { panic!("一集的該是電影") };
        assert_eq!((f.year, f.rating), (Some(2023), Some(3)), "Bangumi 的 10 分制換成 5 顆星");

        let mut wish = bangumi_doing();
        wish["type"] = json!(1);
        assert_eq!(bangumi_entry(&wish, "zh-TW"), None);
        let mut real = bangumi_doing();
        real["subject_type"] = json!(6);
        let Some(Entry::Series(s)) = bangumi_entry(&real, "zh-TW") else { panic!("該是影集") };
        assert!(!s.anime, "三次元不是動畫");
    }

    fn anilist_entry_json(format: &str, status: &str, progress: u32) -> Value {
        json!({
            "progress": progress, "updatedAt": 1_793_498_579, "status": status,
            "media": {
                "format": format, "episodes": 11,
                "title": { "romaji": "JoJo no Kimyou na Bouken", "native": "ジョジョの奇妙な冒険", "english": "JoJo's Bizarre Adventure" },
                "coverImage": { "large": "https://s4.anilist.co/cover.jpg" },
                "startDate": { "year": 2026 }
            }
        })
    }

    #[test]
    fn anilist_英文站用英文名_看完的補滿集數_電影另外放() {
        let Some(Entry::Series(s)) = anilist_entry(&anilist_entry_json("ONA", "CURRENT", 6), "en") else {
            panic!()
        };
        assert_eq!(
            (s.title.as_str(), s.progress, s.date.as_str()),
            ("JoJo's Bizarre Adventure", 6, "2026-11-01")
        );
        let Some(Entry::Series(s)) = anilist_entry(&anilist_entry_json("TV", "COMPLETED", 0), "ja") else {
            panic!()
        };
        assert_eq!((s.title.as_str(), s.progress), ("ジョジョの奇妙な冒険", 11));
        assert!(matches!(
            anilist_entry(&anilist_entry_json("MOVIE", "COMPLETED", 1), "en"),
            Some(Entry::Film(_))
        ));
        assert_eq!(
            anilist_entry(&anilist_entry_json("TV", "CURRENT", 0), "en"),
            None,
            "一集都還沒看的不出現"
        );
    }

    fn mal_json(media_type: &str, status: &str) -> Value {
        json!({
            "node": {
                "id": 52991, "title": "Sousou no Frieren",
                "main_picture": { "medium": "https://cdn.myanimelist.net/m.jpg", "large": "https://cdn.myanimelist.net/l.jpg" },
                "alternative_titles": { "en": "Frieren: Beyond Journey's End", "ja": "葬送のフリーレン" },
                "media_type": media_type, "num_episodes": 28, "start_season": { "year": 2023 }
            },
            "list_status": { "status": status, "num_episodes_watched": 3, "updated_at": "2024-03-30T10:00:00+00:00", "score": 9 }
        })
    }

    #[test]
    fn mal_照狀態算集數_電影另外放() {
        let Some(Entry::Series(s)) = mal_entry(&mal_json("tv", "watching"), "en") else { panic!() };
        assert_eq!(
            (s.title.as_str(), s.progress, s.cover.as_deref()),
            ("Frieren: Beyond Journey's End", 3, Some("https://cdn.myanimelist.net/l.jpg"))
        );
        let Some(Entry::Series(s)) = mal_entry(&mal_json("tv", "completed"), "zh-TW") else { panic!() };
        assert_eq!((s.title.as_str(), s.progress), ("葬送のフリーレン", 28), "中文站沒有中文名就用原文");
        let Some(Entry::Film(f)) = mal_entry(&mal_json("movie", "completed"), "en") else { panic!() };
        assert_eq!((f.year, f.rating), (Some(2023), Some(5)));
    }

    const LETTERBOXD_ITEM: &str = r#"<title>Primetime, 2026 - ★★★½</title> <link>https://letterboxd.com/dave/film/primetime-2026/</link> <letterboxd:watchedDate>2026-10-30</letterboxd:watchedDate> <letterboxd:filmTitle>Tom &amp; Jerry</letterboxd:filmTitle> <letterboxd:filmYear>2026</letterboxd:filmYear> <letterboxd:memberRating>3.5</letterboxd:memberRating> <tmdb:movieId>1375441</tmdb:movieId> <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/poster.jpg?v=41640d6988"/></p> ]]></description>"#;

    #[test]
    fn letterboxd_一則觀影紀錄的欄位() {
        let f = letterboxd_entry(LETTERBOXD_ITEM).expect("該讀得出來");
        assert_eq!(f.title, "Tom & Jerry", "片名的 HTML 實體要還原");
        assert_eq!(
            (f.date.as_str(), f.year, f.tmdb_id, f.rating),
            ("2026-10-30", Some(2026), Some(1_375_441), Some(4))
        );
        assert_eq!(f.cover.as_deref(), Some("https://a.ltrbxd.com/resized/poster.jpg?v=41640d6988"));
        assert_eq!(letterboxd_entry("<title>A list</title>"), None, "片單不是觀影紀錄");
    }

    #[test]
    fn 片名的語系順序() {
        assert_eq!(pick_title("zh-CN", Some(""), Some("原文"), Some("Eng")), "原文", "空字串不算有");
        assert_eq!(pick_title("ko", None, Some("原文"), Some("Eng")), "Eng");
        assert_eq!(pick_title("en", None, None, None), "");
    }

    async fn state_on(server: &MockServer) -> AppState {
        let mut st = crate::state::test_state().await;
        st.external = std::sync::Arc::new(crate::state::ExternalUrls::all_pointing_at(&server.uri()));
        st
    }

    async fn tv_rows(pool: &SqlitePool) -> Vec<(String, String, Option<String>)> {
        sqlx::query_as(
            "SELECT series_name, episode_label, genres FROM tv_history ORDER BY series_name, episode_label",
        )
        .fetch_all(pool)
        .await
        .expect("讀 tv_history")
    }

    /// 進度往前走只補新的集數；同一份清單再同步一次不會重複寫
    #[tokio::test]
    async fn bangumi_同步寫進影集_再同步只補新的集數() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/bangumi/v0/users/me/collections"))
            .and(query_param("subject_type", "2"))
            .and(query_param("type", "3"))
            .and(header("authorization", "Bearer tok"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [bangumi_doing()] })))
            .mount(&server)
            .await;
        // 其他組合（看過的、三次元）是空的
        Mock::given(method("GET"))
            .and(path("/bangumi/v0/users/me/collections"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [] })))
            .mount(&server)
            .await;
        integrations::set_for_test("BANGUMI_USERNAME", Some("me"));
        integrations::set_for_test("BANGUMI_TOKEN", Some("tok"));
        crate::handlers::site_config::set_default_locale_for_test("zh-TW");
        let st = state_on(&server).await;

        assert_eq!(sync_and_record(&st, "bangumi").await, Some(Ok(5)));
        let rows = tv_rows(&st.pool).await;
        assert_eq!(rows.len(), 5);
        assert_eq!(rows[0], ("葬送的芙莉莲".into(), "E01".into(), Some("anime".into())));
        assert_eq!(sync_and_record(&st, "bangumi").await, Some(Ok(0)), "同一份清單再同步一次不該再寫");
        let rec = integrations::last_record(&st.pool, "bangumi").await.expect("有記下結果");
        assert!(rec.ok);
    }

    #[tokio::test]
    async fn 沒填帳號就不打上游_記成失敗() {
        let server = MockServer::start().await;
        let st = state_on(&server).await;
        for (key, var) in [
            ("bangumi", "BANGUMI_USERNAME"),
            ("anilist", "ANILIST_USERNAME"),
            ("mal", "MAL_USERNAME"),
            ("letterboxd", "LETTERBOXD_USERNAME"),
        ] {
            integrations::set_for_test(var, None);
            assert!(matches!(sync_and_record(&st, key).await, Some(Err(_))), "{key}");
        }
        assert!(server.received_requests().await.expect("wiremock").is_empty());
        assert_eq!(sync_and_record(&st, "nope").await, None);
    }

    #[tokio::test]
    async fn anilist_同步_使用者不存在時回報() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/anilist"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "MediaListCollection": { "lists": [{ "entries": [anilist_entry_json("TV", "CURRENT", 2)] }] } }
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/anilist"))
            .respond_with(
                ResponseTemplate::new(404)
                    .set_body_json(json!({ "errors": [{ "message": "Private User" }] })),
            )
            .mount(&server)
            .await;
        integrations::set_for_test("ANILIST_USERNAME", Some("someone"));
        crate::handlers::site_config::set_default_locale_for_test("en");
        let st = state_on(&server).await;
        assert_eq!(sync_and_record(&st, "anilist").await, Some(Ok(2)));
        assert!(matches!(sync_and_record(&st, "anilist").await, Some(Err(e)) if e.contains("private")));
    }

    #[tokio::test]
    async fn mal_同步帶_client_id_電影寫進電影紀錄() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/mal/v2/users/me/animelist"))
            .and(query_param("status", "completed"))
            .and(header("X-MAL-CLIENT-ID", "cid"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({ "data": [mal_json("movie", "completed")], "paging": {} })),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/mal/v2/users/me/animelist"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "data": [], "paging": {} })))
            .mount(&server)
            .await;
        integrations::set_for_test("MAL_USERNAME", Some("me"));
        integrations::set_for_test("MAL_CLIENT_ID", Some("cid"));
        let st = state_on(&server).await;
        assert_eq!(sync_and_record(&st, "mal").await, Some(Ok(1)));
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM film_history WHERE source = 'mal'")
            .fetch_one(&st.pool)
            .await
            .expect("count");
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn letterboxd_同步讀_rss_帶_tmdb_編號() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/letterboxd/dave/rss/"))
            .respond_with(ResponseTemplate::new(200).set_body_string(format!(
                "<rss><channel><item>{LETTERBOXD_ITEM}</item><item><title>A list</title></item></channel></rss>"
            )))
            .mount(&server)
            .await;
        integrations::set_for_test("LETTERBOXD_USERNAME", Some("dave"));
        let st = state_on(&server).await;
        assert_eq!(sync_and_record(&st, "letterboxd").await, Some(Ok(1)));
        let tmdb: Option<i64> =
            sqlx::query_scalar("SELECT tmdb_id FROM film_history WHERE source = 'letterboxd'")
                .fetch_one(&st.pool)
                .await
                .expect("row");
        assert_eq!(tmdb, Some(1_375_441));

        integrations::set_for_test("LETTERBOXD_USERNAME", Some("ghost"));
        assert!(
            matches!(sync_and_record(&st, "letterboxd").await, Some(Err(_))),
            "沒有這個人（404）要回報失敗"
        );
    }
}
