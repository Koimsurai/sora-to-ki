//! OG 圖的背景：首頁那顆刻線土星、三條衛星軌道、稀疏的星點，逐格畫成動畫。
//!
//! 土星的畫法是 `src/components/about/colophonSaturn.ts`（此站點遊樂場的平面版）逐行移植，
//! 數字照 `src/lib/saturnSpec.ts`。**兩邊要一起改**，不然分享卡上的土星會跟站上那顆不一樣。
//!
//! 動的只有兩件事：衛星沿軌道繞一圈、少數幾顆星慢慢閃。土星本身不轉——星球一轉每個
//! 像素都變，每一格都得存整張圖，檔案會大十倍。動的東西都排成剛好在 `LOOP_MS` 內
//! 繞完整數圈，所以最後一格接回第一格看不出接縫。
//!
//! 這一張用在首頁與站台預設圖。它比其他頁早寫，畫法是自己逐像素算，沒走 `canvas`：
//! 土星的刷痕本來就是逐像素的著色器（前端也是 `putImageData`）。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_possible_wrap,
    clippy::many_single_char_names,
    clippy::suboptimal_flops,
    reason = "逐像素的幾何運算：值域都在畫布範圍內（夾過 0–255 或 0–W），單字母變數照抄 TS 原版以便對照"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};

/// 一圈的長度與每格的時間。100ms 一格（10fps）：衛星一格移動幾個像素，看起來是連續的，
/// 而格數直接決定檔案大小
const LOOP_MS: u32 = 18_000;
const FRAME_MS: u32 = 100;
const FRAMES: usize = (LOOP_MS / FRAME_MS) as usize;

const GROUND: [f32; 3] = [10.0, 10.0, 12.0];
const INK: [f32; 3] = [241.0, 236.0, 227.0];
const AMBER: [f32; 3] = [233.0, 193.0, 122.0];

// ── saturnSpec.ts ────────────────────────────────────────────────
const TILT: f32 = 0.42;
const ROLL: f32 = -0.2;
const SUN: [f32; 3] = [-0.75, 0.45, 0.5];
/// [緯度°, 寬度°, 亮度增減, 南北對稱]
const SATURN_BANDS: [(f32, f32, f32, bool); 15] = [
    (0.0, 9.0, 0.26, false),
    (17.0, 4.0, -0.3, true),
    (22.5, 2.5, 0.08, true),
    (28.0, 2.0, -0.14, true),
    (33.0, 2.5, 0.06, true),
    (38.0, 1.6, -0.12, true),
    (43.0, 2.4, 0.05, true),
    (48.0, 1.5, -0.13, true),
    (53.0, 2.0, 0.03, true),
    (58.0, 1.8, -0.1, true),
    (-63.0, 2.5, -0.08, false),
    (64.0, 2.0, -0.06, false),
    (72.0, 5.0, -0.2, true),
    (78.0, 0.9, 0.16, false),
    (86.0, 6.0, -0.3, true),
];
const RING_SEGMENTS: [(f32, f32, f32); 9] = [
    (1.11, 1.236, 0.08),
    (1.239, 1.527, 0.26),
    (1.527, 1.64, 0.62),
    (1.64, 1.75, 0.88),
    (1.75, 1.88, 1.0),
    (1.88, 1.951, 0.8),
    (1.951, 2.025, 0.1),
    (2.025, 2.267, 0.62),
    (2.322, 2.33, 0.4),
];
const RING_GAPS: [(f32, f32); 3] = [(2.214, 0.006), (2.265, 0.003), (1.45, 0.006)];
const RING_INNER: f32 = 1.11;
const RING_OUTER: f32 = 2.34;
const PLANET_ROWS: f32 = 22.0;
const RING_ROWS: f32 = 34.0;
const PLANET_COVER: f32 = 0.76;
const RING_COVER: f32 = 0.64;
/// 首頁五條軌道的內三條（外兩條在這個大小下整條都在畫布外）
const ORBITS: [f32; 3] = [2.9, 3.55, 4.25];
const PHASES: [f32; 3] = [0.7, 2.07, 3.44];

// ── 構圖 ─────────────────────────────────────────────────────────
/// 土星在右半邊：左邊 72–712px 是字。環的外緣約 2.4R，所以中心離字要留這麼多
const CX: f32 = 942.0;
const CY: f32 = 292.0;
const R: f32 = 92.0;
/// 琥珀色的是第幾顆（站上的規矩：琥珀只當「一個點」的訊號）
const AMBER_SAT: usize = 0;
/// 會閃的星只在這條線右邊（跟衛星同一塊），見 `Scene::new`
const TWINKLE_FROM_X: f32 = 600.0;

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let k = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    k * k * (3.0 - 2.0 * k)
}

