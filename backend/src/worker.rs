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

/// `enable_var` 開著才 spawn；先睡 `delay_secs`，之後每輪 `work` 跑完睡 `period_secs`。
///
/// 回傳 handle 的理由是**可觀察**：spawn 之後 task 先睡一段，從外面完全看不出到底有沒有
/// 啟動。`cargo mutants` 因此可以把整個函式換成 no-op、或把開關判斷顛倒，都沒有測試會紅
/// ——後果分別是「同步永遠不跑」與「沒設定卻自己開始打上游」。呼叫端（main.rs）照舊忽略它。
pub fn spawn_periodic<F, Fut>(
    state: AppState,
    tag: &str,
    enable_var: &str,
    delay_secs: u64,
    period_secs: u64,
    work: F,
) -> Option<JoinHandle<()>>
where
    F: Fn(AppState) -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send,
{
    if !enabled(std::env::var(enable_var).ok().as_deref()) {
        tracing::info!("[{tag}] sync worker disabled ({enable_var} unset)");
        return None;
    }
    Some(tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(delay_secs)).await;
        loop {
            work(state.clone()).await;
            tokio::time::sleep(Duration::from_secs(period_secs)).await;
        }
    }))
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

    #[test]
    fn 秒數壞值退回預設而不是_0() {
        assert_eq!(secs_or(None, 30), 30);
        assert_eq!(secs_or(Some(""), 30), 30, "空字串當成沒設");
        assert_eq!(secs_or(Some("not-a-number"), 30), 30);
        assert_eq!(secs_or(Some("-5"), 30), 30, "負數不是合法秒數");
        assert_eq!(secs_or(Some("900"), 30), 900);
    }
}
