//! 文章的「排程」與「回收桶」（2026-10 後台提案）。
//!
//! posts.status 的四種值：
//!
//! | status      | 讀者看得到 | 怎麼離開這個狀態 |
//! |---|---|---|
//! | `draft`     | 否 | 編輯器發佈／排程 |
//! | `scheduled` | 否 | 到 `publish_at` 時由 [`spawn`] 的 worker 翻成 `published` |
//! | `published` | 是 | 編輯器改回草稿、丟進回收 |
//! | `trashed`   | 否 | 還原（回到 `trashed_from`）；放滿 [`TRASH_KEEP_DAYS`] 天後 worker 真的刪掉 |
//!
//! 公開端點一律只讀 `status = 'published'`，所以新加的兩種狀態對讀者天生是看不到的——
//! 不需要在每一條公開查詢上補條件。
//!
//! 時間一律存 UTC 的 `YYYY-MM-DD HH:MM:SS`（SQLite `datetime('now')` 的寫法），
//! 跟 `created_at` 同一種格式，SQL 裡直接用字串比大小。

use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::SqlitePool;
use tokio::task::JoinHandle;

use crate::state::AppState;

/// 回收桶裡放多久才真的刪
pub const TRASH_KEEP_DAYS: i64 = 30;

/// worker 多久醒來一次。排程的精度就是這個數字：設 09:00 的文章最晚 09:01 出現
const TICK_SECS_DEFAULT: u64 = 60;

const DB_FORMAT: &str = "%Y-%m-%d %H:%M:%S";

/// 編輯器與 API 可以寫進 status 的值（`trashed` 只能透過刪除／還原進出）
pub const WRITABLE_STATUSES: &[&str] = &["draft", "published", "scheduled"];

/// 把呼叫端給的排程時間正規化成 DB 的 UTC 字串。
///
/// 收兩種寫法：
/// - RFC 3339（`2026-10-28T09:00:00+08:00`、`…Z`）——前端送的是這種，時區照它帶的換算
/// - 不帶時區的 `YYYY-MM-DD HH:MM[:SS]` 或 `YYYY-MM-DDTHH:MM[:SS]`——**當成 UTC**
///   （MCP 與腳本直接寫 DB 格式時用；不帶時區還猜當地時間，就會差八小時）
///
/// 解不出來回 `None`。
pub fn parse_publish_at(raw: &str) -> Option<String> {
    let s = raw.trim();
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc).format(DB_FORMAT).to_string());
    }
    let s = s.replacen('T', " ", 1);
    ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(&s, f).ok())
        .map(|dt| dt.format(DB_FORMAT).to_string())
}

/// 現在（UTC，DB 格式）
fn now_db() -> String {
    Utc::now().format(DB_FORMAT).to_string()
}

/// 建立／更新文章時，body 裡跟發佈時機有關的欄位解讀出來的結果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lifecycle {
    pub status: String,
    /// 只有 `scheduled` 才有值
    pub publish_at: Option<String>,
    /// 排程時勾了「發佈時推送電子報」
    pub newsletter_pending: bool,
}

/// 驗 status 與排程時間。`status` 已經是呼叫端給的字串（缺 key 由呼叫端決定預設）。
///
/// - status 不在 [`WRITABLE_STATUSES`] 裡 → 錯（`trashed` 也是：丟回收要走刪除）
/// - `scheduled` 沒給時間、時間解不出來、或時間已經過了 → 錯。
///   「過了就直接發佈」看起來體貼，但會讓一篇本來要明天發的文章因為時區寫錯而今天就出去
pub fn lifecycle(status: &str, publish_at: Option<&str>, send_newsletter: bool) -> Result<Lifecycle, String> {
    if !WRITABLE_STATUSES.contains(&status) {
        return Err(format!("無效的狀態：{status}（只能是 draft、published 或 scheduled）"));
    }
    if status != "scheduled" {
        return Ok(Lifecycle { status: status.to_string(), publish_at: None, newsletter_pending: false });
    }
    let raw = publish_at.map(str::trim).filter(|s| !s.is_empty()).ok_or("排程發佈需要 publish_at")?;
    let at = parse_publish_at(raw).ok_or_else(|| format!("看不懂的排程時間：{raw}"))?;
    if at <= now_db() {
        return Err(format!("排程時間已經過了：{at}（UTC）"));
    }
    Ok(Lifecycle { status: "scheduled".into(), publish_at: Some(at), newsletter_pending: send_newsletter })
}

