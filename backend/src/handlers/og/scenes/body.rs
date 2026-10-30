//! OG 圖的背景：首頁那顆主星（站長選的預設天體）、衛星軌道、稀疏的星點，逐格畫成動畫。
//!
//! 主星的畫法是 `src/components/about/colophonBody.ts`（此站點遊樂場的平面版）逐行移植，畫到第四步
//! （土星、海王星有環，黑洞有盤影，參宿四有外層大氣）；數字照 `src/lib/saturnSpec.ts` 的 `PLANETS`。
//! **兩邊要一起改**，不然分享卡上的主星會跟站上那顆不一樣。
//!
//! 動的只有三件事：衛星沿軌道繞一圈、參宿四的伴星繞一圈、少數幾顆星慢慢閃。主星本身不轉也不脹縮——
//! 一動每個像素都變，每一格都得存整張圖，檔案會大十倍。動的東西都排成剛好在 `LOOP_MS` 內
//! 繞完整數圈，所以最後一格接回第一格看不出接縫。
//!
//! 這一張用在首頁與站台預設圖。它比其他頁早寫，畫法是自己逐像素算，沒走 `canvas`：
//! 主星的刷痕本來就是逐像素的著色器（前端也是 `putImageData`）。只有軌道（橢圓、點線）借 `canvas` 畫。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_possible_wrap,
    clippy::many_single_char_names,
    clippy::suboptimal_flops,
    clippy::unreadable_literal,
    clippy::excessive_precision,
    clippy::approx_constant,
    reason = "逐像素的幾何運算：值域都在畫布範圍內（夾過 0–255 或 0–W），單字母變數照抄 TS 原版以便對照；\
              規格的數字從 saturnSpec.ts 原樣產生（弧的角度是度數換成的弧度），不手動化簡"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, Palette, Rgba, palette_of};

/// 一圈的長度與每格的時間。100ms 一格（10fps）：衛星一格移動幾個像素，看起來是連續的，
/// 而格數直接決定檔案大小
const LOOP_MS: u32 = 18_000;
const FRAME_MS: u32 = 100;
const FRAMES: usize = (LOOP_MS / FRAME_MS) as usize;

// ── saturnSpec.ts ────────────────────────────────────────────────
const TILT: f32 = 0.42;
const ROLL: f32 = -0.2;
const SUN: [f32; 3] = [-0.75, 0.45, 0.5];
const RING_ROWS: f32 = 34.0;
const RING_COVER: f32 = 0.64;
const DISK_SHEAR: f32 = 3.2;
const DISK_COVER: f32 = 0.8;
/// 首頁的五條軌道（沒有自己軌道形狀的主星用這組）與每一顆的起始相位（`satellitePhase`）
const ORBITS: [f32; 5] = [2.9, 3.55, 4.25, 4.95, 5.7];
const PHASES: [f32; 5] = [0.7, 2.07, 3.44, 4.81, 6.18];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Planet,
    BlackHole,
    Star,
}

struct Ring {
    /// [內緣, 外緣, 亮度]
    segments: &'static [(f32, f32, f32)],
    /// [位置, 半寬]
    gaps: &'static [(f32, f32)],
    inner: f32,
    outer: f32,
    /// 海王星 Adams 環上的弧：[半徑, 起, 迄（弧度）, 亮度]
    arcs: &'static [(f32, f32, f32, f32)],
    gain: f32,
    /// 刷痕的寬環（土星、吸積盤）；false 是髮絲細環（海王星）
    brushed: bool,
    /// 吸積盤朝我們轉來那一側亮多少
    doppler: f32,
}

/// 軌道的形狀（`StarOrbit`）。進動不畫：分享圖只有一圈，軌道停在第 0 秒的方向
struct Orbit {
    a: f32,
    e: f32,
    incl: f32,
    node: f32,
    peri: f32,
}

struct Hexagon {
    colat: f32,
    width: f32,
    delta: f32,
}

struct Companion {
    a: f32,
    size: f32,
}

/// 一顆主星（`PlanetSpec`，只留平面版用得到的欄位）
struct Spec {
    kind: Kind,
    /// [緯度°, 寬度°, 亮度增減]
    bands: &'static [(f32, f32, f32)],
    base: f32,
    rows: f32,
    cover: f32,
    wave: f32,
    swell: f32,
    floor: f32,
    pole: (f32, f32),
    /// [經度（弧度）, 緯度°, 經向寬°, 緯向寬°, 亮度增減]
    spots: &'static [(f32, f32, f32, f32, f32)],
    ring: Ring,
    retrograde: &'static [usize],
    orbits: Option<[Orbit; 5]>,
    hexagon: Option<Hexagon>,
    companion: Option<Companion>,
    /// 第一格從一圈的哪裡開始（0–1）。不播動畫的平台只看得到第一格，訊號色那顆要在畫面裡、
    /// 在主星前面；這個欄位只有分享圖有，前端沒有
    start: f32,
}

