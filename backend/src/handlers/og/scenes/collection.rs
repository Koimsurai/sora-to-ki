//! 收藏頁的天空（`src/components/media/signalSky.ts` 逐行移植）：每部作品是看完那一刻從地球
//! 發出的一圈訊號，距離就是離現在多久。分享圖取的是頁面一打開、鏡頭停在地球旁邊的那一刻
//! （`s = 0`）：點畫的地球照真實的晝夜亮著半邊，台灣是琥珀色的一點，國際太空站貼著地球，
//! 在讀與想讀的書繞著地球，外面一圈虛線是地球同步軌道，背後是照真實方向畫的銀河。
//!
//! 鏡頭停在地球旁邊時，作品的訊號圈（最近的也是幾分鐘前發出的，已經在幾千萬公里外）都在
//! 畫面外，所以這一張不需要任何作品的資料；繞著地球的書用一組固定的形狀，不是真的書單。
//!
//! 時間固定在 2026-10-25 07:00 UTC（台灣下午三點）：地球的晝夜、鏡頭轉到哪個方向
//! （讓台灣朝著畫面）、太空站在哪裡、銀河在哪個角度，都照前端的公式在這一刻算。
//!
//! 動態：前端「正在播」的時候地球一直往外發著一圈圈琥珀色的波（三道輪流）。分享圖只發一道：
//! 擴張的圓每一格都會改一整圈的像素，三道同時在動的話檔案大三倍。這一道從地球邊上長出來、
//! 走到 118px 外淡掉，一圈發三次，每一次之間地球是靜的；另外只有在讀的書在呼吸、
//! 右半邊幾顆星在閃。整片星空與地球都不轉（一轉每個像素都變，每格都等於整張圖）。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::suboptimal_flops,
    reason = "天文的部分用 f64 算、畫的時候轉 f32 座標（都在畫布範圍內）；轉成整數的都是 0 以上的亮度階、像素與格數；公式照抄 TS 原版以便逐行對照"
)]

use std::f64::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{AMBER, Ctx, GROUND, Gradient, INK, Rgba, amber, ink, load_image_sized};

/// 一整圈（畫圖用的 f32）
const FULL: f32 = std::f32::consts::TAU;

const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一圈幾秒：會閃的星、在讀的書照這個長度取整數圈，接縫才對得上
const LOOP_S: f64 = 15.0;

// ── signalSky.ts 的常數 ─────────────────────────────────────────
const DEG: f64 = PI / 180.0;
const OBLIQUITY: f64 = 23.44 * DEG;
const J2000_MS: f64 = 946_728_000_000.0;
const DAY_MS: f64 = 86_400_000.0;
/// 分享圖的「現在」：2026-10-25 07:00 UTC
const NOW_MS: f64 = 1_792_911_600_000.0;
/// 鏡頭從多近開始（光秒）：頁面頂端的那個鏡頭
const NEAREST: f64 = 0.2;
const EARTH_LS: f64 = 0.02127;
const HOME_LAT: f64 = 23.7;
const HOME_LON: f64 = 121.0;
const GLOBE_DOTS: usize = 640;
const GEO_LS: f64 = 0.1406;
const ISS_LS: f64 = EARTH_LS * 1.066;
const ISS_INC: f64 = 51.6 * DEG;
const ISS_PERIOD_S: f64 = 5574.0;
/// 地球的平黃經（J2000 時幾度、每天走幾度）
const EARTH_L0: f64 = 100.46;
const EARTH_N: f64 = 0.98561;
const LEVELS: usize = 8;
/// `ART.iss.w`：太空站插圖畫多寬
const ISS_ART_W: f64 = 44.0;
/// 「正在播」的波每秒走幾成（從地球邊上 8px 長出來，走到 118px 外）
const WAVE_SPEED: f64 = 0.45;

// ── 構圖 ─────────────────────────────────────────────────────────
/// 前端的地球在畫面中間偏右（`0.56w, 0.54h`），`R = min(0.38w, 0.8h)`——1200×630 是 456px，
/// 地球同步軌道那圈（`k × 0.1406` 光秒）會有 320px 半徑，右半邊放不下。收到 400：
/// 那圈剛好從字的右緣（640px 左右）繞到畫布右緣，地球還是看得出點畫的球
const R_PX: f64 = 400.0;
const EX: f64 = 920.0;
const EY: f64 = 320.0;
/// 會閃的星只挑這條線右邊的（字那一側每格都在變的話，每一格的外框都是整張圖寬）
const TWINKLE_FROM_X: f32 = 740.0;

