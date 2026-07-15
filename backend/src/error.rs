use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

/// 服務層錯誤。回應形狀刻意對齊 Express：多數端點 `{ "error": ... }`，
/// 但 auth（requireAdmin）用 `{ "message": ... }`，故分變體決定 body key。
#[derive(Debug)]
pub enum AppError {
    Database(sqlx::Error),
    /// 代理回 Express 時的上游錯誤（連線失敗等）。
    Upstream(reqwest::Error),
    /// 404，回應 `{"error": "<msg>"}`，對齊 Express 的 `res.status(404).json({error})`。
    NotFound(String),
    /// 401，回應 `{"message": "<msg>"}`，對齊 Express requireAdmin。
    Unauthorized(String),
    /// 403，回應 `{"message": "<msg>"}`，對齊 Express requireAdmin。
    Forbidden(String),
    Anyhow(anyhow::Error),
}

impl AppError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::Unauthorized(msg.into())
    }
    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::Forbidden(msg.into())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        Self::Database(err)
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        Self::Upstream(err)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::Anyhow(err)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        // (狀態碼, body)：auth 用 message key、其餘用 error key，逐一對齊 Express。
        let (status, body): (StatusCode, Value) = match self {
            AppError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
            AppError::Upstream(e) => (StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() })),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, json!({ "error": msg })),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, json!({ "message": msg })),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, json!({ "message": msg })),
            AppError::Anyhow(e) => (StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e.to_string() })),
        };
        if status.is_server_error() {
            tracing::error!(%status, %body, "request failed");
        } else {
            tracing::debug!(%status, %body, "request rejected");
        }
        (status, Json(body)).into_response()
    }
}
