//! 航行日誌的分享圖（`src/components/about/logSky.ts` 逐行移植）：從地表升空。仰角看一段地球的
//! 邊緣，地表是台灣周邊真實的海岸線（刻線），火箭從台灣的發射台離地、沿一條平滑的軌道爬升，
//! 已經穿過大氣層（星空浮出來了），停在軌道最前端「現在」那裡。
//!
//! 鏡頭照頁面的鏡頭（滑鼠不在畫面上，`look = 0`）。頁面的畫布鋪滿視窗，在 1200×630 的視窗裡
//! 構圖剛好就是分享圖要的：火箭與琥珀點落在右上（x ≈ 850–950），軌道的前半段與發射台在左下，
//! 會被字底下的漸層壓暗。
//!
//! ## 跟頁面不一樣的地方（都是因為不讀資料、不畫字）
//!
//! - **軌道的形狀是示意的**。頁面上離地高度是累積的 GitHub 貢獻；這裡不讀資料，每天的量取成
//!   一條等比例往上加的直線（累積起來是二次曲線），接近頁面上那條「越往後爬得越快」的樣子。
//!   終點的高度與位置跟頁面一樣（前端把累積量正規化到 `ALT_MAX`）。
//! - **地上的燈全畫成「那天沒有貢獻」的暗點**：燈的大小與亮度是每天的真實數字，不能編。
//! - 改版的節點照站長填的里程碑日期擺（`page_content` 的 log，[`crate::handlers::page_content::log_dates`]）；它們的名字、地上的月份刻度、遙測列、
//!   「現在」那幾個字是頁面上的 DOM 或文字，這裡都不畫。
//! - 背景的星：頁面上是站台的背景星空（不是這張畫布畫的）。這裡用首頁那張分享圖的星
//!   （`saturn.rs` 的種子與分布），地球的輪廓一樣把它們擋在地平線以下。
//!
//! 動態：整片不動，只有火箭那一小塊——軌道前端的琥珀點一明一暗地脈動、噴嘴的火焰閃動，
//! 加上右邊天上幾顆星慢慢閃。脈動、火焰、星都排成一圈裡的整數次，最後一格接得回第一格。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::suboptimal_flops,
    reason = "幾何照 TS 原版的寫法逐行對照（不改成 mul_add）；天數與格數都很小；座標是畫布範圍內的浮點數"
)]

use std::f32::consts::TAU;

use chrono::{Datelike, NaiveDate};
use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, Gradient, Rgba, amber, ground, ink, load_image, resize_image};
use super::body::rng;
use crate::handlers::ground::{DEFAULT_PAD, Ground};

/// 一圈 12 秒、每格 100ms。火焰與脈動每一格都在變（一格約 4 KB），一圈越長檔案越大：
/// 15 秒是 640 KB，12 秒收在 550 KB 左右
const FRAMES: usize = 120;
const FRAME_MS: u32 = 100;
const LOOP_S: f32 = FRAMES as f32 * FRAME_MS as f32 / 1000.0;

/// 海岸線由呼叫端帶進來（`handlers::ground`：站長設的發射台周圍），日誌的起點與里程碑也是
const ROCKET_WEBP: &[u8] = include_bytes!("../../../../../public/illustrations/rocket-ascent.webp");

/// 火箭線稿（568×878）：噴嘴出口與機鼻的位置（原圖比例）
const NOZZLE: [f64; 2] = [0.074, 0.957];
const NOSE: [f64; 2] = [0.968, 0.017];
/// 火箭畫多長（噴嘴到機鼻，會跟著遠近縮放）
const ROCKET_LEN: f64 = 120.0;
/// 火焰的點活多久（秒）與每秒噴幾個（前端是每幀 3 個、60fps）
const FLAME_LIFE: f32 = 0.55;
const FLAME_RATE: f32 = 180.0;

