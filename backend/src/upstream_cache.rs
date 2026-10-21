//! 第三方代理的回應快取（GitHub／WakaTime／Steam／Spotify 那幾支 GET）。
//!
//! 在這之前那些端點每個請求都直接打上游：`/api/github/events` 一次 7–10 秒、
//! contributions 將近 1 秒，而且上游一抖就原樣把 5xx 傳給讀者（實測 Steam 那幾支
//! 一起回 500/503）。這層做三件事，各支 handler 不用自己寫：
//!
//! 1. **TTL 快取**：key 是 path + query，依路由給不同的 TTL。
//! 2. **出錯時回舊值**：上游回 5xx／429 而手上有舊資料（不超過 [`MAX_STALE_MS`]）就回舊的，
//!    標 `x-upstream-cache: stale`。讀者看到的是幾分鐘前的資料，而不是一片錯誤。
//! 3. **同一個 key 只放一個請求去打上游**：快取過期的那一刻湧進來的請求，排在同一把鎖後面，
//!    第一個抓完其他人直接拿結果。
//!
//! 只收 2xx；4xx（使用者不存在之類）照原樣回、不快取。
//! key 有上限（[`MAX_ENTRIES`]）：`{username}` 這類參數來自公開網址，不設上限的話任何人
//! 換參數就能把 map 撐到無限大。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::body::{Body, Bytes};
use axum::extract::{Request, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use parking_lot::Mutex;

use crate::util::now_ms;

const MAX_ENTRIES: usize = 256;
/// 上游出錯時，多舊的資料還願意拿出來回。
pub const MAX_STALE_MS: i64 = 24 * 60 * 60 * 1000;
/// 單筆回應的大小上限；超過就照原樣回、不快取（這些端點實際都在幾十 KB 以內）。
const MAX_BODY: usize = 2 * 1024 * 1024;
const LOCK_SHARDS: usize = 32;

#[derive(Clone)]
struct Entry {
    status: StatusCode,
    content_type: Option<HeaderValue>,
    body: Bytes,
    fetched_at: i64,
}

pub struct UpstreamCache {
    entries: Mutex<HashMap<String, Entry>>,
    // 每個 key 一把鎖的話鎖本身也要清；固定幾把、依 key 雜湊分配就好
    locks: [tokio::sync::Mutex<()>; LOCK_SHARDS],
}

impl Default for UpstreamCache {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            locks: std::array::from_fn(|_| tokio::sync::Mutex::new(())),
        }
    }
}

impl UpstreamCache {
    fn get(&self, key: &str) -> Option<Entry> {
        self.entries.lock().get(key).cloned()
    }

    fn put(&self, key: String, entry: Entry) {
        let mut map = self.entries.lock();
        if map.len() >= MAX_ENTRIES && !map.contains_key(&key) {
            // 滿了就丟掉最舊的那筆
            if let Some(oldest) = map.iter().min_by_key(|(_, e)| e.fetched_at).map(|(k, _)| k.clone()) {
                map.remove(&oldest);
            }
        }
        map.insert(key, entry);
    }

    fn lock_for(&self, key: &str) -> &tokio::sync::Mutex<()> {
        use std::hash::{Hash, Hasher};
        // DefaultHasher::new() 的種子是固定的，同一個 key 一定落在同一把鎖
        let mut h = std::hash::DefaultHasher::new();
        key.hash(&mut h);
        #[expect(clippy::cast_possible_truncation, reason = "取餘數之後必定小於 LOCK_SHARDS")]
        let i = (h.finish() % LOCK_SHARDS as u64) as usize;
        &self.locks[i]
    }
}

/// 掛在路由上的設定：同一個 [`UpstreamCache`]，各路由自己的 TTL。
#[derive(Clone)]
pub struct CachePolicy {
    pub cache: Arc<UpstreamCache>,
    pub ttl: Duration,
}

