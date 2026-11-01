//! 收藏來源的設定：金鑰與同步開關。
//!
//! 站長在後台（收藏 → 來源）填的存在 `integration_settings`，名字就是對應的環境變數名。
//! 讀的時候**這裡有的優先，沒有的看環境變數**：原本寫在 `.env.backend` 的站不用搬，照樣能用。
//! 各整合讀設定一律走 [`var`]，不直接 `std::env::var`——不然後台改了不會生效。
//!
//! 值放在記憶體一份（開機讀一次，後台改的時候順手更新），讀取不碰資料庫：
//! 同步 worker 每一輪、每個讀者的請求都會讀。

use std::collections::HashMap;
use std::sync::LazyLock;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// 一個來源要填的一格
pub struct Field {
    /// 環境變數名，也是資料庫裡的 key
    pub env: &'static str,
    /// 密碼、token 這類：後台只說「有沒有填」，連末幾碼都不給
    pub secret: bool,
    /// 沒填也能用（例如 Google Books 的 key 只是提高額度）
    pub optional: bool,
}

/// 收藏的一個來源
pub struct Source {
    pub key: &'static str,
    pub fields: &'static [Field],
    /// 有背景同步的話，開關的環境變數名（`ENABLE_*_SYNC`）
    pub sync: Option<&'static str>,
}

const fn field(env: &'static str) -> Field {
    Field { env, secret: false, optional: false }
}

const fn secret(env: &'static str) -> Field {
    Field { env, secret: true, optional: false }
}

/// 後台列出來的順序就是這裡的順序（前端再依「在看、在讀…」分組）
pub const SOURCES: &[Source] = &[
    Source { key: "tmdb", fields: &[secret("TMDB_API_TOKEN")], sync: None },
    Source {
        key: "simkl",
        fields: &[field("SIMKL_CLIENT_ID"), secret("SIMKL_ACCESS_TOKEN")],
        sync: Some("ENABLE_SIMKL_SYNC"),
    },
    Source {
        key: "bahamut",
        fields: &[field("BAHAMUT_UID"), secret("BAHAMUT_PASSWORD")],
        sync: Some("ENABLE_BAHAMUT_SYNC"),
    },
    Source {
        key: "bangumi",
        fields: &[field("BANGUMI_USERNAME"), Field { env: "BANGUMI_TOKEN", secret: true, optional: true }],
        sync: Some("ENABLE_BANGUMI_SYNC"),
    },
    Source { key: "anilist", fields: &[field("ANILIST_USERNAME")], sync: Some("ENABLE_ANILIST_SYNC") },
    Source {
        key: "mal",
        fields: &[field("MAL_USERNAME"), field("MAL_CLIENT_ID")],
        sync: Some("ENABLE_MAL_SYNC"),
    },
    Source {
        key: "letterboxd",
        fields: &[field("LETTERBOXD_USERNAME")],
        sync: Some("ENABLE_LETTERBOXD_SYNC"),
    },
    Source {
        key: "googleBooks",
        fields: &[Field { env: "GOOGLE_BOOKS_API_KEY", secret: true, optional: true }],
        sync: None,
    },
    Source { key: "ncl", fields: &[], sync: Some("ENABLE_TW_ISBN_SYNC") },
    Source { key: "nlk", fields: &[secret("NLK_API_KEY")], sync: None },
    Source {
        key: "neodb",
        fields: &[secret("NEODB_TOKEN"), Field { env: "NEODB_URL", secret: false, optional: true }],
        sync: Some("ENABLE_NEODB_SYNC"),
    },
    Source {
        key: "spotify",
        fields: &[
            field("SPOTIFY_CLIENT_ID"),
            secret("SPOTIFY_CLIENT_SECRET"),
            secret("SPOTIFY_REFRESH_TOKEN"),
        ],
        sync: None,
    },
    Source { key: "lastfm", fields: &[field("LASTFM_USERNAME"), secret("LASTFM_API_KEY")], sync: None },
    Source { key: "listenbrainz", fields: &[field("LISTENBRAINZ_USERNAME")], sync: None },
    Source { key: "steam", fields: &[secret("STEAM_API_KEY"), field("STEAM_ID")], sync: None },
    Source { key: "wakatime", fields: &[secret("WAKATIME_API_KEY")], sync: None },
];

pub fn source(key: &str) -> Option<&'static Source> {
    SOURCES.iter().find(|s| s.key == key)
}

static VALUES: LazyLock<RwLock<HashMap<String, String>>> = LazyLock::new(|| RwLock::new(HashMap::new()));

/// 某個設定的值：後台填的優先，沒有就看環境變數。空字串視同沒設
pub fn var(name: &str) -> Option<String> {
    stored(name).or_else(|| std::env::var(name).ok().filter(|v| !v.trim().is_empty()))
}

/// 只看後台填的那份
pub fn stored(name: &str) -> Option<String> {
    VALUES.read().get(name).cloned()
}