// ── 世界：地球半徑 R，軌跡在 z = 0 的平面上，θ 是繞地心的角度（往右是時間）──
const R: f64 = 4000.0;
/// 發射台的角度與整段時間跨過的角度
const THETA0: f64 = -0.085;
const SPAN: f64 = 0.16;
/// 累積貢獻最多爬到多高
const ALT_MAX: f64 = 320.0;
/// 地上的燈一排隔多寬（一週七排，往鏡頭這邊排開）
const LANE: f64 = 22.0;
/// 軌道的平滑程度（天）：越大越順
const SMOOTH_DAYS: f64 = 14.0;
/// 大氣層頂在多高
const ATMOSPHERE: f64 = 40.0;

/// 地表一個世界單位是幾度（往右是東、往遠方是北，發射台在站長設的位置）
const DEG_PER_UNIT: f64 = 0.008;
/// 地表最近畫到哪（橫向位置）：再近就到鏡頭底下了
const NEAR_Z: f64 = 900.0;

/// 琥珀點一圈脈動幾次（前端是 `sin(t × 3)`，12 秒裡 5.7 次，取整數接縫才對得上）
const PULSE_LAPS: f32 = 6.0;
/// 會閃的星只在這條線右邊（字的右邊）：一格的大小取的是所有變動像素的外框，
/// 左邊也有星在閃的話每一格都是整張圖寬
const TWINKLE_FROM_X: f32 = 760.0;

type V3 = [f64; 3];
/// 地表上的一串點（θ、橫向位置）
type SurfaceLine = Vec<(f64, f64)>;
fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn mul(a: V3, k: f64) -> V3 {
    [a[0] * k, a[1] * k, a[2] * k]
}
fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn norm(a: V3) -> V3 {
    let l = a[0].hypot(a[1]).hypot(a[2]);
    mul(a, 1.0 / if l == 0.0 { 1.0 } else { l })
}
/// 地心往 θ 方向的單位向量（離地的「上」）
fn radial(th: f64) -> V3 {
    [th.sin(), th.cos(), 0.0]
}
/// θ 方向的地面切線（往右、往未來）
fn downrange(th: f64) -> V3 {
    [th.cos(), -th.sin(), 0.0]
}

/// 地表上 θ、橫向位置的那一點（橫向也照著地球的弧度往下彎）
fn surface_at(a: f64, z: f64) -> V3 {
    let r = radial(a);
    let bend = (z * z) / (2.0 * R);
    [r[0] * (R - bend), r[1] * (R - bend), z]
}

#[derive(Clone, Copy)]
struct ScreenPoint {
    x: f64,
    y: f64,
    /// 透視縮放（近的大）
    s: f64,
}

/// 頁面的鏡頭（`camera`），滑鼠不在畫面上（`look = 0`）
struct Camera {
    eye: V3,
    f: V3,
    right: V3,
    up: V3,
    fl: f64,
    cx: f64,
    cy: f64,
}

impl Camera {
    fn new(w: f64, h: f64) -> Self {
        let mid = THETA0 + SPAN * 0.55;
        let up0 = radial(mid);
        let target = mul(up0, R + 120.0);
        // 鏡頭在軌跡平面的前方偏左、離地有點高，往遠方的地平線看過去
        let back: V3 = [0.0, 0.0, 1100.0];
        let eye = add(add(target, back), add(mul(up0, 230.0), mul(downrange(mid), -120.0)));
        let f = norm(sub(target, eye));
        let right = norm(cross(f, up0));
        let up = cross(right, f);
        Self { eye, f, right, up, fl: (w * 1.1).min(h * 1.5), cx: w * 0.5, cy: h * 0.52 }
    }
    fn project(&self, p: V3) -> Option<ScreenPoint> {
        let d = sub(p, self.eye);
        let z = dot(d, self.f);
        if z < 10.0 {
            return None;
        }
        Some(ScreenPoint {
            x: self.cx + (self.fl * dot(d, self.right)) / z,
            y: self.cy - (self.fl * dot(d, self.up)) / z,
            s: 1100.0 / z,
        })
    }
    /// 地表上這一點朝不朝向鏡頭（背面的不畫）
    fn facing(&self, p: V3) -> bool {
        dot(p, sub(self.eye, p)) > 0.0
    }
}