const SATURN: Spec = Spec {
    start: 0.0,
    kind: Kind::Planet,
    bands: &[
        (0.0, 9.0, 0.26),
        (17.0, 4.0, -0.3),
        (-17.0, 4.0, -0.3),
        (22.5, 2.5, 0.08),
        (-22.5, 2.5, 0.08),
        (28.0, 2.0, -0.14),
        (-28.0, 2.0, -0.14),
        (33.0, 2.5, 0.06),
        (-33.0, 2.5, 0.06),
        (38.0, 1.6, -0.12),
        (-38.0, 1.6, -0.12),
        (43.0, 2.4, 0.05),
        (-43.0, 2.4, 0.05),
        (48.0, 1.5, -0.13),
        (-48.0, 1.5, -0.13),
        (53.0, 2.0, 0.03),
        (-53.0, 2.0, 0.03),
        (58.0, 1.8, -0.1),
        (-58.0, 1.8, -0.1),
        (-63.0, 2.5, -0.08),
        (64.0, 2.0, -0.06),
        (72.0, 5.0, -0.2),
        (-72.0, 5.0, -0.2),
        (86.0, 6.0, -0.3),
        (-86.0, 6.0, -0.3),
    ],
    base: 0.52,
    rows: 22.0,
    cover: 0.76,
    wave: 0.8,
    swell: 0.45,
    floor: 0.05,
    pole: (80.0, 48.0),
    spots: &[],
    ring: Ring {
        segments: &[
            (1.11, 1.236, 0.08),
            (1.239, 1.527, 0.26),
            (1.527, 1.64, 0.62),
            (1.64, 1.75, 0.88),
            (1.75, 1.88, 1.0),
            (1.88, 1.951, 0.8),
            (1.951, 2.025, 0.1),
            (2.025, 2.267, 0.62),
            (2.322, 2.33, 0.4),
        ],
        gaps: &[(2.214, 0.006), (2.265, 0.003), (1.45, 0.006)],
        inner: 1.11,
        outer: 2.34,
        arcs: &[],
        gain: 1.0,
        brushed: true,
        doppler: 0.0,
    },
    retrograde: &[],
    orbits: Some([
        Orbit { a: 2.6, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 3.0765017667844523, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 3.5913427561837454, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 4.341696113074205, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 5.699999999999999, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
    ]),
    hexagon: Some(Hexagon { colat: 12.0, width: 1.4, delta: 0.85 }),
    companion: None,
};
const NEPTUNE: Spec = Spec {
    start: 0.0,
    kind: Kind::Planet,
    bands: &[
        (0.0, 14.0, -0.06),
        (-24.0, 6.0, 0.05),
        (24.0, 7.0, 0.04),
        (-40.0, 4.0, -0.04),
        (-46.0, 3.0, 0.05),
        (44.0, 5.0, 0.03),
        (-66.0, 9.0, -0.12),
        (66.0, 9.0, -0.08),
    ],
    base: 0.58,
    rows: 34.0,
    cover: 0.56,
    wave: 0.25,
    swell: 0.12,
    floor: 0.75,
    pole: (72.0, 44.0),
    spots: &[
        (-0.95, 23.0, 24.0, 11.0, 0.6),
        (-0.95, 23.0, 16.0, 7.0, -1.05),
        (-0.88, 15.0, 14.0, 1.8, 0.9),
        (2.2, 31.0, 16.0, 7.5, 0.5),
        (2.2, 31.0, 11.0, 5.0, -0.95),
        (-0.55, -22.0, 24.0, 11.0, 0.6),
        (-0.55, -22.0, 16.0, 7.0, -1.05),
        (-0.5, -32.0, 14.0, 1.8, 0.9),
        (0.9, -42.0, 5.0, 1.4, 0.7),
        (2.6, -55.0, 5.0, 3.0, -0.6),
        (2.6, -55.0, 1.2, 0.9, 0.8),
        (-1.4, 27.0, 35.0, 0.9, 0.7),
        (1.8, 31.0, 28.0, 0.8, 0.6),
        (3.6, -36.0, 30.0, 0.8, 0.6),
        (-2.6, 41.0, 22.0, 0.7, 0.5),
    ],
    ring: Ring {
        segments: &[(2.142, 2.156, 0.45), (2.532, 2.548, 0.35)],
        gaps: &[],
        inner: 2.0,
        outer: 2.6,
        arcs: &[
            (2.54, 0.0, 0.06981317007977318, 1.0),
            (2.54, 0.15707963267948966, 0.3316125578789226, 1.0),
            (2.54, 0.41887902047863906, 0.6632251157578452, 1.0),
            (2.54, 0.7853981633974483, 1.1519173063162575, 1.0),
        ],
        gain: 1.0,
        brushed: false,
        doppler: 0.0,
    },
    retrograde: &[3],
    orbits: Some([
        Orbit { a: 2.9, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 3.55, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 4.25, e: 0.0, incl: 0.0, node: 0.0, peri: 0.0 },
        Orbit { a: 4.95, e: 0.0, incl: 23.0, node: 40.0, peri: 0.0 },
        Orbit { a: 4.5, e: 0.38, incl: 7.0, node: 200.0, peri: 120.0 },
    ]),
    hexagon: None,
    companion: None,
};
const BLACKHOLE: Spec = Spec {
    start: 0.14,
    kind: Kind::BlackHole,
    bands: &[],
    base: 0.0,
    rows: 22.0,
    cover: 0.76,
    wave: 0.8,
    swell: 0.45,
    floor: 0.05,
    pole: (90.0, 89.0),
    spots: &[],
    ring: Ring {
        segments: &[(1.17, 1.45, 1.0), (1.45, 1.8, 0.8), (1.8, 2.2, 0.55), (2.2, 2.6, 0.3)],
        gaps: &[],
        inner: 1.15,
        outer: 2.65,
        arcs: &[],
        gain: 1.0,
        brushed: true,
        doppler: 0.55,
    },
    retrograde: &[],
    orbits: Some([
        Orbit { a: 3.3, e: 0.18, incl: 8.0, node: 20.0, peri: 40.0 },
        Orbit { a: 3.7, e: 0.3, incl: 24.0, node: 110.0, peri: 200.0 },
        Orbit { a: 4.1, e: 0.24, incl: 14.0, node: 250.0, peri: 300.0 },
        Orbit { a: 4.5, e: 0.33, incl: 32.0, node: 60.0, peri: 120.0 },
        Orbit { a: 4.9, e: 0.2, incl: 18.0, node: 170.0, peri: 10.0 },
    ]),
    hexagon: None,
    companion: None,
};
const BETELGEUSE: Spec = Spec {
    start: 0.0,
    kind: Kind::Star,
    bands: &[],
    base: 0.62,
    rows: 26.0,
    cover: 0.72,
    wave: 2.4,
    swell: 0.4,
    floor: 0.2,
    pole: (95.0, 94.0),
    spots: &[(0.3, -35.0, 42.0, 22.0, -0.55), (-0.8, 22.0, 16.0, 12.0, 0.3), (2.0, -6.0, 20.0, 15.0, 0.25)],
    ring: Ring {
        segments: &[],
        gaps: &[],
        inner: 1.05,
        outer: 1.6,
        arcs: &[],
        gain: 0.0,
        brushed: true,
        doppler: 0.0,
    },
    retrograde: &[],
    orbits: None,
    hexagon: None,
    companion: Some(Companion { a: 1.6, size: 0.12 }),
};

fn spec_of(theme: &str) -> &'static Spec {
    match theme {
        "neptune" => &NEPTUNE,
        "blackhole" => &BLACKHOLE,
        "betelgeuse" => &BETELGEUSE,
        _ => &SATURN,
    }
}

