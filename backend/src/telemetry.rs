//! tracing 事件怎麼送進 Sentry（GlitchTip）。放在 lib 而不是 main.rs，是為了測得到：
//! 這條管線壞掉時沒有任何症狀，只會讓錯誤列表安靜下來（見 tests/telemetry.rs）。
//!
//! 每個層級走哪幾條路：
//!   ERROR  → Event（成為 issue）+ Log
//!   WARN   → Breadcrumb（附在下一個 issue 上）+ Log
//!   INFO   → 只有 Log
//!   DEBUG/TRACE → 丟掉。這兩級在正式環境是 request 級別的雜訊，
//!                 全送的話 Postgres 會被灌爆而且沒有對應的價值。
//!
//! ⚠️ WARN 刻意**不**變成 Event。link_preview 抓不到、manage_tags 失敗這類
//!   日常雜訊每天都有，變成 issue 的話列表會被淹掉——而列表一旦沒人看，
//!   真的出事時也就沒人看。
//!
//! 不裝 SpanLayer：traces 在 main.rs 的 init_sentry 刻意關掉了，span 送不出去。
//! sentry-tracing 0.49.5 起舊的合體層（`sentry_tracing::layer` + `EventFilter`）deprecated，
//! 官方的遷移寫法就是一個層級一層、各自掛過濾。

use tracing::{Level, Subscriber};
use tracing_subscriber::{
    Layer,
    filter::{LevelFilter, filter_fn},
    registry::LookupSpan,
};

/// 掛在 registry 上的 Sentry 那幾層
pub fn sentry_layers<S>() -> impl Layer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    // 麵包屑要排在錯誤前面：同一個事件兩層都收時，麵包屑才會帶進那個 issue（目前 ERROR 不當麵包屑，順序不影響）
    sentry_tracing::BreadcrumbLayer::new()
        .with_filter(filter_fn(|md| *md.level() == Level::WARN))
        .and_then(sentry_tracing::ErrorLayer::new().with_filter(LevelFilter::ERROR))
        .and_then(sentry_tracing::LogLayer::new().with_filter(LevelFilter::INFO))
}
