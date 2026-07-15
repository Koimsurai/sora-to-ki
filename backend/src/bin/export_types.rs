//! Rust struct → TypeScript 型別（packages/api-types）。
//! 用法：`cargo run --bin export_types`（backend/ 下）。
//! P4 起手：先收已 typed 的端點 struct；動態 JSON 端點待 typed 化後逐步 register。

use koimsurai_web_backend::handlers::admin::{AdminCategoryRow, AdminTagRow, AdminUserRow, AdminUsersResponse};
use specta_typescript::Typescript;

fn main() {
    let types = specta::Types::default()
        .register::<AdminTagRow>()
        .register::<AdminCategoryRow>()
        .register::<AdminUserRow>()
        .register::<AdminUsersResponse>();
    Typescript::default()
        .header("// 由 backend `cargo run --bin export_types` 產生 — 勿手改\n")
        .export_to("../packages/api-types/index.ts", &types, specta_serde::Format)
        .expect("export types");
    println!("exported → packages/api-types/index.ts");
}
