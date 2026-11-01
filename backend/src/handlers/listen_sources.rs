//! 「在聽」不用 Spotify 的退路：Last.fm、ListenBrainz。
//!
//! Spotify 的開發者 app 要站長自己有 Premium 才能用，而且只收得到 Spotify 上聽的；Last.fm 與
//! ListenBrainz 是「誰播都記」的紀錄站，網易雲、KKBOX、Apple Music、YouTube Music 透過各自的
//! scrobbler 都會進來。兩個都只要帳號名（Last.fm 另外要一把免費的 API key）。
//!
//! 讀出來轉成跟 Spotify 一樣的形狀（`RecentPlayItem`、`NowPlayingResponse`），所以前台與後台
//! 收藏頁完全不用分辨來源。順序：Spotify 有設定就用 Spotify，否則 Last.fm，再否則 ListenBrainz。

use serde_json::Value;

use crate::handlers::spotify::{
    NowPlayingResponse, RecentPlayItem, RecentlyPlayedResponse, SpotifyAlbum, SpotifyArtist,
    SpotifyExternalUrls, SpotifyImage, SpotifyTrack,
};
use crate::integrations;
use crate::state::AppState;

const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

/// 一首歌（不管從哪來）→ Spotify 形狀的曲目
fn track(
    id: String,
    name: &str,
    artist: &str,
    album: &str,
    cover: Option<String>,
    url: String,
) -> SpotifyTrack {
    SpotifyTrack {
        id,
        name: name.to_string(),
        artists: vec![SpotifyArtist { name: artist.to_string() }],
        album: SpotifyAlbum {
            name: album.to_string(),
            images: cover.map(|url| SpotifyImage { url }).into_iter().collect(),
            release_date: String::new(),
        },
        duration_ms: 0,
        external_urls: SpotifyExternalUrls { spotify: url },
        popularity: 0,
        explicit: false,
    }
}

fn iso(secs: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(secs, 0).map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.get("#text").or(Some(x))).and_then(Value::as_str).unwrap_or("")
}

// ── Last.fm ─────────────────────────────────────────────────────────────

/// `user.getRecentTracks` 的一首。正在播的那首沒有 `date`，`now` 給它當下的時間
pub(crate) fn lastfm_item(t: &Value) -> Option<(RecentPlayItem, bool)> {
    let name = t.get("name").and_then(Value::as_str).filter(|s| !s.is_empty())?;
    let artist = text(t, "artist");
    let url = t.get("url").and_then(Value::as_str).unwrap_or("").to_string();
    // Last.fm 的封面四種大小，最後一個最大；全是空字串的就是沒有
    let cover = t
        .get("image")
        .and_then(Value::as_array)
        .and_then(|imgs| imgs.iter().rev().find_map(|i| i.get("#text")?.as_str().filter(|s| !s.is_empty())))
        .map(str::to_string);
    let mbid = t.get("mbid").and_then(Value::as_str).filter(|s| !s.is_empty());
    let id = mbid.map_or_else(|| format!("lastfm:{url}"), |m| format!("mbid:{m}"));
    let playing = t.pointer("/@attr/nowplaying").and_then(Value::as_str) == Some("true");
    let played_at = if playing {
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    } else {
        iso(t.pointer("/date/uts").and_then(Value::as_str)?.parse().ok()?)?
    };
    let track = track(id, name, artist, text(t, "album"), cover, url);
    Some((RecentPlayItem { track, played_at }, playing))
}

async fn lastfm(state: &AppState, key: &str, user: &str) -> Result<Vec<(RecentPlayItem, bool)>, String> {
    let url = format!(
        "{}/2.0/?method=user.getrecenttracks&format=json&limit=50&user={}&api_key={}",
        state.external.lastfm_api,
        crate::util::encode_uri_component(user),
        crate::util::encode_uri_component(key)
    );
    let r = state
        .http
        .get(url)
        .header("User-Agent", crate::identity::user_agent("listening"))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Couldn't reach Last.fm".to_string())?;
    let status = r.status();
    let v: Value = r.json().await.map_err(|_| "Last.fm sent something that isn't JSON".to_string())?;
    if let Some(msg) = v.get("message").and_then(Value::as_str).filter(|_| v.get("error").is_some()) {
        return Err(format!("Last.fm: {msg}"));
    }
    if !status.is_success() {
        return Err(format!("Last.fm answered {}", status.as_u16()));
    }
    let list = v.pointer("/recenttracks/track").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(list.iter().filter_map(lastfm_item).collect())
}

// ── ListenBrainz ────────────────────────────────────────────────────────

