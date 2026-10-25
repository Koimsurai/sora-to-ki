//! 留言頁（`src/components/about/Messages.tsx`、`messagesWave.ts` 與 `blog/SignalLog.tsx` 逐行移植）：
//! 上面是收訊的頻道——一條帶雜訊的線，右端是天線；底下是瀑布圖，每一則留言是一列，
//! 波形擺在 X 頻段頻寬上屬於那個人的頻率，最新的在最上面，回覆窄一點、接在它回的那則底下。
//!
//! 圖上沒有任何留言者的名字、內容、時間戳，也沒有刻度上的數字：瀑布圖只畫時間軸那條點線、
//! 刻度列的底線、每一列的底噪與波形。波形照前端的 `bandPath` 由「一段字」算出形狀，
//! 這裡的字是固定亂數產生的（只拿來決定起伏，不會畫出來），頻率是一組固定、散得開的位置。
//!
//! 構圖：前端的頻道高 180、橫跨整個內容寬；分享圖把它收到 150 高（天線還認得出來、
//! 底下留得出七八列），從 x 360 拉到右邊的天線——左段落在字的漸層底下，像訊號從暗處過來。
//! 瀑布圖只放右半邊（x 744 起）：前端的第三欄（名字與內容）整欄是字，不畫。
//!
//! 動態：前端的雜訊每 33ms 用 `Math.random` 重抽一次——整條線每格都變、每格都等於一大條圖，
//! 所以這裡的雜訊是固定的一條。動的是頁面上「發一則留言」的那段：頻道中間有人打字
//! （字即時變成波形）、送出、那段往右飛進天線、天線亮一下；接著瀑布最上面那一列（最新的那則，
//! 跟打的是同一段字）照波形從左到右描一遍，前緣是琥珀色的點，描完再退回平常的灰。
//! 其餘時間不動，最後一格就是第一格。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "格數與字數都很小；座標是畫布範圍內的浮點數，縮圖的尺寸是正的"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, GROUND, Gradient, Rgba, amber, ink, load_image, resize_image};

/// 一圈 12 秒
const FRAMES: usize = 120;
const FRAME_MS: u32 = 100;
const DT: f32 = FRAME_MS as f32 / 1000.0;

// ── messagesWave.ts ──────────────────────────────────────────────
/// 收訊天線（669×865）：饋源的位置（原圖比例）。畫的時候左右翻過來，碟面朝左上
const DISH_RATIO: f32 = 669.0 / 865.0;
const DISH_FEED: (f32, f32) = (0.7, 0.098);
/// 一個字在波形上佔多寬
const PX_PER_CHAR: f32 = 9.0;
/// 送出的那段飛到天線要多久（秒，之後就不畫了）
const SEND_S: f32 = 1.6;

/// 頻道在分享圖上的範圍（前端是 `.msg-strip`：內容寬 × 180 高）。左端從 360 起：
/// 拉到最左邊的話會貼著左上角的站名過去，而打字的波形在頻道正中間，那會落在字的那一區
const STRIP_X: f32 = 360.0;
const STRIP_Y: f32 = 40.0;
const STRIP_W: f32 = 812.0;
const STRIP_H: f32 = 150.0;

// ── SignalLog ────────────────────────────────────────────────────
/// 一列的頻寬（SVG 的 viewBox 寬；畫面上拉滿那一欄）
const BAND_W: f32 = 600.0;
/// 瀑布圖：刻度列底線的高度、時間軸那條點線的 x、頻寬那一欄的左右
const FALL_TOP: f32 = 212.0;
const FALL_LEFT: f32 = 744.0;
const AXIS_X: f32 = 774.5;
const BAND_LEFT: f32 = 798.0;
const BAND_RIGHT: f32 = 1172.0;

/// 瀑布圖的每一列（由新到舊）：那段字有幾個字、頻率（0–1）、是不是回覆。
/// 前端一列的高是內容那欄撐出來的（名字＋內容＋按鈕，約 100px）；內容不畫，所以列距收緊成
/// 一般的 64、回覆 46，右半邊放得下八列
const ROWS: [(usize, f32, bool); 8] = [
    (28, 0.34, false),
    (38, 0.71, true),
    (64, 0.12, false),
    (22, 0.86, false),
    (90, 0.47, false),
    (30, 0.63, true),
    (12, 0.25, false),
    (54, 0.92, false),
];
const ROW_PITCH: f32 = 64.0;
const REPLY_PITCH: f32 = 46.0;

