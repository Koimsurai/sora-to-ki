//! 關於的分享圖（`src/components/about/fallSky.ts` 逐行移植）：整頁是一段下墜，取開頭「坐穩了。」
//! 那一段——星被往下掉的速度拉成一道道細線，右邊一具掛著傘的返回艙在降，最右邊是高度計，
//! 琥珀點（讀者）沿著高度計往下掉。
//!
//! 頁面上返回艙要到快落地時才從上面降下來（那時星已經淡掉、地平線升上來了）；分享圖只有一格，
//! 把它跟開頭的下墜放在同一個畫面：星照下墜時的樣子畫、地面與雲層不畫，返回艙照還在空中的樣子
//! （傘張著、被風帶得偏一點），高度計只畫尺與刻度，讀數與標籤（字）不畫。
//!
//! 動態：只有高度計上的琥珀點一路往下掉（到底淡掉，從頂上再淡進來），第一格它落在尺的四成處。
//! 星與返回艙都不動：星一動整片都變；返回艙照前端那樣擺（`sin(t × 0.9) × 0.07`）試過，
//! 傘的線每一格都整片挪一兩個像素，一格要存九千個像素，整張圖到 4 MB（只有點在動時不到十分之一）。
//! 所以它停在擺到一半的樣子。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::too_many_arguments,
    reason = "格數與星數都很小；座標是畫布範圍內的浮點數，插圖的尺寸是正的常數；\
              draw_canopy 照抄前端 drawCanopy 的參數，逐行對得上"
)]

use std::f32::consts::TAU;

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, amber, ink, load_image, resize_image};
use super::notes::seeded;

/// 一圈 15 秒、每格 100ms
const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;

/// 星的數量：跟前端桌機版一樣（窄螢幕是 280）
const STARS: usize = 720;
/// 下墜的速度（0 到 1；前端是捲動速度除以 2500 px/s）。0.3 大約是一般往下捲的速度，
/// 星拉成 10–60px 的線，看得出在往下掉、又不會整片變成雨
const SPEED: f32 = 0.3;

/// 返回艙插圖（public/illustrations/reentry-parachute.webp）：原圖尺寸、傘與艙的分界、吊帶的位置、腳底。
/// 插圖只用下面艙體那一段，傘用線畫（`draw_canopy`）
const CW: f32 = 483.0;
const CH: f32 = 900.0;
const SPLIT: f32 = 0.78;
const RISER: [f32; 2] = [0.5, 0.6];
const FOOT: f32 = 0.94;
const CHUTE: &[u8] = include_bytes!("../../../../../public/illustrations/reentry-parachute.webp");

/// 返回艙畫多高。前端是 `min(250, h × 0.34)`（630 高時 214px），那是落地時跟地平線、樹一起
/// 出現的大小；分享圖上它是右半邊唯一的主角，放大到 290（傘頂到艙底約 1.31 倍，380px）
const DH: f32 = 290.0;
/// 艙的中線：照前端的 `gx = w × 0.76`
const GX: f32 = W as f32 * 0.76;
/// 艙底（腳）的高度：前端是踩在地平線上；這裡讓傘頂（吊帶上方約 0.97 × DH）到艙底
/// （吊帶下方約 0.34 × DH）落在畫面正中
const FOOT_Y: f32 = 500.0;

/// 高度計：尺在右邊（`w - 60`），從 96 到 `h - 80`
const METER_X: f32 = W as f32 - 60.0;
const METER_Y0: f32 = 96.0;
const METER_Y1: f32 = H as f32 - 80.0;
/// 每一年一道刻度：前端是 `(那一年的中線 - h / 2) / 落地的位置`，跟著版面算。這裡是在開發站
/// 1200×630（跟分享圖同尺寸）量到的八個值，版面大改時回頭重量
const CHAPTER_TICKS: [f32; 8] = [0.0, 0.0787, 0.1811, 0.2992, 0.4173, 0.5276, 0.6299, 0.7402];

/// 返回艙停在擺到哪裡（前端在空中時是 `sin(t × 0.9) × 0.07`，這裡取其中一刻）。
/// 正的是傘頂往右偏
const SWING: f32 = 0.045;
/// 第一格時琥珀點在尺的哪裡（0 是頂、1 是底），與它淡進淡出各佔一圈的多少
const DOT_START: f32 = 0.4;
const DOT_FADE: f32 = 0.06;

const fn clamp01(x: f32) -> f32 {
    x.clamp(0.0, 1.0)
}