/// 半徑 radius 的球從鏡頭看過去的輪廓（畫面上那一段連續的弧，照順序）
fn silhouette(cam: &Camera, radius: f64, w: f64, h: f64) -> Vec<ScreenPoint> {
    let eye_len = cam.eye[0].hypot(cam.eye[1]).hypot(cam.eye[2]);
    let k = (radius * radius) / (eye_len * eye_len);
    let center = mul(cam.eye, k);
    let rad = radius * (1.0 - k).sqrt();
    let nrm = norm(cam.eye);
    let u = norm(cross(nrm, [0.0, 0.0, 1.0]));
    let v = cross(nrm, u);
    let n = 360;
    let pts: Vec<Option<ScreenPoint>> = (0..n)
        .map(|s| {
            let ang = (f64::from(s) / f64::from(n)) * std::f64::consts::TAU;
            cam.project(add(center, add(mul(u, ang.cos() * rad), mul(v, ang.sin() * rad))))
                .filter(|p| p.x > -3.0 * w && p.x < 4.0 * w && p.y > -3.0 * h && p.y < 4.0 * h)
        })
        .collect();
    // 取最長的一段連續可見的點（繞圈的，所以從一個空缺後面開始數）
    let Some(gap) = pts.iter().position(Option::is_none) else {
        return pts.into_iter().flatten().collect();
    };
    let (mut best, mut run): (Vec<ScreenPoint>, Vec<ScreenPoint>) = (Vec::new(), Vec::new());
    for s in 1..=pts.len() {
        if let Some(p) = pts[(gap + s) % pts.len()] {
            run.push(p);
        } else {
            if run.len() > best.len() {
                best = std::mem::take(&mut run);
            }
            run.clear();
        }
    }
    if run.len() > best.len() { run } else { best }
}

/// 發射台周圍的陸地與河流（`handlers::ground`：Natural Earth 50m，公有領域）換成地表座標（θ、橫向位置）。
/// 一串 [經度×100, 緯度×100, …] 是一條線。經度一度在高緯度比較窄，以台灣為準修正（台灣本身不變）
fn surface_line(g: &Ground, flat: &[i32]) -> SurfaceLine {
    let lon_scale = g.lat.to_radians().cos() / DEFAULT_PAD.lat.to_radians().cos();
    flat.as_chunks::<2>()
        .0
        .iter()
        .map(|[lon, lat]| {
            let (lon, lat) = (f64::from(*lon) / 100.0, f64::from(*lat) / 100.0);
            (THETA0 + ((lon - g.lon) * lon_scale) / (R * DEG_PER_UNIT), (g.lat - lat) / DEG_PER_UNIT)
        })
        .collect()
}

/// 陸地的環（首尾相接）與河流、湖的線（不封閉），都換成地表座標
fn land(g: &Ground) -> (Vec<SurfaceLine>, Vec<SurfaceLine>) {
    let rings = g.land.iter().flatten().map(|r| surface_line(g, r)).collect();
    let water = g.water.iter().map(|l| surface_line(g, l)).collect();
    (rings, water)
}

/// 軌道：每天的量 → 高斯平滑過的累積高度（`createLog` 裡的 `alt`）
fn altitudes(counts: &[f64]) -> Vec<f64> {
    let n = counts.len();
    let cum: Vec<f64> = counts
        .iter()
        .scan(0.0, |a, c| {
            *a += c;
            Some(*a)
        })
        .collect();
    let total = cum.last().copied().filter(|t| *t != 0.0).unwrap_or(1.0);
    let k = (SMOOTH_DAYS * 3.0).ceil() as i64;
    let out: Vec<f64> = (0..n as i64)
        .map(|i| {
            let (mut sum, mut wsum) = (0.0, 0.0);
            for j in -k..=k {
                let c = cum[(i + j).clamp(0, n as i64 - 1) as usize];
                let wt = (-((j * j) as f64) / (2.0 * SMOOTH_DAYS * SMOOTH_DAYS)).exp();
                sum += c * wt;
                wsum += wt;
            }
            (sum / wsum / total) * ALT_MAX
        })
        .collect();
    // 起點貼地：平滑會把第一天抬起來一點，整條往下扣回去
    let lift = out[0];
    out.iter().enumerate().map(|(idx, a)| (a - lift * (1.0 - idx as f64 / (n - 1) as f64)).max(0.0)).collect()
}