/// `/1/user/{u}/listens` 的一首。封面走 Cover Art Archive（MusicBrainz 對到發行版時才有）
pub(crate) fn listenbrainz_item(l: &Value) -> Option<RecentPlayItem> {
    let meta = l.get("track_metadata")?;
    let name = meta.get("track_name").and_then(Value::as_str).filter(|s| !s.is_empty())?;
    let artist = meta.get("artist_name").and_then(Value::as_str).unwrap_or("");
    let album = meta.get("release_name").and_then(Value::as_str).unwrap_or("");
    let mapping = meta.get("mbid_mapping");
    let recording = mapping.and_then(|m| m.get("recording_mbid")).and_then(Value::as_str);
    let cover = mapping
        .and_then(|m| m.get("caa_release_mbid"))
        .and_then(Value::as_str)
        .map(|r| format!("https://coverartarchive.org/release/{r}/front-250"));
    let played_at = l.get("listened_at").and_then(Value::as_i64).and_then(iso)?;
    let (id, url) = match recording {
        Some(r) => (format!("mbid:{r}"), format!("https://musicbrainz.org/recording/{r}")),
        None => {
            (format!("lb:{}", l.get("recording_msid").and_then(Value::as_str).unwrap_or(name)), String::new())
        }
    };
    Some(RecentPlayItem { track: track(id, name, artist, album, cover, url), played_at })
}

async fn listenbrainz(state: &AppState, user: &str) -> Result<Vec<RecentPlayItem>, String> {
    let url = format!(
        "{}/1/user/{}/listens?count=50",
        state.external.listenbrainz_api,
        crate::util::encode_uri_component(user)
    );
    let r = state
        .http
        .get(url)
        .header("User-Agent", crate::identity::user_agent("listening"))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Couldn't reach ListenBrainz".to_string())?;
    if r.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("ListenBrainz doesn't know that user".into());
    }
    if !r.status().is_success() {
        return Err(format!("ListenBrainz answered {}", r.status().as_u16()));
    }
    // 短時間打太多次時，它回 200 但內容是一頁「驗證瀏覽器」的 HTML
    let html = r
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|t| t.starts_with("text/html"));
    if html {
        return Err(
            "ListenBrainz is asking for a browser check (too many requests); it will work again in a while"
                .into(),
        );
    }
    let v: Value = r.json().await.map_err(|_| "ListenBrainz sent something that isn't JSON".to_string())?;
    let list = v.pointer("/payload/listens").and_then(Value::as_array).cloned().unwrap_or_default();
    Ok(list.iter().filter_map(listenbrainz_item).collect())
}

/// 正在播的那首（ListenBrainz 另外一支端點）
async fn listenbrainz_now(state: &AppState, user: &str) -> Option<SpotifyTrack> {
    let url = format!(
        "{}/1/user/{}/playing-now",
        state.external.listenbrainz_api,
        crate::util::encode_uri_component(user)
    );
    let v: Value = state
        .http
        .get(url)
        .header("User-Agent", crate::identity::user_agent("listening"))
        .timeout(TIMEOUT)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let l = v.pointer("/payload/listens/0")?.clone();
    let mut with_time = l;
    with_time["listened_at"] = Value::from(chrono::Utc::now().timestamp());
    listenbrainz_item(&with_time).map(|i| i.track)
}

