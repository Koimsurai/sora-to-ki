//! 讀者在哪個國家：用 DB-IP 的免費國家資料庫（IP to Country Lite，CC BY 4.0）從 IP 查。
//!
//! 原本只讀 Cloudflare 的 `CF-IPCountry`，但 koimsurai.com 沒有走 Cloudflare，那個標頭從來沒出現過，
//! 反應紀錄的國家每一筆都是「不明」。現在先看 CF 標頭（有走 Cloudflare 的自架者照舊），沒有才查這份。
//!
//! 只查國家，查完 IP 就丟：呼叫端拿到的只有兩個字母的國碼，IP 不會進資料庫也不會進 log。
//!
//! 資料庫每月初更新一次。worker 開機先讀已經下載過的那份，沒有或超過 [`MAX_AGE_DAYS`] 天就重抓：
//! 這個月的還沒發布（月初頭幾個小時）就用上個月的。檔案放在資料庫旁邊（同一個 volume），
//! 重新部署不用再抓一次；db-backup 只備份 SQLite，不會帶到這份。
//!
//! 下載**預設開著**，跟 [`crate::worker`] 那幾支同步「預設關閉」不一樣：那些要帳號、會打別人的 API，
//! 這份是公開檔案、一個月抓一次，關著的話每個自架者的國家欄都是空的。不想連外的設 `GEOIP_DOWNLOAD=0`，
//! 自己把 `.mmdb` 放到 `GEOIP_DB` 指的位置也讀得到。

use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Datelike, NaiveDate};
use maxminddb::{Reader, geoip2};
use parking_lot::RwLock;
use tokio::task::JoinHandle;

use crate::state::AppState;

const BASE_URL: &str = "https://download.db-ip.com/free";
/// 每月更新一次，多留幾天給「月初還沒發布」的空窗
const MAX_AGE_DAYS: u64 = 35;
/// 多久看一次要不要重抓
const CHECK_EVERY: Duration = Duration::from_hours(24);

static DB: RwLock<Option<Arc<Reader<Vec<u8>>>>> = RwLock::new(None);

/// IP 在哪個國家（ISO 3166-1 兩碼、大寫）。資料庫還沒載好、內網位址、查不到都是 `None`
pub fn country(ip: IpAddr) -> Option<String> {
    let db = DB.read().clone()?;
    let found = db.lookup(ip).ok()?.decode::<geoip2::Country>().ok()??;
    found.country.iso_code.map(str::to_ascii_uppercase)
}

/// 換上一份新的資料庫；位元組不是合法的 mmdb 就回錯、原本那份照用
fn install(bytes: Vec<u8>) -> Result<(), String> {
    let reader = Reader::from_source(bytes).map_err(|e| format!("not a valid mmdb: {e}"))?;
    *DB.write() = Some(Arc::new(reader));
    Ok(())
}

/// 檔案放哪：`GEOIP_DB`，沒設就是資料庫旁邊（容器裡的工作目錄是 /usr/src/app，db/ 是 volume）
fn db_path() -> PathBuf {
    std::env::var("GEOIP_DB")
        .ok()
        .filter(|p| !p.trim().is_empty())
        .map_or_else(|| PathBuf::from("db/dbip-country-lite.mmdb"), PathBuf::from)
}

/// 要抓的月份：這個月、上個月（一月的上個月是去年十二月）
fn months(today: NaiveDate) -> [String; 2] {
    let (y, m) = (today.year(), today.month());
    let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
    [format!("{y}-{m:02}"), format!("{py}-{pm:02}")]
}

/// 檔案多舊（天）；沒有檔案或讀不到時間就當成要重抓
fn age_days(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.elapsed().map_or(0, |d| d.as_secs() / 86400))
}

/// 照順序試這個月與上個月，抓到、解壓、驗過才寫檔（先寫暫存檔再換名，不會留下半份）
async fn download(
    http: &reqwest::Client,
    base: &str,
    today: NaiveDate,
    dest: &Path,
) -> Result<Vec<u8>, String> {
    let mut last = String::new();
    for month in months(today) {
        let url = format!("{base}/dbip-country-lite-{month}.mmdb.gz");
        let res = match http.get(&url).timeout(Duration::from_secs(120)).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last = format!("{url}: HTTP {}", r.status());
                continue;
            }
            Err(e) => {
                last = format!("{url}: {e}");
                continue;
            }
        };
        let gz = res.bytes().await.map_err(|e| format!("{url}: {e}"))?;
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(&gz[..]), &mut bytes)
            .map_err(|e| format!("{url}: not gzip: {e}"))?;
        Reader::from_source(&bytes[..]).map_err(|e| format!("{url}: not a valid mmdb: {e}"))?;
        if let Some(dir) = dest.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let tmp = dest.with_extension("mmdb.tmp");
        std::fs::write(&tmp, &bytes).map_err(|e| format!("{}: {e}", tmp.display()))?;
        std::fs::rename(&tmp, dest).map_err(|e| format!("{}: {e}", dest.display()))?;
        return Ok(bytes);
    }
    Err(last)
}

