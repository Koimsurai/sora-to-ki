//! 照片頁的地面站（`src/components/gallery/downlink.ts` 的 `createStation` 逐行移植）：
//! 深空網路的下傳。碟形天線在左下，探測器在右上很遠的地方，訊號一道一道從探測器的碟面
//! 傳到天線的饋源，探測器上那個發送中的點是琥珀色的。
//!
//! 構圖：網頁上天線在最左、探測器在最右，訊號橫越整頁。分享圖的左邊是字，所以兩樣都收進
//! 右半邊——天線站在右半邊的左下，探測器在右上角，訊號斜斜地從右上走到左下。
//! 插圖、透明度、波前的畫法（點弧、越近越大、中間最亮）都照前端。
//!
//! 背景的星：網頁上是全站共用的星空（不是這張畫布畫的），這裡用首頁分享圖（`saturn`）
//! 同一組稀疏的星點，幾張分享圖的天空才是同一片。
//!
//! 動態：波前一道接一道往天線走、琥珀點一明一暗（都是前端本來就在做的），加上右半邊幾顆星在閃。
//! 前端的探測器會微微晃（`sin(t × 0.3)`），分享圖讓它停在 t = 0：插圖一動整張探測器的像素
//! 每格都變，檔案會大好幾倍。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    reason = "像素座標與格數，值域都在畫布範圍內"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, amber, ink, load_image_sized};

const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一圈幾秒：波前、琥珀點、會閃的星都照它取整數圈，最後一格才接得回第一格
const LOOP_S: f32 = 15.0;

// ── downlink.ts 的常數 ──────────────────────────────────────────
/// 天線插圖（669×865）與饋源在圖裡的位置（比例）
const DISH: &[u8] = include_bytes!("../../../../../public/illustrations/dsn-dish.webp");
const DISH_FEED: (f32, f32) = (0.7, 0.098);
/// 探測器插圖（698×700）與高增益天線碟面中心在圖裡的位置（比例）
const PROBE: &[u8] = include_bytes!("../../../../../public/illustrations/deep-space-probe.webp");
const PROBE_DISH: (f32, f32) = (435.0 / 698.0, 265.0 / 700.0);
/// 波前每秒走幾成：前端是 0.35，一圈 15 秒要走整數趟，取 1/3（五趟）
const WAVE_SPEED: f32 = 1.0 / 3.0;
/// 琥珀點一明一暗：前端是 `sin(t × 3)`，一圈取七次（每秒 2.93）
const PULSE_LAPS: f32 = 7.0;

// ── 構圖 ─────────────────────────────────────────────────────────
/// 天線：前端畫滿地面站那條畫布的高（260px 減 6），這裡高 300px，站在右半邊的左下
const DISH_H: f32 = 300.0;
const DISH_X: f32 = 752.0;
const DISH_Y: f32 = 316.0;
/// 探測器：前端是 `min(200, 0.3w)` 寬、中心在右緣往內 0.55 個寬；這裡一樣大、一樣靠右，
/// 高度往下放一點（前端的那條畫布只有 260px 高）
const PROBE_W: f32 = 200.0;
const PROBE_CY: f32 = 112.0;
/// 會閃的星只挑這條線右邊的（字那一側每格都在變的話，每一格的外框都是整張圖寬）
const TWINKLE_FROM_X: f32 = 740.0;

/// mulberry32：跟首頁分享圖同一個產生器、同一個種子，撒出同一片星
fn rng(seed: u32) -> impl FnMut() -> f32 {
    let mut a = seed;
    move || {
        a = a.wrapping_add(0x6d2b_79f5);
        let mut t = a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 0x3d));
        (f64::from(t ^ (t >> 14)) / 4_294_967_296.0) as f32
    }
}

/// 會閃的星：位置、大小、最亮多亮、一圈閃幾次、起始相位
struct Star {
    x: f32,
    y: f32,
    r: f32,
    a: f32,
    laps: f32,
    phase: f32,
}

pub struct Photos {
    /// 不會動的部分：星、天線、探測器
    back: Pixmap,
    twinkle: Vec<Star>,
    /// 探測器發送的那一點、天線的饋源
    tx: (f32, f32),
    feed: (f32, f32),
}

impl Default for Photos {
    fn default() -> Self {
        Self::new()
    }
}

impl Photos {
    pub fn new() -> Self {
        let (w, h) = (W as f32, H as f32);
        let dish_w = DISH_H * (669.0 / 865.0);
        // 探測器（`layout` 在 t = 0：不晃、轉 180° 讓碟面朝左下對著天線）
        let (pcx, pcy, rot) = (w - PROBE_W * 0.55, PROBE_CY, PI);
        let ox = (PROBE_DISH.0 - 0.5) * PROBE_W;
        let oy = (PROBE_DISH.1 - 0.5) * PROBE_W;
        let tx = (pcx + ox * rot.cos() - oy * rot.sin(), pcy + ox * rot.sin() + oy * rot.cos());
        let feed = (DISH_X + dish_w * DISH_FEED.0, DISH_Y + DISH_H * DISH_FEED.1);

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);