/// 一顆會閃的星
struct Star {
    x: f32,
    y: f32,
    r: f32,
    a: f32,
    laps: f32,
    phase: f32,
}

pub struct Log {
    /// 天上不閃的星
    sky: Pixmap,
    /// 地球、軌道、燈、節點、發射台（底是透明的，蓋在星上：地球的輪廓把星擋在地平線以下）
    ground: Pixmap,
    twinkle: Vec<Star>,
    /// 火箭（先縮到要貼的大小）與它在畫面上的位置：噴嘴 (x, y)、機身的角度、貼圖的旋轉與偏移
    rocket: Pixmap,
    nozzle: (f32, f32),
    angle: f32,
    rocket_rot: f32,
    rocket_at: (f32, f32),
    /// 軌道最前端（現在）的琥珀點
    here: (f32, f32),
    /// 火焰的點：一圈裡第 k 個噴出來的點往哪偏、多快（前端是每幀 `Math.random()`，這裡固定一組才接得起來）
    flame: Vec<(f32, f32)>,
}

impl Log {
    /// 從 `start`（站點誕生那天）畫到今天；`milestones` 是軌道上改版節點的日期
    /// `terrain` 是發射台周圍的地面（`handlers::ground::ground_for`）
    pub fn new(start: NaiveDate, milestones: &[NaiveDate], terrain: &Ground) -> Self {
        let today = chrono::Local::now().date_naive();
        Self::on(today, start, milestones, terrain)
    }

    /// 畫到 `today` 那天為止（日誌一天一格，往遠方是時間）
    fn on(today: NaiveDate, start: NaiveDate, milestones: &[NaiveDate], terrain: &Ground) -> Self {
        let (w, h) = (W as f64, H as f64);
        let n = ((today - start).num_days() + 1).max(2) as usize;
        // 每天的量：示意的（見檔頭），一天比一天多一點，累積起來是一條越爬越陡的曲線
        let counts: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let alt = altitudes(&counts);
        let start_dow = start.weekday().num_days_from_sunday() as usize;
        let ms_index: Vec<usize> =
            milestones.iter().map(|d| (*d - start).num_days().clamp(0, n as i64 - 1) as usize).collect();

        let theta_of = |i: f64| THETA0 + (i / (n - 1) as f64) * SPAN;
        let alt_of = |i: f64| {
            let c = i.clamp(0.0, (n - 1) as f64);
            let a = c.floor() as usize;
            let b = (a + 1).min(n - 1);
            alt[a] + (alt[b] - alt[a]) * (c - a as f64)
        };
        // 軌跡上第 i 天的位置（世界座標）
        let path_at = |i: f64| mul(radial(theta_of(i)), R + alt_of(i));
        // 第 i 天的燈在地上的位置：沿地面軌跡，一週七排往鏡頭這邊排開
        let light_at = |i: usize| {
            let dow = (start_dow + i) % 7;
            let p = mul(radial(theta_of(i as f64)), R);
            [p[0], p[1], 40.0 + dow as f64 * LANE]
        };
        // 飛行路徑角：就是畫出來那條軌跡的切線，火箭永遠順著自己拖出來的線飛
        let gamma_at = |i: f64| {
            let a = (i - 4.0).max(0.0);
            let b = (i + 4.0).min((n - 1) as f64);
            let climb = alt_of(b) - alt_of(a);
            let run = ((b - a) / (n - 1) as f64) * SPAN * R;
            climb.atan2(if run == 0.0 { 1.0 } else { run })
        };
        let cam = Camera::new(w, h);
        let upto = (n - 1) as f64;
        let tip = n - 1;

        // ── 天上的星（見檔頭）：照 saturn.rs 的種子與分布，右邊每四顆有一顆會閃 ──
        let mut sky = Ctx::new(W as u32, H as u32);
        sky.clear(ground());
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
            if i % 4 == 0 && star.x > TWINKLE_FROM_X {
                twinkle.push(Star { laps: 1.0 + (i / 6 % 3) as f32, ..star });
            } else {
                sky.dot(star.x, star.y, star.r, ink(star.a));
            }
        }

