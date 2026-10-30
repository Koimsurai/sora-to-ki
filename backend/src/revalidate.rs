use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Duration;

// 文章內容變更後,通知前端清掉 ISR 快取(nitro routeRules 的 swr;文章頁 TTL 1h、列表 5min)。
//
// 刻意做成 middleware 而非在各 handler 內呼叫:posts 的寫入散在 posts.rs / admin.rs / opencc.rs
// 共 14 處,逐一掛必然會漏 —— 而且漏掉不會報錯,只會安靜地讓讀者看到舊內容。
// 這裡只認「寫入方法 + 動到文章本體的路徑 + 回應成功」,新增端點自動涵蓋。

// 這些子路徑是高頻互動,絕不能觸發清快取:
// /view 是每次有人瀏覽文章都會打 —— 若也清快取,等於每有一次瀏覽就把全站 ISR 清空,
// ISR 直接失效且不斷重複重生。like/reactions/comments 同理,而且它們的內容是 client 端
// 才 render 的(不在 SSR HTML 裡),清了也沒意義。
const NON_CONTENT_ACTIONS: &[&str] = &["view", "like", "unlike", "reactions", "comments", "send-newsletter"];

fn is_content_mutation(path: &str) -> bool {
    if !path.starts_with("/api/posts") && !path.starts_with("/api/admin/posts") {
        return false;
    }
    // 末段是高頻互動動作就跳過;其餘(/api/posts/:id/status、/api/admin/posts/:id、
    // /api/admin/posts/:id/generate-zh-cn …)都算文章本體變更。
    let last = path.rsplit('/').next().unwrap_or("");
    !NON_CONTENT_ACTIONS.contains(&last)
}

pub async fn notify_on_post_write(req: Request, next: Next) -> Response {
    let is_write = matches!(req.method().as_str(), "POST" | "PUT" | "PATCH" | "DELETE");
    let should_notify = is_write && is_content_mutation(req.uri().path());

    let res = next.run(req).await;

    if should_notify && res.status().is_success() {
        tokio::spawn(fire()); // fire-and-forget:不拖慢寫入回應
    }
    res
}

