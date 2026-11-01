//! 收藏的來源（後台的「收藏 → 來源」）：列出每個平台的狀態、填金鑰、開關同步、立刻同步一次。
//! 設定存在哪、怎麼讀見 `integrations.rs`。
//!
//! 金鑰**只寫不讀**：這裡回給前端的只有「填了沒、填在哪（後台或環境變數）」，一般欄位
//! （Client ID、帳號）多給末四碼讓站長認得是哪一組，密碼與 token 連末幾碼都不給。

use std::collections::BTreeMap;
use std::time::Duration;

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::auth::{AdminAuth, OwnerAuth};
use crate::error::{AppError, JsonBody, Problem};
use crate::integrations::{self, Source, SyncRecord};
use crate::state::AppState;

/// 一格設定的狀態
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SourceField {
    /// 環境變數名，也是寫入時的 key
    pub env: String,
    pub secret: bool,
    pub optional: bool,
    /// 值從哪來：`admin`（後台填的）、`env`（環境變數）；沒填是 null
    #[specta(optional)]
    pub from: Option<String>,
    /// 一般欄位的末四碼（密碼與 token 不給）
    #[specta(optional)]
    pub hint: Option<String>,
}

/// 即時檢查的結果（沒有背景同步、讀者來的時候才去抓的那幾個：TMDB、Spotify、Steam…）
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SourceCheck {
    pub ok: bool,
    /// 有的話是抓到幾筆（Spotify 最近播放）
    #[specta(optional)]
    pub count: Option<u32>,
    /// 失敗的理由（英文）
    #[specta(optional)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SourceInfo {
    pub key: String,
    pub fields: Vec<SourceField>,
    /// 必填的都填了
    pub configured: bool,
    /// 有背景同步的話，開關現在的狀態
    #[specta(optional)]
    pub sync: Option<bool>,
    /// 最近一次同步的結果
    #[specta(optional)]
    pub last: Option<SyncRecord>,
    /// 沒有背景同步的來源：這次打開頁面時的即時檢查
    #[specta(optional)]
    pub check: Option<SourceCheck>,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct SourcesResponse {
    pub sources: Vec<SourceInfo>,
    /// Spotify app 要填的 Redirect URI
    pub spotify_redirect: String,
}

/// 改一個來源：`values` 裡的值是新的金鑰，`null` 是清掉（退回環境變數）；沒帶的欄位不動
#[derive(Debug, Default, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct SourceUpdate {
    #[serde(default)]
    pub values: BTreeMap<String, Option<String>>,
    #[serde(default)]
    pub sync: Option<bool>,
}

/// 金鑰一格的長度上限：真的 token 頂多幾百字，這只是擋亂貼
const VALUE_MAX: usize = 2000;

fn field_info(f: &integrations::Field) -> SourceField {
    let from = if integrations::stored(f.env).is_some() {
        Some("admin")
    } else if integrations::var(f.env).is_some() {
        Some("env")
    } else {
        None
    };
    let hint = if f.secret {
        None
    } else {
        integrations::var(f.env).map(|v| {
            let chars: Vec<char> = v.chars().collect();
            chars[chars.len().saturating_sub(4)..].iter().collect()
        })
    };
    SourceField {
        env: f.env.into(),
        secret: f.secret,
        optional: f.optional,
        from: from.map(Into::into),
        hint,
    }
}

fn configured(s: &Source) -> bool {
    s.fields.iter().all(|f| f.optional || integrations::var(f.env).is_some())
}

async fn info(state: &AppState, s: &'static Source) -> SourceInfo {
    // 只檢查真的有填東西的：選填的全空（Google Books 沒填 key）就是在用退路，不帶 key 去打
    // Google 反而會撞到共用額度回 429，在後台變成一個假的紅叉
    let filled = s.fields.iter().any(|f| integrations::var(f.env).is_some());
    let check =
        if s.sync.is_none() && configured(s) && filled { Some(check(state, s.key).await) } else { None };
    SourceInfo {
        key: s.key.into(),
        fields: s.fields.iter().map(field_info).collect(),
        configured: configured(s),
        sync: s.sync.map(integrations::sync_on),
        last: if s.sync.is_some() { integrations::last_record(&state.pool, s.key).await } else { None },
        check,
    }
}

const CHECK_TIMEOUT: Duration = Duration::from_secs(6);