        // ── 地球與軌道（`draw` 照順序；火箭穿過大氣層之後的樣子：暗幕已經掀開）──
        let mut ctx = Ctx::new(W as u32, H as u32);
        let hf = H as f32;
        // 地球：從鏡頭看過去的輪廓塗成不透明，把背後的星星擋掉（星空只在大氣層外）
        let earth = silhouette(&cam, R, w, h);
        let earth_path = |ctx: &mut Ctx| {
            ctx.begin_path();
            for (k, p) in earth.iter().enumerate() {
                if k == 0 {
                    ctx.move_to(p.x as f32, p.y as f32);
                } else {
                    ctx.line_to(p.x as f32, p.y as f32);
                }
            }
        };
        if earth.len() > 1 {
            let (first, last) = (earth[0], earth[earth.len() - 1]);
            ctx.set_fill(Rgba(ground(), 1.0));
            earth_path(&mut ctx);
            ctx.line_to(last.x as f32, hf * 4.0);
            ctx.line_to(first.x as f32, hf * 4.0);
            ctx.close_path();
            ctx.fill();
        }

        // 地表：一片稀疏的經緯點，朝鏡頭的那一面，越遠越淡
        let mut a = THETA0 - 0.2;
        while a <= THETA0 + SPAN + 0.2 {
            let mut z = -2200.0;
            while z <= 1000.0 {
                let q = surface_at(a, z);
                if cam.facing(q)
                    && let Some(s) = cam.project(q)
                    && !(s.x < -10.0 || s.x > w + 10.0 || s.y < -10.0 || s.y > h + 10.0)
                {
                    ctx.set_fill(ink((0.04 + 0.08 * s.s).min(0.16) as f32));
                    ctx.fill_rect(s.x as f32, s.y as f32, 1.2, 1.2);
                }
                z += 48.0;
            }
            a += 0.012;
        }

        // 陸地：只描海岸線（線稿），細、淡一階。照原本的點一段一段連，看不到的那段
        // （地平線後面、比鏡頭近、超出畫面兩側）就提筆。整塊裁在地球的輪廓裡
        if earth.len() > 1 {
            let (first, last) = (earth[0], earth[earth.len() - 1]);
            ctx.save();
            earth_path(&mut ctx);
            ctx.line_to(last.x as f32, hf * 4.0);
            ctx.line_to(first.x as f32, hf * 4.0);
            ctx.close_path();
            ctx.clip();
            let seen = |a: f64, z: f64| {
                z <= NEAR_Z
                    && (THETA0 - 0.18..=THETA0 + SPAN + 0.18).contains(&a)
                    && cam.facing(surface_at(a, z))
            };
            ctx.set_line_width(1.0);
            ctx.set_round_join(true);
            // 海岸線（環：多走一個點回到起點，最後一段海岸也畫上），內陸的河流與湖淡一半（線：不回起點）
            let (rings, water) = land(terrain);
            for (lines, closed, alpha) in [(&rings, true, 0.42), (&water, false, 0.2)] {
                ctx.set_stroke(ink(alpha));
                ctx.begin_path();
                for line in lines {
                    let mut pen = false;
                    for k in 0..line.len() + usize::from(closed) {
                        let (a, z) = line[k % line.len()];
                        let Some(s) = (if seen(a, z) { cam.project(surface_at(a, z)) } else { None }) else {
                            pen = false;
                            continue;
                        };
                        if pen {
                            ctx.line_to(s.x as f32, s.y as f32);
                        } else {
                            ctx.move_to(s.x as f32, s.y as f32);
                        }
                        pen = true;
                    }
                }
                ctx.stroke();
            }
            ctx.set_round_join(false);
            ctx.restore();
        }

