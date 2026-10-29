//! 這個站是誰：網址、站名、作者、站長信箱。
//!
//! 全部從環境變數讀，沒設就用**中性的預設值**，不是原作者的站——拉下來自架的人
//! 漏設的話會看到 `My Site`、`localhost`，一眼就知道要去填，而不是悄悄把 RSS、信件、
//! 分享圖都署上別人的名字。啟動時 [`warn_if_unset`] 會把漏設的列出來。
//!
//! 每次呼叫都重讀環境變數（同 `mailer::env_or` 的做法）：成本可以忽略，
//! 測試也不必處理「第一次讀到的值被快取住」的問題。

/// 軟體本身的名字。用在對外請求的 User-Agent 與第三方 API 要求的 app 名稱，
/// 讓對方看得出是哪套程式發的；站台自己的名字另外放在 [`site_name`]。
pub const SOFTWARE: &str = "sora-to-ki";

const DEFAULT_SITE_URL: &str = "http://localhost:13579";
const DEFAULT_SITE_NAME: &str = "My Site";

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// 站台網址，不帶結尾的 `/`。讀 `SITE_URL`；舊的 `PUBLIC_SITE_URL` 仍然認得。
pub fn site_url() -> String {
    let raw = env_nonempty("SITE_URL")
        .or_else(|| env_nonempty("PUBLIC_SITE_URL"))
        .unwrap_or_else(|| DEFAULT_SITE_URL.to_string());
    raw.trim_end_matches('/').to_string()
}

/// 站台網址的 host，去掉 `www.`，例如 `example.com`。分析工具的站台 ID、友鏈的回連檢查都用它。
pub fn site_host() -> String {
    let Some(host) =
        reqwest::Url::parse(&site_url()).ok().and_then(|u| u.host_str().map(str::to_ascii_lowercase))
    else {
        return String::new();
    };
    host.strip_prefix("www.").unwrap_or(&host).to_string()
}

/// 站名（`SITE_NAME`）：RSS 標題、信件署名、分享圖上的品牌字。
pub fn site_name() -> String {
    env_nonempty("SITE_NAME").unwrap_or_else(|| DEFAULT_SITE_NAME.to_string())
}

/// 作者名（`SITE_AUTHOR`）：文章沒填作者時的預設、RSS 的 `<author>`。沒設就跟站名一樣。
pub fn site_author() -> String {
    env_nonempty("SITE_AUTHOR").unwrap_or_else(site_name)
}

/// 一句話介紹（`SITE_DESCRIPTION`），RSS 的 `<description>`。沒設就用站名。
pub fn site_description() -> String {
    env_nonempty("SITE_DESCRIPTION").unwrap_or_else(site_name)
}

/// 站長的信箱（`OWNER_EMAIL`）。用這個信箱第一次 OAuth 登入的人會拿到 OWNER 角色；
/// 沒設就沒有人會自動變成站長。
pub fn owner_email() -> Option<String> {
    env_nonempty("OWNER_EMAIL")
}

/// 對外請求的 User-Agent：`sora-to-ki-<用途>/1.0 (+站台網址)`，讓對方查得到是誰。
pub fn user_agent(purpose: &str) -> String {
    format!("{SOFTWARE}-{purpose}/1.0 (+{})", site_url())
}

/// 啟動時呼叫一次：身分相關的環境變數沒設就記一條警告，免得部署完才發現 RSS 寫著 localhost。
pub fn warn_if_unset() {
    let missing: Vec<&str> = ["SITE_URL", "SITE_NAME"]
        .into_iter()
        .filter(|k| {
            env_nonempty(k).is_none() && !(*k == "SITE_URL" && env_nonempty("PUBLIC_SITE_URL").is_some())
        })
        .collect();
    if !missing.is_empty() {
        tracing::warn!(
            missing = ?missing,
            site_url = %site_url(),
            site_name = %site_name(),
            "站台身分沒有設定完整，RSS、信件、分享圖會用預設值"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_agent_帶軟體名_用途與站台網址() {
        let ua = user_agent("linkpreview");
        assert!(ua.starts_with("sora-to-ki-linkpreview/1.0 (+"), "{ua}");
        assert!(ua.ends_with(&format!("{})", site_url())), "{ua}");
    }

    #[test]
    fn site_url_不帶結尾斜線() {
        assert!(!site_url().ends_with('/'));
    }
}
