//! 這個站是誰：網址、站名、作者、站長信箱。
//!
//! 站名、作者、介紹以站台設定（`handlers::site_config`，後台與 MCP 改的那份）為準；
//! 環境變數只是它第一次建立時的種子，以及設定還沒載入時（測試）的退路。
//! 網址與站長信箱是部署層的事，只看環境變數。
//!
//! 都沒設就用**中性的預設值**，不是原作者的站——拉下來自架的人漏設的話會看到 `My Site`、
//! `localhost`，一眼就知道要去填，而不是悄悄把 RSS、信件、分享圖都署上別人的名字。
//!
//! 環境變數每次呼叫都重讀（同 `mailer::env_or` 的做法）：成本可以忽略，
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

/// 站名：RSS 標題、信件署名、分享圖上的品牌字。
pub fn site_name() -> String {
    crate::handlers::site_config::current().map_or_else(env_site_name, |s| s.name)
}

/// 作者名：文章沒填作者時的預設、RSS 的 `<author>`。沒設就跟站名一樣。
pub fn site_author() -> String {
    let from_settings = crate::handlers::site_config::current().map(|s| s.author);
    match from_settings {
        Some(author) => Some(author).filter(|a| !a.is_empty()),
        None => env_site_author(),
    }
    .unwrap_or_else(site_name)
}

/// 一句話介紹，RSS 的 `<description>`。沒設就用站名。
pub fn site_description() -> String {
    let from_settings = crate::handlers::site_config::current().map(|s| s.description);
    match from_settings {
        Some(description) => Some(description).filter(|d| !d.is_empty()),
        None => env_site_description(),
    }
    .unwrap_or_else(site_name)
}

/// `SITE_NAME`：站台設定的種子
pub fn env_site_name() -> String {
    env_nonempty("SITE_NAME").unwrap_or_else(|| DEFAULT_SITE_NAME.to_string())
}

/// `SITE_AUTHOR`：站台設定的種子
pub fn env_site_author() -> Option<String> {
    env_nonempty("SITE_AUTHOR")
}

/// `SITE_DESCRIPTION`：站台設定的種子
pub fn env_site_description() -> Option<String> {
    env_nonempty("SITE_DESCRIPTION")
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

/// 啟動時呼叫一次：網址沒設就記一條警告，免得部署完才發現 RSS 寫著 localhost。
/// 站名不必在這裡警告：它在後台就改得到。
pub fn warn_if_unset() {
    if env_nonempty("SITE_URL").is_none() && env_nonempty("PUBLIC_SITE_URL").is_none() {
        tracing::warn!(site_url = %site_url(), "SITE_URL 沒有設定，RSS、信件、分享圖的連結會指向預設位址");
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