// ── 構圖 ─────────────────────────────────────────────────────────
/// 主星在右半邊：左邊 72–712px 是字。環的外緣約 2.6R，所以中心離字要留這麼多
const CX: f32 = 942.0;
const CY: f32 = 292.0;
const R: f32 = 92.0;
/// 亮成訊號色的是第幾顆（站上的規矩：訊號色只當「一個點」）
const SIGNAL_SAT: usize = 0;
/// 會閃的星只在這條線右邊（跟衛星同一塊），見 `Body::new`
const TWINKLE_FROM_X: f32 = 600.0;
const DEG: f32 = 180.0 / PI;

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let k = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    k * k * (3.0 - 2.0 * k)
}

fn mix(a: f32, b: f32, k: f32) -> f32 {
    a + (b - a) * k
}

fn fract(x: f32) -> f32 {
    x - x.floor()
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
    let c = |dx, dy, dz| hash3(xi + dx, yi + dy, zi + dz);
    mix(
        mix(mix(c(0, 0, 0), c(1, 0, 0), u), mix(c(0, 1, 0), c(1, 1, 0), u), v),
        mix(mix(c(0, 0, 1), c(1, 0, 1), u), mix(c(0, 1, 1), c(1, 1, 1), u), v),
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

    /// 反過來：星球座標的一點在畫面上的位置（x 往右、y 往上）與深度
    fn to_view(&self, [px, py, pz]: [f32; 3]) -> [f32; 3] {
        let y1 = py * self.cos_t - pz * self.sin_t;
        [
            px * self.cos_r - y1 * self.sin_r,
            px * self.sin_r + y1 * self.cos_r,
            py * self.sin_t + pz * self.cos_t,
        ]
    }

    /// 畫面上一點（星球半徑為 1 的單位）落在環平面上的哪裡
    fn view_to_plane(&self, x: f32, y: f32) -> (f32, f32) {
        (x * self.cos_r + y * self.sin_r, (x * self.sin_r - y * self.cos_r) / self.sin_t)
    }
}

fn ring_tone(spec: &Spec, r: f32) -> f32 {
    let mut tone = 0.0;
    for &(inner, outer, value) in spec.ring.segments {
        tone +=
            smoothstep(inner - 0.004, inner + 0.004, r) * smoothstep(outer + 0.004, outer - 0.004, r) * value;
    }
    for &(at, half) in spec.ring.gaps {
        tone *= smoothstep(half * 0.4, half, (r - at).abs());
    }
    tone * spec.ring.gain
}

fn strokes(row: f32, ink: f32, cover: f32, fw: f32) -> f32 {
    let f = (fract(row) - 0.5).abs();
    let half = ink * cover / 2.0;
    let aa = (fw * 0.75).max(0.001);
    smoothstep(half + aa, half - aa, f) * (half / aa).clamp(0.0, 1.0)
}

/// 至少一個像素寬的髮絲：比一個像素細的照比例變淡
fn hairline(d: f32, at: f32, half: f32, px: f32) -> f32 {
    let reach = (px * 0.5).max(half);
    ((reach + px * 0.5 - (d - at).abs()) / px).clamp(0.0, 1.0) * (half * 2.0 / px).min(1.0)
}

/// 星球表面的亮度底子：雲帶、斑點、極區變暗、北極六角形（土星）
fn surface_tone(spec: &Spec, n: [f32; 3], lat: f32) -> f32 {
    let mut tone = spec.base;
    for &(c, w, d) in spec.bands {
        tone += (-((lat - c) / w).powi(2)).exp() * d * 1.6;
    }
    if !spec.spots.is_empty() {
        let lon = n[0].atan2(n[2]);
        for &(lo, la, w_lon, w_lat, d) in spec.spots {
            let dl = (fract((lon - lo) / TAU + 0.5) - 0.5) * 360.0 * (la / DEG).cos();
            tone += (-((dl / w_lon).powi(2) + ((lat - la) / w_lat).powi(2))).exp() * d;
        }
    }
    tone *= smoothstep(spec.pole.0, spec.pole.1, lat.abs());
    if let Some(hex) = &spec.hexagon {
        let colat = 90.0 - lat;
        let seg = (fract((n[2].atan2(n[0]) * DEG + 360.0) / 60.0) * 60.0 - 30.0) / DEG;
        let edge = hex.colat * (PI / 6.0).cos() / seg.cos();
        tone += (-((colat - edge) / hex.width).powi(2)).exp() * hex.delta
            + smoothstep(edge + hex.width, edge - hex.width, colat) * 0.2
            + (-((colat - 1.6) / 0.7).powi(2)).exp() * 0.45;
    }
    tone
}

/// 行星（土星、海王星）表面一點的墨（0–1），畫到有環那一步
fn planet_ink(spec: &Spec, rot: &Rot, n: [f32; 3], fw_n: f32, fw_lat: f32) -> f32 {
    let s = rot.sun;
    let lit = smoothstep(-0.12, 0.4, n[0] * s[0] + n[1] * s[1] + n[2] * s[2]);
    let lat = n[1].clamp(-1.0, 1.0).asin() * DEG;
    let tone = surface_tone(spec, n, lat);
    // 六角形裡面不到一列緯度刻線，改成以極點為中心、每 1.1° 一圈
    let polar = spec.hexagon.as_ref().is_some_and(|h| lat > 90.0 - h.colat * 1.25);
    let wave = noise(n[0] * 1.1, n[1] * 6.0, n[2] * 1.1);
    let row = if polar { (90.0 - lat) / 1.1 } else { n[1] * spec.rows + wave * spec.wave };
    let swell = noise(n[0] * 2.2, n[1] * 36.0, n[2] * 2.2) * spec.swell + 1.0;
    let brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48.0, n[2] * 2.4));
    // 環落在星球上的影子
    let mut shade = 1.0;
    let t = -n[1] / s[1];
    if t > 0.0 {
        shade = 1.0 - ring_tone(spec, (n[0] + s[0] * t).hypot(n[2] + s[2] * t)) * 0.8;
    }
    let ink = (lit * tone * swell * mix(spec.floor, 1.0, brush) * shade).clamp(0.0, 1.0).powf(0.8);
    strokes(row, ink, spec.cover, if polar { fw_lat / 1.1 } else { spec.rows * fw_n })
}