/// 繞著地球的書（`home`）：在讀的（live，內圈、實心、會呼吸）與想讀的（queued，外圈、空心）。
/// 固定的一組形狀：大小是頁數換算的 0–1，相位是呼吸從哪裡開始（前端用 `hash(id)`）
const HOMES: [(bool, f64, f64); 11] = [
    (false, 0.55, 0.0),
    (true, 0.6, 0.21),
    (false, 0.35, 0.0),
    (false, 0.7, 0.0),
    (true, 0.5, 0.67),
    (false, 0.45, 0.0),
    (true, 0.8, 0.43),
    (false, 0.35, 0.0),
    (false, 0.6, 0.0),
    (true, 0.4, 0.9),
    (false, 0.5, 0.0),
];

#[derive(Clone, Copy)]
struct V3 {
    x: f64,
    y: f64,
    z: f64,
}

impl V3 {
    const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    fn scale(self, k: f64) -> Self {
        Self::new(self.x * k, self.y * k, self.z * k)
    }
}

/// 赤道座標的方向換成黃道座標
fn eq_to_ecl(v: V3) -> V3 {
    V3::new(
        v.x,
        v.y * OBLIQUITY.cos() + v.z * OBLIQUITY.sin(),
        -v.y * OBLIQUITY.sin() + v.z * OBLIQUITY.cos(),
    )
}

/// 赤經（小時）、赤緯（度）換成黃道座標裡的方向
fn direction(ra_h: f64, dec_d: f64) -> V3 {
    let ra = ra_h * 15.0 * DEG;
    let dec = dec_d * DEG;
    eq_to_ecl(V3::new(dec.cos() * ra.cos(), dec.cos() * ra.sin(), dec.sin()))
}

/// 地球上的一點（緯度、經度）現在朝哪個方向：照恆星時跟著地球轉
fn surface(lat_d: f64, lon_d: f64, days: f64) -> V3 {
    let gmst = 18.697_374_558 + 24.065_709_824_419_08 * days;
    direction((((gmst + lon_d / 15.0) % 24.0) + 24.0) % 24.0, lat_d)
}

/// mulberry32（前端的 `rng`）：同樣的種子撒出同樣的銀河與星
fn rng(seed: u32) -> impl FnMut() -> f64 {
    let mut a = seed;
    move || {
        a = a.wrapping_add(0x6d2b_79f5);
        let mut t = a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 0x3d));
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

/// 常態分布（Box–Muller），跟前端一樣先取開根號那個、再取餘弦那個
fn gauss(rand: &mut impl FnMut() -> f64) -> f64 {
    let u = rand();
    let u = if u == 0.0 { 1e-9 } else { u };
    let r = (-2.0 * u.ln()).sqrt();
    r * (TAU * rand()).cos()
}

const fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// 背景（無限遠）的一點：方向與大小
struct SkyDot {
    d: V3,
    size: f64,
}

/// 銀道面的三個軸：北銀極、銀心、與兩者垂直的那一軸
fn galactic_axes() -> (V3, V3, V3) {
    let pole = direction(12.857, 27.128);
    let center = direction(17.76, -28.936);
    let side = V3::new(
        pole.y * center.z - pole.z * center.y,
        pole.z * center.x - pole.x * center.z,
        pole.x * center.y - pole.y * center.x,
    );
    (pole, center, side)
}

/// 銀經 l、銀緯 b 的方向
fn galactic(l: f64, b: f64) -> V3 {
    let (pole, center, side) = galactic_axes();
    let (cl, sl, cb, sb) = (l.cos(), l.sin(), b.cos(), b.sin());
    V3::new(
        cb * (cl * center.x + sl * side.x) + sb * pole.x,
        cb * (cl * center.y + sl * side.y) + sb * pole.y,
        cb * (cl * center.z + sl * side.z) + sb * pole.z,
    )
}

