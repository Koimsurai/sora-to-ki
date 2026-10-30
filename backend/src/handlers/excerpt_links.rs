//! 摘要裡「哪幾句連到哪一章」（`posts.excerpt_links`，見 migration 0020）。
//!
//! 存的是依語系分開的 JSON：`{"zh-TW": [{"text": "…", "to": "05.4"}], "en": [...]}`。
//! 寫入時逐筆檢查，讀出時只留摘要裡真的找得到的句子——摘要改寫過、句子對不上的連結
//! 直接不出現，不會在前台畫出一條指向空氣的底線。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::Problem;
use crate::handlers::posts::I18N_LOCALES;

/// 摘要裡的一句話，連到 `to` 那一章（`05` 是第五個大節，`05.4` 是它底下第四個小節）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct ExcerptLink {
    pub text: String,
    pub to: String,
}

pub type LinkMap = BTreeMap<String, Vec<ExcerptLink>>;

/// 一個語系最多幾句：摘要只有幾句話，畫太多底線就等於沒有重點。
const MAX_PER_LOCALE: usize = 24;
const MAX_TEXT_CHARS: usize = 120;

/// DB 裡存的 JSON → 對照表。壞掉的 JSON 當作沒有（只有這個模組寫得進去，理論上不會壞）。
pub fn parse_stored(raw: Option<&str>) -> LinkMap {
    raw.and_then(|s| serde_json::from_str(s).ok()).unwrap_or_default()
}

/// 公開 API 用：某語系的連結，只留摘要裡找得到的句子。
pub fn for_locale(raw: Option<&str>, locale: &str, excerpt: &str) -> Vec<ExcerptLink> {
    let mut map = parse_stored(raw);
    map.remove(locale).unwrap_or_default().into_iter().filter(|l| excerpt.contains(&l.text)).collect()
}

/// `to` 只收章節編號：兩位數，或兩位數接「.」再接一到兩位數。
fn valid_target(to: &str) -> bool {
    let (major, minor) = match to.split_once('.') {
        Some((a, b)) => (a, Some(b)),
        None => (to, None),
    };
    let digits = |s: &str, lens: &[usize]| lens.contains(&s.len()) && s.bytes().all(|c| c.is_ascii_digit());
    digits(major, &[2]) && minor.is_none_or(|m| digits(m, &[1, 2]))
}

fn parse_links(locale: &str, v: &Value) -> Result<Vec<ExcerptLink>, Problem> {
    let shape = || {
        Problem::new("excerpt_shape", format!("excerpt_links.{locale} must be an array of {{ text, to }}"))
            .param("lang", locale)
    };
    let Value::Array(items) = v else {
        return Err(shape());
    };
    if items.len() > MAX_PER_LOCALE {
        return Err(Problem::new(
            "excerpt_too_many",
            format!("excerpt_links.{locale}: at most {MAX_PER_LOCALE} sentences"),
        )
        .param("lang", locale)
        .param("max", MAX_PER_LOCALE));
    }
    items
        .iter()
        .map(|item| {
            let link: ExcerptLink = serde_json::from_value(item.clone()).map_err(|_| shape())?;
            let text = link.text.trim().to_string();
            if text.is_empty() || text.chars().count() > MAX_TEXT_CHARS {
                return Err(Problem::new(
                    "excerpt_text_length",
                    format!("excerpt_links.{locale}: text must be 1 to {MAX_TEXT_CHARS} characters"),
                )
                .param("lang", locale)
                .param("max", MAX_TEXT_CHARS));
            }
            if !valid_target(&link.to) {
                return Err(Problem::new(
                    "excerpt_target",
                    format!(
                        "excerpt_links.{locale}: to must be a section number (like 05 or 05.4), got {}",
                        link.to
                    ),
                )
                .param("lang", locale)
                .param("target", link.to.as_str()));
            }
            Ok(ExcerptLink { text, to: link.to })
        })
        .collect()
}

fn to_stored(map: &LinkMap) -> Option<String> {
    if map.is_empty() { None } else { serde_json::to_string(map).ok() }
}

/// 後台寫入：把請求帶的 `excerpt_links` 併進現有的值，回傳要存回 DB 的字串（`None` = 清成 NULL）。
///
/// - `null`：整欄清掉
/// - 物件：有帶到的語系整組換掉，`null` 或 `[]` 刪掉那個語系；沒帶到的語系不動
pub fn merge_input(stored: Option<&str>, input: &Value) -> Result<Option<String>, Problem> {
    let Value::Object(by_locale) = input else {
        return if input.is_null() {
            Ok(None)
        } else {
            Err(Problem::new("excerpt_shape", "excerpt_links must be an object or null"))
        };
    };
    let mut map = parse_stored(stored);
    for (locale, v) in by_locale {
        if !I18N_LOCALES.contains(&locale.as_str()) {
            return Err(Problem::new("unknown_locale", format!("excerpt_links: unknown language {locale}"))
                .param("field", "excerptLinks")
                .param("lang", locale.as_str()));
        }
        let links = if v.is_null() { Vec::new() } else { parse_links(locale, v)? };
        if links.is_empty() {
            map.remove(locale);
        } else {
            map.insert(locale.clone(), links);
        }
    }
    Ok(to_stored(&map))
}

