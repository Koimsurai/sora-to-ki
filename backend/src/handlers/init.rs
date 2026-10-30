//! 初次設定（後台的 `/admin/init` 精靈）：全新的站還沒有站長時，拿著設定碼用 GitHub／Google 登入的
//! 第一個人認領站長。
//!
//! 為什麼要設定碼：站一開起來就在網路上，「第一個登入的人當站長」等於誰先找到誰拿走。設定碼只印在
//! 後端的 log 裡，看得到 log 的人才是架站的人。設定碼存在資料庫，重開機不會換一組；認領完就刪掉。
//!
//! 有設 `OWNER_EMAIL` 的站不走這裡：用那個信箱登入就是站長（handlers/oauth）。
//! 精靈其他幾步（語系、站台、頁面）是認領之後用一般的站台設定 API 存，不在這支。

use std::sync::atomic::{AtomicU32, Ordering};

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use rand::RngExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;

use crate::{
    auth::{bearer_token, verify_jwt},
    error::{AppError, JsonBody},
    state::AppState,
};

/// `site_settings` 裡設定碼的 key
const KEY: &str = "setup_code";
/// 設定碼用的字：去掉看起來像的 0 O 1 I L
const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/// 打錯幾次就換一組（新的那組照樣印在 log）。8 個字約 40 bit，換碼是讓猜的人永遠從頭開始
const MAX_FAILURES: u32 = 10;

static FAILURES: AtomicU32 = AtomicU32::new(0);

/// `XXXX-XXXX`
fn generate() -> String {
    let mut rng = rand::rng();
    let chars: String = (0..8).map(|_| char::from(ALPHABET[rng.random_range(0..ALPHABET.len())])).collect();
    format!("{}-{}", &chars[..4], &chars[4..])
}

/// 打進來的設定碼：大小寫、空白、連字號都不計較
fn normalize(code: &str) -> String {
    code.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_uppercase()).collect()
}

/// 逐字比完才回答，比對時間不洩漏「前幾個字對了」
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// 還沒有站長、也沒設 `OWNER_EMAIL`
pub async fn needed(pool: &SqlitePool) -> Result<bool, AppError> {
    if crate::identity::owner_email().is_some() {
        return Ok(false);
    }
    let (owners,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM oauth_users WHERE role = 'OWNER'").fetch_one(pool).await?;
    Ok(owners == 0)
}

async fn stored(pool: &SqlitePool) -> Result<Option<String>, AppError> {
    Ok(sqlx::query_scalar("SELECT value FROM site_settings WHERE key = ?")
        .bind(KEY)
        .fetch_optional(pool)
        .await?)
}

async fn store(pool: &SqlitePool, code: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO site_settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    )
    .bind(KEY)
    .bind(code)
    .execute(pool)
    .await?;
    Ok(())
}

fn log_code(code: &str) {
    // 刻意用英文、開頭固定是 `setup:`：精靈教人 `grep setup`，不管站長用哪個語言
    tracing::warn!("setup: open {}/admin/init?code={code} to claim this site", crate::identity::site_url());
}

/// 開機時呼叫：還沒有站長就把設定碼印出來（沒有就先產生一組），有站長了就把剩下的設定碼清掉
pub async fn announce(pool: &SqlitePool) -> Result<(), AppError> {
    if !needed(pool).await? {
        sqlx::query("DELETE FROM site_settings WHERE key = ?").bind(KEY).execute(pool).await?;
        return Ok(());
    }
    let code = if let Some(c) = stored(pool).await? {
        c
    } else {
        let c = generate();
        store(pool, &c).await?;
        c
    };
    log_code(&code);
    Ok(())
}

/// 設定碼對不對。錯太多次就換一組
async fn verify(pool: &SqlitePool, code: &str) -> Result<bool, AppError> {
    let Some(expected) = stored(pool).await? else { return Ok(false) };
    if same(&normalize(code), &normalize(&expected)) {
        return Ok(true);
    }
    if FAILURES.fetch_add(1, Ordering::Relaxed) + 1 >= MAX_FAILURES {
        FAILURES.store(0, Ordering::Relaxed);
        let fresh = generate();
        store(pool, &fresh).await?;
        tracing::warn!("setup: too many wrong codes, issued a new one");
        log_code(&fresh);
    }
    Ok(false)
}

/// 精靈認得的錯誤：`code` 給前端對到介面字串，`error` 是給看 API 的人的說明
fn refuse(status: StatusCode, code: &str, error: &str) -> Response {
    (status, Json(json!({ "code": code, "error": error }))).into_response()
}

fn already() -> Response {
    refuse(StatusCode::CONFLICT, "already_claimed", "這個站已經有站長了")
}

