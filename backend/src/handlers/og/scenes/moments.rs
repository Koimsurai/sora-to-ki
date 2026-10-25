//! 碎念的彗星（`src/components/blog/comet.ts` 逐行移植，排版照同一檔的 `layoutArc`）：
//! 一條往下左右擺的大弧線，彗核是最新那一則（琥珀色的點），碎念沿著彗尾排開，
//! 越往下越舊、塵埃越稀。
//!
//! 取的是進場長完、停下來的那一刻：彗尾整條都在（`revealY = Infinity`）、彗髮全開（`headScale = 1`）。
//! 碎念的字不畫（字那一層只有頁名與副標），只留每一則在彗尾上的那個點（DOM 的 `.mo-dot`）。
//!
//! 資料：不讀資料庫。排版照一組固定的形狀——12 則完整的（`FULL`）加 2 則只剩一個點的，
//! 每一則的高度都當成 120px（一行字加日期與按鈕列，間距就是最小的 `GAP`）。
//! 前端塵埃用的是 `Math.random`，這裡換成有種子的產生器，每次畫出來都一樣。
//!
//! 動態：塵埃不流（一流整條彗尾每一格都在變，每格都等於整張圖），動的只有彗核那一小團——
//! 彗髮的顆粒照前端那條 `sin²` 一明一暗，加上彗星旁邊幾顆背景星慢慢閃。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "顆粒數與格數都很小；座標是畫布範圍內的浮點數"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, amber, ink};
use super::starfield::{self, Twinkle, rng};

const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一圈幾秒
const LOOP_S: f32 = FRAMES as f32 * FRAME_MS as f32 / 1000.0;

// ── comet.ts ────────────────────────────────────────────────────
/// 弧線一個來回的高度
const PERIOD: f32 = 1300.0;
const PHASE: f32 = 0.9;
const GAP: f32 = 230.0;
const GHOST_STEP: f32 = 30.0;

// ── Thinking.tsx 與固定的形狀 ──────────────────────────────────
/// 完整顯示的則數（`FULL`），更舊的只剩彗尾上的一個點
const FULL: usize = 12;
const GHOSTS: usize = 2;
/// 每一則的高度（見檔頭）
const POST_H: f32 = 120.0;

// ── 構圖 ────────────────────────────────────────────────────────
/// 彗核的高度。頁面上它在標題底下（1440×900 的視窗裡約 270px）；分享圖矮，往上提，
/// 彗尾才有一段完整的「往右彎出去再擺回來」落在畫面裡
const HEAD_Y: f32 = 150.0;
/// 弧線的中心。前端是頁寬的一半，在分享圖上那是字的位置；移到右邊，整條彗尾
/// （最右約 1065px、畫面底約 780px）都落在字的右邊
const CX: f32 = 800.0;

/// 擺幅：前端是 `min(寬 × 0.22, 330)`，照算（1200 寬是 264）
fn amp() -> f32 {
    (W as f32 * 0.22).min(330.0)
}

fn arc_x(y: f32) -> f32 {
    CX + amp() * (((y - HEAD_Y) / PERIOD) * TAU + PHASE).sin()
}

/// 近似常態分布：四個均勻亂數相加（`gauss`）
fn gauss(rand: &mut impl FnMut() -> f32) -> f32 {
    let mut u = 0.0;
    for _ in 0..4 {
        u += rand();
    }
    (u - 2.0) / 1.15
}

/// 彗星往哪裡飛：沿著弧線往上（`headDirection`）
fn head_direction() -> (f32, f32) {
    let dx = arc_x(HEAD_Y - 6.0) - arc_x(HEAD_Y);
    let n = dx.hypot(6.0);
    (dx / n, -6.0 / n)
}

struct Coma {
    /// 在彗核後面多遠（0 是彗核，1 是彗髮的尾端）
    u: f32,
    /// 往兩側偏多少（-1 到 1）
    s: f32,
    j: f32,
}

pub struct Moments {
    back: Pixmap,
    coma: Vec<Coma>,
    twinkle: Vec<Twinkle>,
}

impl Default for Moments {
    fn default() -> Self {
        Self::new()
    }
}