/// 恆星（參宿四）表面一點的墨：自己發光、邊緣變暗，刻線是畫面上水平的平行直線
fn star_ink(spec: &Spec, n: [f32; 3], y: f32, z: f32, fw: f32) -> f32 {
    let lit = z.max(0.0).powf(0.45);
    let lat = n[1].clamp(-1.0, 1.0).asin() * DEG;
    let cells = noise(n[0] * 1.6, n[1] * 1.6, n[2] * 1.6);
    let tone = surface_tone(spec, n, lat)
        * mix(0.3, 1.35, smoothstep(-0.4, 0.4, cells))
        * mix(0.6, 1.1, smoothstep(-0.5, 0.5, noise(n[0] * 7.0, n[1] * 7.0, n[2] * 7.0)));
    let row =
        y * spec.rows + cells * spec.wave + noise(n[0] * 4.5, n[1] * 4.5, n[2] * 4.5) * spec.wave * 0.35;
    let swell = noise(n[0] * 2.2, n[1] * 36.0, n[2] * 2.2) * spec.swell + 1.0;
    let brush = smoothstep(-0.45, 0.15, noise(n[0] * 2.4, n[1] * 48.0, n[2] * 2.4));
    strokes(row, (lit * tone * swell * mix(spec.floor, 1.0, brush)).clamp(0.0, 1.0).powf(0.8), spec.cover, fw)
}