/// `milkyWay`：照銀道面的真實方向撒點，越靠銀心越密
fn milky_way(count: usize) -> Vec<Vec<SkyDot>> {
    let mut rand = rng(23);
    let mut levels: Vec<Vec<SkyDot>> = (0..LEVELS).map(|_| Vec::new()).collect();
    for _ in 0..count {
        let near_core = rand() < 0.45;
        let l = if near_core { gauss(&mut rand) * 0.7 } else { rand() * TAU };
        let b = gauss(&mut rand) * if near_core { 0.09 } else { 0.06 };
        let d = galactic(l, b);
        let scale = if near_core { 1.25 } else { 1.0 };
        let level = ((rand().powf(1.6) * LEVELS as f64 * scale).floor() as usize).min(LEVELS - 1);
        let size = if rand() < 0.08 { 1.4 } else { 1.0 };
        levels[level].push(SkyDot { d, size });
    }
    levels
}

/// `milkyHaze`：銀河的光霧，方向、濃淡、大小
fn milky_haze(count: usize) -> Vec<(V3, f64, f64)> {
    let mut rand = rng(29);
    (0..count)
        .map(|_| {
            let near_core = rand() < 0.5;
            let l = if near_core { gauss(&mut rand) * 0.8 } else { rand() * TAU };
            let b = gauss(&mut rand) * if near_core { 0.07 } else { 0.045 };
            let d = galactic(l, b);
            let weight = if near_core { 0.7 + rand() * 0.3 } else { 0.35 + rand() * 0.35 };
            let size = (if near_core { 1.2 } else { 0.8 }) * (0.6 + rand() * 0.8);
            (d, weight, size)
        })
        .collect()
}

/// `fieldStars`：四面八方的星，大多很暗、少數亮
fn field_stars(count: usize) -> Vec<Vec<SkyDot>> {
    let mut rand = rng(11);
    let mut levels: Vec<Vec<SkyDot>> = (0..LEVELS).map(|_| Vec::new()).collect();
    for _ in 0..count {
        let z = rand() * 2.0 - 1.0;
        let phi = rand() * TAU;
        let c = (1.0 - z * z).sqrt();
        let u = rand();
        let level = ((u * u * u * LEVELS as f64).floor() as usize).min(LEVELS - 1);
        levels[level].push(SkyDot {
            d: V3::new(phi.cos() * c, phi.sin() * c, z),
            size: 0.8 + (level as f64 / LEVELS as f64) * 1.1,
        });
    }
    levels
}

/// 鏡頭（`view` 在 `s = 0`、`t = 0` 的那一刻）
struct View {
    k: f64,
    sin_e: f64,
    cos_e: f64,
    sin_p: f64,
    cos_p: f64,
    diag: f64,
}

impl View {
    fn new(psi: f64) -> Self {
        let e: f64 = 1.12;
        Self {
            k: R_PX / NEAREST,
            sin_e: e.sin(),
            cos_e: e.cos(),
            sin_p: psi.sin(),
            cos_p: psi.cos(),
            diag: (W as f64).hypot(H as f64),
        }
    }

    fn project(&self, p: V3) -> (f32, f32) {
        let x = p.x * self.cos_p - p.y * self.sin_p;
        let y = p.x * self.sin_p + p.y * self.cos_p;
        ((EX + self.k * x) as f32, (EY + self.k * (y * self.sin_e - p.z * self.cos_e)) as f32)
    }

    /// 朝鏡頭那一邊有多少（正的在前面）
    fn depth_of(&self, p: V3) -> f64 {
        (p.x * self.sin_p + p.y * self.cos_p) * self.cos_e + p.z * self.sin_e
    }

    /// 無限遠的方向畫在畫面上的哪裡（透視，視野約 130 度）
    fn sky_at(&self, d: V3) -> Option<(f32, f32)> {
        let into = -self.depth_of(d);
        if into < 0.08 {
            return None;
        }
        let f = self.diag * 0.36;
        let x = d.x * self.cos_p - d.y * self.sin_p;
        let y = d.x * self.sin_p + d.y * self.cos_p;
        Some(((EX + f * x / into) as f32, (EY + f * (y * self.sin_e - d.z * self.cos_e) / into) as f32))
    }

    /// 半徑 r 像素的東西看不看得到
    fn fade(&self, r: f64) -> f64 {
        clamp01((r - 4.0) / 14.0) * clamp01((self.diag * 1.4 - r) / (self.diag * 0.5))
    }
}