        // 地平線：地球的邊緣，外面一層很薄的大氣光；再往上一層虛線是大氣層頂
        for (width, alpha) in [(18.0, 0.02), (6.0, 0.04), (3.0, 0.08), (1.0, 0.4)] {
            ctx.set_stroke(ink(alpha));
            ctx.set_line_width(width);
            earth_path(&mut ctx);
            ctx.stroke();
        }
        ctx.set_line_width(1.0);
        let shell = silhouette(&cam, R + ATMOSPHERE, w, h);
        ctx.set_line_dash(&[2.0, 6.0]);
        ctx.set_stroke(ink(0.14));
        ctx.begin_path();
        for (k, p) in shell.iter().enumerate() {
            if k == 0 {
                ctx.move_to(p.x as f32, p.y as f32);
            } else {
                ctx.line_to(p.x as f32, p.y as f32);
            }
        }
        ctx.stroke();
        ctx.set_line_dash(&[]);

        // 地面軌跡：發射台到今天正下方的一條點線（月份刻度是字，不畫）
        ctx.set_line_dash(&[2.0, 5.0]);
        ctx.set_stroke(ink(0.22));
        ctx.begin_path();
        let mut pen = false;
        for i in (0..n).step_by(4) {
            let Some(p) = cam.project(mul(radial(theta_of(i as f64)), R)) else { continue };
            if pen {
                ctx.line_to(p.x as f32, p.y as f32);
            } else {
                ctx.move_to(p.x as f32, p.y as f32);
            }
            pen = true;
        }
        ctx.stroke();
        ctx.set_line_dash(&[]);

        // 地上的燈：每天一盞。真實的亮度是那天的貢獻數，這裡不編，全畫成「沒有貢獻」的那種暗點
        for i in 0..=tip {
            let Some(p) = cam.project(light_at(i)) else { continue };
            let r = 0.6 * (0.55 + p.s * 0.6).min(1.4);
            ctx.dot(p.x as f32, p.y as f32, r as f32, ink(0.1));
        }

        // 軌跡：從發射台爬到現在的一條線；底下垂幾條淡淡的線，看得出離地多高
        ctx.set_stroke(ink(0.6));
        ctx.set_line_width(1.3);
        ctx.begin_path();
        pen = false;
        for i in 0..=tip {
            let Some(p) = cam.project(path_at(i as f64)) else { continue };
            if pen {
                ctx.line_to(p.x as f32, p.y as f32);
            } else {
                ctx.move_to(p.x as f32, p.y as f32);
            }
            pen = true;
        }
        if pen && let Some(end) = cam.project(path_at(upto)) {
            ctx.line_to(end.x as f32, end.y as f32);
        }
        ctx.stroke();
        ctx.set_line_width(1.0);
        ctx.set_stroke(ink(0.06));
        for i in (0..=tip).step_by(14) {
            let (Some(a), Some(b)) =
                (cam.project(path_at(i as f64)), cam.project(mul(radial(theta_of(i as f64)), R)))
            else {
                continue;
            };
            ctx.begin_path();
            ctx.move_to(a.x as f32, a.y as f32);
            ctx.line_to(b.x as f32, b.y as f32);
            ctx.stroke();
        }

        // 改版的節點
        for &i in &ms_index {
            if let Some(p) = cam.project(path_at(i as f64)) {
                ctx.dot(p.x as f32, p.y as f32, 3.0, ink(0.75));
            }
        }

