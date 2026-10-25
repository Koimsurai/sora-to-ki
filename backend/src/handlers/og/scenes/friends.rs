//! 朋友的軌道（`src/components/about/friendsSky.ts` 逐行移植）：這個站在中心（琥珀色的點），
//! 每位朋友各在自己的橢圓軌道上繞，外面再留兩條空的給下一位。星身後拖一段漸淡的軌跡，
//! 軌道上的刻點是他最近的每一篇（越舊越遠）；兩週內有新文章的星一圈圈發出訊號環。
//!
//! 取的是進場長完、停下來的那一刻（`grow = 1`、沒有對接、沒有預覽星）。星旁邊的名字、
//! 中心那行站名都是疊在畫布上的 DOM 字，這裡不畫。
//!
//! 資料：不讀資料庫、也不抓朋友的 feed。用一組固定的形狀——四位朋友（軌道照前端用 id 雜湊，
//! 這裡的 id 只拿來決定軌道的形狀，不會出現在圖上），最外圈那位兩週內剛更新、
//! 其他三位一個月、四個月前，最後一位沒有 feed。
//!
//! 動態：星不繞（一繞軌跡、刻點跟著整圈都在變，而且各圈週期照克卜勒是不可公約的，
//! 接不回第一格），軌道時間停在一個讓剛更新那顆落在右邊空著的天的時刻。動的只有那顆星：
//! 一圈圈往外的訊號環、一明一暗的光暈，加上它附近幾顆背景星慢慢閃。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "朋友數、刻點數與格數都很小；雜湊值轉成 0–1 的浮點數"
)]

use std::f32::consts::TAU;

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, amber, ink};
use super::starfield::{self, Twinkle};

const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一圈幾秒
const LOOP_S: f32 = FRAMES as f32 * FRAME_MS as f32 / 1000.0;

// ── friendsSky.ts ───────────────────────────────────────────────
/// 軌道平面往左上傾斜的角度（弧度）
const TILT: f32 = -0.18;
/// 最內圈與最外圈的軌道半長軸（相對 R）
const K_IN: f32 = 0.42;
const K_OUT: f32 = 1.0;
/// 最內圈繞一圈幾秒（外圈照克卜勒第三定律變長）
const PERIOD_IN_S: f32 = 34.0;
/// 星身後的軌跡拖多長（平近點角）
const TRAIL_M: f32 = 1.1;
/// 刻點最遠排到星身後多少：一年前的那篇在這裡
const BEACON_SPAN: f32 = TAU * 0.82;
/// 剛發的那篇離星多遠，免得疊在星上
const BEACON_NEAR: f32 = 0.16;
/// 相鄰兩個刻點至少隔多遠
const BEACON_GAP: f32 = 0.09;
/// 多少天內有新文章算「剛更新」：會發出訊號環
const FRESH_DAYS: f32 = 14.0;
/// 多少天沒更新就暗到底
const DIM_DAYS: f32 = 180.0;
/// 寬螢幕的軌道扁度（`frameOf` 的 squash）
const SQUASH: f32 = 0.6;
/// 進場時軌道長出來要幾秒（`Friends.tsx` 的 `GROW_S`）：長完那一刻，軌道時間大約走到這裡
const GROW_S: f32 = 1.6;

// ── 構圖 ────────────────────────────────────────────────────────
/// 中心（這個站）。前端在軌道畫布的正中間；這裡放在字的右邊
const CX: f32 = 905.0;
const CY: f32 = 322.0;
/// 軌道的基準半徑。前端是 `min(寬 × 0.42, 高 × 0.7)`，照分享圖算是 441px——最外圈會寬到
/// 900 多像素，整個系統蓋過字。收到 275：朋友的軌道都在右半邊，只有最外面兩條空的掃進字底下
const R: f32 = 275.0;

/// 一位朋友：軌道用的 id、最新一篇距今幾天（沒有 feed 是 `None`）、最近每一篇距今幾天
struct Star {
    id: &'static str,
    days: Option<f32>,
    posts: &'static [f32],
}