/// 簡體譯文是從繁體轉出來的（`opencc`），連結也跟著轉：轉完在簡體摘要裡找得到的句子才留。
pub fn convert_locale(
    stored: Option<&str>,
    from: &str,
    to: &str,
    target_excerpt: Option<&str>,
    convert: impl Fn(&str) -> String,
) -> Option<String> {
    let mut map = parse_stored(stored);
    let converted: Vec<ExcerptLink> = match (map.get(from), target_excerpt) {
        (Some(links), Some(excerpt)) => links
            .iter()
            .map(|l| ExcerptLink { text: convert(&l.text), to: l.to.clone() })
            .filter(|l| excerpt.contains(&l.text))
            .collect(),
        _ => Vec::new(),
    };
    if converted.is_empty() {
        map.remove(to);
    } else {
        map.insert(to.to_string(), converted);
    }
    to_stored(&map)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn 章節編號只收兩位數大節與一到兩位數小節() {
        for ok in ["01", "05", "05.4", "12.10"] {
            assert!(valid_target(ok), "{ok}");
        }
        for bad in ["", "5", "005", "05.", "05.123", "a5", "05.x", "#ar-h05"] {
            assert!(!valid_target(bad), "{bad}");
        }
    }

    #[test]
    fn 寫入只換有帶到的語系_空陣列刪掉該語系() {
        let first = merge_input(None, &json!({ "zh-TW": [{ "text": " 正確率只有 38% ", "to": "05.4" }] }))
            .unwrap()
            .unwrap();
        // 前後空白會修掉
        assert_eq!(for_locale(Some(&first), "zh-TW", "…正確率只有 38%…")[0].text, "正確率只有 38%");

        let both = merge_input(Some(&first), &json!({ "en": [{ "text": "only 38%", "to": "05" }] })).unwrap();
        let map = parse_stored(both.as_deref());
        assert_eq!(map.len(), 2, "沒帶到的 zh-TW 要留著");

        let back = merge_input(both.as_deref(), &json!({ "en": [] })).unwrap();
        assert_eq!(parse_stored(back.as_deref()).keys().collect::<Vec<_>>(), ["zh-TW"]);

        let gone = merge_input(back.as_deref(), &json!({ "zh-TW": null })).unwrap();
        assert_eq!(gone, None, "最後一個語系刪掉就整欄 NULL");
        assert_eq!(merge_input(Some(&first), &Value::Null).unwrap(), None);
    }

    #[test]
    fn 寫入擋掉格式不對的() {
        assert!(merge_input(None, &json!("x")).is_err());
        assert!(merge_input(None, &json!({ "fr": [] })).is_err());
        assert!(merge_input(None, &json!({ "en": { "text": "a", "to": "01" } })).is_err());
        assert!(merge_input(None, &json!({ "en": [{ "text": "a" }] })).is_err());
        assert!(merge_input(None, &json!({ "en": [{ "text": "  ", "to": "01" }] })).is_err());
        assert!(merge_input(None, &json!({ "en": [{ "text": "a", "to": "1" }] })).is_err());
        let long = "字".repeat(MAX_TEXT_CHARS + 1);
        assert!(merge_input(None, &json!({ "en": [{ "text": long, "to": "01" }] })).is_err());
        let many: Vec<_> = (0..=MAX_PER_LOCALE).map(|_| json!({ "text": "a", "to": "01" })).collect();
        assert!(merge_input(None, &json!({ "en": many })).is_err());
    }

    #[test]
    fn 讀出只留摘要裡找得到的句子() {
        let raw = merge_input(
            None,
            &json!({ "zh-TW": [{ "text": "還在", "to": "01" }, { "text": "改寫掉了", "to": "02" }] }),
        )
        .unwrap();
        let links = for_locale(raw.as_deref(), "zh-TW", "這句還在。");
        assert_eq!(links, vec![ExcerptLink { text: "還在".into(), to: "01".into() }]);
        assert_eq!(for_locale(raw.as_deref(), "en", "這句還在。"), [], "別的語系沒有就是空的");
        assert_eq!(for_locale(Some("not json"), "zh-TW", "x"), []);
    }

    #[test]
    fn 簡體連結從繁體轉出來_轉完對不上的不留() {
        let raw = merge_input(
            None,
            &json!({ "zh-TW": [{ "text": "從零架設", "to": "02" }, { "text": "對不上", "to": "03" }] }),
        )
        .unwrap();
        let conv = |s: &str| s.replace('從', "从").replace('設', "设");
        let out = convert_locale(raw.as_deref(), "zh-TW", "zh-CN", Some("文中附上从零架设的步骤"), conv);
        let map = parse_stored(out.as_deref());
        assert_eq!(map["zh-CN"], vec![ExcerptLink { text: "从零架设".into(), to: "02".into() }]);
        assert_eq!(map["zh-TW"].len(), 2, "繁體那組不動");

        // 簡體摘要沒了 → 簡體連結一起拿掉
        let cleared = convert_locale(out.as_deref(), "zh-TW", "zh-CN", None, conv);
        assert!(!parse_stored(cleared.as_deref()).contains_key("zh-CN"));
    }
}
