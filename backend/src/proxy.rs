use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, HeaderName, StatusCode},
    response::{IntoResponse, Response},
};

use crate::{error::AppError, state::AppState};

/// 請求體上限，對齊 Express 的 `express.json({ limit: '10mb' })`。
/// Request body cap, matching Express's `express.json({ limit: '10mb' })`.
const MAX_BODY_BYTES: usize = 10 * 1024 * 1024;

/// 逐跳 (hop-by-hop) 標頭，依 RFC 7230 不可轉發。
/// Hop-by-hop headers (RFC 7230) that must not be forwarded.
fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
    )
}

/// Fallback handler：把任何「尚未被 Rust 接管」的請求原樣轉發回 Express。
/// 這是 strangler 的核心——只要某端點還沒搬，行為就跟直連 Express 完全一致。
///
/// Fallback handler: transparently forward any request NOT yet taken over by Rust
/// back to Express. The crux of the strangler — un-migrated endpoints behave exactly
/// as if talking to Express directly.
pub async fn proxy_to_express(
    State(state): State<AppState>,
    req: Request,
) -> Result<Response, AppError> {
    // 退役模式：Express 已停（EXPRESS_UPSTREAM 空）→ 對齊原 catch-all `404 'Not Found'`
    if state.upstream.is_empty() {
        return Ok((
            axum::http::StatusCode::NOT_FOUND,
            [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
            "Not Found",
        )
            .into_response());
    }

    let (parts, body) = req.into_parts();

    let path_and_query = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let url = format!("{}{}", state.upstream, path_and_query);

    let body_bytes = axum::body::to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|e| AppError::Anyhow(anyhow::anyhow!("read request body: {e}")))?;

    // 轉發標頭：去掉 hop-by-hop、host（讓 reqwest 依上游 URL 自填）、content-length（依 body 自算）
    let mut fwd_headers = HeaderMap::new();
    for (name, value) in parts.headers.iter() {
        if is_hop_by_hop(name) || name == header::HOST || name == header::CONTENT_LENGTH {
            continue;
        }
        fwd_headers.insert(name.clone(), value.clone());
    }

    let upstream_resp = state
        .http
        .request(parts.method, &url)
        .headers(fwd_headers)
        .body(body_bytes)
        .send()
        .await?;

    // 回傳：保留上游狀態碼與標頭（去掉 hop-by-hop、content-length 讓 axum 依 body 重算）
    let status = StatusCode::from_u16(upstream_resp.status().as_u16())
        .unwrap_or(StatusCode::BAD_GATEWAY);
    let resp_headers = upstream_resp.headers().clone();
    let resp_bytes = upstream_resp.bytes().await?;

    let mut builder = Response::builder().status(status);
    for (name, value) in resp_headers.iter() {
        if is_hop_by_hop(name) || name == header::CONTENT_LENGTH {
            continue;
        }
        builder = builder.header(name, value);
    }

    builder
        .body(Body::from(resp_bytes))
        .map_err(|e| AppError::Anyhow(anyhow::anyhow!("build proxied response: {e}")))
        .map(IntoResponse::into_response)
}