/// 前端的 `smooth(a, b, x)`（a 可以比 b 大，那就是反過來的）
fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let t = clamp01((x - a) / (b - a));
    t * t * (3.0 - 2.0 * t)
}

/// 降落傘（線畫，`drawCanopy`）：傘頂、一片一片的傘衣（從頂點拉到下緣的弧線）、下緣一段一段往上鼓的
/// 扇形、吊繩收到吊帶上。(rx, ry) 是吊帶的位置、`width` 是傘張開時的寬度、`breathe` 是前端的
/// `sin(t × 2.1)` 那一項。c（0 到 1）是著地後過了多久——分享圖上傘一直在空中，呼叫端給 0，
/// 留著這個參數是為了跟前端逐行對得上
fn draw_canopy(ctx: &mut Ctx, rx: f32, ry: f32, width: f32, swing: f32, breathe: f32, c: f32, ground_y: f32) {
    let l = width * 1.15;
    let breathe = 1.0 + breathe * 0.035 * (1.0 - c);
    let h = width * (0.42 * breathe * (1.0 - c) + 0.06 * c);
    let half = (width / 2.0) * (1.0 - 0.3 * c);
    let reach = l * (1.0 - 0.12 * c);
    let ang = swing + c * 1.45;
    let (sn, cs) = ang.sin_cos();
    // 傘的座標（吊帶在原點、往上是負的）轉到畫面上；倒下時不會穿進地面
    let p = |x: f32, y: f32| (rx + x * cs - y * sn, (ry + x * sn + y * cs).min(ground_y - 0.5));
    let n = 7;
    let skirt: Vec<f32> = (0..=n).map(|i| -half + (i as f32 * 2.0 * half) / n as f32).collect();
    let top = -reach;
    let apex = p(0.0, top - h);
    ctx.set_line_width(1.0);
    ctx.set_stroke(ink(0.8));
    // 傘頂的外形
    ctx.begin_path();
    let l0 = p(-half, top);
    ctx.move_to(l0.0, l0.1);
    let c1 = p(-half * 0.95, top - h * 1.25);
    let c2 = p(half * 0.95, top - h * 1.25);
    let r0 = p(half, top);
    ctx.bezier_curve_to(c1.0, c1.1, c2.0, c2.1, r0.0, r0.1);
    ctx.stroke();
    // 傘衣的縫線：從頂點往下緣，越外側越彎
    ctx.set_stroke(ink(0.45));
    for &x in &skirt[1..skirt.len() - 1] {
        let q = p(x * 0.78, top - h * 0.92);
        let e = p(x, top);
        ctx.begin_path();
        ctx.move_to(apex.0, apex.1);
        ctx.quadratic_curve_to(q.0, q.1, e.0, e.1);
        ctx.stroke();
    }
    // 下緣：一段一段往上鼓的扇形
    ctx.set_stroke(ink(0.7));
    ctx.begin_path();
    for i in 0..n {
        let a = p(skirt[i], top);
        let b = p(skirt[i + 1], top);
        let m = p(f32::midpoint(skirt[i], skirt[i + 1]), top - h * 0.2);
        if i == 0 {
            ctx.move_to(a.0, a.1);
        }
        ctx.quadratic_curve_to(m.0, m.1, b.0, b.1);
    }
    ctx.stroke();
    // 吊繩：繃直的；著地後鬆掉、往下垂
    ctx.set_stroke(ink(0.35));
    let root = p(0.0, 0.0);
    for &x in &skirt {
        let e = p(x, top);
        let sag = p(x * 0.5, top / 2.0 + width * 0.35 * c);
        ctx.begin_path();
        ctx.move_to(e.0, e.1);
        ctx.quadratic_curve_to(sag.0, sag.1, root.0, root.1);
        ctx.stroke();
    }
}

pub struct About {
    /// 星、高度計的尺、返回艙（不動的部分）
    back: Pixmap,
}

impl Default for About {
    fn default() -> Self {
        Self::new()
    }
}

impl About {
    pub fn new() -> Self {
        let (w, h) = (W as f32, H as f32);
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);
        ctx.set_line_width(1.0);