/// 行星的環上 (x, z) 那一點的墨（0–1）；fw 是半徑每個像素變多少
fn ring_ink(spec: &Spec, rot: &Rot, x: f32, z: f32, fw: f32) -> f32 {
    let r = x.hypot(z);
    let ring = &spec.ring;
    if !(ring.inner - 0.01..=ring.outer + 0.01).contains(&r) {
        return 0.0;
    }
    // 星球投在環上的影子
    let s = rot.sun;
    let along = -(x * s[0] + z * s[2]);
    let (cx, cy, cz) = (x + s[0] * along, s[1] * along, z + s[2] * along);
    let shade = if along > 0.0 && (cx * cx + cy * cy + cz * cz).sqrt() < 1.0 { 0.12 } else { 1.0 };
    if !ring.brushed {
        // 細環（海王星）：每一道畫成髮絲；Adams 環上的弧比環亮、也寬一點
        let mut thin = 0.0;
        for &(inner, outer, value) in ring.segments {
            thin += hairline(r, f32::midpoint(inner, outer), (outer - inner) / 2.0, fw) * value;
        }
        let a = z.atan2(x);
        for &(at, from, to, value) in ring.arcs {
            thin += smoothstep(from - 0.02, from + 0.02, a)
                * smoothstep(to + 0.02, to - 0.02, a)
                * hairline(r, at, 0.012, fw)
                * value;
        }
        return (thin * ring.gain * shade).clamp(0.0, 1.0);
    }
    let ringlets = noise(r * 60.0, 0.0, 0.0) * 0.22 + 0.9;
    let brush = smoothstep(-0.55, 0.15, noise(x * 2.4, r * 40.0, z * 2.4));
    let ink = (ring_tone(spec, r) * ringlets * (0.4 + 0.6 * brush) * shade).clamp(0.0, 1.0);
    strokes(r * RING_ROWS, ink.powf(0.75), RING_COVER, fw * RING_ROWS)
}

/// 黑洞的吸積盤上 (x, z) 那一點：(墨, 不透明度)。朝我們轉來的那一側（左邊）亮
fn disk_ink(spec: &Spec, x: f32, z: f32, fw: f32) -> (f32, f32) {
    let r = x.hypot(z);
    let ring = &spec.ring;
    let band = smoothstep(ring.inner, ring.inner + 0.06, r) * smoothstep(ring.outer, ring.outer - 0.35, r);
    if band <= 0.0 {
        return (0.0, 0.0);
    }
    let ang = z.atan2(x) + r.ln() * DISK_SHEAR;
    let streak = noise(ang.cos() * 2.4, ang.sin() * 2.4, r * 9.0);
    let heat = smoothstep(ring.outer, ring.inner, r) * 0.5 + 0.6;
    let texture = mix(0.2, 1.0, smoothstep(-0.4, 0.5, streak)) * heat;
    let beam = 1.0 - (x / r) * ring.doppler;
    let ink = (ring_tone(spec, r) * texture * beam).clamp(0.0, 1.0);
    (strokes(r * RING_ROWS, ink.powf(0.75), DISK_COVER, fw * RING_ROWS), band)
}