// ── 時間軸（格） ─────────────────────────────────────────────────
/// 開始打字；一秒打 12 個字，打完最上面那一列的字
const TYPE_START: usize = 20;
const TYPE_CPS: f32 = 12.0;
/// 送出
const SEND_START: usize = 46;
/// 天線亮過之後，最上面那一列從左到右描一遍（格數），再花幾格退回平常的灰
const RESCAN_AFTER: usize = 6;
const RESCAN: usize = 14;
const FADE: usize = 10;

/// 固定的亂數（mulberry32）：雜訊與每一列的「字」都用它，每次產出來都一樣
fn seeded(seed: u32) -> impl FnMut() -> f32 {
    let mut s = seed;
    move || {
        s = s.wrapping_add(0x6d2b_79f5);
        let mut t = (s ^ (s >> 15)).wrapping_mul(0x01 | s);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(0x3d | t))) ^ t;
        ((t ^ (t >> 14)) as f32) / 4_294_967_296.0
    }
}

/// 一段字 → 某個取樣點的高度（-1–1）。同一段字永遠同一個形狀（`sampleOf`）
fn sample_of(chars: &[u32], u: f32, x: f32, t: f32) -> f32 {
    let i = ((u * chars.len() as f32).floor().max(0.0) as usize).min(chars.len() - 1);
    let c = chars[i];
    let amp = 0.25 + ((c * 37) % 97) as f32 / 97.0 * 0.75;
    let env = (PI * (u * 1.02).min(1.0)).sin();
    (x * (0.12 + (c % 13) as f32 * 0.02) + t * 6.0).sin() * amp * env
}

/// 瀑布圖上一則訊號的波形（`bandPath`）：viewBox 寬 `BAND_W`、高 `height` 裡的折線點
fn band_points(chars: &[u32], freq: f32, height: f32, max_share: f32) -> Vec<(f32, f32)> {
    let len = (BAND_W * max_share).min(24.0 + chars.len() as f32 * 3.0);
    let x0 = freq * (BAND_W - len);
    let y = height / 2.0;
    let mut pts = Vec::new();
    let mut x = 0.0;
    while x <= len {
        let v = sample_of(chars, x / len, x, 0.0) * height * 0.42;
        pts.push((x0 + x, y + v));
        x += 1.5;
    }
    pts
}

/// 天線在頻道裡的位置（`dishOf`，頻道座標）。寬取整數，縮好的天線圖才能原尺寸貼上
struct Dish {
    x: f32,
    y: f32,
    dw: f32,
    dh: f32,
    fx: f32,
    fy: f32,
}

fn dish_of(w: f32, h: f32) -> Dish {
    let dh = h - 8.0;
    let dw = (dh * DISH_RATIO).round();
    let x = w - dw;
    let y = 4.0;
    Dish { x, y, dw, dh, fx: x + dw * (1.0 - DISH_FEED.0), fy: y + dh * DISH_FEED.1 }
}

/// 一列：波形的點（已經換成畫布座標）、底噪那條線的高度
struct Row {
    pts: Vec<(f32, f32)>,
    floor: f32,
}

pub struct Messages {
    /// 雜訊、天線（平常的亮度）、瀑布圖：每一格都一樣的部分
    back: Pixmap,
    dish: Pixmap,
    /// 雜訊那條線的點（頻道座標）：天線亮的那幾格要把壓在天線底下的那一小段補回來
    noise: Vec<(f32, f32)>,
    /// 打字與送出的那段字（= 最上面那一列的字）
    text: Vec<u32>,
    top: Row,
    /// 送出的那段尾巴越過天線、天線亮起來的那一格
    arrive: usize,
}