/// 後台「來源」頁的即時檢查：抓一次，回最近幾首。不看優先順序，指定哪個就查哪個
pub(crate) async fn check(state: &AppState, key: &str) -> Result<u32, String> {
    let n = match key {
        "lastfm" => {
            let k = integrations::var("LASTFM_API_KEY").ok_or("Not set")?;
            let user = integrations::var("LASTFM_USERNAME").ok_or("Not set")?;
            lastfm(state, &k, &user).await?.len()
        }
        "listenbrainz" => {
            listenbrainz(state, &integrations::var("LISTENBRAINZ_USERNAME").ok_or("Not set")?).await?.len()
        }
        _ => 0,
    };
    Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

// ── 給 spotify.rs 用的兩個入口 ───────────────────────────────────────────

/// 有設定的退路來源；兩個都沒設是 `None`
fn which() -> Option<Source> {
    if let (Some(key), Some(user)) =
        (integrations::var("LASTFM_API_KEY"), integrations::var("LASTFM_USERNAME"))
    {
        return Some(Source::LastFm { key, user });
    }
    integrations::var("LISTENBRAINZ_USERNAME").map(|user| Source::ListenBrainz { user })
}

enum Source {
    LastFm { key: String, user: String },
    ListenBrainz { user: String },
}

impl Source {
    /// 快取的 key：換了帳號或來源，舊的結果就不算
    fn id(&self) -> String {
        match self {
            Self::LastFm { user, .. } => format!("lastfm:{user}"),
            Self::ListenBrainz { user } => format!("listenbrainz:{user}"),
        }
    }
}

/// 最近播放的快取：一分鐘內重用（前台、頂欄選單、後台都會打）；抓失敗時一小時內的舊結果照用。
/// ListenBrainz 對短時間內打很多次的 IP 會改回一頁「驗證瀏覽器」，那時候有舊的總比空的好
static RECENT: parking_lot::Mutex<Option<(String, std::time::Instant, Vec<RecentPlayItem>)>> =
    parking_lot::Mutex::new(None);
const FRESH: std::time::Duration = std::time::Duration::from_secs(60);
const STALE_OK: std::time::Duration = std::time::Duration::from_secs(3600);

/// 最近播放。沒有設定任何退路來源回 `None`（呼叫端就當作沒接音樂）
pub(crate) async fn recent(state: &AppState) -> Option<Result<RecentlyPlayedResponse, String>> {
    let source = which()?;
    let id = source.id();
    let cached = RECENT.lock().clone().filter(|(k, _, _)| *k == id);
    if let Some((_, at, items)) = &cached
        && at.elapsed() < FRESH
    {
        return Some(Ok(RecentlyPlayedResponse { items: items.clone() }));
    }
    let fetched = match source {
        Source::LastFm { key, user } => {
            // 正在播的那首也在清單最上面，「最近播放」不要重複算它
            lastfm(state, &key, &user)
                .await
                .map(|l| l.into_iter().filter(|(_, now)| !now).map(|(i, _)| i).collect())
        }
        Source::ListenBrainz { user } => listenbrainz(state, &user).await,
    };
    Some(match fetched {
        Ok(items) => {
            *RECENT.lock() = Some((id, std::time::Instant::now(), items.clone()));
            Ok(RecentlyPlayedResponse { items })
        }
        Err(e) => match cached.filter(|(_, at, _)| at.elapsed() < STALE_OK) {
            Some((_, _, items)) => Ok(RecentlyPlayedResponse { items }),
            None => Err(e),
        },
    })
}

/// 正在播的那首。沒在播、沒設定、抓失敗都是 `None`
pub(crate) async fn now_playing(state: &AppState) -> Option<NowPlayingResponse> {
    let item = match which()? {
        Source::LastFm { key, user } => {
            lastfm(state, &key, &user).await.ok()?.into_iter().find(|(_, now)| *now).map(|(i, _)| i.track)
        }
        Source::ListenBrainz { user } => listenbrainz_now(state, &user).await,
    }?;
    Some(NowPlayingResponse { is_playing: true, item: Some(item), progress_ms: None })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // 形狀照 Last.fm 與 ListenBrainz 真正回的（2026-11），只留用得到的欄位

    fn lastfm_track(now: bool) -> Value {
        let mut t = json!({
            "artist": { "mbid": "", "#text": "Röyksopp" },
            "mbid": "30d08f4c-d825-4ae1-b79c-44242cddd7c0",
            "album": { "mbid": "", "#text": "Profound Mysteries" },
            "name": "Some Resolve",
            "url": "https://www.last.fm/music/R%C3%B6yksopp/_/Some+Resolve",
            "image": [
                { "size": "small", "#text": "https://lastfm.freetls.fastly.net/i/u/34s/a.png" },
                { "size": "extralarge", "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/a.png" }
            ],
            "date": { "uts": "1771414109", "#text": "18 Feb 2026, 11:28" }
        });
        if now {
            t["@attr"] = json!({ "nowplaying": "true" });
            t.as_object_mut().expect("物件").remove("date");
        }
        t
    }

    #[test]
    fn lastfm_一首轉成_spotify_形狀() {
        let (item, playing) = lastfm_item(&lastfm_track(false)).expect("讀得出來");
        assert!(!playing);
        assert_eq!(item.track.name, "Some Resolve");
        assert_eq!(item.track.artists[0].name, "Röyksopp");
        assert_eq!(item.track.album.name, "Profound Mysteries");
        assert_eq!(
            item.track.album.images[0].url, "https://lastfm.freetls.fastly.net/i/u/300x300/a.png",
            "取最大的封面"
        );
        assert_eq!(item.track.id, "mbid:30d08f4c-d825-4ae1-b79c-44242cddd7c0");
        assert_eq!(item.played_at, "2026-02-18T11:28:29Z");
        let (_, playing) = lastfm_item(&lastfm_track(true)).expect("正在播的也讀得出來");
        assert!(playing);
    }

    fn listen() -> Value {
        json!({
            "listened_at": 1_771_414_109,
            "recording_msid": "fd0cad33",
            "track_metadata": {
                "artist_name": "Röyksopp", "track_name": "Some Resolve", "release_name": "Profound Mysteries",
                "mbid_mapping": { "caa_release_mbid": "f1418001-7f1e-46af-bfdb-95faeded8841", "recording_mbid": "30d08f4c" }
            }
        })
    }

    #[test]
    fn listenbrainz_一首轉成_spotify_形狀_封面走_cover_art_archive() {
        let item = listenbrainz_item(&listen()).expect("讀得出來");
        assert_eq!(
            item.track.album.images[0].url,
            "https://coverartarchive.org/release/f1418001-7f1e-46af-bfdb-95faeded8841/front-250"
        );
        assert_eq!(item.track.external_urls.spotify, "https://musicbrainz.org/recording/30d08f4c");
        let mut bare = listen();
        bare["track_metadata"].as_object_mut().expect("物件").remove("mbid_mapping");
        let item = listenbrainz_item(&bare).expect("沒對到 MusicBrainz 也讀得出來");
        assert!(item.track.album.images.is_empty());
        assert_eq!(item.track.id, "lb:fd0cad33");
    }

    async fn state_on(server: &MockServer) -> AppState {
        let mut st = crate::state::test_state().await;
        st.external = std::sync::Arc::new(crate::state::ExternalUrls::all_pointing_at(&server.uri()));
        st
    }

    #[tokio::test]
    async fn lastfm_最近播放不含正在播的那首_正在播另外給() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/lastfm/2.0/"))
            .and(query_param("user", "me"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "recenttracks": { "track": [lastfm_track(true), lastfm_track(false)] }
            })))
            .mount(&server)
            .await;
        integrations::set_for_test("LASTFM_API_KEY", Some("k"));
        integrations::set_for_test("LASTFM_USERNAME", Some("me"));
        let st = state_on(&server).await;
        let recent = recent(&st).await.expect("有設定").expect("抓得到");
        assert_eq!(recent.items.len(), 1);
        let now = now_playing(&st).await.expect("正在播");
        assert!(now.is_playing);
        assert_eq!(now.item.map(|t| t.name).as_deref(), Some("Some Resolve"));
    }

    #[tokio::test]
    async fn lastfm_帳號錯了回報_last_fm_自己的訊息() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/lastfm/2.0/"))
            .respond_with(
                ResponseTemplate::new(404).set_body_json(json!({ "error": 6, "message": "User not found" })),
            )
            .mount(&server)
            .await;
        integrations::set_for_test("LASTFM_API_KEY", Some("k"));
        integrations::set_for_test("LASTFM_USERNAME", Some("nobody"));
        let st = state_on(&server).await;
        assert!(matches!(recent(&st).await, Some(Err(e)) if e == "Last.fm: User not found"));
        assert!(now_playing(&st).await.is_none());
    }

    #[tokio::test]
    async fn listenbrainz_沒有_last_fm_時用它() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/listenbrainz/1/user/rob/listens"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({ "payload": { "listens": [listen()] } })),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/listenbrainz/1/user/rob/playing-now"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({ "payload": { "listens": [listen()] } })),
            )
            .mount(&server)
            .await;
        integrations::set_for_test("LASTFM_API_KEY", None);
        integrations::set_for_test("LISTENBRAINZ_USERNAME", Some("rob"));
        let st = state_on(&server).await;
        assert_eq!(recent(&st).await.expect("有設定").expect("抓得到").items.len(), 1);
        assert!(now_playing(&st).await.is_some_and(|n| n.is_playing));
    }

    /// 打太多次時 ListenBrainz 回 200 加一頁 HTML：要說清楚是被擋，而且一分鐘內不再去打
    #[tokio::test]
    async fn listenbrainz_回驗證頁時說清楚_一分鐘內用快取() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/listenbrainz/1/user/rob/listens"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({ "payload": { "listens": [listen()] } })),
            )
            .up_to_n_times(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/listenbrainz/1/user/rob/listens"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw("<!DOCTYPE html><title>Verifying your browser</title>", "text/html"),
            )
            .mount(&server)
            .await;
        integrations::set_for_test("LASTFM_API_KEY", None);
        integrations::set_for_test("LISTENBRAINZ_USERNAME", Some("rob"));
        let st = state_on(&server).await;
        assert_eq!(recent(&st).await.expect("有設定").expect("第一次抓得到").items.len(), 1);
        assert_eq!(recent(&st).await.expect("有設定").expect("用快取").items.len(), 1);
        assert_eq!(server.received_requests().await.expect("wiremock").len(), 1, "一分鐘內不再打");
        let direct = listenbrainz(&st, "rob").await;
        assert!(matches!(direct, Err(e) if e.contains("browser check")));
    }

    #[tokio::test]
    async fn 兩個都沒設就是沒有() {
        integrations::set_for_test("LASTFM_API_KEY", None);
        integrations::set_for_test("LISTENBRAINZ_USERNAME", None);
        let st = crate::state::test_state().await;
        assert!(recent(&st).await.is_none());
        assert!(now_playing(&st).await.is_none());
    }
}
