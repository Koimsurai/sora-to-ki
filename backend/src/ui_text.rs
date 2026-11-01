//! 後端自己產出、會給人看的字（分享圖、信件、RSS）：直接讀前端的語系檔，不另外抄一份。
//! - `common.json`：前台也在用的（頁名、副標），前端改了譯文這裡跟著變
//! - `server.json`：只有伺服器寫的（信件、碎念的 RSS、llms.txt），不進前台的 bundle

use std::collections::HashMap;
use std::sync::LazyLock;

/// 站上的五個語系 → 語系檔、HTML／takumi 的語言標記、Noto CJK 裡對應的字形版本
/// （同一個字在繁中、簡中、日文、韓文的寫法不一樣，`.ttc` 裡四套都有）
pub struct Locale {
    pub code: &'static str,
    files: [&'static str; 2],
    pub lang: &'static str,
    pub cjk: &'static str,
}

macro_rules! files {
    ($code:literal) => {
        [
            include_str!(concat!("../../src/locales/", $code, "/common.json")),
            include_str!(concat!("../../src/locales/", $code, "/server.json")),
        ]
    };
}

pub const LOCALES: [Locale; 5] = [
    Locale { code: "zh-TW", files: files!("zh-TW"), lang: "zh-Hant", cjk: "TC" },
    Locale { code: "zh-CN", files: files!("zh-CN"), lang: "zh-Hans", cjk: "SC" },
    Locale { code: "en", files: files!("en"), lang: "en", cjk: "TC" },
    Locale { code: "ja", files: files!("ja"), lang: "ja", cjk: "JP" },
    Locale { code: "ko", files: files!("ko"), lang: "ko", cjk: "KR" },
];

/// 每個語系兩支檔的頂層合成一份（兩支的頂層 key 不重疊）
pub static STRINGS: LazyLock<HashMap<&'static str, serde_json::Value>> = LazyLock::new(|| {
    LOCALES
        .iter()
        .map(|l| {
            let mut all = serde_json::Map::new();
            for json in l.files {
                let serde_json::Value::Object(part) =
                    serde_json::from_str(json).expect("src/locales 的 JSON 由前端的測試把關，壞了編不到這裡")
                else {
                    panic!("src/locales 的語系檔頂層一定是物件");
                };
                all.extend(part);
            }
            (l.code, serde_json::Value::Object(all))
        })
        .collect()
});

pub fn locale_of(code: &str) -> &'static Locale {
    LOCALES.iter().find(|l| l.code == code).unwrap_or(&LOCALES[0])
}

/// 語系檔裡 `a.b.c` 那一條；這個語系沒有就退回繁中
pub fn text(locale: &str, key: &str) -> String {
    let find = |code: &str| {
        let mut v = STRINGS.get(code)?;
        for part in key.split('.') {
            v = v.get(part)?;
        }
        v.as_str().map(str::to_string)
    };
    find(locale).or_else(|| find("zh-TW")).unwrap_or_default()
}

/// 跟 i18next 一樣的 `{{name}}` 插值。值原樣放進去：要放進 HTML 的，呼叫端先轉義
pub fn fill(template: &str, vars: &[(&str, &str)]) -> String {
    vars.iter().fold(template.to_string(), |s, (k, v)| s.replace(&format!("{{{{{k}}}}}"), v))
}

/// 這個站自己的話（信件、碎念的 RSS）用哪個語系：站台的預設語系
pub fn site_text(key: &str) -> String {
    text(&crate::handlers::site_config::default_locale(), key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 插值照名字換掉_沒給的留著() {
        assert_eq!(fill("{{a}} · {{b}}", &[("a", "x"), ("b", "y")]), "x · y");
        assert_eq!(fill("{{a}} {{c}}", &[("a", "x")]), "x {{c}}");
    }

    /// server.json 每個語系都要有繁中有的每一條：少了就會在信件裡退回繁中
    #[test]
    fn server_json_每個語系都齊() {
        fn leaves(v: &serde_json::Value, at: &str, out: &mut Vec<String>) {
            match v {
                serde_json::Value::Object(m) => {
                    for (k, v) in m {
                        leaves(v, &if at.is_empty() { k.clone() } else { format!("{at}.{k}") }, out);
                    }
                }
                _ => out.push(at.to_string()),
            }
        }
        let keys_of = |l: &Locale| {
            let mut out = Vec::new();
            leaves(&serde_json::from_str(l.files[1]).expect("JSON"), "", &mut out);
            out.sort();
            out
        };
        let want = keys_of(&LOCALES[0]);
        for l in &LOCALES[1..] {
            assert_eq!(keys_of(l), want, "{} 的 server.json 跟繁中的 key 不一樣", l.code);
        }
    }

    #[test]
    fn 沒有的語系退回繁中() {
        assert_eq!(text("xx", "siteNav.notes"), text("zh-TW", "siteNav.notes"));
        assert_eq!(text("en", "siteNav.notes"), "Notes");
    }
}
