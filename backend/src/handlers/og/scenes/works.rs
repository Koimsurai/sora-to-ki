//! 作品的螺旋航線（`src/components/about/worksSky.ts` 逐行移植）：中心是起點，越新的作品越外圈，
//! 每件作品是一顆線畫的小星球——大小是程式碼量、地貌線是主要語言、環是其他語言、衛星是 GitHub 星星。
//!
//! 作品清單與數字照 `src/data/works.ts` 的 `WORKS`（取它的 `fallback`，那是 2026-10-23 從 GitHub
//! 量的真實數字）。分享圖不讀 GitHub：前端的 live 數字跟這份差一點，長出來的星也只差一點，
//! 而換一組數字快取就得重算。**作品增減或重量數字時兩邊一起改**，不然分享圖上的星跟作品頁的對不上。
//!
//! 畫的是作品頁進場跑完、停下來的那一刻：航線畫好了，琥珀點落在最新那一件，變成它的衛星。
//! 動態：琥珀衛星繞著它的星球轉；轉了大半圈後淡回白色，琥珀點從中心的起點重新出發，
//! 沿著航線畫到最新那一件、落地變回衛星（跟進場時一樣），然後光暈退掉，接回第一格。
//! 每顆星的衛星也都在轉（整數圈，見 `orbits`）。整條螺旋不轉、星球的地貌不自轉——
//! 前端兩樣都在轉，但螺旋一轉每個像素都在變，每格都等於整張圖。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::many_single_char_names,
    clippy::suboptimal_flops,
    clippy::too_many_arguments,
    clippy::decimal_bitwise_operands,
    reason = "幾何照抄 TS 原版（單字母變數、參數與運算順序都對照著寫，mulberry32 的 `z | 61` 也照原樣）；座標是畫布範圍內的浮點數，格數很小"
)]

use std::f64::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, Rgba, amber, ink};

const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一圈幾秒
const LOOP_S: f64 = FRAMES as f64 * FRAME_MS as f64 / 1000.0;

type Vec3 = [f64; 3];

// ── 作品（src/data/works.ts）──────────────────────────────────

/// 一件作品的數字（`WorkStats`）。`pushed_days_ago` 是 fallback 的 `pushed_at` 距離量的那天
/// （2026-10-23）幾天：前端是距離「現在」，只影響地貌自轉的速度，這裡只取一個固定的瞬間
struct WorkStats {
    name: &'static str,
    commits: u32,
    stars: u32,
    pushed_days_ago: f64,
    languages: &'static [(&'static str, f64)],
}

/// 清單的順序就是螺旋的順序（第一個是中心的起點）
const WORKS: [WorkStats; 7] = [
    WorkStats {
        name: "VoltiCar",
        commits: 1,
        stars: 0,
        pushed_days_ago: 581.0,
        languages: &[("Python", 21_623.0), ("Shell", 2_478.0)],
    },
    WorkStats {
        name: "sora-to-ki",
        commits: 732,
        stars: 2,
        pushed_days_ago: 0.0,
        languages: &[
            ("TypeScript", 2_368_532.0),
            ("Rust", 1_381_627.0),
            ("CSS", 579_299.0),
            ("JavaScript", 95_194.0),
        ],
    },
    WorkStats {
        name: "flow2code",
        commits: 70,
        stars: 4,
        pushed_days_ago: 133.0,
        languages: &[("TypeScript", 977_846.0), ("JavaScript", 77_185.0)],
    },
    WorkStats {
        name: "session-to-obsidian",
        commits: 13,
        stars: 2,
        pushed_days_ago: 10.0,
        languages: &[("Python", 69_873.0)],
    },
    WorkStats {
        name: "anigamer-rs",
        commits: 3,
        stars: 0,
        pushed_days_ago: 80.0,
        languages: &[("Rust", 43_438.0)],
    },
    WorkStats {
        name: "nuntius",
        commits: 31,
        stars: 3,
        pushed_days_ago: 7.0,
        languages: &[("Python", 301_901.0)],
    },
    WorkStats {
        name: "tessera",
        commits: 88,
        stars: 48,
        pushed_days_ago: 0.0,
        languages: &[
            ("Rust", 3_757_802.0),
            ("TypeScript", 1_745_467.0),
            ("JavaScript", 38_282.0),
            ("CSS", 25_658.0),
            ("Python", 18_382.0),
        ],
    },
];

// ── 亂數與向量（照 worksSky.ts）────────────────────────────────