        // 發射台：起點地上一個小三角
        if let Some(pad) = cam.project(path_at(0.0)) {
            let (x, y) = (pad.x as f32, pad.y as f32);
            ctx.set_stroke(ink(0.7));
            ctx.begin_path();
            ctx.move_to(x - 6.0, y + 2.0);
            ctx.line_to(x, y - 8.0);
            ctx.line_to(x + 6.0, y + 2.0);
            ctx.close_path();
            ctx.stroke();
        }

        // 現在：軌跡最前端的琥珀點與火箭（`rocketAt`；會動的部分在 `frame` 畫）
        let here = cam.project(path_at(upto)).map_or((0.0, 0.0), |p| (p.x as f32, p.y as f32));
        let th = theta_of(upto);
        let g = gamma_at(upto);
        let dir = norm(add(mul(downrange(th), g.cos()), mul(radial(th), g.sin())));
        let base = path_at(upto);
        let (ra, rb) = (cam.project(base), cam.project(add(base, mul(dir, 20.0))));
        let (nozzle, angle, scale_s) = match (ra, rb) {
            (Some(a), Some(b)) => ((a.x, a.y), (b.y - a.y).atan2(b.x - a.x), a.s),
            _ => ((0.0, 0.0), 0.0, 1.0),
        };
        let img = load_image(ROCKET_WEBP);
        let (rw, rh) = (f64::from(img.width()), f64::from(img.height()));
        let ax = (NOSE[0] - NOZZLE[0]) * rw;
        let ay = (NOSE[1] - NOZZLE[1]) * rh;
        // 火箭畫多長：跟著遠近縮放，窄螢幕再小一點（`rocketLen`）
        let len = ROCKET_LEN * scale_s.clamp(0.6, 1.3) * (w / 1100.0).clamp(0.55, 1.0);
        let sc = len / ax.hypot(ay);
        let rocket = resize_image(&img, (rw * sc).round() as u32, (rh * sc).round() as u32);
        // 縮完取整數像素，實際的比例照縮出來的大小算，噴嘴才對得準
        let (sx, sy) = (f64::from(rocket.width()) / rw, f64::from(rocket.height()) / rh);

        let mut flame_rand = rng(55);
        let flame = (0..(FLAME_RATE * LOOP_S).round() as usize)
            .map(|_| ((flame_rand() - 0.5) * 0.45, 30.0 + flame_rand() * 45.0))
            .collect();

        // 天與地分開留：會閃的星要在地球底下（地平線以下的被地球擋掉）
        Self {
            sky: sky.pixmap,
            ground: ctx.pixmap,
            twinkle,
            rocket,
            nozzle: (nozzle.0 as f32, nozzle.1 as f32),
            angle: angle as f32,
            rocket_rot: (angle - ay.atan2(ax)) as f32,
            rocket_at: ((-NOZZLE[0] * rw * sx) as f32, (-NOZZLE[1] * rh * sy) as f32),
            here,
            flame,
        }
    }
}

impl super::Scene for Log {
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
        ctx.draw_image(&self.sky, 0.0, 0.0);
        for s in &self.twinkle {
            // 亮度只分五階（同 saturn.rs）：大部分的格子裡它們不動，一樣看得出在慢慢閃
            let k = 0.55 + 0.45 * ((s.laps * TAU * p + s.phase).sin() * 2.0).round() / 2.0;
            ctx.dot(s.x, s.y, s.r, ink(s.a * k));
        }
        ctx.draw_image(&self.ground, 0.0, 0.0);

        // 現在：軌跡最前端的琥珀點，一明一暗地脈動
        let (hx, hy) = self.here;
        let pulse = 0.5 + 0.5 * (TAU * PULSE_LAPS * p).sin();
        ctx.set_fill(
            Gradient::radial(hx, hy, 0.0, hx, hy, 16.0 + pulse * 8.0)
                .stop(0.0, amber(0.6))
                .stop(1.0, amber(0.0)),
        );
        ctx.begin_path();
        ctx.arc(hx, hy, 24.0, 0.0, TAU, false);
        ctx.fill();
        ctx.dot(hx, hy, 3.6, amber(1.0));