/// 還沒裝過就先讀已經有的那份；沒有或太舊、而且允許下載就重抓。回傳這一輪有沒有裝上資料庫
async fn refresh(
    http: &reqwest::Client,
    base: &str,
    path: &Path,
    allow_download: bool,
    loaded: bool,
) -> bool {
    let fresh = age_days(path).is_some_and(|d| d < MAX_AGE_DAYS);
    // 舊的也先裝上：重抓失敗的話，上個月的資料總比沒有好
    let mut installed = false;
    if !loaded && let Ok(bytes) = std::fs::read(path) {
        match install(bytes) {
            Ok(()) => installed = true,
            Err(e) => tracing::warn!("[geo] {}: {e}", path.display()),
        }
    }
    if fresh || !allow_download {
        return installed;
    }
    match download(http, base, chrono::Local::now().date_naive(), path).await {
        Ok(bytes) => match install(bytes) {
            Ok(()) => {
                tracing::info!("[geo] country database updated: {}", path.display());
                true
            }
            Err(e) => {
                tracing::warn!("[geo] {e}");
                installed
            }
        },
        Err(e) => {
            tracing::warn!("[geo] download failed, keeping what we have until the next try: {e}");
            installed
        }
    }
}

/// 開機讀檔、之後每天看一次要不要重抓
pub fn spawn(state: &AppState) -> JoinHandle<()> {
    let http = state.http.clone();
    let path = db_path();
    let allow = !matches!(std::env::var("GEOIP_DOWNLOAD").as_deref(), Ok("0" | "false" | "FALSE"));
    tokio::spawn(async move {
        let mut loaded = false;
        loop {
            loaded |= refresh(&http, BASE_URL, &path, allow, loaded).await;
            tokio::time::sleep(CHECK_EVERY).await;
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::path as at;
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn 先試這個月再試上個月_一月的上個月是去年十二月() {
        assert_eq!(months(day(2026, 11, 1)), ["2026-11", "2026-10"]);
        assert_eq!(months(day(2027, 1, 3)), ["2027-01", "2026-12"]);
    }

    #[test]
    fn 沒有檔案就沒有年紀() {
        assert_eq!(age_days(Path::new("/nonexistent/geo.mmdb")), None);
    }

    #[test]
    fn 不是_mmdb_的位元組不會換掉原本那份() {
        assert!(install(b"not a database".to_vec()).is_err());
    }

    #[test]
    fn 資料庫沒載好時查不到國家而不是出錯() {
        // 其他測試不會裝上合法的資料庫，這裡永遠是空的
        assert_eq!(country("8.8.8.8".parse().unwrap()), None);
    }

    fn gz(bytes: &[u8]) -> Vec<u8> {
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        std::io::Write::write_all(&mut enc, bytes).unwrap();
        enc.finish().unwrap()
    }

    #[tokio::test]
    async fn 這個月還沒發布就抓上個月_內容不對就不寫檔() {
        let server = MockServer::start().await;
        Mock::given(at("/dbip-country-lite-2026-11.mmdb.gz"))
            .respond_with(ResponseTemplate::new(404))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(at("/dbip-country-lite-2026-10.mmdb.gz"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(gz(b"garbage")))
            .expect(1)
            .mount(&server)
            .await;
        let dir = std::env::temp_dir().join(format!("geo-test-{}", std::process::id()));
        let dest = dir.join("geo.mmdb");
        let err =
            download(&reqwest::Client::new(), &server.uri(), day(2026, 11, 1), &dest).await.unwrap_err();
        assert!(err.contains("2026-10") && err.contains("mmdb"), "{err}");
        assert!(!dest.exists(), "壞掉的檔案不該寫下去");
    }

    #[tokio::test]
    async fn 兩個月都抓不到時回最後一個錯誤() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(503))
            .expect(2)
            .mount(&server)
            .await;
        let dest = std::env::temp_dir().join("geo-test-none/geo.mmdb");
        let err =
            download(&reqwest::Client::new(), &server.uri(), day(2026, 11, 1), &dest).await.unwrap_err();
        assert!(err.contains("2026-10") && err.contains("503"), "{err}");
    }

    #[tokio::test]
    async fn 不准下載而且沒有檔案時什麼都不做() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(200))
            .expect(0)
            .mount(&server)
            .await;
        let path = Path::new("/nonexistent/geo.mmdb");
        assert!(!refresh(&reqwest::Client::new(), &server.uri(), path, false, false).await);
    }

    #[tokio::test]
    async fn 檔案太舊或沒有而且允許下載時會去抓() {
        let server = MockServer::start().await;
        Mock::given(wiremock::matchers::any())
            .respond_with(ResponseTemplate::new(404))
            .expect(2)
            .mount(&server)
            .await;
        let path = Path::new("/nonexistent/geo.mmdb");
        assert!(!refresh(&reqwest::Client::new(), &server.uri(), path, true, false).await);
    }
}