/// 用一個很輕的請求確認金鑰能用。上游慢的話最多等 [`CHECK_TIMEOUT`]，後台頁面不會跟著卡住
async fn check(state: &AppState, key: &str) -> SourceCheck {
    let fail = |e: String| SourceCheck { ok: false, count: None, error: Some(e) };
    let status = |r: Result<reqwest::Response, reqwest::Error>| match r {
        Ok(r) if r.status().is_success() => Ok(()),
        Ok(r) => Err(format!("The service answered {}", r.status().as_u16())),
        Err(e) if e.is_timeout() => Err("The service didn't answer in time".to_string()),
        Err(_) => Err("Couldn't reach the service".to_string()),
    };
    let ok = SourceCheck { ok: true, count: None, error: None };
    let http = &state.http;
    let result = match key {
        "tmdb" => match crate::util::tmdb_token() {
            Some(token) => status(
                crate::util::tmdb_request(http, &token, "/3/configuration")
                    .timeout(CHECK_TIMEOUT)
                    .send()
                    .await,
            ),
            None => Err("Not set".to_string()),
        },
        "googleBooks" => {
            let mut url =
                format!("{}/books/v1/volumes?q=isbn:9780262033848&maxResults=1", state.external.google_books);
            if let Some(k) = integrations::var("GOOGLE_BOOKS_API_KEY") {
                url.push_str("&key=");
                url.push_str(&crate::util::encode_uri_component(&k));
            }
            status(http.get(url).timeout(CHECK_TIMEOUT).send().await)
        }
        "steam" => match crate::handlers::thirdparty::steam_env() {
            Some((k, id)) => status(
                http.get(format!(
                    "{}/ISteamUser/GetPlayerSummaries/v0002/?key={}&steamids={}",
                    state.external.steam_api,
                    crate::util::encode_uri_component(&k),
                    crate::util::encode_uri_component(&id)
                ))
                .timeout(CHECK_TIMEOUT)
                .send()
                .await,
            ),
            None => Err("Not set".to_string()),
        },
        "wakatime" => match crate::handlers::thirdparty::wakatime_key() {
            Some(k) => status(
                http.get(format!("{}/api/v1/users/current", state.external.wakatime))
                    .header("Authorization", crate::handlers::thirdparty::waka_auth(&k))
                    .timeout(CHECK_TIMEOUT)
                    .send()
                    .await,
            ),
            None => Err("Not set".to_string()),
        },
        "nlk" => crate::handlers::isbn_regions::check_nlk(state).await,
        "lastfm" | "listenbrainz" => {
            return match crate::handlers::listen_sources::check(state, key).await {
                Ok(n) => SourceCheck { count: Some(n), ..ok },
                Err(e) => fail(e),
            };
        }
        "spotify" => {
            return match tokio::time::timeout(
                CHECK_TIMEOUT,
                crate::handlers::spotify::recent_unfiltered(state),
            )
            .await
            {
                Ok(Ok(r)) => SourceCheck { count: u32::try_from(r.items.len()).ok(), ..ok },
                Ok(Err(e)) => fail(e),
                Err(_) => fail("Spotify didn't answer in time".to_string()),
            };
        }
        _ => Ok(()),
    };
    match result {
        Ok(()) => ok,
        Err(e) => fail(e),
    }
}

/// `GET /api/admin/sources`
#[utoipa::path(get, path = "/api/admin/sources", tag = "integrations",
    security(("bearer" = [])),
    responses((status = 200, body = SourcesResponse), (status = 401, description = "需要登入")))]
pub async fn list_sources(State(state): State<AppState>, _auth: AdminAuth) -> Json<SourcesResponse> {
    // 即時檢查各自要等上游，一起跑；回來之後照清單的順序排
    let mut set = tokio::task::JoinSet::new();
    for (i, s) in integrations::SOURCES.iter().enumerate() {
        let st = state.clone();
        set.spawn(async move { (i, info(&st, s).await) });
    }
    let mut done = Vec::with_capacity(integrations::SOURCES.len());
    while let Some(joined) = set.join_next().await {
        if let Ok(pair) = joined {
            done.push(pair);
        }
    }
    done.sort_by_key(|(i, _)| *i);
    let sources = done.into_iter().map(|(_, s)| s).collect();
    Json(SourcesResponse { sources, spotify_redirect: crate::handlers::spotify::redirect_uri() })
}

fn unknown_source(key: &str) -> Response {
    Problem::new("source_unknown", format!("No source named {key}"))
        .param("source", key)
        .respond(StatusCode::NOT_FOUND)
}