/// 黑洞正對著我們的那一層：光子環，加上被重力彎到陰影上下的盤影（上方最亮）
fn lens_ink(spec: &Spec, x: f32, y: f32, px: f32) -> f32 {
    let d = x.hypot(y);
    let beam = 1.0 - (x / d) * spec.ring.doppler;
    let mut ink = hairline(d, 1.04, 0.012, px) * beam * 0.9;
    let above = smoothstep(-0.3, 0.85, y / d);
    let band = smoothstep(1.08, 1.16, d) * smoothstep(1.75, 1.45, d);
    ink += strokes(
        d * RING_ROWS,
        (band * mix(0.25, 0.9, above) * beam).clamp(0.0, 1.0),
        RING_COVER,
        px * RING_ROWS,
    );
    ink.clamp(0.0, 1.0)
}

/// 參宿四外面那層延伸很遠的大氣：一圈圈很淡的同心刻線，南邊那團多一點
fn halo_ink(x: f32, y: f32, px: f32) -> f32 {
    let d = x.hypot(y);
    let glow = smoothstep(1.75, 1.0, d) * smoothstep(0.98, 1.02, d);
    if glow <= 0.0 {
        return 0.0;
    }
    let plume = smoothstep(-0.2, -0.9, y / d) * 0.35 + 1.0;
    let breakup = smoothstep(-0.5, 0.4, noise(x * 3.0, y * 3.0, d * 6.0));
    strokes(
        d * RING_ROWS * 0.8,
        (glow * plume * mix(0.35, 1.0, breakup) * 0.55).clamp(0.0, 1.0),
        0.5,
        px * RING_ROWS * 0.8,
    )
}

/// 主星那一塊（含環、盤、大氣）：預乘過的 RGBA，左上角在 (x0, y0)
struct BodyLayer {
    x0: usize,
    y0: usize,
    w: usize,
    h: usize,
    /// 每個像素 [r·a, g·a, b·a, a]
    px: Vec<[f32; 4]>,
}

/// `renderBody` 畫到第四步：由下往上疊後半圈的環 → 星球 → 正對著我們的那層（光子環、盤影、大氣）→ 前半圈的環
fn render_body(spec: &Spec, rot: &Rot, pal: Palette) -> BodyLayer {
    let hole = spec.kind == Kind::BlackHole;
    let star = spec.kind == Kind::Star;
    let with_ring = spec.kind != Kind::Star;
    let reach = ((if with_ring { spec.ring.outer + 0.05 } else { 1.8 }) * R).ceil();
    let x0 = (CX - reach).floor().max(0.0) as usize;
    let y0 = (CY - reach).floor().max(0.0) as usize;
    let x1 = ((CX + reach).ceil() as usize).min(W);
    let y1 = ((CY + reach).ceil() as usize).min(H);
    let (w, h) = (x1 - x0, y1 - y0);
    let mut px = vec![[0.0f32; 4]; w * h];
    let p = 1.0 / R;
    let ground = pal.ground.map(f32::from);
    let paper = pal.ink.map(f32::from);
    for py in y0..y1 {
        for qx in x0..x1 {
            let x = (qx as f32 + 0.5 - CX) / R;
            let y = -(py as f32 + 0.5 - CY) / R;
            let d = x.hypot(y);
            // 顏色記成「紙到墨之間的幾成」，乘上不透明度累加
            let (mut ink, mut alpha) = (0.0f32, 0.0f32);
            let mut over = |v: f32, a: f32| {
                ink = ink * (1.0 - a) + v * a;
                alpha = alpha * (1.0 - a) + a;
            };
            let mut ring = (0.0, 0.0);
            let mut front = true;
            if with_ring {
                let (rx, rz) = rot.view_to_plane(x, y);
                front = rz * rot.cos_t >= 0.0;
                let r0 = rx.hypot(rz);
                let fw = ((rx + rot.cos_r * p).hypot(rz + rot.sin_r * p / rot.sin_t) - r0).abs()
                    + ((rx - rot.sin_r * p).hypot(rz + rot.cos_r * p / rot.sin_t) - r0).abs();
                ring = if hole { disk_ink(spec, rx, rz, fw) } else { (1.0, ring_ink(spec, rot, rx, rz, fw)) };
            }
            if !front && ring.1 > 0.0 {
                over(ring.0, ring.1);
            }
            // 星球：不透明的球，邊緣反鋸齒。黑洞是一片跟夜色同色的陰影
            if d < 1.0 + p {
                let dd = d.min(0.9999);
                let k = if d > 0.0 { dd / d } else { 1.0 };
                let z = (1.0 - dd * dd).sqrt();
                let v = if hole {
                    0.0
                } else {
                    let n = rot.to_planet(x * k, y * k, z);
                    if star {
                        star_ink(spec, n, y, z, spec.rows * p)
                    } else {
                        let sphere = |a: f32, b: f32| (1.0 - a * a - b * b).max(0.0).sqrt();
                        let nx = rot.to_planet((x + p) * k, y * k, sphere(x + p, y));
                        let ny = rot.to_planet(x * k, (y - p) * k, sphere(x, y - p));
                        let fw_n = (nx[1] - n[1]).abs() + (ny[1] - n[1]).abs();
                        let asin = |v: f32| v.min(1.0).asin();
                        let fw_lat =
                            ((asin(nx[1]) - asin(n[1])).abs() + (asin(ny[1]) - asin(n[1])).abs()) * DEG;
                        planet_ink(spec, rot, n, fw_n, fw_lat)
                    }
                };
                over(v, ((1.0 - d) * R + 0.5).clamp(0.0, 1.0));
            }
            if hole {
                over(1.0, lens_ink(spec, x, y, p));
            } else if star {
                over(1.0, halo_ink(x, y, p));
            }
            if front && ring.1 > 0.0 {
                over(ring.0, ring.1);
            }
            if alpha <= 0.0 {
                continue;
            }
            let mut out = [0.0f32; 4];
            for ch in 0..3 {
                out[ch] = (ground[ch] + (paper[ch] - ground[ch]) * (ink / alpha)) * alpha;
            }
            out[3] = alpha;
            px[(py - y0) * w + (qx - x0)] = out;
        }
    }
    BodyLayer { x0, y0, w, h, px }
}

