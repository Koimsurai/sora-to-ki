# specta 型別遷移計畫（P4 收尾）

> 給下一個 session 的 handoff。前置閱讀：`STRANGLER.md`（遷移史）、本檔。
> 現況：管線已通（`cargo run --bin export_types` → `packages/api-types/index.ts` →
> 前端 `@koimsurai/api-types` workspace import）。首例 UsersManager 已完成，
> tsc 第一天就抓到 avatar/avatar_url 漂移 bug。
>
> **2026-07-17 第二批：posts 全家（公開 + admin）已 typed 化並上線。**
> 生成型別 4 → 15 個。過程中 tsc 抓到 4 個既有無聲缺陷（見下方「已抓到的漂移」）。

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

## 已抓到的漂移（型別遷移的實際產出，非理論效益）

`avatar/avatar_url`（UsersManager，首例）之外，posts 這批 tsc 又抓到 4 個——
**全部都是 build 過、HTTP 200、但功能從沒生效**的無聲缺陷：

| 缺陷 | 真相 | 修法 |
|---|---|---|
| **`allow_comments` 公開端點從沒回傳** | 後台能存能讀（`row_to_json` 的 `p.*` spread 帶得到），但 `/api/posts`、`/api/posts/:id` 從來不含此欄 → 前端 `post.allow_comments !== 0 && !== false` 對 `undefined` 恆為 true → **關留言的開關對公開站從來沒生效**。查過已刪的 Express 原始碼，它也沒回傳 → 不是 strangler 遷移的 regression，是 JS 時代就有的洞。 | PostListItem / PostDetailResponse 補欄位，全站統一 `boolean` |
| **部落格列表 excerpt 永遠空白** | `NoteCard` 用 `post.content` 做內文截斷，但 `/api/posts` 只回 `excerpt` 不回 `content` → 三元運算恆走 `: ''` → **8 張卡全是空的**（SSR 實測 `class="note-excerpt"><` ×8）。舊的手寫 `content?: string` optional 讓它永遠通過 tsc。 | 後端加 `content_preview`（前 260 字，i18n 正確；整篇 content 進列表要多 ~188KB） |
| **後台文章列表「開新分頁看文章」按鈕從不出現** | `{post.slug && <Link to={`/blog/${post.slug}`}>}`，但 **posts 表根本沒有 slug 欄位** → 恆為 falsy。文章網址本來就是 `/blog/:id`。 | 改用 `post.id`，拿掉 slug 條件 |
| **`PostEditor` 的 `data.summary` 是死路** | `data.excerpt ?? data.summary ?? ''`；`summary` 只存在於表單，API 從不回傳。 | 刪掉該分支 |

> 教訓：**手寫 interface 的 `?:` 是這類 bug 的溫床**——optional 欄位讓「API 從沒送過這個欄位」
> 跟「這次剛好沒值」在型別上無法區分，tsc 永遠不會吭聲。生成型別沒有這個模糊地帶。

## 現況盤點（動態 JSON 密度，由重到輕）

| handler | 動態點 | 備註 |
|---|---|---|
| watch.rs | 9 | favorites/now/tmdb 快取 payload——TMDb 透傳部分可用 `Value` 欄位保留（透傳不 typed） |
| ~~admin.rs posts~~ | ~~2~~ | **✅ 2026-07-17 完成**：`AdminPostFull`（28 欄 + tags，欄位序 = DB 宣告序）供 `/admin/posts` 與 `/admin/posts/:id` 共用；後者用 `#[serde(flatten)]` 出 `{message, ...row, available_locales}` |
| ~~posts.rs~~ | ~~4~~ | **✅ 2026-07-17 完成**：`PostListItem` / `PostDetailResponse` / `CommentRow` / `ReactionRow` 等 |
| ~~admin.rs comments~~ | ~~1~~ | **✅ 2026-07-18 完成**：`AdminCommentRow`（14 欄 + post_title，欄位序 = comments 宣告序）、`CommentCounts`（4 狀態固定欄）、`AdminCommentsResponse`。順手把 `BlacklistRow`/`KeywordFilterRow` 加 specta::Type 並註冊。前端 `CommentsManager` 三個手寫 interface 全歸零。**admin.rs 的 `row_to_json` 已全數清除**（import 移除）。老 vs 新對拍 5 種 query 全 byte-identical |
| ~~books.rs~~ | ~~5~~ | **✅ 2026-07-18 完成**：`BookRow`（18 欄，欄位序 = DB 宣告序）+ `BooksListResponse` / `BookDetailResponse`。REAL rating 用 `#[serde(serialize_with)]`（`serialize_rating` 重用 `js_num_value`：4.0→4、4.1 維持 float）。前端 Bookshelf / admin BooksManager 的 `Book` interface 歸零。old vs new 對拍（含 4.0 whole-rating + null rating）全 byte-identical |
| collection.rs | 4 | 白名單欄位已定 14 欄，struct 化順手。⚠️ 但 `/anime` `/cinema` 頁面已刪，後端是否退役未定（見 ROADMAP）——先確認再做 |
| gallery.rs | 3 | manifest 是檔案透傳，**保持 Value**（形狀由檔案定，不 typed） |
| spotify/oauth/newsletter/thoughts/quote/bahamut | 1–2 | 小額收尾 |

