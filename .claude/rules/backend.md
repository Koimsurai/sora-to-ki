---
paths:
  - "backend/**"
  - "Cargo.toml"
  - "Cargo.lock"
  - "clippy.toml"
  - ".cargo/**"
---

# 後端（Rust）守則

## clippy 的規則在 **根目錄 `Cargo.toml` 的 `[workspace.lints.clippy]`**

不是預設的那五組。開的是 `pedantic` 整組 + 六條個別挑進來的 nursery
（`or_fun_call`、`significant_drop_in_scrutinee`、`significant_drop_tightening`、
`redundant_clone`、`missing_const_for_fn`、`use_self`）。`backend/Cargo.toml` 用
`[lints] workspace = true` 繼承——**新增 crate 時要記得寫這一行，忘了不會有錯誤訊息，
那個 crate 就是完全沒有 lint**。

**nursery 整組不要開**：`option_if_let_else` 這類公認會讓程式更難讀的都在裡面。
**`clippy::cargo` 也不要開**：全是 `cargo_common_metadata` / `multiple_crate_versions`，
對私有 binary 沒有意義。**`restriction` 更不能整組開**（連「不准用 `else`」都在裡面），
只個別挑：`todo` / `unimplemented` / `dbg_macro` / `print_stdout` / `print_stderr` 是 deny。

設定已經定案。遇到 clippy 報錯就在該處寫 `#[allow(…, reason = "…")]`，不要改全域設定。

## `unwrap_used` 寫在 crate root，不在 `[workspace.lints]`

`src/lib.rs`、`src/main.rs`、`src/bin/export_types.rs` 各有一行 `#![deny(clippy::unwrap_used)]`。
**不要把它搬進 `Cargo.toml`**——那是 package 層級的，會連 `tests/` 一起管，而
`clippy.toml` 的 `allow-unwrap-in-tests` 只認 `#[cfg(test)]` 與 `#[test]`，
`tests/common/mod.rs` 那種**非 `#[test]` 的 setup helper** 不在豁免範圍內。

`expect_used` 刻意**不開**：`.unwrap()` 是「沒想過會不會失敗」，`.expect(m)` 是「我斷言
它不會失敗，理由是 m」——後者是有文件的逃生口。`LazyLock` 裡的 `Regex::new(字面值)` 用帶訊息的 expect。

`clippy.toml`（repo 根目錄）放的是 lint 的**設定值**，開關在 `Cargo.toml`，兩個檔案要一起看。
裡面有兩區：五個 `allow-*-in-tests`（`unwrap_used` 能開起來的前提——CI 是 `-D warnings`，
**warn 在合流那一刻等同 deny**，所以「只設 warn 讓測試能用」行不通），以及 `disallowed-types`。

`Cargo.toml` 裡的 `allow` 每一條都標了理由，**要拿掉之前先讀理由**。最大宗是 `doc_markdown`，
它要求中文註解裡的 Express / SQLite 這些字加反引號。

## 鎖的選擇是編譯期規則，不是約定

`clippy.toml` 的 `disallowed-types` 擋掉 `std::sync::Mutex` / `RwLock`。**同步鎖一律
`parking_lot`，要跨 `await` 持有才用 `tokio::sync`**（後者不擋）。
`state.rs` 開頭那句「短臨界區、不跨 await 持有」的不變條件由這條規則守著。
（`disallowed_types` 屬於 `style` 組、已含在 `all` 裡，只要寫設定值、不用另外開 lint。）

## clippy 照著改會壞的四類

都留了 `#[allow]` + `reason`：

| 位置 | clippy 說 | 為什麼不能照做 |
|---|---|---|
| `books.rs` `serialize_rating` | `&Option<f64>` → `Option<&f64>` | 簽名是 serde `serialize_with` 的契約，改了編不過 |
| `tests/schema.rs` 的 `r##` 字面值 | 減一層 hash | 內容本身含 `"#`，減了字串提早結束 |
| `spotify_callback` 的 `HashMap` | 加 `S: BuildHasher` 泛型 | axum handler 帶泛型就推不出 `Handler` impl，註冊不進 router |
| 幾何／演算法內部的 cast | 用 `try_from` | 值域是**證得出來**的（exiftool 的旋轉角度、只縮不放的 `fit_inside`、已 `clamp` 的百分比） |

## 測試一律用 `cargo nextest run --no-fail-fast`

**`cargo test` 在這個專案是壞的，不要拿它的結果下任何判斷。** nextest 是**一個測試一個行程**，
`cargo test` 是同一個行程平行跑執行緒；而這裡有十幾個測試檔直接寫 process 全域的
`std::env::set_var`（gallery 的輸出目錄、bahamut 的 cookie、mailer/oauth/watch/simkl 的金鑰…），
外加 `QUOTE_CACHE`、`STARS_CACHE`、`GALLERY_SYNC_LOCK` 這些全域 static，同行程平行跑就是互相蓋。

症狀是**隨機幾條紅、每次紅的還不一樣**，看起來像測試本身不穩定，但在 nextest 下全綠。
不要把 `cargo test` 的紅回報成「既有失敗」。

`--no-fail-fast` 也必須帶：少了它，nextest 遇到第一個失敗就中止，跑完的數量每次不同，
那個變動本身又會被誤讀成不穩定。

沒有任何地方需要 `cargo test`：CI 走 `cargo llvm-cov nextest`，cargo-mutants 也在
`.cargo/mutants.toml` 設了 `test_tool = "nextest"`。

## 變異測試

**覆蓋率不等於測試有效。** `cargo mutants --file <單檔>` 約 4 分鐘，判準是「錯了會不會安靜
地錯」——覆蓋率接近 100% 的檔案，變異分數可能不到一半（驗證鏈的 `&&` 換成 `||` 測試照樣綠）。
設定與使用時機寫在 `.cargo/mutants.toml`。**不要全 repo 跑**（三個半小時，且結果會被沒打算測的
整合層稀釋）。
