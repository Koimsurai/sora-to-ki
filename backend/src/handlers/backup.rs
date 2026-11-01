//! 備份與還原（搬家用）：後台下載一份資料庫快照、上傳一份蓋回去。
//!
//! 下載：`VACUUM INTO` 做一份一致的快照（不擋寫入，跟每日備份的 sidecar 同一個做法），gzip 後送出。
//!
//! 還原分兩步，因為正在用的資料庫不能在連線開著的時候換掉：
//! 1. 上傳的檔案（每日備份的 `.sqlite.gz`，或直接一個 `.sqlite`）串流寫到資料庫旁邊，解壓、檢查
//!    （是 SQLite、完整、看得到站台設定、版本不比這支程式新），放成 `restore-pending.sqlite`，然後後端自己結束
//! 2. 容器重開（`restart: unless-stopped`），開機時 [`apply_pending`] 把現在的資料庫改名留著
//!    （`db.sqlite.before-restore-<時間>`），把待還原的那份換上去，再照常跑 migrations
//!
//! 上傳的圖片與照片不在資料庫裡，要另外搬資料夾；後台與精靈的畫面都會講。

use std::path::{Path, PathBuf};

use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::auth::OwnerAuth;
use crate::error::Problem;
use crate::state::AppState;

const PENDING: &str = "restore-pending.sqlite";
/// 上傳的上限：解壓前 1 GB（站的資料庫通常幾十 MB）
pub const MAX_UPLOAD: usize = 1024 * 1024 * 1024;

/// `DATABASE_URL`（`sqlite:///path/db.sqlite?mode=rwc` 這類）→ 檔案路徑。記憶體資料庫回 `None`
pub fn db_file(database_url: &str) -> Option<PathBuf> {
    let rest = database_url.strip_prefix("sqlite://").or_else(|| database_url.strip_prefix("sqlite:"))?;
    let path = rest.split('?').next()?;
    (!path.is_empty() && !path.contains(":memory:")).then(|| PathBuf::from(path))
}

fn pending_file(db: &Path) -> PathBuf {
    db.with_file_name(PENDING)
}

/// 開機時、連資料庫之前呼叫：有待還原的那份就換上去。回傳換了沒有
pub fn apply_pending(database_url: &str) -> std::io::Result<bool> {
    let Some(db) = db_file(database_url) else { return Ok(false) };
    let pending = pending_file(&db);
    if !pending.exists() {
        return Ok(false);
    }
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    // 現在這份（連同 WAL 與 shm）改名留著，還原錯了還能換回來
    for suffix in ["", "-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", db.display()));
        if from.exists() {
            std::fs::rename(&from, format!("{}.before-restore-{stamp}{suffix}", db.display()))?;
        }
    }
    std::fs::rename(&pending, &db)?;
    Ok(true)
}

/// 理由也放進 `params.error`：後台的翻譯是「這份備份不能用：{{error}}」，理由本身是英文的診斷
fn bad(code: &'static str, why: impl Into<String>) -> Response {
    let why = why.into();
    Problem::new(code, why.clone()).param("error", why).respond(StatusCode::BAD_REQUEST)
}

/// 上傳的那份能不能用：SQLite、完整、有站台設定、migration 版本不比這支程式新
async fn check(path: &Path) -> Result<(), String> {
    let mut head = [0u8; 16];
    let mut f = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    tokio::io::AsyncReadExt::read_exact(&mut f, &mut head)
        .await
        .map_err(|_| "The file is too small".to_string())?;
    if &head != b"SQLite format 3\0" {
        return Err("This isn't a SQLite database (or a .sqlite.gz backup)".into());
    }
    // immutable：不上鎖、不建 -wal/-shm。只用 read_only 打開 WAL 模式的檔會在旁邊留下兩個檔，
    // 改名成待換的那份之後就跟它對不上了
    let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(path).immutable(true);
    let mut conn = sqlx::ConnectOptions::connect(&opts).await.map_err(|e| e.to_string())?;
    let verdict = inspect(&mut conn).await;
    let _ = sqlx::Connection::close(conn).await;
    verdict
}

async fn inspect(conn: &mut sqlx::SqliteConnection) -> Result<(), String> {
    let (ok,): (String,) =
        sqlx::query_as("PRAGMA quick_check").fetch_one(&mut *conn).await.map_err(|e| e.to_string())?;
    if ok != "ok" {
        return Err(format!("The database is damaged: {ok}"));
    }
    let has = |table: &'static str| {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
            .bind(table)
    };
    if has("site_settings").fetch_one(&mut *conn).await.unwrap_or(0) == 0
        || has("_sqlx_migrations").fetch_one(&mut *conn).await.unwrap_or(0) == 0
    {
        return Err("This isn't a sora-to-ki database".into());
    }
    let newest: Option<i64> = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(None);
    let ours = sqlx::migrate!("./migrations").iter().map(|m| m.version).max().unwrap_or(0);
    if newest.unwrap_or(0) > ours {
        return Err("This backup comes from a newer version; upgrade this site first".into());
    }
    Ok(())
}