        // 火焰：從噴嘴往機身的反方向噴，近的是琥珀色、遠的變成墨色。
        // 第 k 個點在 k / FLAME_RATE 秒噴出來，偏角與速度照一圈裡的第幾個（一圈之後同一組再噴一次）
        let (nx, ny) = self.nozzle;
        let count = self.flame.len() as i64;
        let first = ((t - FLAME_LIFE) * FLAME_RATE).floor() as i64 + 1;
        let last = (t * FLAME_RATE).floor() as i64;
        for k in first..=last {
            let life = t - k as f32 / FLAME_RATE;
            let (off, sp) = self.flame[k.rem_euclid(count) as usize];
            let a = self.angle + std::f32::consts::PI + off;
            let q = life / FLAME_LIFE;
            // 對齊 2px 的格子（前端的 `Math.round(x / 2) * 2`）：一顆一顆的方塊，不糊成一團
            let snap = |v: f32| (v / 2.0).round() * 2.0;
            let (px, py) = (snap(nx + a.cos() * sp * life), snap(ny + a.sin() * sp * life));
            ctx.set_fill(if q < 0.35 { amber(0.9 * (1.0 - q)) } else { ink(0.6 * (1.0 - q)) });
            ctx.fill_rect(px, py, 2.0, 2.0);
        }

        // 火箭
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(self.rocket_rot);
        ctx.draw_image(&self.rocket, self.rocket_at.0, self.rocket_at.1);
        ctx.restore();
        ctx.pixmap
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").expect("合法日期")
    }

    /// 海岸線要讀得到、換得成地表座標：格式改了這裡先紅，不會等到分享圖上的海岸線不見才發現
    #[test]
    fn 讀得到海岸線() {
        let (rings, water) = land(&crate::handlers::ground::ground_for(DEFAULT_PAD));
        assert!(rings.len() > 10 && rings.iter().all(|r| r.len() >= 3), "海岸線讀壞了");
        assert_eq!(water.len(), 0, "台灣在海邊，不畫河流");
    }

    /// 軌道從地面出發、一路往上，終點爬到頂
    #[test]
    fn 軌道從地面爬到頂() {
        let counts: Vec<f64> = (0..400).map(f64::from).collect();
        let alt = altitudes(&counts);
        assert!(alt[0].abs() < 1e-9, "起點沒有貼地：{}", alt[0]);
        assert!(alt.windows(2).all(|w| w[1] >= w[0] - 1e-9), "高度有往下掉的地方");
        assert!(alt[399] > ALT_MAX * 0.95, "終點只爬到 {}", alt[399]);
    }

    /// 不管哪一天產圖，畫面都要正常（日誌第一天也是）
    #[test]
    fn 哪一天產圖都畫得出來() {
        let start = day("2025-04-01");
        let tw = crate::handlers::ground::ground_for(DEFAULT_PAD);
        let first = Log::on(start, start, &[start], &tw);
        assert_eq!(super::super::Scene::frame(&first, 0).data().len(), W * H * 4);
        // 里程碑早於起點、或還沒有任何里程碑，都不能炸
        let odd = Log::on(day("2026-10-29"), start, &[day("2020-01-01")], &tw);
        assert_eq!(super::super::Scene::frame(&odd, 0).data().len(), W * H * 4);
        let bare = Log::on(day("2026-10-29"), start, &[], &tw);
        assert_eq!(super::super::Scene::frame(&bare, 0).data().len(), W * H * 4);
        // 內陸的發射台：多了一層河流
        let denver = crate::handlers::ground::ground_for(crate::handlers::ground::LaunchPad {
            lat: 39.7,
            lon: -105.0,
        });
        let inland = Log::on(day("2026-10-29"), start, &[], &denver);
        assert_eq!(super::super::Scene::frame(&inland, 0).data().len(), W * H * 4);
    }
}