/// 某個 `ENABLE_*_SYNC` 現在是不是開著（規則見 [`crate::worker::enabled`]）
pub fn sync_on(enable_var: &str) -> bool {
    crate::worker::enabled(var(enable_var).as_deref())
}

/// 開機讀一次放進記憶體
pub async fn load(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT name, value FROM integration_settings").fetch_all(pool).await?;
    *VALUES.write() = rows.into_iter().collect();
    Ok(())
}

/// 寫一格；`None` 是清掉（之後退回環境變數）
pub async fn set(pool: &SqlitePool, name: &str, value: Option<&str>) -> Result<(), sqlx::Error> {
    if let Some(v) = value {
        sqlx::query(
            "INSERT INTO integration_settings (name, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) \
             ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(name)
        .bind(v)
        .execute(pool)
        .await?;
        VALUES.write().insert(name.to_string(), v.to_string());
    } else {
        sqlx::query("DELETE FROM integration_settings WHERE name = ?").bind(name).execute(pool).await?;
        VALUES.write().remove(name);
    }
    Ok(())
}

/// 測試用：直接放進記憶體，不碰資料庫
#[cfg(test)]
pub fn set_for_test(name: &str, value: Option<&str>) {
    match value {
        Some(v) => VALUES.write().insert(name.to_string(), v.to_string()),
        None => VALUES.write().remove(name),
    };
}

// ── 同步的結果 ──────────────────────────────────────────────────

/// 某個來源最近一次同步的結果，存在 `sync_state` 的 `source:<key>`
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct SyncRecord {
    /// UTC，`YYYY-MM-DD HH:MM:SS`
    pub at: String,
    pub ok: bool,
    /// 這一輪新寫進來幾筆
    #[specta(optional)]
    pub count: Option<u32>,
    /// 失敗的理由（英文，給站長看的診斷）
    #[specta(optional)]
    pub error: Option<String>,
}

fn record_key(source: &str) -> String {
    format!("source:{source}")
}

/// 記下一輪同步的結果。寫失敗只記 log：同步本身已經做完了，不能因為記不下來就當它沒做
pub async fn record(pool: &SqlitePool, source: &str, result: Result<u32, String>) {
    let at = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let rec = match result {
        Ok(n) => SyncRecord { at, ok: true, count: Some(n), error: None },
        Err(e) => SyncRecord { at, ok: false, count: None, error: Some(e) },
    };
    let Ok(json) = serde_json::to_string(&rec) else { return };
    let saved = sqlx::query(
        "INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(record_key(source))
    .bind(json)
    .execute(pool)
    .await;
    if let Err(e) = saved {
        tracing::warn!("[{source}] couldn't save the sync result: {e}");
    }
}

pub async fn last_record(pool: &SqlitePool, source: &str) -> Option<SyncRecord> {
    let row: Option<(Option<String>,)> = sqlx::query_as("SELECT value FROM sync_state WHERE key = ?")
        .bind(record_key(source))
        .fetch_optional(pool)
        .await
        .ok()?;
    serde_json::from_str(row?.0.as_deref()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 後台填的優先_清掉就退回環境變數() {
        // nextest 每個測試各自一個行程，改環境變數不會影響別的測試
        unsafe { std::env::set_var("SORA_TEST_KEY", "from-env") };
        assert_eq!(var("SORA_TEST_KEY").as_deref(), Some("from-env"));
        set_for_test("SORA_TEST_KEY", Some("from-admin"));
        assert_eq!(var("SORA_TEST_KEY").as_deref(), Some("from-admin"));
        set_for_test("SORA_TEST_KEY", None);
        assert_eq!(var("SORA_TEST_KEY").as_deref(), Some("from-env"));
    }

    #[test]
    fn 環境變數是空白也算沒設() {
        unsafe { std::env::set_var("SORA_TEST_BLANK", "  ") };
        assert_eq!(var("SORA_TEST_BLANK"), None);
    }

    #[test]
    fn 後台關掉同步_蓋過環境變數的開() {
        unsafe { std::env::set_var("SORA_TEST_SYNC", "1") };
        assert!(sync_on("SORA_TEST_SYNC"));
        set_for_test("SORA_TEST_SYNC", Some("0"));
        assert!(!sync_on("SORA_TEST_SYNC"));
    }

    #[test]
    fn 來源的_key_不重複_每一格環境變數名不重複() {
        let mut keys: Vec<_> = SOURCES.iter().map(|s| s.key).collect();
        let mut envs: Vec<_> =
            SOURCES.iter().flat_map(|s| s.fields.iter().map(|f| f.env).chain(s.sync)).collect();
        let (k, e) = (keys.len(), envs.len());
        keys.sort_unstable();
        keys.dedup();
        envs.sort_unstable();
        envs.dedup();
        assert_eq!((keys.len(), envs.len()), (k, e));
    }
}