fn glow(ctx: &mut Ctx, x: f32, y: f32, r: f32, color: [u8; 3], a: f32) {
    ctx.set_fill(Gradient::radial(x, y, 0.0, x, y, r).stop(0.0, Rgba(color, a)).stop(1.0, Rgba(color, 0.0)));
    ctx.begin_path();
    ctx.arc(x, y, r, 0.0, FULL, false);
    ctx.fill();
}

/// 前端的 `ellipse` 小工具：先移到圈的起點，免得接上前一段路徑
fn ellipse(ctx: &mut Ctx, x: f32, y: f32, rx: f32, ry: f32) {
    ctx.move_to(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0.0, 0.0, FULL, false);
}

/// `drawGlyph` 的書：菱形，想讀的是空心
fn book(ctx: &mut Ctx, size: f64, queued: bool, x: f32, y: f32, alpha: f32) {
    let r = (1.8 + size * 1.4) as f32;
    ctx.set_fill(ink(alpha));
    ctx.set_stroke(ink(alpha));
    ctx.set_line_width(1.0);
    ctx.begin_path();
    ctx.move_to(x, y - r);
    ctx.line_to(x + r, y);
    ctx.line_to(x, y + r);
    ctx.line_to(x - r, y);
    ctx.close_path();
    if queued {
        ctx.stroke();
    } else {
        ctx.fill();
    }
}

/// 會閃的星：位置、一圈閃幾次、起始相位
struct Twinkle {
    x: f32,
    y: f32,
    laps: f64,
    ph: f64,
}

/// 在讀的書：位置、大小、呼吸的相位
struct Live {
    x: f32,
    y: f32,
    size: f64,
    ph: f64,
}

pub struct Collection {
    /// 不會動的部分：銀河、星、同步軌道、地球、太空站、想讀的書
    back: Pixmap,
    twinkle: Vec<Twinkle>,
    live: Vec<Live>,
    /// 地球半徑（像素）、圈的扁度、台灣（琥珀點）
    earth_r: f32,
    sin_e: f32,
    dot: (f32, f32),
}

impl Default for Collection {
    fn default() -> Self {
        Self::new()
    }
}