/// 固定的形狀（見檔頭）。剛更新的那位放最後：它是唯一會動的，前端也是最後畫它，
/// 底圖先畫好其他的、每一格只疊它，順序跟前端一樣。
/// 其他三位的 id 是挑過的：軌道時間停下來時，三顆星分別落在中心的左、下、右，不擠在一起
const STARS: [Star; 4] = [
    Star { id: "orbit-100", days: Some(36.0), posts: &[36.0, 71.0, 140.0, 290.0] },
    Star { id: "orbit-349", days: Some(118.0), posts: &[118.0, 260.0] },
    Star { id: "orbit-46", days: None, posts: &[] },
    Star { id: "orbit-d", days: Some(3.0), posts: &[3.0, 9.0, 24.0, 52.0, 97.0, 180.0, 330.0] },
];

/// 字串 → 0–1 的固定亂數（照 JS 的 `for…of` 逐個 code point 算，`Math.imul` 是 32 位元的乘法）
fn hash01(s: &str, salt: u32) -> f32 {
    // FNV 的 offset basis（2166136261）
    let mut h: u32 = 0x811c_9dc5 ^ salt;
    for c in s.chars() {
        h = (h ^ u32::from(c)).wrapping_mul(16_777_619);
    }
    (f64::from(h) / 4_294_967_296.0) as f32
}

fn brightness_of(days: Option<f32>) -> f32 {
    days.map_or(0.45, |d| (1.0 - d / DIM_DAYS).clamp(0.35, 1.0))
}

/// 克卜勒方程式 M = E − e·sinE，用牛頓法解偏近點角
fn eccentric(m: f32, e: f32) -> f32 {
    let mut big_e = m;
    for _ in 0..5 {
        big_e -= (big_e - e * big_e.sin() - m) / (1.0 - e * big_e.cos());
    }
    big_e
}

#[derive(Clone, Copy)]
struct Orbit {
    k: f32,
    e: f32,
    /// 近心點的方向（軌道平面內）
    peri: f32,
    /// 平均角速度（弧度／秒）
    n: f32,
    m0: f32,
}

impl Orbit {
    fn of(k: f32, id: &str) -> Self {
        Self {
            k,
            e: 0.16 + hash01(id, 1) * 0.16,
            peri: hash01(id, 2) * TAU,
            n: TAU / (PERIOD_IN_S * (k / K_IN).powf(1.5)),
            m0: hash01(id, 0) * TAU,
        }
    }

    /// 平近點角 `m` 那一點的畫面座標（`onOrbit` + `project`）
    fn at(&self, m: f32) -> (f32, f32) {
        let a = R * self.k;
        let big_e = eccentric(m, self.e);
        let px = a * (big_e.cos() - self.e);
        let py = a * (1.0 - self.e * self.e).sqrt() * big_e.sin();
        let (sp, cp) = self.peri.sin_cos();
        let (qx, qy) = (px * cp - py * sp, px * sp + py * cp);
        let (x, y) = (qx * 1.05, qy * SQUASH);
        let (st, ct) = TILT.sin_cos();
        (CX + x * ct - y * st, CY + x * st + y * ct)
    }

    fn mean(&self, t: f32) -> f32 {
        self.m0 + self.n * t
    }
}

/// 第 j 條軌道的半長軸：朋友一人一條，外面再兩條空的
fn k_of(j: usize, rings: usize) -> f32 {
    K_IN + (K_OUT - K_IN) * j as f32 / (rings - 1).max(1) as f32
}

/// 一整圈虛線軌道（`ring`，進場長完所以 span 是 1）
fn ring(ctx: &mut Ctx, o: &Orbit, t: f32, alpha: f32, dash: &[f32]) {
    ctx.set_line_dash(dash);
    ctx.set_stroke(ink(alpha));
    ctx.begin_path();
    let n = 180;
    let from = o.mean(t);
    for s in 0..=n {
        let (x, y) = o.at(from - (s as f32 / n as f32) * TAU);
        if s == 0 {
            ctx.move_to(x, y);
        } else {
            ctx.line_to(x, y);
        }
    }
    ctx.stroke();
    ctx.set_line_dash(&[]);
}

