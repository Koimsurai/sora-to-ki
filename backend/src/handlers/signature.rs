//! 文末的手寫簽名：站長自己的，沒有就不顯示。
//!
//! 存成一串「步驟」：一筆（SVG 路徑）或一個點（像 i 上面那點），照寫的順序排。前台照這個順序
//! 用一顆筆尖一筆一筆寫出來（`components/common/SignatureSVG.tsx`）。只存路徑資料與座標，
//! 不存 SVG 原檔：上傳的檔案裡可能夾著 script 或外部連結，那些都不該進到每一篇文章的頁面裡。
//!
//! 來源有兩個：後台站台設定上傳 SVG（前端解析成步驟再送來），或 `SITE_SIGNATURE_FILE`
//! 指向一個 SVG 檔，開機時資料庫裡還沒有簽名就讀進來一次（自架的人、agent 用；跟站名的種子同一個做法）。

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::Problem;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct Signature {
    /// SVG 的 viewBox（四個數字）
    pub view_box: String,
    pub steps: Vec<SignatureStep>,
}

/// 簽名的一步：一筆，或點一個點
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SignatureStep {
    /// SVG 路徑的 `d`
    Stroke {
        d: String,
    },
    Dot {
        x: f64,
        y: f64,
    },
}

/// 最多幾步：一個簽名頂多幾十筆，這只是擋亂傳
const MAX_STEPS: usize = 64;
/// 一筆的路徑資料最長多少字
const MAX_PATH: usize = 20_000;

fn invalid(why: &str) -> Problem {
    Problem::new("signature_invalid", format!("The signature isn't usable: {why}"))
}

/// 路徑資料只能有 SVG 的路徑指令、數字與分隔符號
fn path_ok(d: &str) -> bool {
    !d.trim().is_empty()
        && d.len() <= MAX_PATH
        && d.chars().all(|c| c.is_ascii_digit() || " ,.-+eEMmLlHhVvCcSsQqTtAaZz\n\r\t".contains(c))
}

pub fn validate(s: &Signature) -> Result<(), Problem> {
    let nums: Vec<f64> =
        s.view_box.split([' ', ',']).filter(|x| !x.is_empty()).filter_map(|x| x.parse().ok()).collect();
    if nums.len() != 4 || nums.iter().any(|n| !n.is_finite()) || nums[2] <= 0.0 || nums[3] <= 0.0 {
        return Err(invalid("the viewBox needs four numbers with a positive width and height"));
    }
    if s.steps.len() > MAX_STEPS {
        return Err(invalid("too many strokes"));
    }
    if !s.steps.iter().any(|st| matches!(st, SignatureStep::Stroke { .. })) {
        return Err(invalid("there are no strokes"));
    }
    for st in &s.steps {
        let ok = match st {
            SignatureStep::Stroke { d } => path_ok(d),
            SignatureStep::Dot { x, y } => x.is_finite() && y.is_finite(),
        };
        if !ok {
            return Err(invalid("a stroke has something other than path data in it"));
        }
    }
    Ok(())
}

static VIEW_BOX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)viewBox\s*=\s*["']([^"']+)["']"#).expect("固定的正規式"));
static ELEMENT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<(path|circle)\b([^>]*)>").expect("固定的正規式"));

fn attr(attrs: &str, name: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"(?:^|\s){name}\s*=\s*["']([^"']*)["']"#)).ok()?;
    re.captures(attrs).map(|c| c[1].trim().to_string())
}

/// SVG 原檔 → 簽名：照檔案裡的順序，`<path>` 是一筆、`<circle>` 是一個點。
/// 前端上傳時的解析（`admin/site/signature.ts`）跟這裡同一個規則
pub fn from_svg(svg: &str) -> Option<Signature> {
    let view_box = VIEW_BOX.captures(svg)?[1].trim().to_string();
    let steps = ELEMENT
        .captures_iter(svg)
        .filter_map(|c| match &c[1] {
            "path" => attr(&c[2], "d").map(|d| SignatureStep::Stroke { d }),
            _ => Some(SignatureStep::Dot {
                x: attr(&c[2], "cx")?.parse().ok()?,
                y: attr(&c[2], "cy")?.parse().ok()?,
            }),
        })
        .collect();
    let s = Signature { view_box, steps };
    validate(&s).ok().map(|()| s)
}