/// 有值的環境變數。compose 用 `${X:-}` 替換,未設定時傳進來的是空字串而非「不存在」,
/// env::var 會回 Ok("") —— 不擋的話每次發文都會送出空密鑰、被前端擋掉,然後在 log 噴 warn。
fn env_set(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

/// 前後端共用的密鑰:`REVALIDATE_SECRET` 有填就用它;沒填就讀 `REVALIDATE_SECRET_FILE` 那個檔。
///
/// 自架的人多半不會去填 `REVALIDATE_SECRET`(範本裡是選填),結果改了站名、跑完初次設定精靈,
/// 前台還掛著舊的快取一小時。所以 compose 把同一個 volume 掛給前後端,後端開機時沒有就產生一把
/// (`ensure_secret_file`),前端的 `/_revalidate` 讀同一個檔(server/routes/_revalidate.ts)。
fn secret() -> Option<String> {
    env_set("REVALIDATE_SECRET").or_else(|| {
        let raw = std::fs::read_to_string(env_set("REVALIDATE_SECRET_FILE")?).ok()?;
        Some(raw.trim().to_string()).filter(|s| !s.is_empty())
    })
}

/// 開機時呼叫:沒填 `REVALIDATE_SECRET`、檔案又還不存在,就產生一把寫進 `REVALIDATE_SECRET_FILE`。
pub fn ensure_secret_file() {
    if env_set("REVALIDATE_SECRET").is_some() {
        return;
    }
    let Some(path) = env_set("REVALIDATE_SECRET_FILE") else { return };
    if std::path::Path::new(&path).exists() {
        return;
    }
    let key: String = {
        use rand::RngExt;
        let mut rng = rand::rng();
        const HEX: &[u8] = b"0123456789abcdef";
        (0..64).map(|_| char::from(HEX[rng.random_range(0..HEX.len())])).collect()
    };
    if let Err(e) = std::fs::write(&path, key) {
        tracing::warn!("清快取的密鑰寫不進 {path}: {e}(前台要等快取自然過期)");
    }
}

/// 請前端清 ISR 快取。不是經過 HTTP 寫入文章的地方（排程 worker）要自己呼叫。
pub async fn fire() {
    // 網址與密鑰都要有才啟用;缺任一 = 功能沒開,安靜跳過。
    let (Some(url), Some(secret)) = (env_set("FRONTEND_REVALIDATE_URL"), secret()) else {
        return;
    };

    let res = reqwest::Client::new()
        .post(&url)
        .header("x-revalidate-secret", secret)
        .timeout(Duration::from_secs(3))
        .send()
        .await;

    // 通知失敗不影響已完成的寫入,最壞情況只是等 TTL 過期 → 記 warn 供排查,不往上拋。
    match res {
        Ok(r) if r.status().is_success() => tracing::debug!("ISR 快取已請前端清除"),
        Ok(r) => tracing::warn!("前端 revalidate 回應 {}", r.status()),
        Err(e) => tracing::warn!("前端 revalidate 打不通: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_content_mutation, notify_on_post_write};
    use axum::{Router, body::Body, http::Request, routing::put};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tower::ServiceExt;

    // 假前端:收一個請求就把整包原始 HTTP 內容送回來,用來驗證通知真的送出且帶對標頭。
    async fn mock_frontend() -> (String, tokio::sync::oneshot::Receiver<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                let mut buf = vec![0u8; 2048];
                let n = sock.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = sock.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok").await;
                let _ = tx.send(req);
            }
        });
        (format!("http://127.0.0.1:{port}/_revalidate"), rx)
    }

    fn app() -> Router {
        Router::new()
            .route("/api/posts/{id}", put(|| async { "ok" }))
            .route("/api/posts/{id}/view", put(|| async { "ok" }))
            .layer(axum::middleware::from_fn(notify_on_post_write))
    }

    // 正負兩案寫在同一個測試:env var 是 process 全域的,分成兩個平行測試會互相干擾。
    #[tokio::test]
    async fn 內容變更會實際發出通知_瀏覽則不會() {
        let (url, rx) = mock_frontend().await;
        // FIXME: Audit that the environment access only happens in single-threaded code.
        unsafe { std::env::set_var("FRONTEND_REVALIDATE_URL", &url) };
        // FIXME: Audit that the environment access only happens in single-threaded code.
        unsafe { std::env::set_var("REVALIDATE_SECRET", "s3cret") };

        // 1) 高頻瀏覽端點:不該發通知
        let res = app()
            .oneshot(Request::builder().method("PUT").uri("/api/posts/39/view").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(res.status().is_success());

        // 2) 文章本體變更:該發通知
        let res = app()
            .oneshot(Request::builder().method("PUT").uri("/api/posts/39").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert!(res.status().is_success());

        // 注意:這裡分辨不出通知是哪個請求觸發的(兩者發出的通知內容完全相同)。
        // 「/view 不可觸發」由上面的 高頻互動不可清快取 單元測試把關;
        // 本測試負責的是「middleware 真的有跑、狀態碼判斷正確、通知確實帶密鑰送達」。
        let got = tokio::time::timeout(std::time::Duration::from_secs(5), rx)
            .await
            .expect("逾時:前端沒收到任何 revalidate 通知")
            .expect("通道關閉");
        assert!(got.starts_with("POST /_revalidate"), "收到的是: {got}");
        assert!(got.to_lowercase().contains("x-revalidate-secret: s3cret"), "缺少密鑰標頭: {got}");
    }

    #[test]
    fn 文章本體變更要清快取() {
        for p in [
            "/api/posts",
            "/api/posts/39",
            "/api/posts/39/status",
            "/api/admin/posts",
            "/api/admin/posts/39",
            "/api/admin/posts/39/generate-zh-cn",
        ] {
            assert!(is_content_mutation(p), "{p} 應該要清快取");
        }
    }

    #[test]
    fn 高頻互動不可清快取() {
        // 這幾條若誤判成 true,每次有人看文章就會清光全站 ISR 快取
        for p in [
            "/api/posts/39/view",
            "/api/posts/39/like",
            "/api/posts/39/unlike",
            "/api/posts/39/reactions",
            "/api/posts/39/comments",
            "/api/admin/posts/39/send-newsletter",
        ] {
            assert!(!is_content_mutation(p), "{p} 不該清快取");
        }
    }

    #[test]
    fn 無關路徑不受影響() {
        for p in ["/api/thoughts", "/api/books", "/api/admin/users/1/role", "/"] {
            assert!(!is_content_mutation(p), "{p} 不該清快取");
        }
    }

    // 沒填 REVALIDATE_SECRET 的自架站:開機產生一把寫進共用檔,之後讀到的都是同一把;有填的話檔案不用
    // （env 是 process 全域的:nextest 每個測試各一個 process,所以這裡改 env 不會干擾別的測試）
    #[test]
    fn 沒填密鑰時開機產生一把_有填就用填的() {
        let path = std::env::temp_dir().join(format!("revalidate-secret-{}", std::process::id()));
        let _ = std::fs::remove_file(&path);
        // SAFETY: 這個測試自己一個 process,沒有別的執行緒在讀 env。
        unsafe {
            std::env::set_var("REVALIDATE_SECRET", "");
            std::env::set_var("REVALIDATE_SECRET_FILE", &path);
        }
        super::ensure_secret_file();
        let first = super::secret().expect("要產生一把");
        assert_eq!(first.len(), 64);
        super::ensure_secret_file();
        assert_eq!(super::secret().as_deref(), Some(first.as_str()), "已經有了就不要換,前端讀的是同一個檔");

        // SAFETY: 同上。
        unsafe { std::env::set_var("REVALIDATE_SECRET", "s3cret") };
        assert_eq!(super::secret().as_deref(), Some("s3cret"));
        let _ = std::fs::remove_file(&path);
    }
}