impl Moments {
    pub fn new() -> Self {
        // 排版（`layoutArc`）：每一則之間 max(GAP, 高度 + 64)，更舊的點接在後面，彗尾畫到頁底
        let posts: Vec<f32> = (0..FULL).map(|i| HEAD_Y + i as f32 * GAP.max(POST_H + 64.0)).collect();
        let last = posts[FULL - 1];
        let gy0 = last + (GAP * 0.75).max(POST_H + 48.0);
        let end_y = gy0 + (GHOSTS - 1) as f32 * GHOST_STEP + 90.0;
        let y_end = end_y + 140.0 - 30.0;
        let span = y_end - HEAD_Y;

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        // 背景星：只有彗核附近那一塊的星會閃（跟彗髮擠在同一個外框裡），彗尾上的不閃
        // （閃的星畫在塵埃上面會蓋掉塵埃）
        let (hx, hy) = (arc_x(HEAD_Y), HEAD_Y);
        let twinkle = starfield::scatter(&mut ctx, |x, y| {
            (x - hx).hypot(y - hy) < 240.0 && (x - arc_x(y)).abs() > 110.0
        });

        // 彗尾（`createComet` 的塵埃）：越往後散得越開、越淡；尾巴往弧線外側變寬
        let mut rand = rng(0x6d6f_6d65);
        let count = (span * 1.6).clamp(1500.0, 6000.0).round() as usize;
        let (grain, grid) = (2.0, 3.0);
        for _ in 0..count {
            let u = rand().powf(1.35);
            let side = gauss(&mut rand);
            let j = rand();
            let y = HEAD_Y + u * span;
            if !(-8.0..=H as f32 + 8.0).contains(&y) {
                continue;
            }
            let width = 6.0 + 46.0 * u.sqrt();
            let x = arc_x(y) + side * width;
            let a = (1.0 - u).powf(1.2) * (0.3 + 0.7 * j) * 0.8;
            if a < 0.03 {
                continue;
            }
            ctx.set_fill(ink(a.min(1.0)));
            ctx.fill_rect((x / grid).round() * grid, (y / grid).round() * grid, grain, grain);
        }
        let coma = (0..320)
            .map(|_| {
                let u = rand().powf(2.2);
                let s = (gauss(&mut rand) / 1.6).clamp(-1.0, 1.0);
                Coma { u, s, j: rand() }
            })
            .collect();

        // 彗核的光暈（畫在彗髮底下，所以進底圖）
        ctx.set_fill(Gradient::radial(hx, hy, 0.0, hx, hy, 30.0).stop(0.0, amber(0.3)).stop(1.0, amber(0.0)));
        ctx.begin_path();
        ctx.arc(hx, hy, 30.0, 0.0, TAU, false);
        ctx.fill();

        // 其他每一則的點（`.mo-dot`：6px、--paper-2），疊在畫布上面的 DOM。更舊的那兩個點在畫面外
        for &y in &posts[1..] {
            if y < H as f32 + 4.0 {
                ctx.dot(arc_x(y), y, 3.0, ink(0.7));
            }
        }
        Self { back: ctx.pixmap, coma, twinkle }
    }
}

impl super::Scene for Moments {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let p = index as f32 / FRAMES as f32;
        let t = p * LOOP_S;
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        for s in &self.twinkle {
            s.draw(&mut ctx, p);
        }

        // 彗髮：包著彗核往後張開的拋物面，每一顆照 sin² 一明一暗。前端是 `sin(t × 1.6 + …)²`，
        // 週期 π / 1.6 秒；一圈 15 秒放不下整數個，調成剛好 8 個（快約 5%），最後一格才接得回第一格
        let shimmer = 8.0 * PI / LOOP_S;
        let (hx, hy) = (arc_x(HEAD_Y), HEAD_Y);
        let (fx, fy) = head_direction();
        let (sx, sy) = (-fy, fx);
        for c in &self.coma {
            let back = -9.0 + 58.0 * c.u;
            let spread = 7.0 + 12.0 * c.u.sqrt();
            let wave = ((t * shimmer + c.j * 9.0).sin().powi(2) * 4.0).round() / 4.0;
            let a = (1.0 - c.u).powf(1.4) * (0.4 + 0.45 * wave);
            if a < 0.04 {
                continue;
            }
            ctx.set_fill(ink(a));
            ctx.fill_rect(
                hx - fx * back + sx * c.s * spread - 0.75,
                hy - fy * back + sy * c.s * spread - 0.75,
                1.5,
                1.5,
            );
        }

        // 彗核：最新那一則的點（`.mo-dot.is-new`，6px 琥珀色，疊在畫布上面）。
        // 它的 `box-shadow: 0 0 14px` 是半徑 3 的圓模糊 σ = 7：中心只剩約 0.07，用一道高斯形的漸層近似
        ctx.set_fill(
            Gradient::radial(hx, hy, 0.0, hx, hy, 21.0)
                .stop(0.0, amber(0.073))
                .stop(1.0 / 3.0, amber(0.044))
                .stop(2.0 / 3.0, amber(0.01))
                .stop(1.0, amber(0.0)),
        );
        ctx.begin_path();
        ctx.arc(hx, hy, 21.0, 0.0, TAU, false);
        ctx.fill();
        ctx.dot(hx, hy, 3.0, amber(1.0));
        ctx.pixmap
    }
}
