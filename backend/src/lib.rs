//! lib target：給 `bin/export_types.rs`（specta 型別匯出）取用 handlers 的 struct。
//! 服務入口仍在 main.rs。
pub mod auth;
pub mod error;
pub mod handlers;
pub mod proxy;
pub mod revalidate;
pub mod state;
pub mod util;