        // 星：釘在不同深度上，往下掉時往上掠過（近的快、遠的慢），掉得快就拉成線。
        // 分享圖停在頁面最上面（捲了 0），所以位置就是各自的 y；拉多長照 SPEED
        let mut rnd = seeded(0.37);
        for _ in 0..STARS {
            let near = rnd().powf(2.2);
            let (sx, sy) = (rnd(), rnd());
            let (size, a, depth) = (0.5 + near * 1.6, 0.16 + near * 0.6, 0.12 + near * 1.1);
            let span = h + 40.0;
            let y = (sy * span).rem_euclid(span) - 20.0;
            let x = sx * (w - 100.0) + 10.0;
            let len = SPEED * 160.0 * depth;
            if len > 1.0 {
                ctx.set_stroke(Gradient::linear(x, y, x, y + len).stop(0.0, ink(a)).stop(1.0, ink(0.0)));
                ctx.begin_path();
                ctx.move_to(x, y);
                ctx.line_to(x, y + len);
                ctx.stroke();
            }
            ctx.set_fill(ink(a));
            ctx.fill_rect(x - size / 2.0, y - size / 2.0, size, size);
        }

        // 高度計：一條尺、每一年一道刻度（記號跟著琥珀點動，在 `frame` 畫）
        ctx.set_stroke(ink(0.22));
        ctx.begin_path();
        ctx.move_to(METER_X, METER_Y0);
        ctx.line_to(METER_X, METER_Y1);
        ctx.stroke();
        ctx.set_stroke(ink(0.35));
        for k in CHAPTER_TICKS {
            let y = METER_Y0 + (METER_Y1 - METER_Y0) * k;
            ctx.begin_path();
            ctx.move_to(METER_X - 5.0, y);
            ctx.line_to(METER_X, y);
            ctx.stroke();
        }

        // 返回艙：掛在傘下，停在擺到一半的樣子（見檔頭）。插圖先縮到要貼的大小再貼
        // （見 `canvas::resize_image`），只貼下面艙體那一段
        let dh = DH;
        let dw = CW * (dh / CH);
        let chute = resize_image(&load_image(CHUTE), dw.round() as u32, dh.round() as u32);
        let (iw, ih) = (chute.width() as f32, chute.height() as f32);
        let left = GX - dw / 2.0;
        let top_y = FOOT_Y - FOOT * dh;
        let rx = left + RISER[0] * dw;
        let ry = top_y + RISER[1] * dh;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(SWING);
        ctx.translate(-rx, -ry);
        ctx.draw_image_sub(
            &chute,
            0.0,
            SPLIT * ih,
            iw,
            (1.0 - SPLIT) * ih,
            left,
            top_y + SPLIT * dh,
            dw,
            (1.0 - SPLIT) * dh,
        );
        ctx.restore();
        // 傘：用線畫（傘頂、一片一片的傘衣、下緣的扇形、吊繩）。呼吸停在中間（0），
        // 空中沒有地面，地面放到無限遠
        draw_canopy(&mut ctx, rx, ry + 2.0, dw * 1.15, SWING, 0.0, 0.0, f32::INFINITY);

        Self { back: ctx.pixmap }
    }
}

impl super::Scene for About {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let p = index as f32 / FRAMES as f32;
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);

        // 琥珀點：讀者，沿著高度計往下掉；記號（尺上那一小橫）跟著它。
        // 一圈掉完一趟，到底淡掉、從頂上再淡進來
        let at = (p + DOT_START).fract();
        let fade = smooth(0.0, DOT_FADE, at) * smooth(1.0, 1.0 - DOT_FADE, at);
        if fade > 0.0 {
            let (x, y) = (METER_X, METER_Y0 + (METER_Y1 - METER_Y0) * at);
            ctx.set_alpha(fade);
            ctx.set_stroke(ink(0.7));
            ctx.begin_path();
            ctx.move_to(x - 8.0, y);
            ctx.line_to(x + 3.0, y);
            ctx.stroke();
            // 下墜得越快，上面拖出一道越長的光
            let tail = SPEED * 60.0;
            ctx.set_stroke(Gradient::linear(x, y, x, y - tail).stop(0.0, amber(0.6)).stop(1.0, amber(0.0)));
            ctx.set_line_width(1.4);
            ctx.begin_path();
            ctx.move_to(x, y);
            ctx.line_to(x, y - tail);
            ctx.stroke();
            ctx.set_line_width(1.0);
            ctx.set_fill(Gradient::radial(x, y, 0.0, x, y, 16.0).stop(0.0, amber(0.5)).stop(1.0, amber(0.0)));
            ctx.begin_path();
            ctx.arc(x, y, 16.0, 0.0, TAU, false);
            ctx.fill();
            ctx.dot(x, y, 3.0, amber(1.0));
        }
        ctx.pixmap
    }
}