/// `SITE_SIGNATURE_FILE`：資料庫裡還沒有簽名時，從這個 SVG 讀一次。讀不到或檔案不能用只記 log
pub fn seed_file() -> Option<Signature> {
    let path = std::env::var("SITE_SIGNATURE_FILE").ok().filter(|p| !p.trim().is_empty())?;
    match std::fs::read_to_string(path.trim()) {
        Ok(svg) => {
            let s = from_svg(&svg);
            if s.is_none() {
                tracing::warn!("SITE_SIGNATURE_FILE ({path}) has no usable strokes; skipped");
            }
            s
        }
        Err(e) => {
            tracing::warn!("couldn't read SITE_SIGNATURE_FILE ({path}): {e}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 1100 300">
  <path d="M1 2C3 4 5 6 7 8" stroke="#000"/>
  <path d='M10 10L20 20'/>
  <circle cx="283" cy="78" r="7"/>
  <circle r="7" cy="76" cx="997"/>
  <path class="u" d="M -10 240 Q 500 270 1060 220"/>
  <script>alert(1)</script>
</svg>"##;

    #[test]
    fn 照檔案的順序讀出筆畫與點_其他東西不收() {
        let s = from_svg(SVG).expect("讀得出來");
        assert_eq!(s.view_box, "-20 -20 1100 300");
        assert_eq!(
            s.steps,
            vec![
                SignatureStep::Stroke { d: "M1 2C3 4 5 6 7 8".into() },
                SignatureStep::Stroke { d: "M10 10L20 20".into() },
                SignatureStep::Dot { x: 283.0, y: 78.0 },
                SignatureStep::Dot { x: 997.0, y: 76.0 },
                SignatureStep::Stroke { d: "M -10 240 Q 500 270 1060 220".into() },
            ]
        );
    }

    #[test]
    fn 不能用的不收() {
        assert!(from_svg("<svg></svg>").is_none(), "沒有 viewBox");
        assert!(
            from_svg(r#"<svg viewBox="0 0 10 10"><circle cx="1" cy="1"/></svg>"#).is_none(),
            "只有點沒有筆畫"
        );
        let bad = Signature {
            view_box: "0 0 10 10".into(),
            steps: vec![SignatureStep::Stroke { d: "javascript:alert(1)".into() }],
        };
        assert_eq!(validate(&bad).expect_err("路徑裡不能有別的東西").code, "signature_invalid");
        let flat = Signature {
            view_box: "0 0 0 10".into(),
            steps: vec![SignatureStep::Stroke { d: "M0 0".into() }],
        };
        assert!(validate(&flat).is_err(), "寬度要是正的");
        let many = Signature {
            view_box: "0 0 1 1".into(),
            steps: vec![SignatureStep::Stroke { d: "M0 0".into() }; MAX_STEPS + 1],
        };
        assert!(validate(&many).is_err());
    }

    #[test]
    fn 環境變數指的檔案() {
        let dir = std::env::temp_dir().join(format!("sig-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("建暫存目錄");
        let file = dir.join("sig.svg");
        std::fs::write(&file, SVG).expect("寫檔");
        unsafe { std::env::set_var("SITE_SIGNATURE_FILE", &file) };
        assert_eq!(seed_file().map(|s| s.steps.len()), Some(5));
        unsafe { std::env::set_var("SITE_SIGNATURE_FILE", dir.join("nope.svg")) };
        assert!(seed_file().is_none());
        unsafe { std::env::remove_var("SITE_SIGNATURE_FILE") };
        assert!(seed_file().is_none());
    }
}