/// 字串 → 0 到 1（FNV-1a，逐個 UTF-16 單位；注意這支除的是 2³²−1，跟手記那支不同）
fn hash(s: &str) -> f64 {
    let mut x: u32 = 2_166_136_261;
    for c in s.encode_utf16() {
        x = (x ^ u32::from(c)).wrapping_mul(16_777_619);
    }
    f64::from(x) / 4_294_967_295.0
}

/// mulberry32（`seeded`）
fn seeded(seed: f64) -> impl FnMut() -> f64 {
    let mut x = (seed * 4_294_967_295.0).floor() as u32;
    move || {
        x = x.wrapping_add(0x6d2b_79f5);
        let mut z = x;
        z = (z ^ (z >> 15)).wrapping_mul(z | 1);
        z ^= z.wrapping_add((z ^ (z >> 7)).wrapping_mul(z | 61));
        f64::from(z ^ (z >> 14)) / 4_294_967_296.0
    }
}

const fn dot3(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn norm(a: Vec3) -> Vec3 {
    let l = a[0].hypot(a[1]).hypot(a[2]);
    let l = if l == 0.0 { 1.0 } else { l };
    [a[0] / l, a[1] / l, a[2] / l]
}
const fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
/// 垂直於 n 的兩個方向
fn basis(n: Vec3) -> (Vec3, Vec3) {
    let u = norm(cross(n, if n[1].abs() < 0.9 { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] }));
    (u, cross(n, u))
}
fn rand_dir(rnd: &mut impl FnMut() -> f64) -> Vec3 {
    let z = rnd() * 2.0 - 1.0;
    let a = rnd() * TAU;
    let r = (1.0 - z * z).sqrt();
    [a.cos() * r, z, a.sin() * r]
}

/// 緯線（可以帶波浪：wave 是振幅、k 是一圈幾個波）
fn lat_line(y0: f64, wave: f64, k: f64, ph: f64) -> Vec<Vec3> {
    (0..73)
        .map(|i| {
            let a = (f64::from(i) / 72.0) * TAU;
            let y = (y0 + wave * (k * a + ph).sin()).clamp(-0.98, 0.98);
            let r = (1.0 - y * y).sqrt();
            [a.cos() * r, y, a.sin() * r]
        })
        .collect()
}
fn lat(y0: f64) -> Vec<Vec3> {
    lat_line(y0, 0.0, 0.0, 0.0)
}

/// 經線：南極到北極
fn lon_line(phi: f64) -> Vec<Vec3> {
    (0..33)
        .map(|i| {
            let th = -PI / 2.0 + (PI * f64::from(i)) / 32.0;
            [th.cos() * phi.cos(), th.sin(), th.cos() * phi.sin()]
        })
        .collect()
}

/// 球面上以 c 為中心、角半徑 rho 的一圈（wobble 讓它不那麼圓）
fn ring_on(c: Vec3, rho: f64, wobble: f64, ph: f64) -> Vec<Vec3> {
    let (u, v) = basis(c);
    (0..49)
        .map(|i| {
            let a = (f64::from(i) / 48.0) * TAU;
            let p = rho * (1.0 + wobble * (5.0 * a + ph).sin());
            let (sn, cs) = p.sin_cos();
            let (sa, ca) = a.sin_cos();
            norm([
                c[0] * cs + (u[0] * ca + v[0] * sa) * sn,
                c[1] * cs + (u[1] * ca + v[1] * sa) * sn,
                c[2] * cs + (u[2] * ca + v[2] * sa) * sn,
            ])
        })
        .collect()
}