impl Messages {
    pub fn new() -> Self {
        let mut rnd = seeded(0x00c0_ffee);
        // 每一列的「字」：只拿來決定波形的起伏（`sampleOf` 看的是字碼），不會畫出來
        let mut texts: Vec<Vec<u32>> = ROWS
            .iter()
            .map(|&(n, _, _)| (0..n).map(|_| 0x4e00 + (rnd() * 20_000.0) as u32).collect())
            .collect();

        let src = load_image(include_bytes!("../../../../../public/illustrations/dsn-dish.webp"));
        let d = dish_of(STRIP_W, STRIP_H);
        let dish = resize_image(&src, d.dw as u32, d.dh.round() as u32);

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(GROUND);

        // 頻道：天線（平常 0.45）、底下那條雜訊
        let line_end = d.x + d.dw * 0.2;
        let mut noise = Vec::new();
        let mut x = 0.0;
        while x <= line_end {
            noise.push((x, STRIP_H / 2.0 + (rnd() - 0.5) * 3.0));
            x += 3.0;
        }
        ctx.save();
        ctx.translate(STRIP_X, STRIP_Y);
        draw_dish(&mut ctx, &dish, &d, 0.0);
        draw_noise(&mut ctx, &noise);
        ctx.restore();

        // 瀑布圖：刻度列的底線（`.sl-scale` 的 border-bottom）、時間軸的點線（`.sl-stamp` 的 border-right）
        ctx.set_stroke(ink(0.15));
        ctx.begin_path();
        ctx.move_to(FALL_LEFT, FALL_TOP + 0.5);
        ctx.line_to(BAND_RIGHT, FALL_TOP + 0.5);
        ctx.stroke();
        ctx.set_line_dash(&[1.0, 1.0]);
        ctx.begin_path();
        ctx.move_to(AXIS_X, FALL_TOP + 1.0);
        ctx.line_to(AXIS_X, H as f32);
        ctx.stroke();

        let sx = (BAND_RIGHT - BAND_LEFT) / BAND_W;
        let mut row_y = FALL_TOP + 1.0;
        let mut rows = Vec::new();
        for (&(_, freq, reply), chars) in ROWS.iter().zip(&texts) {
            // 回覆：波形窄一點、矮一點（`.is-reply .sl-band` 24px、上緣 12px；一般的 36px、上緣 16px）
            let (top, height, share) = if reply { (12.0, 24.0, 0.4) } else { (16.0, 36.0, 0.6) };
            let band_y = row_y + top;
            let pts = band_points(chars, freq, height, share)
                .into_iter()
                .map(|(x, y)| (BAND_LEFT + x * sx, band_y + y))
                .collect();
            rows.push(Row { pts, floor: band_y + height / 2.0 });
            row_y += if reply { REPLY_PITCH } else { ROW_PITCH };
        }
        for row in &rows {
            // 底噪：整條頻寬上一條細點線（1 5）
            ctx.set_stroke(ink(0.15));
            ctx.set_line_dash(&[1.0, 5.0]);
            ctx.begin_path();
            ctx.move_to(BAND_LEFT, row.floor);
            ctx.line_to(BAND_RIGHT, row.floor);
            ctx.stroke();
            ctx.set_line_dash(&[]);
            stroke_points(&mut ctx, &row.pts, ink(0.7));
        }

        let text = texts.swap_remove(0);
        let top = rows.swap_remove(0);
        let arrive = (SEND_START..FRAMES)
            .find(|&i| {
                let s = (i - SEND_START) as f32 * DT;
                let (x0, _) = sending_span(&text, s, line_end);
                x0 > d.x
            })
            .unwrap_or(FRAMES);
        Self { back: ctx.pixmap, dish, noise, text, top, arrive }
    }
}

/// 天線：左右翻過來貼，亮度 0.45 + 0.5 × flash；亮的時候饋源那裡一圈琥珀色的光
fn draw_dish(ctx: &mut Ctx, dish: &Pixmap, d: &Dish, flash: f32) {
    ctx.save();
    ctx.set_alpha(0.45 + 0.5 * flash);
    ctx.translate(d.x + d.dw, d.y);
    ctx.scale(-1.0, 1.0);
    ctx.draw_image(dish, 0.0, 0.0);
    ctx.restore();
    if flash > 0.0 {
        ctx.set_fill(
            Gradient::radial(d.fx, d.fy, 0.0, d.fx, d.fy, 30.0)
                .stop(0.0, amber(0.7 * flash))
                .stop(1.0, amber(0.0)),
        );
        ctx.begin_path();
        ctx.arc(d.fx, d.fy, 30.0, 0.0, TAU, false);
        ctx.fill();
    }
}

/// 背景的雜訊（頻道座標）：沒有訊號時就只有這個
fn draw_noise(ctx: &mut Ctx, pts: &[(f32, f32)]) {
    stroke_points(ctx, pts, ink(0.25));
}

fn stroke_points(ctx: &mut Ctx, pts: &[(f32, f32)], c: Rgba) {
    ctx.set_stroke(c);
    ctx.set_line_width(1.0);
    ctx.begin_path();
    for &(x, y) in pts {
        ctx.line_to(x, y);
    }
    ctx.stroke();
}

