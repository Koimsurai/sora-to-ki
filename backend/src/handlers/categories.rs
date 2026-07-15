use axum::{extract::State, Json};
use serde::Serialize;
use sqlx::FromRow;

use crate::{error::AppError, state::AppState};

/// `GET /api/categories` 單列。欄位順序對齊 Express SELECT。
#[derive(Debug, Serialize, FromRow)]
pub struct CategoryRow {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub short_description: Option<String>,
    pub updated_at: Option<String>,
    pub post_count: i64,
}

#[derive(Debug, Serialize)]
pub struct CategoriesResponse {
    pub message: &'static str,
    pub categories: Vec<CategoryRow>,
}

/// `GET /api/categories` —— 公開純讀。SQL 逐字照抄 Express。
pub async fn list_categories(
    State(state): State<AppState>,
) -> Result<Json<CategoriesResponse>, AppError> {
    let categories = sqlx::query_as::<_, CategoryRow>(
        r#"
        SELECT
          c.id,
          c.name,
          c.slug,
          c.description,
          c.short_description,
          c.updated_at,
          COUNT(p.id) as post_count
        FROM categories c
        LEFT JOIN posts p ON p.category = c.name AND p.status = 'published'
        GROUP BY c.id, c.name, c.slug, c.description, c.short_description, c.updated_at
        ORDER BY post_count DESC, c.name ASC
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(CategoriesResponse {
        message: "success",
        categories,
    }))
}