fn hash3(x: i32, y: i32, z: i32) -> f32 {
    let mut h = (x as u32)
        .wrapping_mul(374_761_393)
        .wrapping_add((y as u32).wrapping_mul(668_265_263))
        .wrapping_add((z as u32).wrapping_mul(1_274_126_177));
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177);
    ((f64::from(h ^ (h >> 16)) / 4_294_967_295.0) * 2.0 - 1.0) as f32
}

fn noise(x: f32, y: f32, z: f32) -> f32 {
    let (xi, yi, zi) = (x.floor(), y.floor(), z.floor());
    let (fx, fy, fz) = (x - xi, y - yi, z - zi);
    let (xi, yi, zi) = (xi as i32, yi as i32, zi as i32);
    let u = fx * fx * (3.0 - 2.0 * fx);
    let v = fy * fy * (3.0 - 2.0 * fy);
    let w = fz * fz * (3.0 - 2.0 * fz);
    let lerp = |a: f32, b: f32, k: f32| a + (b - a) * k;
    let c = |dx, dy, dz| hash3(xi + dx, yi + dy, zi + dz);
    lerp(
        lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
        lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
        w,
    )
}

struct Rot {
    cos_r: f32,
    sin_r: f32,
    cos_t: f32,
    sin_t: f32,
    sun: [f32; 3],
}

impl Rot {
    fn new() -> Self {
        let (sin_r, cos_r) = ROLL.sin_cos();
        let (sin_t, cos_t) = TILT.sin_cos();
        let mut rot = Self { cos_r, sin_r, cos_t, sin_t, sun: [0.0; 3] };
        let l = (SUN[0] * SUN[0] + SUN[1] * SUN[1] + SUN[2] * SUN[2]).sqrt();
        rot.sun = rot.to_planet(SUN[0] / l, SUN[1] / l, SUN[2] / l);
        rot
    }

    /// 畫面（x 往右、y 往上、z 朝向看的人）→ 星球自己的座標
    fn to_planet(&self, x: f32, y: f32, z: f32) -> [f32; 3] {
        let x1 = x * self.cos_r + y * self.sin_r;
        let y1 = -x * self.sin_r + y * self.cos_r;
        [x1, y1 * self.cos_t + z * self.sin_t, -y1 * self.sin_t + z * self.cos_t]
    }

    /// 環的平面上 (x, z) → 畫面上的 (x, y 往上, 深度)
    fn plane_to_view(&self, x: f32, z: f32) -> [f32; 3] {
        [
            x * self.cos_r + z * self.sin_t * self.sin_r,
            x * self.sin_r - z * self.sin_t * self.cos_r,
            z * self.cos_t,
        ]
    }

    /// 畫面上一點（星球半徑為 1 的單位）落在環平面上的哪裡
    fn view_to_plane(&self, x: f32, y: f32) -> (f32, f32) {
        (x * self.cos_r + y * self.sin_r, (x * self.sin_r - y * self.cos_r) / self.sin_t)
    }
}

fn ring_tone(r: f32) -> f32 {
    let mut tone = 0.0;
    for (inner, outer, value) in RING_SEGMENTS {
        tone +=
            smoothstep(inner - 0.004, inner + 0.004, r) * smoothstep(outer + 0.004, outer - 0.004, r) * value;
    }
    for (at, half) in RING_GAPS {
        tone *= smoothstep(half * 0.4, half, (r - at).abs());
    }
    tone
}

fn strokes(row: f32, ink: f32, cover: f32, fw: f32) -> f32 {
    let f = (row - row.floor() - 0.5).abs();
    let half = ink * cover / 2.0;
    let aa = (fw * 0.75).max(0.001);
    smoothstep(half + aa, half - aa, f) * (half / aa).clamp(0.0, 1.0)
}