        // 星：多數很淡很小，少數亮一點（同首頁分享圖）。右半邊每四顆有一顆會閃，
        // 壓在插圖底下的不閃（逐格畫的時候它會跑到插圖上面）
        let under_art = |x: f32, y: f32| {
            let on_dish = x > DISH_X - 4.0 && x < DISH_X + dish_w + 4.0 && y > DISH_Y - 4.0;
            let on_probe = (x - pcx).abs() < PROBE_W * 0.55 && (y - pcy).abs() < PROBE_W * 0.55;
            on_dish || on_probe
        };
        let mut rand = rng(23);
        let mut twinkle = Vec::new();
        for i in 0..240 {
            let m = rand().powi(4);
            let star = Star {
                x: rand() * w,
                y: rand() * h,
                r: 0.35 + m * 0.9,
                a: 0.18 + m * 0.6,
                laps: 0.0,
                phase: rand() * TAU,
            };
            if i % 4 == 0 && star.x > TWINKLE_FROM_X && !under_art(star.x, star.y) {
                twinkle.push(Star { laps: 1.0 + (i / 6 % 3) as f32, ..star });
            } else {
                ctx.dot(star.x, star.y, star.r, ink(star.a));
            }
        }

        // 天線（插圖原檔比畫上去大兩三倍，先縮好再貼，細線才不會斷）
        let dish = load_image_sized(DISH, dish_w.round() as u32, DISH_H.round() as u32);
        ctx.set_alpha(0.85);
        ctx.draw_image(&dish, DISH_X, DISH_Y);

        // 探測器
        let probe = load_image_sized(PROBE, PROBE_W as u32, PROBE_W as u32);
        ctx.save();
        ctx.translate(pcx, pcy);
        ctx.rotate(rot);
        ctx.set_alpha(0.9);
        ctx.draw_image(&probe, -PROBE_W / 2.0, -PROBE_W / 2.0);
        ctx.restore();

        Self { back: ctx.pixmap, twinkle, tx, feed }
    }
}

impl super::Scene for Photos {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        // 一圈裡的進度（0–1）與換算回來的秒數
        let p = index as f32 / FRAMES as f32;
        let t = p * LOOP_S;
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);

        for s in &self.twinkle {
            // 亮度只分五階（同首頁的土星）：連續變化的話這些星每一格都要存
            let k = 0.55 + 0.45 * ((s.laps * TAU * p + s.phase).sin() * 2.0).round() / 2.0;
            ctx.dot(s.x, s.y, s.r, ink(s.a * k));
        }

        // 訊號：一圈一圈的點弧，從探測器往饋源傳，越近越大
        let (tx, ty) = self.tx;
        let (fx, fy) = self.feed;
        let (vx, vy) = (fx - tx, fy - ty);
        let ang = vy.atan2(vx);
        // 波前的間距固定（大約 140px 一道），訊號走得越遠道數越多（最少六道）
        let waves = (vx.hypot(vy) / 140.0).round().max(6.0);
        for k in 0..waves as usize {
            let q = (t * WAVE_SPEED * (6.0 / waves) + k as f32 / waves) % 1.0;
            let cx = tx + vx * q;
            let cy = ty + vy * q;
            let r = 10.0 + q * 26.0;
            // 一道波前：圓弧的頂點在 (cx, cy)、朝著天線那一側拱出去
            let ox = cx - ang.cos() * r;
            let oy = cy - ang.sin() * r;
            ctx.set_fill(ink(0.5 * (q * PI).sin()));
            // 前端是 `for (a = -0.7; a <= 0.7; a += 0.14)`：浮點數累加到最後一步是 0.7000000000000002，
            // 所以實際只有十個點（-0.7 到 0.56），弧是不對稱的。照它的累加方式算
            let mut a: f64 = -0.7;
            while a <= 0.7 {
                let th = ang + a as f32;
                ctx.fill_rect(ox + th.cos() * r, oy + th.sin() * r, 1.4, 1.4);
                a += 0.14;
            }
        }

        // 發送中：碟面中心一個琥珀色的點
        ctx.set_fill(
            Gradient::radial(tx, ty, 0.0, tx, ty, 12.0).stop(0.0, amber(0.45)).stop(1.0, amber(0.0)),
        );
        ctx.begin_path();
        ctx.arc(tx, ty, 12.0, 0.0, TAU, false);
        ctx.fill();
        let pulse = (PULSE_LAPS * TAU * p).sin();
        ctx.dot(tx, ty, 2.2, amber(0.65 + 0.35 * pulse));
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 探測器與天線都要在右半邊，訊號從右上往左下走
    #[test]
    fn 天線與探測器都在右半邊() {
        let s = Photos::new();
        assert!(DISH_X > 712.0 && s.tx.0 > s.feed.0 && s.tx.1 < s.feed.1, "{:?} → {:?}", s.tx, s.feed);
    }
}