/// 軌道時間停在哪：讓剛更新那顆星落在右邊空著的天（字的右邊、離畫面邊緣與中心都有距離）。
/// 從進場長完那一刻往後找；找不到就停在長完那一刻
fn keep_time(o: &Orbit) -> f32 {
    let open = |(x, y): (f32, f32)| x > 1010.0 && x < W as f32 - 90.0 && y > 150.0 && y < H as f32 - 150.0;
    let period = TAU / o.n;
    (0..600).map(|s| GROW_S + period * s as f32 / 600.0).find(|t| open(o.at(o.mean(*t)))).unwrap_or(GROW_S)
}

pub struct Friends {
    back: Pixmap,
    /// 剛更新那顆星的位置、亮度與它在清單裡的位置（相位用）
    fresh: (f32, f32, f32, usize),
    twinkle: Vec<Twinkle>,
}

impl Default for Friends {
    fn default() -> Self {
        Self::new()
    }
}

impl Friends {
    pub fn new() -> Self {
        let rings = STARS.len() + 2;
        let orbits: Vec<Orbit> =
            STARS.iter().enumerate().map(|(i, s)| Orbit::of(k_of(i, rings), s.id)).collect();
        let fresh_i = STARS.len() - 1;
        let t = keep_time(&orbits[fresh_i]);

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        // 背景星：只有剛更新那顆星附近的會閃（見 `starfield`）
        let (fx, fy) = orbits[fresh_i].at(orbits[fresh_i].mean(t));
        let twinkle = starfield::scatter(&mut ctx, |x, y| (x - fx).hypot(y - fy) < 220.0);

        for o in &orbits {
            ring(&mut ctx, o, t, 0.22, &[1.0, 4.0]);
        }
        for j in STARS.len()..rings {
            let o = Orbit::of(k_of(j, rings), if j == STARS.len() { "next" } else { "far" });
            ring(&mut ctx, &o, t, 0.08, &[2.0, 6.0]);
        }

        // 中心：這個站
        ctx.set_fill(
            Gradient::radial(CX, CY, 0.0, CX, CY, 26.0).stop(0.0, amber(0.55)).stop(1.0, amber(0.0)),
        );
        ctx.begin_path();
        ctx.arc(CX, CY, 26.0, 0.0, TAU, false);
        ctx.fill();
        ctx.dot(CX, CY, 3.6, amber(1.0));

        let mut fresh = (0.0, 0.0, 0.0, fresh_i);
        for (i, (s, o)) in STARS.iter().zip(&orbits).enumerate() {
            let lum = brightness_of(s.days);
            let m = o.mean(t);
            let (px, py) = o.at(m);

            // 星身後的軌跡：越靠近星越亮
            let steps = 24;
            ctx.set_line_width(1.2);
            let mut prev = o.at(m - TRAIL_M);
            for k in 1..=steps {
                let q = o.at(m - TRAIL_M * (1.0 - k as f32 / steps as f32));
                ctx.set_stroke(ink(0.5 * lum * (k as f32 / steps as f32)));
                ctx.begin_path();
                ctx.move_to(prev.0, prev.1);
                ctx.line_to(q.0, q.1);
                ctx.stroke();
                prev = q;
            }
            ctx.set_line_width(1.0);

            // 每篇一個刻點：橫跨軌道的一小段線＋一個點。用對數排，近幾天的分得開、一年前的擠在最後
            let scale = |d: f32| (d.max(0.0).ln_1p() / 365f32.ln_1p()).min(1.0);
            let mut last = f32::NEG_INFINITY;
            for &d in s.posts {
                let dm = (BEACON_NEAR + (BEACON_SPAN - BEACON_NEAR) * scale(d)).max(last + BEACON_GAP);
                last = dm;
                let (bx, by) = o.at(m - dm);
                let (b2x, b2y) = o.at(m - dm + 0.01);
                let len = (b2x - bx).hypot(b2y - by).max(f32::MIN_POSITIVE);
                let (nx, ny) = (-(b2y - by) / len, (b2x - bx) / len);
                let a = 0.85 - 0.55 * scale(d);
                ctx.set_stroke(ink(a));
                ctx.begin_path();
                ctx.move_to(bx - nx * 3.0, by - ny * 3.0);
                ctx.line_to(bx + nx * 3.0, by + ny * 3.0);
                ctx.stroke();
                ctx.dot(bx, by, 1.8, ink(a));
            }

            if i == fresh_i {
                fresh = (px, py, lum, i);
                continue;
            }
            // 沒在更新的星：光暈固定 0.45
            star(&mut ctx, px, py, lum, 0.45);
        }
        debug_assert!(STARS[fresh_i].days.is_some_and(|d| d <= FRESH_DAYS));
        Self { back: ctx.pixmap, fresh, twinkle }
    }
}