fn bad_code() -> Response {
    refuse(StatusCode::FORBIDDEN, "bad_code", "設定碼不對")
}

/// `GET /api/init/status` 的回應
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct InitStatus {
    /// 還沒有站長（要走初次設定）
    pub needed: bool,
}

/// `GET /api/init/status` —— 公開：後台用它決定要不要把人帶去初次設定
#[utoipa::path(get, path = "/api/init/status", tag = "init", responses((status = 200, body = InitStatus)))]
pub async fn status(State(state): State<AppState>) -> Result<Json<InitStatus>, AppError> {
    Ok(Json(InitStatus { needed: needed(&state.pool).await? }))
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct CodeBody {
    #[serde(default)]
    pub code: String,
}

/// `POST /api/init/check` —— 先驗設定碼（精靈的第一步），還不認領
#[utoipa::path(post, path = "/api/init/check", tag = "init", request_body = CodeBody,
    responses(
        (status = 204, description = "設定碼正確"),
        (status = 403, description = "設定碼不對"),
        (status = 409, description = "已經有站長了"),
    ))]
pub async fn check(
    State(state): State<AppState>,
    JsonBody(body): JsonBody<CodeBody>,
) -> Result<Response, AppError> {
    if !needed(&state.pool).await? {
        return Ok(already());
    }
    if !verify(&state.pool, &body.code).await? {
        return Ok(bad_code());
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}

/// `POST /api/init/claim` —— 帶著 GitHub／Google 登入的 token 與設定碼，認領站長
#[utoipa::path(post, path = "/api/init/claim", tag = "init", request_body = CodeBody,
    security(("bearer" = [])),
    responses(
        (status = 204, description = "認領完成，這個帳號是站長了"),
        (status = 401, description = "要先用 GitHub 或 Google 登入"),
        (status = 403, description = "設定碼不對"),
        (status = 409, description = "已經有站長了"),
    ))]
pub async fn claim(
    State(state): State<AppState>,
    headers: HeaderMap,
    JsonBody(body): JsonBody<CodeBody>,
) -> Result<Response, AppError> {
    let user_id = bearer_token(&headers)
        .and_then(|t| verify_jwt(t, &state.jwt_secret))
        .and_then(|c| c.get("userId").and_then(serde_json::Value::as_i64))
        .filter(|&u| u != 0);
    let Some(user_id) = user_id else {
        return Ok(refuse(StatusCode::UNAUTHORIZED, "not_signed_in", "要先用 GitHub 或 Google 登入"));
    };
    if !needed(&state.pool).await? {
        return Ok(already());
    }
    if !verify(&state.pool, &body.code).await? {
        return Ok(bad_code());
    }
    // 兩個 provider 合併過的帳號，角色記在主帳號上（跟 auth::authorize 讀的是同一個）
    let primary: Option<(i64, Option<i64>)> =
        sqlx::query_as("SELECT id, linked_to FROM oauth_users WHERE id = ?")
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?;
    let Some((id, linked_to)) = primary else {
        return Ok(refuse(StatusCode::UNAUTHORIZED, "not_signed_in", "找不到這個帳號，請重新登入"));
    };
    // 「還沒有站長」寫在同一句裡：兩個人同時按下去，只有一個會改到
    let done = sqlx::query(
        "UPDATE oauth_users SET role = 'OWNER', updated_at = CURRENT_TIMESTAMP \
         WHERE id = ? AND NOT EXISTS (SELECT 1 FROM oauth_users WHERE role = 'OWNER')",
    )
    .bind(linked_to.unwrap_or(id))
    .execute(&state.pool)
    .await?;
    if done.rows_affected() == 0 {
        return Ok(already());
    }
    sqlx::query("DELETE FROM site_settings WHERE key = ?").bind(KEY).execute(&state.pool).await?;
    tracing::info!(user_id = linked_to.unwrap_or(id), "setup: site claimed");
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 設定碼是兩組四個字_不含容易看錯的字() {
        for _ in 0..200 {
            let c = generate();
            assert_eq!(c.len(), 9);
            assert_eq!(&c[4..5], "-");
            assert!(c.chars().filter(|&ch| ch != '-').all(|ch| ALPHABET.contains(&(ch as u8))), "{c}");
        }
    }

    #[test]
    fn 打設定碼不計較大小寫空白與連字號() {
        assert_eq!(normalize(" 7f3k-q9m2 "), "7F3KQ9M2");
        assert!(same(&normalize("7f3kq9m2"), &normalize("7F3K-Q9M2")));
        assert!(!same(&normalize("7F3K-Q9M"), &normalize("7F3K-Q9M2")));
        assert!(!same("", "A"));
    }
}
