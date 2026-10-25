//! 照片的後台設定：疊在 manifest 上的標題、介紹、標籤、精選、隱藏（2026-10 後台提案的「照片」頁）。
//!
//! manifest.json 每次同步 NAS 都會整個重寫，所以站長改的東西不能寫回那個檔——
//! 存在 `photo_meta` 表，讀的時候用 [`apply`] 疊上去。

use std::collections::HashMap;

use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, SqlitePool};

use crate::handlers::gallery::{GalleryPhoto, manifest_error, read_manifest};
use crate::state::AppState;

const TITLE_MAX: usize = 80;
const DESC_MAX: usize = 500;
const TAG_MAX: usize = 24;
const TAGS_MAX: usize = 30;

#[derive(Debug, Clone, Default, FromRow)]
struct MetaRow {
    photo_id: String,
    title: Option<String>,
    description: Option<String>,
    tags: Option<String>,
    tags_en: Option<String>,
    featured: bool,
    hidden: bool,
}

fn parse_tags(raw: Option<&str>) -> Option<Vec<String>> {
    raw.and_then(|s| serde_json::from_str(s).ok())
}

async fn all_meta(pool: &SqlitePool) -> sqlx::Result<HashMap<String, MetaRow>> {
    let rows = sqlx::query_as::<_, MetaRow>(
        "SELECT photo_id, title, description, tags, tags_en, featured, hidden FROM photo_meta",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.photo_id.clone(), r)).collect())
}

fn overlay(photo: &mut GalleryPhoto, m: &MetaRow) {
    if let Some(t) = &m.title {
        photo.title.clone_from(t);
    }
    if let Some(d) = &m.description {
        photo.description.clone_from(d);
    }
    if let Some(t) = parse_tags(m.tags.as_deref()) {
        photo.tags = t;
    }
    if let Some(t) = parse_tags(m.tags_en.as_deref()) {
        photo.tags_en = t;
    }
}

/// 一張照片在後台的兩個開關
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PhotoFlags {
    pub featured: bool,
    pub hidden: bool,
}

/// 把後台的設定疊到照片上。`include_hidden = false`（公開端點）時藏起來的直接拿掉。
/// 回傳每張照片的開關（跟疊完之後的照片同一個順序）。
pub async fn apply(
    pool: &SqlitePool,
    photos: &mut Vec<GalleryPhoto>,
    include_hidden: bool,
) -> sqlx::Result<Vec<PhotoFlags>> {
    let meta = all_meta(pool).await?;
    if !include_hidden {
        photos.retain(|p| !meta.get(&p.id).is_some_and(|m| m.hidden));
    }
    Ok(photos
        .iter_mut()
        .map(|p| match meta.get(&p.id) {
            Some(m) => {
                overlay(p, m);
                PhotoFlags { featured: m.featured, hidden: m.hidden }
            }
            None => PhotoFlags::default(),
        })
        .collect())
}

/// 後台的一張：疊過的照片，加上原本的檔名（標題改過也看得到是哪個檔）與兩個開關
#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminPhoto {
    #[serde(flatten)]
    pub photo: GalleryPhoto,
    /// manifest 上的標題（同步時是檔名）
    pub original_title: String,
    /// 精選：前台地面站排在最上面
    pub featured: bool,
    /// 前台不顯示
    pub hidden: bool,
}

#[derive(Debug, Serialize, specta::Type, utoipa::ToSchema)]
pub struct AdminPhotosResponse {
    /// 上次同步 NAS 的時間（manifest 的 generatedAt）
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub photos: Vec<AdminPhoto>,
}

/// `GET /api/admin/gallery/photos` —— 全部照片（含藏起來的），新拍的在前
#[utoipa::path(get, path = "/api/admin/gallery/photos", tag = "admin", security(("bearer" = [])),
    responses((status = 200, body = AdminPhotosResponse), (status = 401, description = "未授權")))]
pub async fn admin_photos(State(state): State<AppState>, _auth: crate::auth::AdminAuth) -> Response {
    let Some(manifest) = read_manifest().await else {
        return manifest_error();
    };
    let originals: Vec<String> = manifest.photos.iter().map(|p| p.title.clone()).collect();
    let mut photos = manifest.photos;
    // include_hidden = true：一張都不會被拿掉，順序跟 originals 對得上
    let flags = match apply(&state.pool, &mut photos, true).await {
        Ok(f) => f,
        Err(e) => return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    };
    let mut out: Vec<AdminPhoto> = photos
        .into_iter()
        .zip(originals)
        .zip(flags)
        .map(|((photo, original_title), f)| AdminPhoto {
            photo,
            original_title,
            featured: f.featured,
            hidden: f.hidden,
        })
        .collect();
    out.sort_by(|a, b| b.photo.shoot_time.unwrap_or(0.0).total_cmp(&a.photo.shoot_time.unwrap_or(0.0)));
    Json(AdminPhotosResponse { generated_at: manifest.generated_at, photos: out }).into_response()
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct PhotoMetaBody {
    /// 空字串 = 改回 manifest 上的（檔名）
    title: Option<String>,
    /// 空字串 = 改回 manifest 上的
    description: Option<String>,
    tags: Option<Vec<String>>,
    tags_en: Option<Vec<String>>,
    featured: Option<bool>,
    hidden: Option<bool>,
}

/// 標籤：去頭尾空白、拿掉空的與重複的，數量與長度有上限
fn clean_tags(tags: &[String]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        if t.chars().count() > TAG_MAX {
            return Err(format!("標籤最多 {TAG_MAX} 個字：{t}"));
        }
        if !out.iter().any(|o| o == t) {
            out.push(t.to_string());
        }
    }
    if out.len() > TAGS_MAX {
        return Err(format!("標籤最多 {TAGS_MAX} 個"));
    }
    Ok(out)
}