fn respond(e: &Entry, tag: &'static str) -> Response {
    let mut res = (e.status, e.body.clone()).into_response();
    if let Some(ct) = &e.content_type {
        res.headers_mut().insert(header::CONTENT_TYPE, ct.clone());
    }
    res.headers_mut().insert("x-upstream-cache", HeaderValue::from_static(tag));
    res
}

fn ttl_ms(p: &CachePolicy) -> i64 {
    i64::try_from(p.ttl.as_millis()).unwrap_or(i64::MAX)
}

pub async fn layer(State(policy): State<CachePolicy>, req: Request, next: Next) -> Response {
    let key = req.uri().path_and_query().map_or_else(|| req.uri().path().to_string(), ToString::to_string);
    let fresh = |e: &Entry| now_ms() - e.fetched_at < ttl_ms(&policy);

    if let Some(e) = policy.cache.get(&key).filter(fresh) {
        return respond(&e, "hit");
    }
    let _guard = policy.cache.lock_for(&key).lock().await;
    // 排隊的時候前一個人可能已經抓好了
    let cached = policy.cache.get(&key);
    if let Some(e) = cached.as_ref().filter(|e| fresh(e)) {
        return respond(e, "hit");
    }

    let res = next.run(req).await;
    let status = res.status();

    if status.is_success() {
        let (parts, body) = res.into_parts();
        let Ok(bytes) = axum::body::to_bytes(body, MAX_BODY).await else {
            return (StatusCode::BAD_GATEWAY, "upstream response too large").into_response();
        };
        let entry = Entry {
            status,
            content_type: parts.headers.get(header::CONTENT_TYPE).cloned(),
            body: bytes.clone(),
            fetched_at: now_ms(),
        };
        policy.cache.put(key, entry);
        let mut res = Response::from_parts(parts, Body::from(bytes));
        res.headers_mut().insert("x-upstream-cache", HeaderValue::from_static("miss"));
        return res;
    }

    let upstream_failed = status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS;
    if upstream_failed && let Some(e) = cached.filter(|e| now_ms() - e.fetched_at < MAX_STALE_MS) {
        tracing::warn!(path = %key, %status, "上游出錯，回快取的舊資料");
        return respond(&e, "stale");
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::routing::get;
    use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
    use tower::ServiceExt;

    /// 一支假的上游：記被呼叫幾次，回應的狀態碼可以中途改。
    struct Upstream {
        calls: AtomicUsize,
        status: AtomicU16,
    }

    fn app(ttl_secs: u64) -> (Router, Arc<Upstream>, Arc<UpstreamCache>) {
        let up = Arc::new(Upstream { calls: AtomicUsize::new(0), status: AtomicU16::new(200) });
        let cache = Arc::new(UpstreamCache::default());
        let u = up.clone();
        let handler = move |axum::extract::Path(name): axum::extract::Path<String>| {
            let u = u.clone();
            async move {
                let n = u.calls.fetch_add(1, Ordering::SeqCst) + 1;
                // 模擬慢上游，讓「同時湧入」的測試真的同時
                tokio::time::sleep(Duration::from_millis(20)).await;
                let status = StatusCode::from_u16(u.status.load(Ordering::SeqCst)).expect("合法狀態碼");
                (status, axum::Json(serde_json::json!({ "name": name, "call": n })))
            }
        };
        let policy = CachePolicy { cache: cache.clone(), ttl: Duration::from_secs(ttl_secs) };
        let router = Router::new()
            .route("/x/{name}", get(handler).layer(axum::middleware::from_fn_with_state(policy, layer)));
        (router, up, cache)
    }

    async fn call(app: &Router, path: &str) -> (StatusCode, String, serde_json::Value) {
        let res = app
            .clone()
            .oneshot(Request::get(path).body(Body::empty()).expect("request"))
            .await
            .expect("oneshot");
        let status = res.status();
        let tag = res
            .headers()
            .get("x-upstream-cache")
            .map(|v| v.to_str().unwrap_or("").to_string())
            .unwrap_or_default();
        let bytes = axum::body::to_bytes(res.into_body(), MAX_BODY).await.expect("body");
        (status, tag, serde_json::from_slice(&bytes).unwrap_or_default())
    }

    #[tokio::test]
    async fn ttl_內同一個網址只打一次上游() {
        let (app, up, _) = app(60);
        let (_, tag, body) = call(&app, "/x/a").await;
        assert_eq!((tag.as_str(), body["call"].as_i64()), ("miss", Some(1)));
        let (_, tag, body) = call(&app, "/x/a").await;
        assert_eq!((tag.as_str(), body["call"].as_i64()), ("hit", Some(1)), "第二次要拿快取");
        call(&app, "/x/a?page=2").await;
        assert_eq!(up.calls.load(Ordering::SeqCst), 2, "query 不同是不同的 key");
    }

    #[tokio::test]
    async fn 過期之後重抓() {
        let (app, up, _) = app(0);
        call(&app, "/x/a").await;
        call(&app, "/x/a").await;
        assert_eq!(up.calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn 上游出錯時回舊資料_沒有舊資料就照原樣回錯() {
        let (app, up, _) = app(0);
        up.status.store(500, Ordering::SeqCst);
        let (status, _, _) = call(&app, "/x/a").await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "沒有舊資料可回時就是錯誤");

        up.status.store(200, Ordering::SeqCst);
        call(&app, "/x/a").await; // 存進一份好的（call = 2）
        for bad in [500, 503, 429] {
            up.status.store(bad, Ordering::SeqCst);
            let (status, tag, body) = call(&app, "/x/a").await;
            assert_eq!(status, StatusCode::OK, "{bad} 時要回舊資料");
            assert_eq!(tag, "stale");
            assert_eq!(body["call"], 2, "回的是上一次成功的那份");
        }
    }

    #[tokio::test]
    async fn 四開頭的錯誤不快取也不拿舊資料蓋掉() {
        let (app, up, _) = app(0);
        call(&app, "/x/a").await;
        up.status.store(404, Ordering::SeqCst);
        let (status, _, _) = call(&app, "/x/a").await;
        assert_eq!(status, StatusCode::NOT_FOUND, "404 是真的答案，不是上游壞掉");
    }

    #[tokio::test]
    async fn 同時湧入的請求只放一個去打上游() {
        let (app, up, _) = app(60);
        let reqs = (0..8).map(|_| {
            let app = app.clone();
            async move { call(&app, "/x/a").await }
        });
        let results = futures_join_all(reqs).await;
        assert_eq!(up.calls.load(Ordering::SeqCst), 1, "其他七個要排隊拿第一個的結果");
        assert!(results.iter().all(|(s, _, b)| *s == StatusCode::OK && b["call"] == 1));
    }

    #[tokio::test]
    async fn key_數量有上限() {
        let (app, _, cache) = app(60);
        for i in 0..MAX_ENTRIES + 10 {
            call(&app, &format!("/x/{i}")).await;
        }
        assert_eq!(cache.entries.lock().len(), MAX_ENTRIES, "公開參數換來換去不能把 map 撐爆");
    }

    /// 沒有 futures crate：用 JoinSet 一起跑，照原順序收回來。
    async fn futures_join_all<F, T>(futs: impl Iterator<Item = F>) -> Vec<T>
    where
        F: std::future::Future<Output = T> + Send + 'static,
        T: Send + 'static,
    {
        let mut set = tokio::task::JoinSet::new();
        for (i, f) in futs.enumerate() {
            set.spawn(async move { (i, f.await) });
        }
        let mut out: Vec<(usize, T)> = Vec::new();
        while let Some(r) = set.join_next().await {
            out.push(r.expect("task"));
        }
        out.sort_by_key(|(i, _)| *i);
        out.into_iter().map(|(_, t)| t).collect()
    }
}
