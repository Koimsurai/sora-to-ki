//! 手記的星軌（`src/components/blog/noteSky.ts` 逐行移植）：一篇文章是一道星軌，天極在右上，
//! 越新的繞在越外圈、寫得越長弧拖得越長；背景的星也都拖著淡淡的軌跡。
//!
//! 手記頁與每一篇文章都用這一張：文章的那一張亮的是它自己那道（琥珀色的星），
//! 手記頁亮的是最新一篇。夜空轉到哪個角度照前端的 `keepTimeOf`：讓亮的那顆星落在
//! 右邊空著的那片天，不壓在字上。
//!
//! 動態：整片星空不轉（一轉每個像素都變，每格都等於整張圖），只有亮的那道星軌
//! 像快門重新打開一樣再拖一次——先亮著停一下、淡掉、再從頭拖出來，拖滿時剛好接回第一格。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "文章數與格數都很小；座標是畫布範圍內的浮點數"
)]

use std::f32::consts::TAU;

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, amber, ink};

/// 背景的星（每一顆都拖著一道淡淡的軌跡）
const FIELD: usize = 640;
const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;

/// 字串 → 0 到 1 的固定亂數（FNV-1a，照 JS 的 `charCodeAt` 逐個 UTF-16 單位算）
fn hash01(s: &str) -> f32 {
    let mut x: u32 = 2_166_136_261;
    for c in s.encode_utf16() {
        x = (x ^ u32::from(c)).wrapping_mul(16_777_619);
    }
    (f64::from(x) / 4_294_967_296.0) as f32
}

/// 有種子的亂數（JS 版的 `seeded`：整數運算、`%` 保留正負號，跟 JS 一樣）。
/// 前端各頁的畫布（noteSky、fallSky…）抄的都是同一個函式，所以其他場景也用這一份
pub(super) fn seeded(seed: f64) -> impl FnMut() -> f32 {
    let mut s = (seed * 2f64.powi(31)).floor() as i64;
    if s == 0 {
        s = 1;
    }
    move || {
        s = (i64::from((s as i32).wrapping_mul(48_271)) + 1) % 2_147_483_647;
        (f64::from((s as i32) & 0x7fff_ffff) / 2_147_483_647.0) as f32
    }
}

/// 一篇文章的星軌參數（`skyPostOf`）
#[derive(Clone, Copy, Debug)]
pub struct SkyPost {
    /// 0 到 1：這篇有多長（相對最長的那篇）
    pub length: f32,
    /// 0 到 1：起點的角度
    pub seed: f32,
}

impl SkyPost {
    /// 長度照內文字數（沒有字數時用標題算一個固定的值），角度照標題
    pub fn of(title: &str, content_length: usize, max_len: usize) -> Self {
        let length = if content_length > 0 {
            content_length as f32 / max_len.max(1) as f32
        } else {
            0.2 + 0.4 * hash01(&format!("{title}#len"))
        };
        Self { length, seed: hash01(title) }
    }
}

const SPIN: f32 = 0.035;
/// 最外圈的半徑上限。前端是 `min(reach × 0.8, 長邊 / 2)`，在 1200×630 會是 600px——
/// 那個圓整圈都在右半邊之外（往右上往右下都出了畫面），最新那幾篇的星永遠落不到字以外的地方。
/// 分享圖矮，所以收到 430：外圈的星才轉得進右邊那片天
const OUTER_MAX: f32 = 430.0;

fn pole() -> (f32, f32) {
    (W as f32 * 0.76, H as f32 * 0.3)
}
fn reach() -> f32 {
    let (x, y) = pole();
    (x.max(W as f32 - x)).hypot(y.max(H as f32 - y))
}

struct Arc {
    cx: f32,
    cy: f32,
    r: f32,
    a0: f32,
    a1: f32,
}

impl Arc {
    fn point(&self, ang: f32) -> (f32, f32) {
        (self.cx + ang.cos() * self.r, self.cy + ang.sin() * self.r)
    }
}

/// 第 i 篇（0 是最新）的那道弧（`postArc`）
fn post_arc(i: usize, n: usize, p: SkyPost, t: f32) -> Arc {
    let (x, y) = pole();
    let inner = 60.0;
    let outer = (reach() * 0.8).min(W.max(H) as f32 * 0.5).min(OUTER_MAX);
    let r = inner + ((n - i) as f32 / n as f32) * (outer - inner);
    let a0 = p.seed * TAU + t * SPIN;
    Arc { cx: x, cy: y, r, a0, a1: a0 + 0.25 + 1.6 * p.length }
}