/// `PUT /api/admin/sources/{key}` —— 只有站長能改（金鑰）；MCP 的機器帳號不行
#[utoipa::path(put, path = "/api/admin/sources/{key}", tag = "integrations", request_body = SourceUpdate,
    security(("bearer" = [])),
    params(("key" = String, Path, description = "來源，例如 simkl")),
    responses(
        (status = 200, body = SourceInfo),
        (status = 400, description = "沒有這一格、值太長"),
        (status = 401, description = "需要登入"),
        (status = 404, description = "沒有這個來源"),
    ))]
pub async fn update_source(
    State(state): State<AppState>,
    _auth: OwnerAuth,
    Path(key): Path<String>,
    JsonBody(body): JsonBody<SourceUpdate>,
) -> Result<Response, AppError> {
    let Some(source) = integrations::source(&key) else { return Ok(unknown_source(&key)) };
    // 先全部驗過再寫：寫到一半才發現一格不對，會留下半套設定
    for (env, value) in &body.values {
        if !source.fields.iter().any(|f| f.env == env) {
            return Ok(Problem::new("source_field_unknown", format!("{key} has no field named {env}"))
                .param("field", env.as_str())
                .respond(StatusCode::BAD_REQUEST));
        }
        if value.as_ref().is_some_and(|v| v.chars().count() > VALUE_MAX) {
            return Ok(Problem::new(
                "source_value_too_long",
                format!("{env} is longer than {VALUE_MAX} characters"),
            )
            .param("field", env.as_str())
            .respond(StatusCode::BAD_REQUEST));
        }
    }
    for (env, value) in &body.values {
        // 空白的當成清掉：貼上時多了空白或是整格刪光，都不該存成一個空的金鑰
        let value = value.as_deref().map(str::trim).filter(|v| !v.is_empty());
        integrations::set(&state.pool, env, value).await?;
    }
    if let (Some(on), Some(var)) = (body.sync, source.sync) {
        integrations::set(&state.pool, var, Some(if on { "1" } else { "0" })).await?;
    }
    forget_cached_login(&state, &key);
    Ok(Json(info(&state, source).await).into_response())
}

/// 金鑰換了，之前用舊金鑰換到的登入狀態就作廢
fn forget_cached_login(state: &AppState, key: &str) {
    match key {
        "spotify" => *state.spotify.token.lock() = None,
        "steam" => *state.steam.cache.lock() = None,
        _ => {}
    }
}

/// `POST /api/admin/sources/{key}/sync` —— 立刻同步一次，回傳更新後的狀態
#[utoipa::path(post, path = "/api/admin/sources/{key}/sync", tag = "integrations",
    security(("bearer" = [])),
    params(("key" = String, Path, description = "有背景同步的來源：simkl、bahamut、ncl")),
    responses(
        (status = 200, body = SourceInfo),
        (status = 401, description = "需要登入"),
        (status = 404, description = "沒有這個來源，或它沒有背景同步"),
    ))]
pub async fn sync_source(
    State(state): State<AppState>,
    _auth: AdminAuth,
    Path(key): Path<String>,
) -> Response {
    let Some(source) = integrations::source(&key).filter(|s| s.sync.is_some()) else {
        return unknown_source(&key);
    };
    let _ = match key.as_str() {
        "simkl" => crate::handlers::simkl::sync_and_record(&state).await,
        "bahamut" => crate::handlers::bahamut::sync_and_record(&state).await,
        "ncl" => crate::handlers::tw_isbn::sync_and_record(&state).await,
        "neodb" => crate::handlers::read_sources::sync_and_record(&state).await,
        other => match crate::handlers::watch_sources::sync_and_record(&state, other).await {
            Some(r) => r,
            None => return unknown_source(&key),
        },
    };
    Json(info(&state, source).await).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 一般欄位給末四碼_密碼不給() {
        integrations::set_for_test("SIMKL_CLIENT_ID", Some("abcdef123456"));
        integrations::set_for_test("SIMKL_ACCESS_TOKEN", Some("secret-token-value"));
        let s = integrations::source("simkl").expect("simkl 在清單裡");
        let fields: Vec<_> = s.fields.iter().map(field_info).collect();
        assert_eq!(fields[0].hint.as_deref(), Some("3456"));
        assert_eq!(fields[0].from.as_deref(), Some("admin"));
        assert_eq!(fields[1].hint, None, "token 連末幾碼都不給");
        assert_eq!(fields[1].from.as_deref(), Some("admin"));
        assert!(configured(s));
    }

    #[test]
    fn 選填的沒填也算設好了() {
        integrations::set_for_test("GOOGLE_BOOKS_API_KEY", None);
        assert!(configured(integrations::source("googleBooks").expect("在清單裡")));
    }
}