/// 把上傳的內容串流寫到 `dest`；gzip 的話邊寫邊解。回傳寫了多少位元組
async fn save(body: Body, dest: &Path) -> Result<u64, String> {
    let raw = dest.with_extension("upload");
    let mut out = tokio::fs::File::create(&raw).await.map_err(|e| e.to_string())?;
    let mut stream = body.into_data_stream();
    let mut total = 0usize;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The upload was cut off".to_string())?;
        total += chunk.len();
        if total > MAX_UPLOAD {
            let _ = tokio::fs::remove_file(&raw).await;
            return Err("The file is larger than 1 GB".into());
        }
        out.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    out.flush().await.map_err(|e| e.to_string())?;
    drop(out);
    // gzip 的開頭兩個位元組是 1f 8b：解到 dest；不是就直接改名
    let mut magic = [0u8; 2];
    let gz = std::fs::File::open(&raw)
        .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut magic))
        .is_ok_and(|()| magic == [0x1f, 0x8b]);
    let (raw2, dest2) = (raw.clone(), dest.to_path_buf());
    let written = tokio::task::spawn_blocking(move || -> std::io::Result<u64> {
        if gz {
            let mut decoder = flate2::read::GzDecoder::new(std::fs::File::open(&raw2)?);
            let mut target = std::fs::File::create(&dest2)?;
            let n = std::io::copy(&mut decoder, &mut target)?;
            std::fs::remove_file(&raw2)?;
            Ok(n)
        } else {
            std::fs::rename(&raw2, &dest2)?;
            Ok(std::fs::metadata(&dest2)?.len())
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Couldn't unpack the backup (is it a .sqlite.gz from the daily backup?)".to_string())?;
    Ok(written)
}

/// 收下一份還原檔：寫好、檢查過才留著，然後後端自己結束讓容器重開。測試裡不結束
async fn receive(body: Body) -> Response {
    let Some(db) = std::env::var("DATABASE_URL").ok().as_deref().and_then(db_file) else {
        return bad("restore_unavailable", "This server isn't using a database file");
    };
    let pending = pending_file(&db);
    let staging = pending.with_extension("checking");
    if let Err(e) = save(body, &staging).await {
        return bad("restore_invalid", e);
    }
    if let Err(e) = check(&staging).await {
        let _ = tokio::fs::remove_file(&staging).await;
        return bad("restore_invalid", e);
    }
    if let Err(e) = tokio::fs::rename(&staging, &pending).await {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    tracing::warn!("restore: a backup was uploaded; restarting to switch to it");
    restart_soon();
    (StatusCode::ACCEPTED, axum::Json(serde_json::json!({ "restarting": true }))).into_response()
}

#[cfg(not(test))]
fn restart_soon() {
    tokio::spawn(async {
        // 讓這個回應先送出去
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        std::process::exit(0);
    });
}

#[cfg(test)]
const fn restart_soon() {}

/// `POST /api/admin/backup/restore` —— 只有站長。body 是檔案本身（`.sqlite.gz` 或 `.sqlite`）
#[utoipa::path(post, path = "/api/admin/backup/restore", tag = "backup",
    security(("bearer" = [])),
    responses(
        (status = 202, description = "收下了，後端重開後換上去"),
        (status = 400, description = "不是能用的備份"),
        (status = 401, description = "需要登入"),
    ))]
pub async fn admin_restore(_auth: OwnerAuth, body: Body) -> Response {
    receive(body).await
}

/// `POST /api/init/restore` —— 初次設定（還沒有站長）時用設定碼還原：搬家到新機器，不必先認領
#[utoipa::path(post, path = "/api/init/restore", tag = "init",
    params(("x-setup-code" = String, Header, description = "log 裡的設定碼")),
    responses(
        (status = 202, description = "收下了，後端重開後換上去"),
        (status = 400, description = "不是能用的備份"),
        (status = 403, description = "設定碼不對，或已經有站長了"),
    ))]
pub async fn init_restore(State(state): State<AppState>, headers: HeaderMap, body: Body) -> Response {
    let code = headers.get("x-setup-code").and_then(|v| v.to_str().ok()).unwrap_or("");
    let allowed = matches!(crate::handlers::init::needed(&state.pool).await, Ok(true))
        && matches!(crate::handlers::init::verify(&state.pool, code).await, Ok(true));
    if !allowed {
        return Problem::new(
            "setup_code_wrong",
            "The setup code is wrong, or this site already has an owner",
        )
        .respond(StatusCode::FORBIDDEN);
    }
    receive(body).await
}

/// `GET /api/admin/backup` —— 下載現在的資料庫（gzip）
#[utoipa::path(get, path = "/api/admin/backup", tag = "backup",
    security(("bearer" = [])),
    responses((status = 200, description = "db-<時間>.sqlite.gz"), (status = 401, description = "需要登入")))]