/// 把 [`Lifecycle`] 寫回那篇文章的四個生命週期欄位。status 本身由呼叫端的 INSERT／UPDATE 寫。
/// 不在回收裡的文章，回收那兩欄一律清掉（例如從回收打開來直接改成草稿）。
pub async fn store_lifecycle(pool: &SqlitePool, id: i64, lc: &Lifecycle) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE posts SET publish_at = ?, newsletter_pending = ?, trashed_at = NULL, trashed_from = NULL \
         WHERE id = ? AND status <> 'trashed'",
    )
    .bind(&lc.publish_at)
    .bind(i64::from(lc.newsletter_pending))
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

/// 丟進回收。已經在回收裡的回 `Ok(false)`（不重設 trashed_at，免得延長保留期）。
pub async fn trash(pool: &SqlitePool, id: i64) -> sqlx::Result<bool> {
    let r = sqlx::query(
        "UPDATE posts SET trashed_from = status, status = 'trashed', trashed_at = datetime('now'), \
         publish_at = NULL, newsletter_pending = 0, updated_at = datetime('now') \
         WHERE id = ? AND status <> 'trashed'",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(r.rows_affected() > 0)
}

/// 從回收還原：回到丟之前的狀態。丟之前是 `scheduled` 的回到草稿——
/// 排程時間在丟的時候清掉了，還原時多半也已經過了，讓人重新決定什麼時候發。
pub async fn restore(pool: &SqlitePool, id: i64) -> sqlx::Result<Option<String>> {
    let r = sqlx::query(
        "UPDATE posts SET status = CASE WHEN trashed_from IN ('published', 'draft') THEN trashed_from ELSE 'draft' END, \
         trashed_at = NULL, trashed_from = NULL, updated_at = datetime('now') \
         WHERE id = ? AND status = 'trashed'",
    )
    .bind(id)
    .execute(pool)
    .await?;
    if r.rows_affected() == 0 {
        return Ok(None);
    }
    sqlx::query_scalar::<_, String>("SELECT status FROM posts WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// 真的刪掉一篇（連同標籤關聯）。SQLite 沒有 FK cascade，只刪 posts 會留下孤兒列，
/// 下一篇拿到同一個 id 就會莫名其妙帶著別人的標籤。
pub async fn delete_permanently(pool: &SqlitePool, id: i64) -> sqlx::Result<u64> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM post_tags WHERE post_id = ?").bind(id).execute(&mut *tx).await?;
    let r = sqlx::query("DELETE FROM posts WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(r.rows_affected())
}

/// 到期的排程翻成 `published`，回傳 `(id, 要不要寄電子報)`。
///
/// `created_at` 改成預定的時間：文章的日期是「排定發佈的那一刻」，不是寫下草稿的那天
/// （列表與 RSS 都照 created_at 排，不改的話排程的文章會插在很久以前）。
/// 逐篇帶 `AND status = 'scheduled'` 更新，同一篇不會被翻兩次、電子報不會寄兩封。
pub async fn publish_due(pool: &SqlitePool) -> sqlx::Result<Vec<(i64, bool)>> {
    let due = sqlx::query_as::<_, (i64, i64)>(
        "SELECT id, newsletter_pending FROM posts \
         WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= datetime('now') \
         ORDER BY publish_at",
    )
    .fetch_all(pool)
    .await?;
    let mut published = Vec::with_capacity(due.len());
    for (id, newsletter) in due {
        let r = sqlx::query(
            "UPDATE posts SET status = 'published', created_at = publish_at, updated_at = datetime('now'), \
             publish_at = NULL, newsletter_pending = 0 WHERE id = ? AND status = 'scheduled'",
        )
        .bind(id)
        .execute(pool)
        .await?;
        if r.rows_affected() > 0 {
            published.push((id, newsletter != 0));
        }
    }
    Ok(published)
}

/// 在回收裡放滿 `keep_days` 天的真的刪掉，回傳刪了幾篇
pub async fn purge_trash(pool: &SqlitePool, keep_days: i64) -> sqlx::Result<u64> {
    let ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM posts WHERE status = 'trashed' AND trashed_at IS NOT NULL \
         AND trashed_at <= datetime('now', printf('-%d days', ?))",
    )
    .bind(keep_days)
    .fetch_all(pool)
    .await?;
    let mut n = 0;
    for id in ids {
        n += delete_permanently(pool, id).await?;
    }
    Ok(n)
}

/// worker 的一輪：發佈到期的、寄該寄的電子報、清前端快取、倒回收。回傳發佈了幾篇
pub async fn tick(state: &AppState) -> usize {
    let published = match publish_due(&state.pool).await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[schedule] 翻排程失敗：{e}");
            Vec::new()
        }
    };
    for &(id, newsletter) in &published {
        tracing::info!("[schedule] 文章 {id} 到時間了，已發佈");
        if newsletter {
            match crate::handlers::mailer::dispatch_newsletter(state, id).await {
                Ok((sent, failed, _)) => {
                    tracing::info!("[schedule] 文章 {id} 的電子報：寄出 {sent}、失敗 {failed}");
                }
                Err(e) => tracing::warn!("[schedule] 文章 {id} 的電子報沒寄出：{e}"),
            }
        }
    }
    if !published.is_empty() {
        // 不是經過 HTTP 寫入，revalidate 的 middleware 看不到，要自己通知前端清快取
        crate::revalidate::fire().await;
    }
    match purge_trash(&state.pool, TRASH_KEEP_DAYS).await {
        Ok(0) => {}
        Ok(n) => tracing::info!("[schedule] 回收桶清掉 {n} 篇放滿 {TRASH_KEEP_DAYS} 天的文章"),
        Err(e) => tracing::error!("[schedule] 清回收桶失敗：{e}"),
    }
    published.len()
}