fn planet_ink(rot: &Rot, n: [f32; 3], fw: f32) -> f32 {
    let s = rot.sun;
    let lit = smoothstep(-0.12, 0.4, n[0] * s[0] + n[1] * s[1] + n[2] * s[2]);
    let lat = n[1].clamp(-1.0, 1.0).asin() * 180.0 / PI;
    let mut tone = 0.52;
    for (c, w, d, mirror) in SATURN_BANDS {
        tone += (-((lat - c) / w).powi(2)).exp() * d * 1.6;
        if mirror {
            tone += (-((lat + c) / w).powi(2)).exp() * d * 1.6;
        }
    }
    tone *= smoothstep(80.0, 48.0, lat.abs());
    let wave = noise(n[0] * 1.1, n[1] * 6.0, n[2] * 1.1);
    let row = n[1] * PLANET_ROWS + wave * 0.8;
    let swell = noise(n[0] * 2.2, n[1] * 36.0, n[2] * 2.2) * 0.45 + 1.0;
    let brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48.0, n[2] * 2.4));
    // 環落在星球上的影子
    let mut shade = 1.0;
    let t = -n[1] / s[1];
    if t > 0.0 {
        shade = 1.0 - ring_tone((n[0] + s[0] * t).hypot(n[2] + s[2] * t)) * 0.8;
    }
    let ink = (lit * tone * swell * (0.05 + 0.95 * brush) * shade).clamp(0.0, 1.0).powf(0.8);
    strokes(row, ink, PLANET_COVER, fw)
}

fn ring_ink(rot: &Rot, x: f32, z: f32, fw: f32) -> f32 {
    let r = x.hypot(z);
    if !(RING_INNER - 0.01..=RING_OUTER + 0.01).contains(&r) {
        return 0.0;
    }
    let s = rot.sun;
    let ringlets = noise(r * 60.0, 0.0, 0.0) * 0.22 + 0.9;
    let brush = smoothstep(-0.55, 0.15, noise(x * 2.4, r * 40.0, z * 2.4));
    // 星球投在環上的影子
    let along = -(x * s[0] + z * s[2]);
    let (cx, cy, cz) = (x + s[0] * along, s[1] * along, z + s[2] * along);
    let shade = if along > 0.0 && (cx * cx + cy * cy + cz * cz).sqrt() < 1.0 { 0.12 } else { 1.0 };
    let ink = (ring_tone(r) * ringlets * (0.4 + 0.6 * brush) * shade).clamp(0.0, 1.0);
    strokes(r * RING_ROWS, ink.powf(0.75), RING_COVER, fw)
}

/// 土星那一塊（含環）：預乘過的 RGBA，左上角在 (x0, y0)
struct SaturnLayer {
    x0: usize,
    y0: usize,
    w: usize,
    h: usize,
    /// 每個像素 [r·a, g·a, b·a, a]
    px: Vec<[f32; 4]>,
}

fn render_saturn(rot: &Rot) -> SaturnLayer {
    let reach = ((RING_OUTER + 0.05) * R).ceil();
    let x0 = (CX - reach).floor().max(0.0) as usize;
    let y0 = (CY - reach).floor().max(0.0) as usize;
    let x1 = ((CX + reach).ceil() as usize).min(W);
    let y1 = ((CY + reach).ceil() as usize).min(H);
    let (w, h) = (x1 - x0, y1 - y0);
    let mut px = vec![[0.0f32; 4]; w * h];
    let sphere = |x: f32, y: f32| (1.0 - x * x - y * y).max(0.0).sqrt();
    for py in y0..y1 {
        for qx in x0..x1 {
            let x = (qx as f32 + 0.5 - CX) / R;
            let y = -(py as f32 + 0.5 - CY) / R;
            let d = x.hypot(y);
            let (mut base_a, mut base) = (0.0, 0.0);
            if d < 1.0 + 1.0 / R {
                base_a = ((1.0 - d) * R + 0.5).clamp(0.0, 1.0);
                let dd = d.min(0.9999);
                let k = if d > 0.0 { dd / d } else { 1.0 };
                let n = rot.to_planet(x * k, y * k, (1.0 - dd * dd).sqrt());
                let nx = rot.to_planet((x + 1.0 / R) * k, y * k, sphere(x + 1.0 / R, y));
                let ny = rot.to_planet(x * k, (y - 1.0 / R) * k, sphere(x, y - 1.0 / R));
                let fw = PLANET_ROWS * ((nx[1] - n[1]).abs() + (ny[1] - n[1]).abs());
                base = planet_ink(rot, n, fw);
            }
            let mut ring_a = 0.0;
            let (rx, rz) = rot.view_to_plane(x, y);
            if !(d < 1.0 && rz * rot.cos_t < 0.0) {
                let r0 = rx.hypot(rz);
                let r1 = (rx + rot.cos_r / R).hypot(rz + rot.sin_r / R / rot.sin_t);
                let r2 = (rx - rot.sin_r / R).hypot(rz + rot.cos_r / R / rot.sin_t);
                ring_a = ring_ink(rot, rx, rz, RING_ROWS * ((r1 - r0).abs() + (r2 - r0).abs()));
            }
            let a = ring_a + base_a * (1.0 - ring_a);
            if a <= 0.0 {
                continue;
            }
            let mut out = [0.0f32; 4];
            for ch in 0..3 {
                let planet_c = GROUND[ch] + (INK[ch] - GROUND[ch]) * base;
                out[ch] = INK[ch] * ring_a + planet_c * base_a * (1.0 - ring_a);
            }
            out[3] = a;
            px[(py - y0) * w + (qx - x0)] = out;
        }
    }
    SaturnLayer { x0, y0, w, h, px }
}