**明確不 typed（保持 Value）**：第三方透傳（steam/github/wakatime/TMDb 原樣轉發）、
gallery manifest、`/api/quote/daily` 的外部名言。specta 只管「自己擁有形狀」的回應。

## 建議順序

1. ~~`PostRow`（posts+admin 共用）~~ **✅ 完成**
2. ~~`admin_comments`（解鎖前端 CommentsManager）~~ **✅ 完成**
3. ~~books~~ **✅ 完成**
4. **thoughts**（← 下一棒；⚠️ 見坑清單「ref passthrough」——需先決定 ref 欄位怎麼 typed）
5. collection（先確認後端要不要退役）
6. watch favorites / newsletter / oauth user（小型）
6. 全清後：刪 `util::row_to_json`（**admin.rs 已不用了**，剩 newsletter/books/watch/collection；
   `js_normalize_numbers` **不能刪**——thirdparty/spotify/watch 的透傳路徑仍在用）、
   export_types register 全量化、README 補型別管線說明

## 坑清單（已踩過的）

- specta 禁 i64 直出（BigInt 精度防呆）→ 必用 `Number` 覆寫；`Option<i64>` 要
  `Option<Number>` 否則 `| null` 被蓋掉
- `export_types` 需要 lib target（已建 `src/lib.rs`）；新 struct 要 `pub`
- serde_json `float_roundtrip`/`preserve_order` feature 不能拿掉（gallery manifest
  等透傳路徑仍依賴）
- 前端 `string | null` vs `string | undefined`：生成型別是 `| null`（serde 語意），
  組件裡 `?? undefined` 橋接（見 UsersManager 首例）
- **`#[serde(flatten)]` specta 支援**（rc.25 實測）：出 intersection type
  `{ message, available_locales } & AdminPostFull`，且 runtime key 序 = 宣告序
  （flatten 的欄位攤在中間），跟舊 `row_to_json` 的 spread 對得起來。文件沒寫，實測的
- **nullable INTEGER 別直接對 `bool`**：欄位 `notnull=0` 時 NULL 會讓 sqlx decode 噴錯 → 500。
  用 `Option<bool>` 收、對外再 `unwrap_or(true)`（DB 可為 null，但 API 契約給 non-null boolean）
- **`p.*` spread 的端點：欄位序 = `PRAGMA table_info` 宣告序，不是你以為的順序**。
  typed 化前先 `PRAGMA table_info(posts)` 抄一份；posts 表就有個 `allow_comments`
  插在 `content_ko` 和 `excerpt_ko` 中間這種你猜不到的位置
- **FromRow 會忽略多餘欄位**——所以「struct 少宣告一欄」不會報錯，但 `row_to_json` 的端點
  照樣會把該欄吐出去。兩者不一致時，struct 是錯的那個（`allow_comments` bug 就是這樣藏住的）
- **REAL 欄位（如 books.rating）：`#[serde(serialize_with = "..."]` 重用 `js_num_value`**
  讓整值 float 輸出整數（4.0→4），對齊舊 `row_to_json` 對 REAL 走 `js_num_value` 的行為。
  specta::Type 用 `#[specta(type = Option<Number>)]` 覆寫（f64 → number）。實測與 serialize_with 並存沒問題
- **前端 `useLoaderData({strict:false}) as {...}` 的 eslint `no-unnecessary-type-assertion`
  可能是誤報**：strict:false 回傳跨路由 loader 的 union，斷言在做「narrow 到本頁 loader 形狀」。
  Blog 的 `posts` 欄位別頁沒有 → 斷言可安全移除（已移）；但 Bookshelf 的 `stats` 會跟 `/watch`
  的 `WatchStats` 混在 union 裡 → 斷言**必要**，移了 tsc 會爆。**逐檔 probe，別無腦批次移除**。
  Bookshelf 已加 `eslint-disable-next-line` + 註解說明。剩 Music/Thinking/ThinkingDetail/Watch 未查
- **thoughts 的 `ref` 是 passthrough Value**（parsed ref_json，link-unfurl / TMDb media 變動形狀）。
  specta 沒開 `serde_json` feature → 無法直接生成 `Value` 型別。選項：① 開 serde_json feature（ref→JsonValue，
  前端 ThoughtRef 要改）② 定 backend `ThoughtRef` struct 解析 ref_json（**風險：ref_json 有非 struct 欄位會被丟掉→形狀變**）
  ③ thoughts 保持手寫 interface（ref 是真 passthrough，符合「透傳不 typed」原則）。**待決定**