/// 夜空轉到哪個時間，那顆星才落在右邊空著的天（照 `keepTimeOf` 的找法；arc 是 t = 0 的那道）
fn keep_time(arc: &Arc) -> f32 {
    let (w, h) = (W as f32, H as f32);
    // 前端的「空著的天」是列表右邊；這裡是字（72–712px）右邊，上下只留一點邊
    let open = |(x, y): (f32, f32)| x > 760.0 && x < w - 50.0 && y > 50.0 && y < h - 50.0;
    let on = |(x, y): (f32, f32)| x > 60.0 && x < w - 60.0 && y > 50.0 && y < h - 50.0;
    for ok in [&open as &dyn Fn((f32, f32)) -> bool, &on] {
        for deg in (0..=180).step_by(3) {
            for sign in if deg == 0 { &[1.0][..] } else { &[1.0, -1.0][..] } {
                let da = sign * (deg as f32).to_radians();
                if ok(arc.point(arc.a1 + da)) {
                    return da / SPIN;
                }
            }
        }
    }
    0.0
}

pub struct Notes {
    back: Pixmap,
    lit: Arc,
}

impl Notes {
    /// `posts` 由新到舊；`lit` 是亮的那一篇
    pub fn new(posts: &[SkyPost], lit: usize) -> Self {
        let n = posts.len().max(1);
        let lit = lit.min(n - 1);
        let lit_post = posts.get(lit).copied().unwrap_or(SkyPost { length: 0.4, seed: 0.3 });
        let t = keep_time(&post_arc(lit, n, lit_post, 0.0));
        let (px, py) = pole();
        let reach = reach();
        let spin = t * SPIN;

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        ctx.set_line_width(1.0);
        let mut rnd = seeded(0.61);
        for _ in 0..FIELD {
            let r = rnd().sqrt();
            let len = 0.1 + rnd() * 0.7;
            let a0 = rnd() * TAU;
            let a = 0.035 + rnd() * rnd() * 0.16;
            let star = 0.5 + rnd() * 1.1;
            let r = 14.0 + r * reach;
            let a1 = a0 + spin + len;
            ctx.set_stroke(ink(a));
            ctx.begin_path();
            ctx.arc(px, py, r, a1 - len, a1, false);
            ctx.stroke();
            ctx.set_fill(ink((a * 4.0).min(1.0)));
            ctx.fill_rect(px + a1.cos() * r - star / 2.0, py + a1.sin() * r - star / 2.0, star, star);
        }
        ctx.dot(px, py, 1.8, ink(0.6));

        for (i, p) in posts.iter().enumerate() {
            if i == lit {
                continue;
            }
            let arc = post_arc(i, n, *p, t);
            ctx.set_stroke(ink(0.3));
            ctx.begin_path();
            ctx.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1, false);
            ctx.stroke();
            let (hx, hy) = arc.point(arc.a1);
            ctx.dot(hx, hy, 1.5, ink(0.8));
        }
        Self { back: ctx.pixmap, lit: post_arc(lit, n, lit_post, t) }
    }
}

impl super::Scene for Notes {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        // 一圈：亮著停 35% → 淡掉 15% → 從頭拖出來 50%（快門打開那條 ease-out），拖滿就是第一格
        let p = index as f32 / FRAMES as f32;
        let (grow, alpha) = if p < 0.35 {
            (1.0, 1.0)
        } else if p < 0.5 {
            (1.0, 1.0 - (p - 0.35) / 0.15)
        } else {
            (1.0 - (1.0 - (p - 0.5) / 0.5).powi(3), 1.0)
        };
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        if alpha <= 0.0 || grow <= 0.0 {
            return ctx.pixmap;
        }
        let a = &self.lit;
        let head = a.a0 + (a.a1 - a.a0) * grow;
        ctx.set_alpha(alpha);
        ctx.set_stroke(ink(0.9));
        ctx.set_line_width(1.4);
        ctx.begin_path();
        ctx.arc(a.cx, a.cy, a.r, a.a0, head, false);
        ctx.stroke();
        let (hx, hy) = a.point(head);
        ctx.set_fill(Gradient::radial(hx, hy, 0.0, hx, hy, 14.0).stop(0.0, amber(0.6)).stop(1.0, amber(0.0)));
        ctx.begin_path();
        ctx.arc(hx, hy, 14.0, 0.0, TAU, false);
        ctx.fill();
        ctx.dot(hx, hy, 2.6, amber(1.0));
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 亂數與雜湊要跟前端那份算出一樣的值，不然分享圖上的星軌跟手記頁的不是同一片天。
    /// 期望值是用 node 跑 noteSky.ts 的同一段程式得到的（含一個 UTF-16 代理對的字）
    #[test]
    fn 雜湊與亂數跟前端一致() {
        assert!((hash01("把 NLLB 翻譯接進 Rust") - 0.071_415_87).abs() < 1e-6);
        assert!((hash01("🪐") - 0.801_379_4).abs() < 1e-6);
        let mut r = seeded(0.61);
        for want in [0.309_993_7, 0.706_213_4, 0.626_683] {
            let got = r();
            assert!((got - want).abs() < 1e-6, "{got} ≠ {want}");
        }
    }
}