impl Collection {
    pub fn new() -> Self {
        let days = (NOW_MS - J2000_MS) / DAY_MS;
        // 鏡頭一開始轉到台灣朝向畫面（稍微偏一點，看得出是球）
        let home0 = surface(HOME_LAT, HOME_LON, days);
        let psi0 = PI / 2.0 - home0.y.atan2(home0.x) - 0.35;
        let v = View::new(psi0);
        let (w, h) = (W as f32, H as f32);
        let (ex, ey) = (EX as f32, EY as f32);

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        ctx.set_line_width(1.0);

        // ── 背景：銀河的光霧、銀河、遠方的星 ──
        // 光霧前端是貼一張預先畫好的柔光圖（中間白、0.4 處剩 0.45、邊上透明），這裡直接畫同一條漸層
        let blob = v.diag * 0.055;
        for (d, weight, size) in milky_haze(360) {
            let Some((px, py)) = v.sky_at(d) else { continue };
            let r = (blob * size) as f32;
            if px < -r || px > w + r || py < -r || py > h + r {
                continue;
            }
            ctx.set_alpha((0.03 * weight) as f32);
            ctx.set_fill(
                Gradient::radial(px, py, 0.0, px, py, r)
                    .stop(0.0, ink(1.0))
                    .stop(0.4, ink(0.45))
                    .stop(1.0, ink(0.0)),
            );
            ctx.fill_rect(px - r, py - r, r * 2.0, r * 2.0);
        }
        ctx.set_alpha(1.0);
        let mut backdrop = |levels: Vec<Vec<SkyDot>>, max: f64| {
            for (level, list) in levels.iter().enumerate() {
                ctx.set_fill(ink((max * (level + 1) as f64 / LEVELS as f64) as f32));
                for s in list {
                    let Some((px, py)) = v.sky_at(s.d) else { continue };
                    if px < 0.0 || px > w || py < 0.0 || py > h {
                        continue;
                    }
                    ctx.fill_rect(px, py, s.size as f32, s.size as f32);
                }
            }
        };
        backdrop(milky_way(7000), 0.42);
        backdrop(field_stars(2400), 0.55);

        // 會閃的星（`twinklers`）：右半邊、離地球夠遠的才真的閃，其他的停在 t = 0 的亮度
        let earth_r = (v.k * EARTH_LS) as f32;
        let mut twinkle = Vec::new();
        let mut trand = rng(5);
        for _ in 0..60 {
            let z = trand() * 2.0 - 1.0;
            let phi = trand() * TAU;
            let c = (1.0 - z * z).sqrt();
            let d = V3::new(phi.cos() * c, phi.sin() * c, z);
            let tw = 0.5 + trand() * 1.5;
            let ph = trand() * TAU;
            let Some((px, py)) = v.sky_at(d) else { continue };
            let clear_of_earth = (px - ex).hypot(py - ey) > earth_r + 45.0;
            if px >= TWINKLE_FROM_X && px <= w && py >= 0.0 && py <= h && clear_of_earth {
                // 一圈閃整數次（`t × tw` 換成一圈裡的整數圈），最後一格才接得回第一格
                let laps = (tw * LOOP_S / TAU).round().max(1.0);
                twinkle.push(Twinkle { x: px, y: py, laps, ph });
            } else {
                ctx.set_fill(ink((0.5 + 0.4 * ph.sin()) as f32));
                ctx.fill_rect(px, py, 1.5, 1.5);
            }
        }

        // ── 地球同步軌道：一圈虛線 ──
        let geo_r = v.k * GEO_LS;
        let geo_a = v.fade(geo_r) * clamp01((geo_r - 30.0) / 40.0);
        ctx.set_line_dash(&[2.0, 5.0]);
        ctx.set_stroke(ink((0.22 * geo_a) as f32));
        ctx.begin_path();
        ellipse(&mut ctx, ex, ey, geo_r as f32, (geo_r * v.sin_e) as f32);
        ctx.stroke();
        ctx.set_line_dash(&[]);

        // ── 地球：點的星球，向著太陽的那半邊亮 ──
        let earth_l = (EARTH_L0 + EARTH_N * days) * DEG;
        let (sx, sy) = (-earth_l.cos(), -earth_l.sin());
        let ga = clamp01((f64::from(earth_r) - 2.5) / 12.0) as f32;
        glow(&mut ctx, ex, ey, earth_r * 1.25, INK, 0.08 * ga);
        ctx.set_stroke(ink(0.3 * ga));
        ctx.begin_path();
        ctx.arc(ex, ey, earth_r, 0.0, FULL, false);
        ctx.stroke();
        for i in 0..GLOBE_DOTS {
            let lat = (1.0 - (2.0 * (i as f64 + 0.5)) / GLOBE_DOTS as f64).asin() / DEG;
            let lon = ((i as f64 * 137.508) % 360.0) - 180.0;
            let n = surface(lat, lon, days);
            let depth = v.depth_of(n);
            if depth < 0.0 {
                continue;
            }
            let xr = n.x * v.cos_p - n.y * v.sin_p;
            let yr = n.x * v.sin_p + n.y * v.cos_p;
            let day = n.x * sx + n.y * sy > 0.0;
            ctx.set_fill(ink(ga * (0.2 + 0.65 * depth as f32) * if day { 1.0 } else { 0.28 }));
            ctx.fill_rect(
                ex + earth_r * xr as f32,
                ey + earth_r * (yr * v.sin_e - n.z * v.cos_e) as f32,
                1.3,
                1.3,
            );
        }

        // ── 國際太空站：貼著地球繞，轉到地球後面就被擋住 ──
        let iss_a = clamp01((f64::from(earth_r) - 12.0) / 24.0);
        let u = TAU * (NOW_MS / 1000.0) / ISS_PERIOD_S;
        let d = eq_to_ecl(V3::new(u.cos(), u.sin() * ISS_INC.cos(), u.sin() * ISS_INC.sin()));
        let (iss_x, iss_y) = v.project(d.scale(ISS_LS));
        let hidden = v.depth_of(d) < 0.0 && (iss_x - ex).hypot(iss_y - ey) < earth_r;
        if iss_a > 0.01 && !hidden {
            const ISS: &[u8] = include_bytes!("../../../../../public/illustrations/iss.webp");
            // 插圖原檔 400×242；前端畫成 44px 寬、高照比例
            let art_h = ISS_ART_W * 242.0 / 400.0;
            let img = load_image_sized(ISS, ISS_ART_W as u32, art_h.round() as u32);
            ctx.set_alpha((0.95 * iss_a) as f32);
            ctx.draw_image(&img, iss_x - img.width() as f32 / 2.0, iss_y - img.height() as f32 / 2.0);
            ctx.set_alpha(1.0);
        }

        // ── 還在地球上的書：繞著地球（分享圖停在 t = 0 的位置）。想讀的直接畫進底圖，在讀的會呼吸 ──
        let mut live = Vec::new();
        for (i, &(is_live, size, ph)) in HOMES.iter().enumerate() {
            let r = f64::from(earth_r) + if is_live { 26.0 } else { 38.0 };
            let th = i as f64 / HOMES.len() as f64 * TAU;
            let (x, y) = ((EX + th.cos() * r) as f32, (EY + th.sin() * r * v.sin_e) as f32);
            if is_live {
                live.push(Live { x, y, size, ph: ph * TAU });
            } else {
                book(&mut ctx, size, true, x, y, 0.7);
            }
        }

        // 琥珀點：台灣（`homeDot`）
        let dot = v.project(home0.scale(EARTH_LS));
        Self { back: ctx.pixmap, twinkle, live, earth_r, sin_e: v.sin_e as f32, dot }
    }
}