/// 軌道上的一點（近點座標）→ 星球座標：近點方向、傾角、升交點，照 3D 版的旋轉順序
fn orbit_to_planet(o: Option<&Orbit>, x: f32, z: f32) -> [f32; 3] {
    let Some(o) = o else { return [x, 0.0, z] };
    let (sp, cp) = (o.peri / DEG).sin_cos();
    let (x1, z1) = (x * cp + z * sp, -x * sp + z * cp);
    let (si, ci) = (o.incl / DEG).sin_cos();
    let (y2, z2) = (-z1 * si, z1 * ci);
    let (sn, cn) = (o.node / DEG).sin_cos();
    [x1 * cn + z2 * sn, y2, -x1 * sn + z2 * cn]
}

/// 軌道上真近點角 nu 的那一點（近點座標）。沒有自己形狀的是正圓
fn orbit_point(o: Option<&Orbit>, i: usize, nu: f32) -> (f32, f32) {
    let radius = o.map_or(ORBITS[i], |o| o.a * (1.0 - o.e * o.e) / (1.0 + o.e * nu.cos()));
    (nu.cos() * radius, nu.sin() * radius)
}

/// 第 i 顆在一圈的進度 t（0–1）時的真近點角：一圈剛好繞一圈；橢圓照克卜勒定律走（近點快、遠點慢）
fn anomaly(spec: &Spec, i: usize, t: f32) -> f32 {
    let dir = if spec.retrograde.contains(&i) { -1.0 } else { 1.0 };
    let mean = PHASES[i] + TAU * (t + spec.start) * dir;
    let Some(o) = spec.orbits.as_ref().map(|o| &o[i]) else { return mean };
    let mut e = mean;
    for _ in 0..5 {
        e -= (e - o.e * e.sin() - mean) / (1.0 - o.e * e.cos());
    }
    2.0 * ((1.0 + o.e).sqrt() * (e / 2.0).sin()).atan2((1.0 - o.e).sqrt() * (e / 2.0).cos())
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
pub struct Body {
    spec: &'static Spec,
    rot: Rot,
    pal: Palette,
    /// 底色＋不閃的星＋軌道（RGB）
    back: Vec<[f32; 3]>,
    twinkle: Vec<Star>,
    layer: BodyLayer,
}

/// 反鋸齒的實心圓，`alpha` 是最濃處的不透明度（source-over）
fn disc(buf: &mut [[f32; 3]], x: f32, y: f32, r: f32, color: [f32; 3], alpha: f32) {
    let reach = r + 1.0;
    let (xa, xb) = ((x - reach).floor().max(0.0) as usize, ((x + reach).ceil().max(0.0) as usize).min(W));
    let (ya, yb) = ((y - reach).floor().max(0.0) as usize, ((y + reach).ceil().max(0.0) as usize).min(H));
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
    let (xa, xb) = ((x - r).floor().max(0.0) as usize, ((x + r).ceil().max(0.0) as usize).min(W));
    let (ya, yb) = ((y - r).floor().max(0.0) as usize, ((y + r).ceil().max(0.0) as usize).min(H));
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

impl Body {
    /// `theme` 是 `site_config::THEMES` 裡的名字（不認得的當土星）
    pub fn new(theme: &str) -> Self {
        let spec = spec_of(theme);
        let pal = palette_of(theme);
        let rot = Rot::new();
        let ink = pal.ink.map(f32::from);
        let mut back = vec![pal.ground.map(f32::from); W * H];

        // 星：多數很淡很小，少數亮一點
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
            if i % 4 == 0 && star.x > TWINKLE_FROM_X {
                twinkle.push(Star { laps: 1.0 + (i / 6 % 3) as f32, ..star });
            } else {
                disc(&mut back, star.x, star.y, star.r, ink, star.a);
            }
        }

        // 軌道：五條，橢圓與傾角照規格；參宿四的是點線（拋出去的塵埃殼）
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.set_line_width(1.0);
        if spec.kind == Kind::Star {
            ctx.set_line_dash(&[(0.05 * R).max(1.5), (0.09 * R).max(2.5)]);
        }
        for i in 0..ORBITS.len() {
            let o = spec.orbits.as_ref().map(|o| &o[i]);
            ctx.set_stroke(Rgba(pal.ink, if i == SIGNAL_SAT { 0.24 } else { 0.13 }));
            ctx.begin_path();
            for k in 0..=256 {
                let (ox, oz) = orbit_point(o, i, k as f32 / 256.0 * TAU);
                let v = rot.to_view(orbit_to_planet(o, ox, oz));
                let (sx, sy) = (CX + v[0] * R, CY - v[1] * R);
                if k == 0 {
                    ctx.move_to(sx, sy);
                } else {
                    ctx.line_to(sx, sy);
                }
            }
            ctx.stroke();
        }
        // 疊到底上（pixmap 是預乘過的）
        for (p, q) in back.iter_mut().zip(ctx.pixmap.data().as_chunks::<4>().0) {
            let a = f32::from(q[3]) / 255.0;
            for ch in 0..3 {
                p[ch] = f32::from(q[ch]) + p[ch] * (1.0 - a);
            }
        }

        let layer = render_body(spec, &rot, pal);
        Self { spec, rot, pal, back, twinkle, layer }
    }

    fn frame_rgb(&self, index: usize) -> Vec<[f32; 3]> {
        let t = index as f32 / FRAMES as f32; // 一圈裡的進度 0–1
        let ink = self.pal.ink.map(f32::from);
        let signal = self.pal.signal.map(f32::from);
        let mut buf = self.back.clone();
        for s in &self.twinkle {
            // 亮度只分五階：連續變化的話這些星每一格都在變，每格都得存它們；分階之後
            // 大部分的格子裡它們不動，眼睛看起來一樣是在慢慢閃
            let k = 0.55 + 0.45 * ((s.laps * TAU * t + s.phase).sin() * 2.0).round() / 2.0;
            disc(&mut buf, s.x, s.y, s.r, ink, s.a * k);
        }

        // 衛星（黑洞是 S 星）：一圈剛好繞軌道一圈；伴星（參宿四）也是。在主星後面的先畫（被主星蓋住），前面的後畫
        let mut dots: Vec<([f32; 3], Option<usize>)> = (0..ORBITS.len())
            .map(|i| {
                let o = self.spec.orbits.as_ref().map(|o| &o[i]);
                let (ox, oz) = orbit_point(o, i, anomaly(self.spec, i, t));
                (self.rot.to_view(orbit_to_planet(o, ox, oz)), Some(i))
            })
            .collect();
        if let Some(c) = &self.spec.companion {
            let a = TAU * (t + self.spec.start);
            dots.push((self.rot.to_view([a.cos() * c.a, 0.0, a.sin() * c.a]), None));
        }
        let draw = |buf: &mut [[f32; 3]], v: [f32; 3], which: Option<usize>| {
            let (x, y) = (CX + v[0] * R, CY - v[1] * R);
            match which {
                Some(SIGNAL_SAT) => {
                    glow(buf, x, y, 13.0, signal, 0.5);
                    disc(buf, x, y, 3.2, signal, 1.0);
                }
                Some(_) => disc(buf, x, y, 2.3, ink, 0.8),
                None => {
                    let size = self.spec.companion.as_ref().map_or(0.0, |c| c.size);
                    disc(buf, x, y, (size * 0.4 * R).max(1.4), ink, 0.7);
                }
            }
        };
        for &(v, which) in &dots {
            if v[2] < 0.0 {
                draw(&mut buf, v, which);
            }
        }
        let layer = &self.layer;
        for row in 0..layer.h {
            for col in 0..layer.w {
                let s = layer.px[row * layer.w + col];
                if s[3] > 0.0 {
                    let p = &mut buf[(layer.y0 + row) * W + layer.x0 + col];
                    for ch in 0..3 {
                        p[ch] = s[ch] + p[ch] * (1.0 - s[3]);
                    }
                }
            }
        }
        for &(v, which) in &dots {
            if v[2] >= 0.0 {
                draw(&mut buf, v, which);
            }
        }
        buf
    }
}

impl super::Scene for Body {
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