/// 一個文字欄位要怎麼改
#[derive(Debug, Clone, PartialEq, Eq)]
enum TextEdit {
    /// 沒帶：不動
    Keep,
    /// 帶了空字串：改回 manifest 上的
    Reset,
    Set(String),
}

impl TextEdit {
    const fn touched(&self) -> bool {
        !matches!(self, Self::Keep)
    }

    /// 要寫進 DB 的值（Reset 寫 NULL）
    fn value(&self) -> Option<&str> {
        match self {
            Self::Set(s) => Some(s),
            Self::Keep | Self::Reset => None,
        }
    }
}

fn text_field(v: Option<&str>, max: usize, name: &str) -> Result<TextEdit, String> {
    match v.map(str::trim) {
        None => Ok(TextEdit::Keep),
        Some("") => Ok(TextEdit::Reset),
        Some(s) if s.chars().count() > max => Err(format!("{name}最多 {max} 個字")),
        Some(s) => Ok(TextEdit::Set(s.to_string())),
    }
}

/// `PATCH /api/admin/gallery/photos/:id` —— 改標題、介紹、標籤、精選、隱藏（只動有帶的欄位）
#[utoipa::path(patch, path = "/api/admin/gallery/photos/{id}", tag = "admin", security(("bearer" = [])),
    params(("id" = String, Path)), request_body = PhotoMetaBody,
    responses(
        (status = 200, body = AdminPhoto),
        (status = 400, description = "欄位不對"),
        (status = 401, description = "未授權"),
        (status = 404, description = "manifest 裡沒有這張"),
    ))]
pub async fn admin_update_photo(
    State(state): State<AppState>,
    _auth: crate::auth::AdminAuth,
    axum::extract::Path(id): axum::extract::Path<String>,
    crate::error::JsonBody(b): crate::error::JsonBody<PhotoMetaBody>,
) -> Response {
    let bad = |e: String| (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
    let Some(manifest) = read_manifest().await else {
        return manifest_error();
    };
    // 只收 manifest 裡真的有的照片：不然任何 id 都能在表裡留一列
    let Some(photo) = manifest.photos.into_iter().find(|p| p.id == id) else {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "沒有這張照片" }))).into_response();
    };
    let title = match text_field(b.title.as_deref(), TITLE_MAX, "標題") {
        Ok(v) => v,
        Err(e) => return bad(e),
    };
    let description = match text_field(b.description.as_deref(), DESC_MAX, "介紹") {
        Ok(v) => v,
        Err(e) => return bad(e),
    };
    let tags = match b.tags.as_deref().map(clean_tags).transpose() {
        Ok(v) => v.map(|t| serde_json::to_string(&t).unwrap_or_default()),
        Err(e) => return bad(e),
    };
    let tags_en = match b.tags_en.as_deref().map(clean_tags).transpose() {
        Ok(v) => v.map(|t| serde_json::to_string(&t).unwrap_or_default()),
        Err(e) => return bad(e),
    };

    let pool = &state.pool;
    let r = async {
        let mut tx = pool.begin().await?;
        sqlx::query("INSERT OR IGNORE INTO photo_meta (photo_id) VALUES (?)")
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        // CASE 旗標：有帶的欄位才寫（含「改回 manifest 的」= 寫 NULL）
        sqlx::query(
            "UPDATE photo_meta SET \
             title = CASE WHEN ? THEN ? ELSE title END, \
             description = CASE WHEN ? THEN ? ELSE description END, \
             tags = CASE WHEN ? THEN ? ELSE tags END, \
             tags_en = CASE WHEN ? THEN ? ELSE tags_en END, \
             featured = COALESCE(?, featured), hidden = COALESCE(?, hidden), \
             updated_at = datetime('now') WHERE photo_id = ?",
        )
        .bind(title.touched())
        .bind(title.value())
        .bind(description.touched())
        .bind(description.value())
        .bind(tags.is_some())
        .bind(&tags)
        .bind(tags_en.is_some())
        .bind(&tags_en)
        .bind(b.featured)
        .bind(b.hidden)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await
    }
    .await;
    if let Err(e) = r {
        return crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e);
    }

    let original_title = photo.title.clone();
    let mut one = vec![photo];
    match apply(pool, &mut one, true).await {
        Ok(flags) => {
            let photo = one.remove(0);
            let f = flags.first().copied().unwrap_or_default();
            Json(AdminPhoto { photo, original_title, featured: f.featured, hidden: f.hidden }).into_response()
        }
        Err(e) => crate::error::internal_error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 標籤去空白去重複_有上限() {
        let t = |v: &[&str]| clean_tags(&v.iter().map(|s| (*s).to_string()).collect::<Vec<_>>());
        assert_eq!(t(&[" 海 ", "", "海", "山"]).unwrap(), ["海", "山"]);
        assert!(t(&["字".repeat(25).as_str()]).is_err());
        assert!(
            t(&(0..31)
                .map(|i| i.to_string())
                .collect::<Vec<_>>()
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>())
            .is_err()
        );
    }

    #[test]
    fn 文字欄位_沒帶不動_空的改回原本的() {
        assert_eq!(text_field(None, 10, "x"), Ok(TextEdit::Keep));
        assert_eq!(text_field(Some("  "), 10, "x"), Ok(TextEdit::Reset));
        assert_eq!(text_field(Some(" 海邊 "), 10, "x"), Ok(TextEdit::Set("海邊".into())));
        assert!(text_field(Some(&"字".repeat(11)), 10, "標題").unwrap_err().contains("標題"));
    }
}