/// 送出的那段在頻道上的左右兩端（送出後 `s` 秒）：從中間出發，越飛越快
fn sending_span(text: &[u32], s: f32, line_end: f32) -> (f32, f32) {
    let mid = line_end * 0.5;
    let off = s * s * STRIP_W * 0.9;
    let len = (line_end * 0.7).min(text.len() as f32 * PX_PER_CHAR);
    (mid - len / 2.0 + off, mid + len / 2.0 + off)
}

/// 頻道上一段字的波形（`wave`）
fn wave(ctx: &mut Ctx, chars: &[u32], x0: f32, x1: f32, alpha: f32, t: f32) {
    if chars.is_empty() || alpha <= 0.0 {
        return;
    }
    let y = STRIP_H / 2.0;
    ctx.set_stroke(ink(alpha));
    ctx.begin_path();
    let mut x = x0;
    while x <= x1 {
        let v = sample_of(chars, (x - x0) / (x1 - x0).max(1.0), x, t) * STRIP_H * 0.32;
        ctx.line_to(x, y + v);
        x += 1.5;
    }
    ctx.stroke();
}

impl super::Scene for Messages {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        let t = index as f32 * DT;
        let d = dish_of(STRIP_W, STRIP_H);
        let line_end = d.x + d.dw * 0.2;
        let mid = line_end * 0.5;

        // 天線亮一下：每秒退 1.4
        let flash =
            if index >= self.arrive { (1.0 - (index - self.arrive) as f32 * DT * 1.4).max(0.0) } else { 0.0 };
        let typed = if (TYPE_START..SEND_START).contains(&index) {
            (((index - TYPE_START + 1) as f32 * DT * TYPE_CPS) as usize).min(self.text.len())
        } else {
            0
        };
        let sending =
            (index >= SEND_START).then(|| (index - SEND_START) as f32 * DT).filter(|&s| s <= SEND_S);

        if flash > 0.0 || typed > 0 || sending.is_some() {
            ctx.save();
            ctx.translate(STRIP_X, STRIP_Y);
            // 前端畫在頻道那張畫布上，超出畫布的（天線那圈光的上緣）就沒了
            ctx.begin_path();
            ctx.rect(0.0, 0.0, STRIP_W, STRIP_H);
            ctx.clip();
            if flash > 0.0 {
                // 天線那一塊重畫：底色蓋掉平常亮度的那張、畫亮的，再把壓在天線底下那一小段雜訊補回來
                ctx.set_fill(Rgba(GROUND, 1.0));
                ctx.fill_rect(d.x, d.y, d.dw, d.dh);
                draw_dish(&mut ctx, &self.dish, &d, flash);
                ctx.save();
                ctx.begin_path();
                ctx.rect(d.x, d.y, d.dw, d.dh);
                ctx.clip();
                draw_noise(&mut ctx, &self.noise);
                ctx.restore();
            }
            // 頻道上的東西只畫到天線底下（前端的 clip）
            ctx.begin_path();
            ctx.rect(0.0, 0.0, line_end, STRIP_H);
            ctx.clip();
            if typed > 0 {
                let len = (line_end * 0.7).min(typed as f32 * PX_PER_CHAR);
                wave(&mut ctx, &self.text[..typed], mid - len / 2.0, mid + len / 2.0, 0.9, t);
            }
            if let Some(s) = sending {
                let (x0, x1) = sending_span(&self.text, s, line_end);
                wave(&mut ctx, &self.text, x0, x1, (0.9 - s * 0.4).max(0.0), t);
                // 訊號的前緣
                ctx.dot(x1, STRIP_H / 2.0, 3.0, amber((1.0 - s * 0.5).max(0.0)));
            }
            ctx.restore();
        }

        // 最上面那一列（剛收到的那則）：照波形從左到右描一遍（滑過時的 --paper），再退回平常的灰
        let scan = self.arrive + RESCAN_AFTER;
        if index >= scan && index < scan + RESCAN + FADE {
            let k = index - scan;
            let pts = &self.top.pts;
            let (upto, alpha) = if k < RESCAN {
                (((k + 1) as f32 / RESCAN as f32 * (pts.len() - 1) as f32) as usize, 1.0)
            } else {
                (pts.len() - 1, 1.0 - (k - RESCAN + 1) as f32 / (FADE + 1) as f32)
            };
            stroke_points(&mut ctx, &pts[..=upto], ink(alpha));
            if k < RESCAN {
                let (hx, hy) = pts[upto];
                ctx.dot(hx, hy, 3.0, amber(1.0));
            }
        }
        ctx.pixmap
    }
}