/// 排程 worker。**一律啟動**，不像同步 worker 要 `ENABLE_*` 開關：
/// 排程是編輯器上的功能，關掉的後果是「設好的文章永遠不會出去」，而且沒有任何錯誤訊息。
/// 週期可用 `POST_SCHEDULE_TICK_SECS` 調（測試環境縮短用）。
pub fn spawn(state: AppState) -> JoinHandle<()> {
    let period = crate::worker::env_secs("POST_SCHEDULE_TICK_SECS", TICK_SECS_DEFAULT).max(1);
    tokio::spawn(async move {
        loop {
            tick(&state).await;
            tokio::time::sleep(Duration::from_secs(period)).await;
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 排程時間_rfc3339_照它帶的時區換成_utc() {
        assert_eq!(parse_publish_at("2026-10-28T09:00:00+08:00").as_deref(), Some("2026-10-28 01:00:00"));
        assert_eq!(parse_publish_at("2026-10-28T09:00:00Z").as_deref(), Some("2026-10-28 09:00:00"));
        assert_eq!(parse_publish_at("2026-10-28T09:00:00.000Z").as_deref(), Some("2026-10-28 09:00:00"));
    }

    #[test]
    fn 排程時間_不帶時區的當成_utc() {
        assert_eq!(parse_publish_at("2026-10-28 09:00:00").as_deref(), Some("2026-10-28 09:00:00"));
        assert_eq!(parse_publish_at("2026-10-28T09:00").as_deref(), Some("2026-10-28 09:00:00"));
        assert_eq!(parse_publish_at(" 2026-10-28 09:00 ").as_deref(), Some("2026-10-28 09:00:00"));
    }

    #[test]
    fn 排程時間_解不出來回_none() {
        assert_eq!(parse_publish_at(""), None);
        assert_eq!(parse_publish_at("明天早上"), None);
        assert_eq!(parse_publish_at("2026-13-01 09:00"), None);
    }

    #[test]
    fn 狀態只收三種_回收要走刪除() {
        assert!(lifecycle("draft", None, false).is_ok());
        assert!(lifecycle("published", None, true).is_ok());
        assert!(lifecycle("trashed", None, false).is_err());
        assert!(lifecycle("", None, false).is_err());
        assert!(lifecycle("Published", None, false).is_err(), "大小寫要完全一樣，DB 裡比的是字串");
    }

    #[test]
    fn 非排程的狀態不留排程時間也不留電子報旗標() {
        let lc = lifecycle("published", Some("2099-01-01 00:00"), true).unwrap();
        assert_eq!(lc.publish_at, None);
        assert!(!lc.newsletter_pending, "直接發佈的電子報當場就寄，不留到 worker");
    }

    #[test]
    fn 排程要有未來的時間() {
        assert!(lifecycle("scheduled", None, false).unwrap_err().contains("publish_at"));
        assert!(lifecycle("scheduled", Some("  "), false).is_err());
        assert!(lifecycle("scheduled", Some("明天"), false).unwrap_err().contains("看不懂"));
        assert!(lifecycle("scheduled", Some("2000-01-01 00:00"), false).unwrap_err().contains("已經過了"));
        let lc = lifecycle("scheduled", Some("2099-01-01T08:00:00+08:00"), true).unwrap();
        assert_eq!(lc.publish_at.as_deref(), Some("2099-01-01 00:00:00"));
        assert!(lc.newsletter_pending);
    }
}
