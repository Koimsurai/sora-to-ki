//! 背景同步 worker 的共同骨架：開關 → 首跑延遲 → 無限迴圈 { 做一輪；睡一個週期 }。
//!
//! Simkl、動畫瘋、國圖 ISBN 三支 worker 原本各寫一份，差別只在環境變數名與兩個秒數。
//! 各自的預設值與理由仍留在各自的檔案裡，這裡只管形狀。

use std::future::Future;
use std::time::Duration;

use tokio::task::JoinHandle;

use crate::state::AppState;

/// `ENABLE_*_SYNC` 的解讀：只認 `1` 與 `true`（不分大小寫）。**預設關閉**——
/// 忘了設 env 的後果應該是「不跑」，而不是「偷偷開始打上游」。
///
/// 抽成純函式是為了測得到：worker 本身先睡一段才開始，從外面觀察不到，但判斷錯的後果
/// 很具體——同步靜靜地再也不跑，資料只是停在最後一次，沒有任何錯誤訊息。
pub fn enabled(raw: Option<&str>) -> bool {
    raw.is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

/// 秒數設定的解讀：沒設、空字串、壞值一律退回 `default`（不是 0——週期變 0 就是瘋狂輪詢）。
pub fn secs_or(raw: Option<&str>, default: u64) -> u64 {
    raw.and_then(|v| v.parse().ok()).unwrap_or(default)
}

/// [`secs_or`] 的環境變數版。
pub fn env_secs(key: &str, default: u64) -> u64 {
    secs_or(std::env::var(key).ok().as_deref(), default)
}

/// 開關關著的時候，多久回來看一次有沒有被打開
const IDLE_CHECK_SECS: u64 = 60;

/// 先睡 `delay_secs`，之後每一輪：`enable_var` 開著就做 `work`、睡 `period_secs`；
/// 關著就什麼都不做，過一分鐘再看。
///
/// 開關每一輪都重新讀（[`crate::integrations::sync_on`]），所以站長在後台打開或關掉同步，
/// 不用重開後端就生效。關著的時候絕對不呼叫 `work`：沒設定卻自己開始打上游，比不跑更糟。
pub fn spawn_periodic<F, Fut>(
    state: AppState,
    tag: &str,
    enable_var: &'static str,
    delay_secs: u64,
    period_secs: u64,
    work: F,
) -> JoinHandle<()>
where
    F: Fn(AppState) -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send,
{
    let tag = tag.to_string();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(delay_secs)).await;
        let mut was_on = None;
        loop {
            let on = crate::integrations::sync_on(enable_var);
            if was_on != Some(on) {
                if on {
                    tracing::info!("[{tag}] sync on");
                } else {
                    tracing::info!("[{tag}] sync off ({enable_var})");
                }
                was_on = Some(on);
            }
            if on {
                work(state.clone()).await;
                tokio::time::sleep(Duration::from_secs(period_secs)).await;
            } else {
                tokio::time::sleep(Duration::from_secs(IDLE_CHECK_SECS)).await;
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 啟用判斷_預設關閉_只認_1_與_true() {
        assert!(!enabled(None));
        assert!(!enabled(Some("")));
        assert!(!enabled(Some("0")));
        assert!(!enabled(Some("yes")));
        assert!(enabled(Some("1")));
        assert!(enabled(Some("true")));
        assert!(enabled(Some("TRUE")), "大小寫不該影響");
        assert!(enabled(Some("True")));
    }

    /// 關著的時候一輪都不做；打開之後下一次檢查就開始做，不用重開
    #[tokio::test]
    async fn 開關關著不做_打開之後就開始做() {
        use std::sync::atomic::{AtomicU32, Ordering};
        static RUNS: AtomicU32 = AtomicU32::new(0);
        const VAR: &str = "SORA_TEST_WORKER_SYNC";
        crate::integrations::set_for_test(VAR, Some("0"));
        // 先建好 state 再暫停時間：連資料庫的逾時也是 tokio 的時鐘，暫停中會被快轉成逾時
        let state = crate::state::test_state().await;
        tokio::time::pause();
        let handle = spawn_periodic(state, "test", VAR, 5, 3600, |_| async {
            RUNS.fetch_add(1, Ordering::SeqCst);
        });
        tokio::time::sleep(Duration::from_secs(5 + IDLE_CHECK_SECS * 3)).await;
        assert_eq!(RUNS.load(Ordering::SeqCst), 0, "關著的時候不能打上游");

        crate::integrations::set_for_test(VAR, Some("1"));
        tokio::time::sleep(Duration::from_secs(IDLE_CHECK_SECS + 1)).await;
        assert_eq!(RUNS.load(Ordering::SeqCst), 1, "打開後一分鐘內要跑第一輪");
        tokio::time::sleep(Duration::from_secs(3600)).await;
        assert_eq!(RUNS.load(Ordering::SeqCst), 2, "之後照週期跑");
        handle.abort();
    }

    #[test]
    fn 秒數壞值退回預設而不是_0() {
        assert_eq!(secs_or(None, 30), 30);
        assert_eq!(secs_or(Some(""), 30), 30, "空字串當成沒設");
        assert_eq!(secs_or(Some("not-a-number"), 30), 30);
        assert_eq!(secs_or(Some("-5"), 30), 30, "負數不是合法秒數");
        assert_eq!(secs_or(Some("900"), 30), 900);
    }
}