/// 星的光暈與星本身
fn star(ctx: &mut Ctx, x: f32, y: f32, lum: f32, pulse: f32) {
    ctx.set_fill(
        Gradient::radial(x, y, 0.0, x, y, 16.0).stop(0.0, ink(0.35 * pulse * lum)).stop(1.0, ink(0.0)),
    );
    ctx.begin_path();
    ctx.arc(x, y, 16.0, 0.0, TAU, false);
    ctx.fill();
    ctx.dot(x, y, 3.2, ink(lum));
}

impl super::Scene for Friends {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let p = index as f32 / FRAMES as f32;
        let real = p * LOOP_S;
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        for s in &self.twinkle {
            s.draw(&mut ctx, p);
        }

        let (x, y, lum, i) = self.fresh;
        let i = i as f32;
        // 訊號環：兩圈一前一後往外擴（畫成跟軌道平面同樣傾斜的橢圓）。前端是 `real × 0.3`，
        // 一圈 15 秒是 4.5 次；調成剛好 4 次（慢約 11%），最後一格才接得回第一格
        let signal = 4.0 / LOOP_S;
        for k in 0..2 {
            let ph = (real * signal + i * 0.37 + k as f32 * 0.5).rem_euclid(1.0);
            let r = 6.0 + ph * 44.0;
            ctx.set_stroke(ink(0.32 * (1.0 - ph)));
            ctx.begin_path();
            ctx.ellipse(x, y, r, r * SQUASH, TILT, 0.0, TAU, false);
            ctx.stroke();
        }
        // 光暈一明一暗：前端是 `sin(real × 2.4 + i)`，一圈 5.7 次，調成剛好 6 次（快約 5%）。
        // 亮度分九階（跟背景星分階同一個理由）：連續變化的話這一團光每一格都得整塊重存
        let pulse = 0.6 + 0.4 * ((real * 6.0 * TAU / LOOP_S + i).sin() * 4.0).round() / 4.0;
        star(&mut ctx, x, y, lum, pulse);
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 雜湊要跟前端那份算出一樣的值，軌道的形狀才跟朋友頁的同一套規則。
    /// 期望值是用 node 跑 friendsSky.ts 的 `hash01` 得到的（含一個 BMP 以外的字：JS 逐個 code point 算）
    #[test]
    fn 雜湊跟前端一致() {
        for (s, salt, want) in [
            ("doraeyi", 0, 0.362_031_f32),
            ("doraeyi", 1, 0.873_278),
            ("doraeyi", 2, 0.161_156),
            ("🪐影", 0, 0.329_801),
        ] {
            let got = hash01(s, salt);
            assert!((got - want).abs() < 1e-6, "{s}#{salt}: {got} ≠ {want}");
        }
    }
}
