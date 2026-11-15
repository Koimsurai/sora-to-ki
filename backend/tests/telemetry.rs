//! 送往 Sentry 的分流（src/telemetry.rs）。這條管線壞掉時正式環境沒有任何症狀，
//! 只會讓 GlitchTip 安靜下來，所以用測試守：ERROR 是 issue、WARN 是附在 issue 上的麵包屑、INFO 兩者都不是。

use tracing_subscriber::prelude::*;

#[test]
fn error_成為_issue_warn_是麵包屑_info_都不是() {
    let events = sentry::test::with_captured_events(|| {
        let subscriber =
            tracing_subscriber::registry().with(koimsurai_web_backend::telemetry::sentry_layers());
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("資訊不該出現");
            tracing::warn!("警告當麵包屑");
            tracing::error!("錯誤成為 issue");
        });
    });

    assert_eq!(events.len(), 1, "只有 ERROR 會變成 issue：{events:#?}");
    let event = format!("{:?}", events[0]);
    assert!(event.contains("錯誤成為 issue"), "issue 帶著錯誤訊息：{event}");

    let crumbs: Vec<_> = events[0].breadcrumbs.iter().filter_map(|b| b.message.clone()).collect();
    assert_eq!(crumbs, vec!["警告當麵包屑".to_string()], "只有 WARN 當麵包屑，INFO 不算");
}

#[test]
fn warn_與_info_不會單獨變成_issue() {
    let events = sentry::test::with_captured_events(|| {
        let subscriber =
            tracing_subscriber::registry().with(koimsurai_web_backend::telemetry::sentry_layers());
        tracing::subscriber::with_default(subscriber, || {
            tracing::warn!("連結預覽抓不到");
            tracing::info!("一般資訊");
            tracing::debug!("除錯");
        });
    });
    assert!(events.is_empty(), "WARN 以下都不該開 issue：{events:#?}");
}