/// mulberry32：跟設計稿同一個產生器，同樣的種子撒出同樣的星。
/// 航行日誌那張的背景星空也用它（同一組種子，見 `log.rs`）
pub(super) fn rng(seed: u32) -> impl FnMut() -> f32 {
    let mut a = seed;
    move || {
        a = a.wrapping_add(0x6d2b_79f5);
        let mut t = a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 0x3d));
        (f64::from(t ^ (t >> 14)) / 4_294_967_296.0) as f32
    }
}

struct Star {
    x: f32,
    y: f32,
    r: f32,
    a: f32,
    /// 會閃的星：一圈裡閃幾次（整數，接縫才對得上）與起始相位；0 表示不閃
    laps: f32,
    phase: f32,
}

/// 整張圖不變的部分先畫好，之後每一格從這裡複製
pub struct Saturn {
    rot: Rot,
    /// 底色＋不閃的星＋軌道（RGB）
    back: Vec<[f32; 3]>,
    twinkle: Vec<Star>,
    planet: SaturnLayer,
}

/// 反鋸齒的實心圓，`alpha` 是最濃處的不透明度（source-over）
fn disc(buf: &mut [[f32; 3]], x: f32, y: f32, r: f32, color: [f32; 3], alpha: f32) {
    let reach = r + 1.0;
    let (xa, xb) = ((x - reach).floor().max(0.0) as usize, ((x + reach).ceil() as usize).min(W));
    let (ya, yb) = ((y - reach).floor().max(0.0) as usize, ((y + reach).ceil() as usize).min(H));
    for py in ya..yb {
        for qx in xa..xb {
            let d = (qx as f32 + 0.5 - x).hypot(py as f32 + 0.5 - y);
            // 半徑不到一像素的小星：面積換成濃度，不然它們會一樣大、只差在閃不閃
            let cover =
                if r < 0.5 { (0.5 + r - d).clamp(0.0, 1.0) * r * 2.0 } else { (r + 0.5 - d).clamp(0.0, 1.0) };
            let k = cover * alpha;
            if k > 0.0 {
                let p = &mut buf[py * W + qx];
                for ch in 0..3 {
                    p[ch] += (color[ch] - p[ch]) * k;
                }
            }
        }
    }
}

/// 一圈淡淡的光暈：中心 `alpha`、到 `r` 線性淡到 0
fn glow(buf: &mut [[f32; 3]], x: f32, y: f32, r: f32, color: [f32; 3], alpha: f32) {
    let (xa, xb) = ((x - r).floor().max(0.0) as usize, ((x + r).ceil() as usize).min(W));
    let (ya, yb) = ((y - r).floor().max(0.0) as usize, ((y + r).ceil() as usize).min(H));
    for py in ya..yb {
        for qx in xa..xb {
            let d = (qx as f32 + 0.5 - x).hypot(py as f32 + 0.5 - y);
            let k = (1.0 - d / r).max(0.0) * alpha;
            if k > 0.0 {
                let p = &mut buf[py * W + qx];
                for ch in 0..3 {
                    p[ch] += (color[ch] - p[ch]) * k;
                }
            }
        }
    }
}

impl Default for Saturn {
    fn default() -> Self {
        Self::new()
    }
}