pub async fn download(State(state): State<AppState>, _auth: OwnerAuth) -> Response {
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let dir = std::env::temp_dir().join(format!("sora-backup-{}-{stamp}", std::process::id()));
    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    let snap = dir.join("db.sqlite");
    // VACUUM INTO 的目的地不能已經存在（目錄是剛建的）；路徑用綁定參數帶，不拼進 SQL
    if let Err(e) =
        sqlx::query("VACUUM INTO ?").bind(snap.to_string_lossy().into_owned()).execute(&state.pool).await
    {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }
    let snap2 = snap.clone();
    let gz = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        std::io::copy(&mut std::fs::File::open(&snap2)?, &mut enc)?;
        enc.finish()
    })
    .await;
    let _ = tokio::fs::remove_dir_all(&dir).await;
    match gz {
        Ok(Ok(bytes)) => (
            [
                (header::CONTENT_TYPE, "application/gzip".to_string()),
                (header::CONTENT_DISPOSITION, format!("attachment; filename=\"db-{stamp}.sqlite.gz\"")),
                (header::CACHE_CONTROL, "no-store".to_string()),
            ],
            bytes,
        )
            .into_response(),
        Ok(Err(e)) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("backup-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).expect("建暫存目錄");
        d
    }

    #[test]
    fn 資料庫網址轉成檔案路徑() {
        assert_eq!(
            db_file("sqlite:///usr/src/app/db/db.sqlite"),
            Some(PathBuf::from("/usr/src/app/db/db.sqlite"))
        );
        assert_eq!(db_file("sqlite://./dev.sqlite?mode=rwc"), Some(PathBuf::from("./dev.sqlite")));
        assert_eq!(db_file("sqlite::memory:"), None);
        assert_eq!(db_file("postgres://x"), None);
    }

    #[test]
    fn 開機時把待還原的換上去_舊的改名留著() {
        let d = tmp("apply");
        let db = d.join("db.sqlite");
        std::fs::write(&db, b"old").expect("寫");
        std::fs::write(d.join("db.sqlite-wal"), b"wal").expect("寫");
        std::fs::write(d.join(PENDING), b"new").expect("寫");
        let url = format!("sqlite://{}", db.display());
        assert!(apply_pending(&url).expect("換得上去"));
        assert_eq!(std::fs::read(&db).expect("讀"), b"new");
        let kept: Vec<_> = std::fs::read_dir(&d)
            .expect("列")
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .filter(|n| n.contains("before-restore"))
            .collect();
        assert_eq!(kept.len(), 2, "舊的資料庫與 WAL 都留著：{kept:?}");
        assert!(!apply_pending(&url).expect("沒有待還原的"), "第二次開機什麼都不做");
    }

    /// 用真的 migrations 建一份資料庫（就是會被備份的那種）
    async fn real_db(path: &Path) {
        let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(path).create_if_missing(true);
        let pool = sqlx::SqlitePool::connect_with(opts).await.expect("連");
        sqlx::migrate!("./migrations").run(&pool).await.expect("migrations");
        pool.close().await;
    }

    #[tokio::test]
    async fn 每日備份的_gz_收得下_亂傳的檔案擋下來() {
        let d = tmp("save");
        let src = d.join("src.sqlite");
        real_db(&src).await;
        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        std::io::copy(&mut std::fs::File::open(&src).expect("開"), &mut gz).expect("壓");
        let bytes = gz.finish().expect("壓完");

        let dest = d.join("out.sqlite");
        save(Body::from(bytes), &dest).await.expect("收得下");
        check(&dest).await.expect("檢查過得了");

        let junk = d.join("junk.sqlite");
        save(Body::from("not a database"), &junk).await.expect("寫得下");
        assert!(check(&junk).await.is_err(), "不是 SQLite 要擋");

        let other = d.join("other.sqlite");
        let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(&other).create_if_missing(true);
        let pool = sqlx::SqlitePool::connect_with(opts).await.expect("連");
        sqlx::query("CREATE TABLE x (a INT)").execute(&pool).await.expect("建表");
        pool.close().await;
        assert!(check(&other).await.is_err(), "別的 SQLite 資料庫不是這個站的");
    }

    #[tokio::test]
    async fn 收下的備份放成待還原_壞的不留() {
        let d = tmp("receive");
        let db = d.join("db.sqlite");
        real_db(&db).await;
        // nextest 每個測試各自一個行程，改環境變數不會影響別的測試
        unsafe { std::env::set_var("DATABASE_URL", format!("sqlite://{}", db.display())) };

        let r = receive(Body::from("garbage")).await;
        assert_eq!(r.status(), StatusCode::BAD_REQUEST);
        assert!(!pending_file(&db).exists(), "壞的不能留下來，不然下次開機會換上去");

        let r = receive(Body::from(std::fs::read(&db).expect("讀"))).await;
        assert_eq!(r.status(), StatusCode::ACCEPTED);
        assert!(pending_file(&db).exists());
    }

    #[tokio::test]
    async fn 精靈的還原要設定碼() {
        let st = crate::state::test_state().await;
        let mut headers = HeaderMap::new();
        headers.insert("x-setup-code", "WRONG-CODE".parse().expect("header"));
        let r = init_restore(State(st), headers, Body::from("x")).await;
        assert_eq!(r.status(), StatusCode::FORBIDDEN);
    }
}
