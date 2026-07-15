# specta 型別遷移計畫（P4 收尾）

> 給下一個 session 的 handoff。前置閱讀：`STRANGLER.md`（遷移史）、本檔。
> 現況：管線已通（`cargo run --bin export_types` → `packages/api-types/index.ts` →
> 前端 `@koimsurai/api-types` workspace import）。首例 UsersManager 已完成，
> tsc 第一天就抓到 avatar/avatar_url 漂移 bug。

## 目標與驗收

- 前端**所有** API 回應型別來自 `@koimsurai/api-types`，手寫 interface 歸零。
- 驗收（MIGRATION_PLAN P4 原文）：改一個 Rust struct → 前端 `tsc` 抓到不一致。

## 🔑 方法論轉變（最重要的一段）

P3 時代的鐵則「byte-identical 對拍 Express」**已失效**——Express 死了。新原則：

1. **回應 JSON「形狀」不能變**（前端相容），但**建構方式可以自由重構**
   （`row_to_json`/`Map` spread → typed struct + `Json(T)`）。
2. 驗證方式改為**自我回歸快照**：改前先抓該端點的線上回應存檔，typed 化後
   對拍自己（`cmp` 或 jq 語意比對）。serde_json `preserve_order` 仍開著，
   struct 欄位序 = JSON key 序，照舊回應的 key 序排欄位即可對齊。
3. JS 語意包袱可逐步卸下：`js_normalize_numbers`（100.0→100）在 typed struct
   下自然消失（i64 欄位本來就輸出整數）；REAL 欄位注意 f64 序列化差異
   （4.0 vs 4 —— 若舊回應是 4，欄位用 `#[serde(serialize_with)]` 或轉 i64/自訂）。

## 施工模式（每端點 15–60 分鐘）

1. 抓快照：`curl :3002/api/xxx > snap.json`
2. 後端：定義 struct（欄位序=快照 key 序）、`derive(Serialize, FromRow, specta::Type)`、
   handler 改回 `Json(T)`；i64 → `#[specta(type = specta_typescript::Number)]`、
   `Option<i64>` → `#[specta(type = Option<specta_typescript::Number>)]`
3. `export_types` 的 register 清單加新 struct → 重生 index.ts
4. 前端：刪手寫 interface → import 生成型別 → 修 tsc 報錯（每個報錯都可能是真漂移，
   像 avatar bug——別無腦 cast）
5. 回歸：`curl` 新回應 vs 快照 `cmp`；`cargo test`、`pnpm exec tsc --noEmit`
6. 部署驗證照使用者 workflow：`docker compose build backend-rs && up -d`，不開 dev server

## 現況盤點（動態 JSON 密度，由重到輕）

| handler | 動態點 | 備註 |
|---|---|---|
| watch.rs | 9 | favorites/now/tmdb 快取 payload——TMDb 透傳部分可用 `Value` 欄位保留（透傳不 typed） |
| admin.rs | 8 | posts/comments 分頁的 `p.*` spread 是最大戶：posts 表 30+ 欄（含 12 i18n 欄）——**建一個 `PostRow` 大 struct 一勞永逸**，posts.rs/admin.rs 共用 |
| books.rs | 5 | REAL rating 欄位注意 4.0 vs 4（見上） |
| posts.rs | 4 | 同 PostRow 案 |
| collection.rs | 4 | 白名單欄位已定 14 欄，struct 化順手 |
| gallery.rs | 3 | manifest 是檔案透傳，**保持 Value**（形狀由檔案定，不 typed） |
| spotify/oauth/newsletter/thoughts/quote/bahamut | 1–2 | 小額收尾 |

**明確不 typed（保持 Value）**：第三方透傳（steam/github/wakatime/TMDb 原樣轉發）、
gallery manifest、`/api/quote/daily` 的外部名言。specta 只管「自己擁有形狀」的回應。

## 建議順序

1. `PostRow`（posts+admin 共用，收益最大、消掉 row_to_json 最大戶）
2. thoughts / books / collection（中型、模式重複）
3. watch favorites / newsletter / oauth user（小型）
4. 前端逐組件換 import（每換一個跑 tsc，把漂移修光）
5. 全清後：刪 `util::row_to_json` + `js_normalize_numbers`（若無人用）、
   export_types register 全量化、README 補型別管線說明

## 坑清單（已踩過的）

- specta 禁 i64 直出（BigInt 精度防呆）→ 必用 `Number` 覆寫；`Option<i64>` 要
  `Option<Number>` 否則 `| null` 被蓋掉
- `export_types` 需要 lib target（已建 `src/lib.rs`）；新 struct 要 `pub`
- serde_json `float_roundtrip`/`preserve_order` feature 不能拿掉（gallery manifest
  等透傳路徑仍依賴）
- 前端 `string | null` vs `string | undefined`：生成型別是 `| null`（serde 語意），
  組件裡 `?? undefined` 橋接（見 UsersManager 首例）