/// 從 c 沿著 dir 方向的大圓走，從角距 s0 走到 s1（撞擊坑的放射紋）
fn ray_on(c: Vec3, dir: Vec3, s0: f64, s1: f64) -> Vec<Vec3> {
    (0..13)
        .map(|i| {
            let s = s0 + ((s1 - s0) * f64::from(i)) / 12.0;
            norm([
                c[0] * s.cos() + dir[0] * s.sin(),
                c[1] * s.cos() + dir[1] * s.sin(),
                c[2] * s.cos() + dir[2] * s.sin(),
            ])
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Family {
    Gas,
    Rock,
    Ice,
    Other,
}

fn family_of(lang: &str) -> Family {
    match lang {
        "TypeScript" | "JavaScript" => Family::Gas,
        "Rust" => Family::Rock,
        "Python" => Family::Ice,
        _ => Family::Other,
    }
}

/// 主要語言是哪一族（`familyOfWork`：bytes 最多的那個，比的是嚴格大於）
fn family_of_work(w: &WorkStats) -> Family {
    let mut top = ("Other", 0.0);
    for &l in w.languages {
        if l.1 > top.1 {
            top = l;
        }
    }
    family_of(top.0)
}

/// 地貌：符號上只畫得到地貌線（`marks`），立體那顆才用的 density 不需要；
/// 但亂數要照原本的順序一個不漏地抽，後面的環、衛星、傾角才會一樣
struct Surface {
    marks: Vec<Vec<Vec3>>,
    tilt: Option<f64>,
    roll: Option<f64>,
    flat: f64,
}

impl Surface {
    const fn of(marks: Vec<Vec<Vec3>>, flat: f64) -> Self {
        Self { marks, tilt: None, roll: None, flat }
    }
}

fn surface_of(family: Family, variant: usize, commits: u32, rnd: &mut impl FnMut() -> f64) -> Surface {
    let v = variant % 3;
    let log_commits = f64::from(commits + 1).log2();
    match family {
        Family::Gas => {
            if v == 1 {
                // 寬而柔的帶，像土星：帶少、邊界不硬；轉得快所以扁
                return Surface::of(vec![lat(0.3), lat(-0.24), lat(0.66), lat(-0.62)], 0.1);
            }
            // 帶的邊界：commit 越多帶越多
            let n = log_commits.round().clamp(3.0, 8.0);
            let edges: Vec<f64> = (0..n as usize)
                .map(|k| -0.82 + (1.64 * (k as f64 + 0.5 + (rnd() - 0.5) * 0.5)) / n)
                .collect();
            if v == 2 {
                // 亂流：帶的邊界是波浪
                let ph = rnd() * TAU;
                let k = 3.0 + (rnd() * 3.0).floor();
                return Surface::of(
                    edges.iter().map(|&e| lat_line(e, 0.07, k, ph + e * 9.0)).collect(),
                    0.05,
                );
            }
            // 一條一條的帶，加一個大風暴
            let lon = rnd() * TAU;
            let storm = norm([lon.cos(), -0.42, lon.sin()]);
            let mut marks: Vec<_> = edges.iter().take(6).map(|&e| lat(e)).collect();
            marks.push(ring_on(storm, 0.2, 0.05, 0.0));
            Surface::of(marks, 0.07)
        }
        Family::Rock => {
            if v == 1 {
                // 月海：幾塊大而暗的盆地，加上幾個小坑
                let maria: Vec<(Vec3, f64, f64)> = (0..3)
                    .map(|_| {
                        let c = rand_dir(rnd);
                        let r = 0.3 + rnd() * 0.22;
                        (c, r, rnd() * TAU)
                    })
                    .collect();
                let pits: Vec<(Vec3, f64)> = (0..6)
                    .map(|_| {
                        let c = rand_dir(rnd);
                        (c, 0.08 + rnd() * 0.08)
                    })
                    .collect();
                let mut marks: Vec<_> = maria.iter().map(|&(c, r, ph)| ring_on(c, r, 0.12, ph)).collect();
                marks.extend(pits.iter().take(3).map(|&(c, r)| ring_on(c, r, 0.0, 0.0)));
                return Surface::of(marks, 0.0);
            }
            if v == 2 {
                // 一個大撞擊坑：兩圈坑緣，放射紋往外拉
                let c = rand_dir(rnd);
                let rays: Vec<Vec3> = (0..7)
                    .map(|_| {
                        let d = rand_dir(rnd);
                        let k = dot3(d, c);
                        norm([d[0] - c[0] * k, d[1] - c[1] * k, d[2] - c[2] * k])
                    })
                    .collect();
                let mut marks = vec![ring_on(c, 0.43, 0.04, 0.0), ring_on(c, 0.63, 0.0, 0.0)];
                marks.extend(rays.iter().map(|&t| ray_on(c, t, 0.68, 1.3)));
                return Surface::of(marks, 0.0);
            }
            // 坑坑洞洞：一個一個坑（符號上畫最大的六個的坑緣）
            let count = 5 + log_commits.round() as usize;
            let mut craters: Vec<(Vec3, f64)> = (0..count)
                .map(|_| {
                    let c = rand_dir(rnd);
                    (c, 0.18 + rnd() * 0.22)
                })
                .collect();
            // JS 的 sort 是穩定排序，sort_by 也是
            craters.sort_by(|a, b| b.1.total_cmp(&a.1));
            Surface::of(craters.iter().take(6).map(|&(c, r)| ring_on(c, r * 0.85, 0.08, 0.0)).collect(), 0.0)
        }
        Family::Ice => {
            if v == 1 {
                // 躺著轉的冰巨星：自轉軸幾乎倒成橫的，極區有一圈亮環
                return Surface {
                    marks: vec![lat(0.5), lat(0.38), lat(-0.25), lat(0.75)],
                    tilt: Some(0.3),
                    roll: Some(1.35),
                    flat: 0.0,
                };
            }
            if v == 2 {
                // 兩面星：一半暗、一半亮，交界是一條歪歪的線
                let d = rand_dir(rnd);
                let ph = rnd() * TAU;
                return Surface::of(vec![ring_on(d, PI / 2.0, 0.05, ph), ring_on(d, 0.5, 0.0, 0.0)], 0.0);
            }
            // 冰殼：兩極有冰冠，表面一道一道裂紋
            let cracks: Vec<Vec3> = (0..3).map(|_| rand_dir(rnd)).collect();
            let mut marks = vec![lat(0.72), lat(-0.72)];
            marks.extend(cracks.iter().map(|&n| ring_on(n, PI / 2.0, 0.03, 0.0)));
            Surface::of(marks, 0.0)
        }
        Family::Other => {
            // 其他：經線，幾條由名字決定
            let m = 4 + (rnd() * 4.0).floor() as usize;
            Surface::of((0..m).map(|k| lon_line((k as f64 * TAU) / m as f64)).collect(), 0.0)
        }
    }
}

struct Moon {
    r: f64,
    phase: f64,
    speed: f64,
    /// 軌道對環面的傾角
    incl: f64,
}

/// 一件作品長成的星（`Body`，只留符號用得到的）
struct Body {
    size: f64,
    /// 最外緣（環或最外一顆衛星）
    #[allow(dead_code, reason = "前端拿它擺字；分享圖不畫字，留著給測試對照前端長出來的環與衛星")]
    span: f64,
    tilt: f64,
    roll: f64,
    flat: f64,
    /// 符號上的環：每種語言一圈
    bands: Vec<(f64, &'static str)>,
    marks: Vec<Vec<Vec3>>,
    moons: Vec<Moon>,
    spin_speed: f64,
}

/// `bodyOf`：variant 是同一族的作品裡這是第幾件
fn body_of(w: &WorkStats, variant: usize) -> Body {
    let total = w.languages.iter().map(|l| l.1).sum::<f64>();
    let total = if total == 0.0 { 1.0 } else { total };
    let mut list: Vec<(&'static str, f64)> =
        w.languages.iter().map(|&(n, b)| (n, b / total)).filter(|l| l.1 >= 0.05).collect();
    list.sort_by(|a, b| b.1.total_cmp(&a.1));
    if list.is_empty() {
        list.push(("Other", 1.0));
    }
    let seed = hash(w.name);
    let mut rnd = seeded(seed);
    let size = (0.4 + 0.15 * (total / 1e4).log10()).clamp(0.42, 1.0);
    let surface = surface_of(family_of(list[0].0), variant, w.commits, &mut rnd);
    // 環：主要語言之外，每多一種語言多一圈帶（`rings` 是立體那顆的，這裡只需要最外一條的半徑）
    let mut bands = Vec::new();
    let mut outer = 1.0;
    if list.len() >= 2 {
        let mut r = 1.3;
        for &(lang, share) in &list[1..] {
            let width = 0.22 + share * 1.1;
            let lines = (width / 0.08).round().max(2.0) as usize;
            // `&&` 會短路：線少於四條就不抽亂數
            let gap = if lines >= 4 && rnd() < 0.7 {
                Some((lines as f64 * (0.45 + rnd() * 0.3)).floor() as usize)
            } else {
                None
            };
            for j in 0..lines {
                if Some(j) != gap {
                    outer = r + (j as f64 / lines as f64) * width;
                }
            }
            bands.push((r + width / 2.0, lang));
            r += width + 0.12;
        }
    }
    let count = (f64::from(w.stars + 1).log2().ceil() as usize).min(4);
    let moons: Vec<Moon> = (0..count)
        .map(|k| {
            let r = outer + 0.45 + k as f64 * 0.42;
            Moon {
                r,
                phase: seed * TAU + k as f64 * 2.1,
                speed: 0.5 / r.powf(1.5),
                incl: (rnd() - 0.5) * (if k == 0 { 0.3 } else { 0.9 }),
            }
        })
        .collect();
    let span = outer.max(moons.last().map_or(1.0, |m| m.r));
    let tilt = surface.tilt.unwrap_or_else(|| 0.15 + rnd() * 0.55);
    let roll = surface.roll.unwrap_or_else(|| (rnd() - 0.5) * 0.6);
    Body {
        size,
        span,
        tilt,
        roll,
        flat: surface.flat,
        bands,
        marks: surface.marks,
        moons,
        spin_speed: 0.04 + 0.22 * (-w.pushed_days_ago / 60.0).exp(),
    }
}

/// `bodiesOf`：同一族的作品照順序各拿不同的地貌
fn bodies() -> Vec<Body> {
    let mut seen: Vec<(Family, usize)> = Vec::new();
    WORKS
        .iter()
        .map(|w| {
            let family = family_of_work(w);
            let variant = seen.iter().find(|s| s.0 == family).map_or(0, |s| s.1);
            seen.retain(|s| s.0 != family);
            seen.push((family, variant + 1));
            body_of(w, variant)
        })
        .collect()
}

// ── 符號（drawGlyph）────────────────────────────────────────────

fn rot_with(tilt: f64, roll: f64) -> impl Fn(f64, f64, f64, f64) -> Vec3 {
    let (st, ct) = tilt.sin_cos();
    let (sr, cr) = roll.sin_cos();
    move |x0, y0, z0, spin| {
        let (sn, cs) = spin.sin_cos();
        let (x, z) = (x0 * cs + z0 * sn, -x0 * sn + z0 * cs);
        let (y, z) = (y0 * ct - z * st, y0 * st + z * ct);
        let (x, y) = (x * cr - y * sr, x * sr + y * cr);
        [x, y, z]
    }
}

/// 衛星在環面座標裡的位置。前端是 `phase + t × speed × pace`；這裡直接給轉到的角度
fn moon_at(m: &Moon, a: f64) -> Vec3 {
    let s = a.sin() * m.r;
    [a.cos() * m.r, s * m.incl.sin(), s * m.incl.cos()]
}

/// 符號上的衛星轉得比立體的快一點
const GLYPH_PACE: f64 = 2.5;

/// 線型分語言
fn dash_of(lang: &str) -> &'static [f32] {
    match lang {
        "TypeScript" => &[],
        "Rust" => &[4.0, 3.0],
        "Python" => &[1.0, 3.0],
        "JavaScript" => &[8.0, 3.0],
        "CSS" => &[1.0, 1.6],
        "Shell" => &[2.0, 5.0],
        _ => &[2.0, 2.0],
    }
}

/// 兩個顏色之間（琥珀衛星淡回白色那一段用；前端是一瞬間換色，見 `Works::frame`）
fn mix(a: Rgba, b: Rgba, k: f64) -> Rgba {
    let k = k as f32;
    let ch = |i: usize| (f32::from(a.0[i]) + (f32::from(b.0[i]) - f32::from(a.0[i])) * k).round() as u8;
    Rgba([ch(0), ch(1), ch(2)], a.1 + (b.1 - a.1) * k)
}

/// 一顆線畫的小星球（`drawGlyph`，alpha 固定是 1）。`lit` 是 0 到 1：前端只有亮或不亮，
/// 這裡多一段中間值讓琥珀衛星淡回白色。`moon_angle` 是每顆衛星轉到的角度
fn draw_glyph(ctx: &mut Ctx, x: f64, y: f64, rc: f64, b: &Body, spin: f64, moon_angle: &[f64], lit: f64) {
    let r = rot_with(b.tilt, b.roll);
    let hidden = |p: Vec3| p[2] < 0.0 && p[0] * p[0] + p[1] * p[1] < 1.0;
    let at = |p: Vec3| ((x + p[0] * rc) as f32, (y - p[1] * rc) as f32);
    ctx.set_line_width(1.0);
    let bands = |ctx: &mut Ctx, front: bool| {
        for &(br, lang) in &b.bands {
            ctx.set_line_dash(dash_of(lang));
            ctx.set_stroke(ink(if front { 0.55 } else { 0.3 }));
            ctx.begin_path();
            let mut pen = false;
            for i in 0..=96 {
                let th = (f64::from(i) / 96.0) * TAU;
                let p = r(th.cos() * br, 0.0, th.sin() * br, 0.0);
                if (p[2] >= 0.0) != front || hidden(p) {
                    pen = false;
                    continue;
                }
                let (px, py) = at(p);
                if pen {
                    ctx.line_to(px, py);
                } else {
                    ctx.move_to(px, py);
                }
                pen = true;
            }
            ctx.stroke();
        }
        ctx.set_line_dash(&[]);
    };
    let moons = |ctx: &mut Ctx, front: bool| {
        for (k, m) in b.moons.iter().enumerate() {
            let p = moon_at(m, moon_angle[k]);
            let p = r(p[0], p[1], p[2], 0.0);
            if (p[2] >= 0.0) != front || hidden(p) {
                continue;
            }
            let glow = if k == 0 { lit } else { 0.0 };
            let (px, py) = at(p);
            ctx.dot(px, py, (1.3 + 0.7 * glow) as f32, mix(ink(0.8), amber(1.0), glow));
        }
    };
    bands(ctx, false);
    moons(ctx, false);
    // 星球本身擋住後面的東西（環的後半、航線）
    let (cx, cy) = (x as f32, y as f32);
    ctx.set_fill(Rgba(GROUND, 1.0));
    ctx.begin_path();
    ctx.arc(cx, cy, rc as f32, 0.0, std::f32::consts::TAU, false);
    ctx.fill();
    ctx.set_stroke(if lit > 0.5 && b.moons.is_empty() { amber(1.0) } else { ink(0.8) });
    ctx.stroke();
    ctx.set_stroke(ink(0.55));
    let squash = 1.0 - b.flat;
    for curve in &b.marks {
        ctx.begin_path();
        let mut pen = false;
        for p in curve {
            let q = r(p[0], p[1] * squash, p[2], spin);
            if q[2] <= 0.04 {
                pen = false;
                continue;
            }
            let (px, py) = at(q);
            if pen {
                ctx.line_to(px, py);
            } else {
                ctx.move_to(px, py);
            }
            pen = true;
        }
        ctx.stroke();
    }
    bands(ctx, true);
    moons(ctx, true);
}

// ── 螺旋（createSpiral）─────────────────────────────────────────

/// 相鄰兩件作品在螺旋上隔多少弧度；最外一件之後還有一段「還沒做的」虛點
const STEP: f64 = 1.2;
const AHEAD: f64 = 2.4;
/// 盤面的傾角：短軸是長軸的幾倍
const INCLINE: f64 = 0.48;
/// 筆尖後面那段亮的線有多長（弧度）
const PEN_TAIL: f64 = 0.9;

// ── 構圖 ─────────────────────────────────────────────────────────
// 前端的 `frameOf` 把螺旋置中、長軸是畫面寬的 0.42。分享圖的字佔左邊，所以框改成自己定：
// 中心往右移到右半邊，長軸收到 380px：每一件作品都落在字的右邊，只有最外圈那段（還沒做的）
// 虛點拖進字的底下、被壓暗。
const CX: f64 = 868.0;
const CY: f64 = 316.0;
const RX: f64 = 380.0;
const RY: f64 = RX * INCLINE;
/// 符號大小的基準（前端是畫面的短邊，夾在 0.8–1.3 倍之間）：跟作品頁在 1440×900 時同一個大小
const GLYPH_UNIT: f64 = 900.0;
/// 停在哪一刻：前端的螺旋以 0.025 rad/s 一直在轉，這裡取它轉到最新那一件落在右下、
/// 左邊那幾件不壓到字的那個角度（等於頁面開著約 4 分鐘時的樣子）
const MOMENT_S: f64 = 239.0;

/// 塵埃：前端每次進頁面用 `Math.random()` 撒，這裡用固定的種子撒一次（不然每次產圖都不一樣）
const DUST: usize = 320;
const DUST_SEED: f64 = 0.27;

/// 符號的星球半徑（`glyphRadius`）
fn glyph_radius(b: &Body) -> f64 {
    (7.0 + 12.0 * (b.size - 0.42)) * (GLYPH_UNIT / 900.0).clamp(0.8, 1.3)
}

fn smooth(a: f64, b: f64, x: f64) -> f64 {
    let k = ((x - a) / (b - a)).clamp(0.0, 1.0);
    k * k * (3.0 - 2.0 * k)
}

pub struct Works {
    bodies: Vec<Body>,
    /// 航線、虛點、塵埃（不會動的那幾樣）
    back: Pixmap,
    t_last: f64,
    /// 每顆衛星一圈裡繞幾圈（照它自己的速度取最接近的整數，至少一圈）
    orbits: Vec<Vec<f64>>,
}

impl Works {
    pub fn new() -> Self {
        let bodies = bodies();
        let n = bodies.len();
        let t_last = (n - 1) as f64 * STEP;
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        let p = |th: f64, off: f64| place(t_last, th, off);
        // 航線：走過的是線，再往外（還沒做的）是虛點
        ctx.set_stroke(ink(0.26));
        ctx.set_line_width(1.0);
        ctx.begin_path();
        for k in 0..=400 {
            let (x, y) = p(t_last * f64::from(k) / 400.0, 0.0);
            ctx.line_to(x as f32, y as f32);
        }
        ctx.stroke();
        // JS 是 `th += 0.035` 一路加上去，浮點誤差也照著累積
        let mut th = t_last;
        while th < t_last + AHEAD {
            let (x, y) = p(th, 0.0);
            ctx.set_fill(ink((0.22 * (1.0 - (th - t_last) / AHEAD)) as f32));
            ctx.fill_rect(x as f32, y as f32, 1.4, 1.4);
            th += 0.035;
        }
        // 塵埃沿著航線（停下來的那一刻：畫到最新那一件再往外 0.4）
        let mut rnd = seeded(DUST_SEED);
        for _ in 0..DUST {
            let th = rnd() * (t_last + AHEAD);
            let off = (rnd() - 0.5) * 2.0;
            let j = rnd();
            if th > t_last + 0.4 {
                continue;
            }
            let (x, y) = p(th, off * 7.0);
            ctx.set_fill(ink((0.15 + 0.35 * j * (1.0 - th / (t_last + AHEAD))) as f32));
            ctx.fill_rect(x as f32, y as f32, 1.5, 1.5);
        }
        let orbits = bodies
            .iter()
            .map(|b| b.moons.iter().map(|m| (m.speed * GLYPH_PACE * LOOP_S / TAU).round().max(1.0)).collect())
            .collect();
        Self { bodies, back: ctx.pixmap, t_last, orbits }
    }

    /// 第 i 件的衛星在一圈裡的第 u（0–1）處轉到的角度
    fn moon_angles(&self, i: usize, u: f64) -> Vec<f64> {
        self.bodies[i]
            .moons
            .iter()
            .zip(&self.orbits[i])
            .map(|(m, n)| m.phase + MOMENT_S * m.speed * GLYPH_PACE + n * TAU * u)
            .collect()
    }

    /// 第 i 件的第一顆衛星在畫面上的哪裡（`moonOf`）：最新那一件的琥珀點
    fn moon_of(&self, i: usize, u: f64) -> (f64, f64) {
        let (x, y) = place(self.t_last, i as f64 * STEP, 0.0);
        let b = &self.bodies[i];
        let Some(m) = b.moons.first() else { return (x, y) };
        let rc = glyph_radius(b);
        let q = moon_at(m, self.moon_angles(i, u)[0]);
        let q = rot_with(b.tilt, b.roll)(q[0], q[1], q[2], 0.0);
        (x + q[0] * rc, y - q[1] * rc)
    }
}

/// 螺旋上 th 處（往外偏 off 像素）在畫面上的位置（`placer`）
fn place(t_last: f64, th: f64, off: f64) -> (f64, f64) {
    let r = 0.13 + (0.87 * th) / (t_last + AHEAD);
    let a = th + MOMENT_S * 0.025;
    (CX + a.cos() * (r * RX + off), CY + a.sin() * (r * RY + off * 0.8))
}

// ── 一圈的節奏（秒）────────────────────────────────────────────
/// 琥珀衛星開始淡回白色
const FADE_AT: f64 = 6.0;
const FADE_S: f64 = 1.0;
/// 琥珀點在起點亮起來
const PEN_AT: f64 = 7.0;
const PEN_IN_S: f64 = 0.4;
/// 從起點畫到最新那一件（前端的 `GROW_S`，同樣是 ease-out）
const GROW_S: f64 = 2.4;
/// 落地後光暈與亮線退掉（前端的 `SETTLE_S`）
const SETTLE_S: f64 = 0.9;

impl super::Scene for Works {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let u = index as f64 / FRAMES as f64;
        let t = u * LOOP_S;
        let grow_at = PEN_AT + PEN_IN_S;
        let landed = grow_at + GROW_S;
        // 最新那一件的第一顆衛星亮不亮：停著的時候亮；淡回白色之後，等筆尖落地才再亮
        let lit = if t < FADE_AT {
            1.0
        } else if t < landed {
            1.0 - ((t - FADE_AT) / FADE_S).min(1.0)
        } else {
            1.0
        };
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        let newest = self.bodies.len() - 1;

        // 筆尖（`draw` 裡琥珀點那一段）：grow 照前端是 ease-out，pen 是落地後退掉的那個係數
        if t >= PEN_AT && t < landed + SETTLE_S {
            let grow = 1.0 - (1.0 - ((t - grow_at) / GROW_S).clamp(0.0, 1.0)).powi(3);
            let fade_in = ((t - PEN_AT) / PEN_IN_S).min(1.0);
            let pen = if t < landed { fade_in } else { 1.0 - (t - landed) / SETTLE_S };
            let reach = self.t_last * grow;
            let tail = (reach - PEN_TAIL).max(0.0);
            ctx.set_line_width(1.0);
            for k in 1..=30 {
                let (x0, y0) = place(self.t_last, tail + (f64::from(k - 1) / 30.0) * (reach - tail), 0.0);
                let (x1, y1) = place(self.t_last, tail + (f64::from(k) / 30.0) * (reach - tail), 0.0);
                // 疊在本來那條線上，只疊「多亮的那一份」
                ctx.set_stroke(ink((0.6 * (f64::from(k) / 30.0).powi(2) * pen) as f32));
                ctx.begin_path();
                ctx.move_to(x0 as f32, y0 as f32);
                ctx.line_to(x1 as f32, y1 as f32);
                ctx.stroke();
            }
            let land = smooth(0.9, 1.0, grow);
            let (sx, sy) = place(self.t_last, reach, 0.0);
            let (mx, my) = self.moon_of(newest, u);
            let (px, py) = ((sx + (mx - sx) * land) as f32, (sy + (my - sy) * land) as f32);
            ctx.set_fill(
                Gradient::radial(px, py, 0.0, px, py, 12.0)
                    .stop(0.0, amber((0.6 * pen) as f32))
                    .stop(1.0, amber(0.0)),
            );
            ctx.begin_path();
            ctx.arc(px, py, 12.0, 0.0, std::f32::consts::TAU, false);
            ctx.fill();
            // 筆尖在落地之前畫在符號底下會被星球擋住；落地之後衛星自己是琥珀色，這顆點只剩光暈
            ctx.dot(px, py, (2.6 - 0.6 * land) as f32, amber(pen as f32));
        }

        for (i, b) in self.bodies.iter().enumerate() {
            let (x, y) = place(self.t_last, i as f64 * STEP, 0.0);
            let spin = MOMENT_S * b.spin_speed * 2.0 + i as f64;
            let glow = if i == newest { lit } else { 0.0 };
            draw_glyph(&mut ctx, x, y, glyph_radius(b), b, spin, &self.moon_angles(i, u), glow);
        }
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 雜湊與 mulberry32 要跟前端算出一樣的值，不然長出來的星跟作品頁的不一樣。
    /// 期望值是用 node 跑 worksSky.ts 的同一段程式得到的
    #[test]
    fn 雜湊與亂數跟前端一致() {
        assert!((hash("tessera") - 0.940_413_207_500_337_9).abs() < 1e-12);
        let mut r = seeded(hash("tessera"));
        for want in [0.750_667_979_707_941_4, 0.610_227_716_388_180_9, 0.349_577_418_761_327_86] {
            let got = r();
            assert!((got - want).abs() < 1e-12, "{got} ≠ {want}");
        }
    }

    /// 每一件長出來的星要跟前端 `bodiesOf` 的一樣：傾角與滾轉是亂數抽到最後才抽的，
    /// 地貌、環、衛星哪一步多抽或少抽一個亂數，這兩個值就會不一樣；地貌線再加總比一次。
    /// 期望值同樣是 node 跑 worksSky.ts（餵 works.ts 的 fallback）得到的
    #[test]
    fn 長出來的星跟前端一致() {
        // (tilt, roll, span, 地貌線的點 x + 2y + 3z 加總)
        let want = [
            (
                0.364_777_263_009_455_07,
                -0.176_854_797_312_989_84,
                1.549_824_281_150_159_7,
                -1.778_376_357_460_008_9,
            ),
            (
                0.515_324_433_671_776_3,
                -0.118_372_810_631_990_43,
                3.144_696_598_060_141_6,
                -128.372_868_256_097_63,
            ),
            (
                0.574_988_263_961_859_1,
                -0.021_656_332_165_002_82,
                2.815_356_164_889_941_7,
                18.060_579_498_054_576,
            ),
            (0.3, 1.35, 1.87, 204.900_695_554_490_14),
            (0.379_187_147_098_127_73, -0.161_828_820_733_353_5, 1.0, 277.142_257_231_908_96),
            (0.172_741_027_898_155_15, -0.041_228_424_757_719_04, 1.87, 70.791_483_742_461_34),
            (0.536_457_744_520_157_6, 0.215_761_576_266_959_3, 3.493_209_190_013_58, 161.517_891_354_315_42),
        ];
        for (b, (tilt, roll, span, marks)) in bodies().iter().zip(want) {
            let sum: f64 = b.marks.iter().flatten().map(|p| p[0] + p[1] * 2.0 + p[2] * 3.0).sum();
            assert!((b.tilt - tilt).abs() < 1e-9, "tilt {} ≠ {tilt}", b.tilt);
            assert!((b.roll - roll).abs() < 1e-9, "roll {} ≠ {roll}", b.roll);
            assert!((b.span - span).abs() < 1e-9, "span {} ≠ {span}", b.span);
            assert!((sum - marks).abs() < 1e-6, "地貌線 {sum} ≠ {marks}");
        }
    }
}