impl Saturn {
    pub fn new() -> Self {
        let rot = Rot::new();
        let mut back = vec![GROUND; W * H];

        // 星：多數很淡很小，少數亮一點。分布避開土星中心那一塊（反正會被星球蓋住）
        let mut rand = rng(23);
        let mut twinkle = Vec::new();
        for i in 0..240 {
            let m = rand().powi(4);
            let star = Star {
                x: rand() * W as f32,
                y: rand() * H as f32,
                r: 0.35 + m * 0.9,
                a: 0.18 + m * 0.6,
                laps: 0.0,
                phase: rand() * TAU,
            };
            // 右半邊每四顆有一顆會閃，一圈閃一到三次。只挑右半邊，是因為一格的大小取的是
            // 「所有變動像素的外框」：左邊也有星在閃的話每一格都是整張圖寬，檔案大一倍
            // （外框裡沒變的像素雖然是透明的，整張 3 MB 的零壓完也還有 3 KB）
            if i % 4 == 0 && star.x > TWINKLE_FROM_X {
                twinkle.push(Star { laps: 1.0 + (i / 6 % 3) as f32, ..star });
            } else {
                disc(&mut back, star.x, star.y, star.r, INK, star.a);
            }
        }

        // 軌道：環平面上半徑 r 的圓。每個像素算它落在環平面的哪個半徑、離軌道幾個像素
        for py in 0..H {
            for qx in 0..W {
                let x = (qx as f32 + 0.5 - CX) / R;
                let y = -(py as f32 + 0.5 - CY) / R;
                let (rx, rz) = rot.view_to_plane(x, y);
                let r0 = rx.hypot(rz);
                // 往右、往下各一個像素時半徑變多少：線寬固定一像素
                let (ax, az) = rot.view_to_plane(x + 1.0 / R, y);
                let (bx, bz) = rot.view_to_plane(x, y - 1.0 / R);
                let grad = (ax.hypot(az) - r0).hypot(bx.hypot(bz) - r0).max(1e-6);
                for (i, orbit) in ORBITS.iter().enumerate() {
                    let cover = (1.0 - (r0 - orbit).abs() / grad).clamp(0.0, 1.0);
                    if cover > 0.0 {
                        let alpha = if i == AMBER_SAT { 0.24 } else { 0.13 };
                        let p = &mut back[py * W + qx];
                        for ch in 0..3 {
                            p[ch] += (INK[ch] - p[ch]) * cover * alpha;
                        }
                    }
                }
            }
        }

        let planet = render_saturn(&rot);
        Self { rot, back, twinkle, planet }
    }

    fn frame_rgb(&self, index: usize) -> Vec<[f32; 3]> {
        let t = index as f32 / FRAMES as f32; // 一圈裡的進度 0–1
        let mut buf = self.back.clone();
        for s in &self.twinkle {
            // 亮度只分五階：連續變化的話這些星每一格都在變，每格都得存它們；分階之後
            // 大部分的格子裡它們不動，眼睛看起來一樣是在慢慢閃
            let k = 0.55 + 0.45 * ((s.laps * TAU * t + s.phase).sin() * 2.0).round() / 2.0;
            disc(&mut buf, s.x, s.y, s.r, INK, s.a * k);
        }

        // 衛星：一圈剛好繞軌道一圈。在星球後面的先畫（被星球蓋住），前面的後畫
        let sats: Vec<(usize, [f32; 3])> = ORBITS
            .iter()
            .enumerate()
            .map(|(i, r)| {
                let a = PHASES[i] + TAU * t;
                (i, self.rot.plane_to_view(a.cos() * r, a.sin() * r))
            })
            .collect();
        let draw_sat = |buf: &mut [[f32; 3]], i: usize, v: [f32; 3]| {
            let (x, y) = (CX + v[0] * R, CY - v[1] * R);
            if i == AMBER_SAT {
                glow(buf, x, y, 13.0, AMBER, 0.5);
                disc(buf, x, y, 3.2, AMBER, 1.0);
            } else {
                disc(buf, x, y, 2.3, INK, 0.8);
            }
        };
        for &(i, v) in &sats {
            if v[2] < 0.0 {
                draw_sat(&mut buf, i, v);
            }
        }
        let sl = &self.planet;
        for row in 0..sl.h {
            for col in 0..sl.w {
                let s = sl.px[row * sl.w + col];
                if s[3] > 0.0 {
                    let p = &mut buf[(sl.y0 + row) * W + sl.x0 + col];
                    for ch in 0..3 {
                        p[ch] = s[ch] + p[ch] * (1.0 - s[3]);
                    }
                }
            }
        }
        for &(i, v) in &sats {
            if v[2] >= 0.0 {
                draw_sat(&mut buf, i, v);
            }
        }
        buf
    }
}

impl super::Scene for Saturn {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let rgb = self.frame_rgb(index);
        let mut data = Vec::with_capacity(W * H * 4);
        for p in rgb {
            data.extend(p.map(|c| c.round().clamp(0.0, 255.0) as u8));
            data.push(255);
        }
        Pixmap::from_vec(data, tiny_skia::IntSize::from_wh(W as u32, H as u32).expect("常數尺寸"))
            .expect("長度剛好是 W×H×4")
    }
}
