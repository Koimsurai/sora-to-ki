//! 照片的後台設定（`handlers/photo_meta`）：疊在 manifest 上的標題、標籤、精選、隱藏。
//!
//! 守的是三件「靜靜地錯」：藏起來的照片還在公開清單上、改過的標題在重新同步之後被蓋回檔名、
//! 公開清單多出 manifest 沒有的欄位（manifest 會被反覆讀寫，featured 只在 true 的時候出現）。
//!
//! ⚠ `GALLERY_MANIFEST_PATH` 是 process 全域的環境變數，這個檔依賴 nextest 一個測試一個行程。

mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{get, owner_token, request, test_app};

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/gallery_manifest.json");
const ID: &str = "fixture-2-numeric-exif";

async fn app() -> (axum::Router, sqlx::SqlitePool) {
    unsafe { std::env::set_var("GALLERY_MANIFEST_PATH", FIXTURE) };
    test_app().await
}

async fn admin(app: &axum::Router, method: &str, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    request(app, method, path, body, Some(&owner_token(true))).await
}

fn find<'a>(photos: &'a Value, id: &str) -> Option<&'a Value> {
    photos.as_array().unwrap().iter().find(|p| p["id"] == id)
}

#[tokio::test]
async fn 改標題與標籤_公開清單跟著變_原本的檔名還留著() {
    let (app, _pool) = app().await;
    let (st, v) = admin(
        &app,
        "PATCH",
        &format!("/api/admin/gallery/photos/{ID}"),
        Some(json!({ "title": "  傍晚的河堤 ", "tags": ["河", " 河 ", "", "夕陽"], "featured": true })),
    )
    .await;
    assert_eq!(st, StatusCode::OK, "{v}");
    assert_eq!(v["title"], "傍晚的河堤");
    assert_eq!(v["original_title"], "fixture-2-numeric-exif.jpg", "改過標題也要看得出是哪個檔");
    assert_eq!(v["tags"], json!(["河", "夕陽"]), "去空白、去重複、拿掉空的");

    let (_, public) = get(&app, "/api/gallery/photos").await;
    let p = find(&public["photos"], ID).unwrap();
    assert_eq!(p["title"], "傍晚的河堤");
    assert_eq!(public["featured"], json!([ID]), "精選另外列 id");
    assert!(p.get("featured").is_none(), "照片本身的形狀跟 manifest 檔一樣，不多出欄位");
    assert_eq!(v["featured"], true, "後台的那一張有自己的開關");

    // 空字串 = 改回 manifest 上的
    let (_, v) =
        admin(&app, "PATCH", &format!("/api/admin/gallery/photos/{ID}"), Some(json!({ "title": "" }))).await;
    assert_eq!(v["title"], "fixture-2-numeric-exif.jpg");
    assert_eq!(v["tags"], json!(["河", "夕陽"]), "沒帶的欄位不動");
}

#[tokio::test]
async fn 藏起來的照片公開清單不給_後台照樣看得到() {
    let (app, _pool) = app().await;
    let (_, before) = get(&app, "/api/gallery/photos").await;
    let total = before["totalPhotos"].as_u64().unwrap();

    let (st, _) =
        admin(&app, "PATCH", &format!("/api/admin/gallery/photos/{ID}"), Some(json!({ "hidden": true })))
            .await;
    assert_eq!(st, StatusCode::OK);

    let (_, public) = get(&app, "/api/gallery/photos").await;
    assert!(find(&public["photos"], ID).is_none(), "藏起來的還在公開清單上");
    assert_eq!(public["totalPhotos"].as_u64().unwrap(), total - 1, "張數要跟清單對得上");

    let (_, all) = admin(&app, "GET", "/api/admin/gallery/photos", None).await;
    assert_eq!(find(&all["photos"], ID).unwrap()["hidden"], true);
    assert_eq!(all["photos"].as_array().unwrap().len() as u64, total);
}

#[tokio::test]
async fn 沒有這張照片或欄位不對就不收() {
    let (app, pool) = app().await;
    let (st, _) =
        admin(&app, "PATCH", "/api/admin/gallery/photos/not-a-photo", Some(json!({ "featured": true })))
            .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM photo_meta").fetch_one(&pool).await.unwrap();
    assert_eq!(n, 0, "不存在的照片不該在表裡留一列");

    let (st, _) = admin(
        &app,
        "PATCH",
        &format!("/api/admin/gallery/photos/{ID}"),
        Some(json!({ "title": "字".repeat(81) })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = admin(
        &app,
        "PATCH",
        &format!("/api/admin/gallery/photos/{ID}"),
        Some(json!({ "tags": ["長".repeat(25)] })),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn 後台端點要登入() {
    let (app, _pool) = app().await;
    let (st, _) = request(&app, "GET", "/api/admin/gallery/photos", None, None).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, _) = request(
        &app,
        "PATCH",
        &format!("/api/admin/gallery/photos/{ID}"),
        Some(json!({ "hidden": true })),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
}
