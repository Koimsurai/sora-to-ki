//! 每一頁底下那片背景星（站上是全站共用的星空，不屬於哪一頁的畫布）。
//!
//! 撒法照首頁土星那張（`saturn.rs` 的 `Saturn::new`）：同一個產生器、同一個種子、同樣的
//! 大小與亮度分布，所以各頁的分享圖底下是同一片天。土星那張是逐像素畫的，這裡改用 `canvas`
//! 的圓點畫，兩張的星落在同樣的位置。
//!
//! 會閃的星由各頁自己挑（`twinkles` 判斷一顆星要不要閃）：只挑會動的東西附近那一塊，
//! 一格的大小取的是「所有變動像素的外框」，遠處也有星在閃的話每一格的外框都會被撐大。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "星的數量很小；座標是畫布範圍內的浮點數"
)]

use std::f32::consts::TAU;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, ink};

/// mulberry32：跟土星那張（與設計稿）同一個產生器
pub fn rng(seed: u32) -> impl FnMut() -> f32 {
    let mut a = seed;
    move || {
        a = a.wrapping_add(0x6d2b_79f5);
        let mut t = a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 0x3d));
        (f64::from(t ^ (t >> 14)) / 4_294_967_296.0) as f32
    }
}

/// 一顆會閃的星
pub struct Twinkle {
    x: f32,
    y: f32,
    r: f32,
    a: f32,
    /// 一圈裡閃幾次（整數，接縫才對得上）
    laps: f32,
    phase: f32,
}

impl Twinkle {
    /// 畫在一圈裡的進度 `p`（0–1）那一刻的亮度
    pub fn draw(&self, ctx: &mut Ctx, p: f32) {
        // 亮度只分五階（跟土星那張一樣）：連續變化的話這些星每一格都在變、每格都得存它們
        let k = 0.55 + 0.45 * ((self.laps * TAU * p + self.phase).sin() * 2.0).round() / 2.0;
        ctx.dot(self.x, self.y, self.r, ink(self.a * k));
    }
}

/// 把不閃的星畫進 `ctx`，回傳要閃的那幾顆（之後每一格自己畫）。
/// 跟土星那張一樣是每四顆挑一顆，再由 `twinkles` 決定它在不在會動的那一塊
pub fn scatter(ctx: &mut Ctx, twinkles: impl Fn(f32, f32) -> bool) -> Vec<Twinkle> {
    let mut rand = rng(23);
    let mut out = Vec::new();
    for i in 0..240 {
        let m = rand().powi(4);
        let (x, y) = (rand() * W as f32, rand() * H as f32);
        let (r, a, phase) = (0.35 + m * 0.9, 0.18 + m * 0.6, rand() * TAU);
        if i % 4 == 0 && twinkles(x, y) {
            out.push(Twinkle { x, y, r, a, laps: 1.0 + (i / 6 % 3) as f32, phase });
        } else {
            ctx.dot(x, y, r, ink(a));
        }
    }
    out
}