impl super::Scene for Collection {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        // 一圈裡的進度（0–1）
        let p = index as f64 / FRAMES as f64;
        let (ex, ey) = (EX as f32, EY as f32);
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);

        for s in &self.twinkle {
            // 亮度只分五階（同首頁的土星）：連續變化的話這些星每一格都要存
            let k = ((s.laps * TAU * p + s.ph).sin() * 2.0).round() / 2.0;
            ctx.set_fill(ink((0.5 + 0.4 * k) as f32));
            ctx.fill_rect(s.x, s.y, 1.5, 1.5);
        }

        // 在讀的書在呼吸：前端是 `sin(t × 2.2)`，取一圈五次（每秒 2.09）才接得起來
        let breathe_laps = (2.2 * LOOP_S / TAU).round();
        for b in &self.live {
            let k = 0.65 + 0.35 * (breathe_laps * TAU * p + b.ph).sin();
            book(&mut ctx, b.size, false, b.x, b.y, k.min(1.0) as f32);
        }

        // 正在播的波：前端三道輪流、每 2.2 秒走完一趟；這裡一圈只發三次，一次一道（見檔頭）。
        // 第一格停在一道剛走了三成的時候，不播動畫的平台看到的也有那一圈
        let every = FRAMES / 3;
        let lap = (1.0 / WAVE_SPEED * 10.0).round() as usize; // 一趟幾格
        let ph = ((index + 7) % every) as f64 / lap as f64;
        if ph < 1.0 {
            let r = self.earth_r + 8.0 + (ph * 110.0) as f32;
            ctx.set_stroke(amber((0.32 * (1.0 - ph)) as f32));
            ctx.set_line_width(1.0);
            ctx.begin_path();
            ellipse(&mut ctx, ex, ey, r, r * self.sin_e);
            ctx.stroke();
        }

        // 琥珀點：台灣
        let (dx, dy) = self.dot;
        glow(&mut ctx, dx, dy, 16.0, AMBER, 0.5);
        ctx.dot(dx, dy, 2.8, amber(1.0));
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 亂數要跟前端的 mulberry32 算出一樣的值，銀河與星才會在同一個位置。
    /// 期望值是用 node 跑 signalSky.ts 的 `rng` 得到的
    #[test]
    fn 亂數跟前端一致() {
        let mut r = rng(23);
        for want in [0.092_722_665_052_860_98, 0.068_311_891_285_702_59, 0.632_112_040_650_099_5] {
            let got = r();
            assert!((got - want).abs() < 1e-12, "{got} ≠ {want}");
        }
    }

    /// 琥珀點要落在地球上、地球在右半邊，波也不能長進字裡
    #[test]
    fn 地球在右半邊() {
        let c = Collection::new();
        let (x, y) = c.dot;
        assert!((x - EX as f32).hypot(y - EY as f32) < c.earth_r, "台灣不在地球上：({x}, {y})");
        assert!(EX as f32 - c.earth_r - 8.0 - 110.0 > 712.0, "波會長進字那一欄");
    }
}
