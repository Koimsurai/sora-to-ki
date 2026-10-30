//! 設備頁的工程概念設計圖（`src/components/about/Setup.tsx`、`setupDraw.ts`、`setupSheets.ts` 逐行移植）：
//! 第一張圖紙 THE WHITE BUILD——爆炸軸測的線稿當底稿，點格、對位記號、編號圈、引線、尺寸線由程式疊上去；
//! 滑過一個零件時底稿退暗，那個零件染成琥珀色、引線換成琥珀色。
//!
//! 只畫線與圈：零件表、標題欄、尺寸線上的數字、編號圈裡的編號都是字，一律不畫
//! （站長不想讓型號、品牌之類的東西出現在分享圖上；這裡的零件 id 只是對照前端用的註解）。
//!
//! 構圖：前端的圖紙是 1200×900，底稿佔左邊 66%；分享圖矮、左邊是字，所以底稿縮到 520px 寬、
//! 靠右擺（x 662 起，見 `ART_W`），零件表的位置空著。最左邊那片側板落在字的漸層邊緣，淡一點。
//!
//! 動態：一直有一個零件是「滑過」的狀態（所以底稿一直是退暗的 0.45，不會整片忽明忽暗——
//! 那會讓每一格都等於整張圖）。輪流換到下一個零件時，它的引線照「設計圖描出來」那段的長法
//! 從編號圈長到零件上，前緣是配線圖上跑的那種琥珀色訊號點（`pulse`）；長到了，零件才亮起來。
//! 三個零件輪一圈剛好回到第一格。
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "格數與零件數都很小；座標是畫布範圍內的浮點數，縮圖的尺寸是正的"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, Gradient, Rgba, amber, amber_rgb, ground, ink, load_image, resize_image};

/// 一圈 15 秒：三個零件各 5 秒
const FRAMES: usize = 150;
const FRAME_MS: u32 = 100;
/// 一個零件亮著的那一段有幾格：前 `SWITCH` 格亮著，接著換到下一個、引線花 `TRACE` 格長過去
const SEGMENT: usize = FRAMES / LIT.len();
const SWITCH: usize = 35;
/// 前端的引線在描出來的進度 0.3–0.7 之間長完（`DRAWING_MS` 1600ms 的 40%，約 0.64 秒）
const TRACE: usize = 7;

/// 點格的間距（`setupDraw.ts` 的 `GRID`）
const GRID: f32 = 24.0;
/// 編號圈的半徑（`Setup.tsx` 的 `BALLOON_R`，跟 `.su-balloon` 的 22px 一樣）
const BALLOON_R: f32 = 11.0;
/// 底稿在分享圖上的位置與寬（高照底稿的比例，約 434）。前端是圖紙寬的 2%／7%／66%（1200 寬時 792px），
/// 這裡縮到 520px、靠右：左下角那顆顯示卡的編號圈（底稿的 9%）要落在字欄（到 692px）的右邊，
/// 不然英文副標換行時會壓在它上面；右邊電源的編號圈（97%）又得留在畫面裡，寬度就只剩這麼多
const ART_X: f32 = 662.0;
const ART_Y: f32 = 96.0;
const ART_W: u32 = 520;

/// 底稿上的一個零件（`setupSheets.ts` 的 `Callout`）：範圍（百分比的多邊形，同 `pct(...)`）、
/// 引線落在哪（`at`）、編號圈擺在哪（`balloon`），都是底稿寬高的百分比
struct Part {
    poly: &'static [&'static [f32]],
    at: [f32; 2],
    balloon: [f32; 2],
}

/// `WHITE_BUILD.parts`，順序照前端（編號圈的 1–9）
const PARTS: [Part; 9] = [
    // rtx-4070ti-super
    Part {
        poly: &[&[18.0, 69.0, 22.5, 66.0, 44.5, 77.0, 44.5, 91.0, 43.0, 92.5, 21.0, 84.5, 18.0, 80.0]],
        at: [31.0, 80.0],
        balloon: [9.0, 90.0],
    },
    // ryzen-9900x
    Part {
        poly: &[&[47.0, 44.6, 50.3, 42.6, 53.6, 44.6, 50.3, 46.8]],
        at: [50.3, 44.7],
        balloon: [59.0, 36.0],
    },
    // eskimo-360
    Part {
        poly: &[
            &[36.5, 6.5, 44.5, 1.5, 70.0, 17.5, 69.5, 23.0, 60.5, 26.5, 36.5, 10.5],
            &[36.5, 10.0, 41.0, 11.0, 46.5, 33.0, 53.5, 33.5, 53.5, 41.5, 46.0, 41.5, 44.5, 35.0, 36.5, 16.0],
        ],
        at: [53.0, 13.0],
        balloon: [78.0, 7.0],
    },
    // xpg-lancer
    Part {
        poly: &[&[53.5, 44.5, 56.5, 42.0, 65.5, 47.5, 65.5, 53.0, 62.0, 54.5, 53.5, 48.0]],
        at: [60.0, 48.0],
        balloon: [81.0, 35.0],
    },
    // b650-a
    Part {
        poly: &[&[31.0, 60.5, 39.0, 50.5, 49.5, 47.0, 60.0, 54.0, 57.0, 60.0, 45.0, 71.5, 31.0, 61.5]],
        at: [37.0, 60.0],
        balloon: [27.0, 50.0],
    },
    // crucial-t500
    Part {
        poly: &[&[48.5, 73.0, 50.0, 72.0, 57.5, 76.5, 56.0, 78.5]],
        at: [53.0, 75.2],
        balloon: [63.0, 70.0],
    },
    // kioxia-exceria
    Part {
        poly: &[&[45.0, 77.0, 46.5, 76.0, 54.0, 80.5, 52.5, 82.5]],
        at: [49.5, 79.3],
        balloon: [52.0, 90.0],
    },
    // leadex-vii
    Part {
        poly: &[&[
            73.5, 70.0, 84.0, 70.0, 87.5, 69.5, 95.0, 74.0, 95.0, 90.0, 86.0, 95.0, 79.0, 90.5, 79.0, 76.0,
        ]],
        at: [87.0, 82.0],
        balloon: [97.0, 63.0],
    },
    // model-5
    Part {
        poly: &[
            &[1.5, 27.0, 23.5, 11.5, 24.5, 13.0, 24.5, 47.0, 13.0, 55.0, 13.0, 73.5, 1.5, 66.0],
            &[28.5, 33.0, 46.5, 20.0, 78.0, 40.5, 77.5, 86.0, 59.5, 98.5, 55.0, 98.0, 28.5, 82.0],
        ],
        at: [72.0, 62.0],
        balloon: [67.0, 99.0],
    },
];

/// 輪流亮的三個零件（`PARTS` 的索引）：顯示卡、水冷排、電源——三個都大、都在畫面右半邊，
/// 一個在下、一個在上、一個在右，亮起來時整張圖的三個角落都輪得到
const LIT: [usize; 3] = [0, 2, 7];

/// `WHITE_BUILD.dims`（水冷排那條 360 的尺寸線；數字不畫）：[a, b, off]，底稿的百分比
const DIM: [[f32; 2]; 3] = [[44.0, 1.5], [69.8, 17.5], [2.2, -3.4]];

/// 底稿在畫布上的範圍
#[derive(Clone, Copy)]
struct Art {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

impl Art {
    /// 底稿上的百分比座標 → 畫布座標（前端的 `at`）
    fn at(self, p: [f32; 2]) -> (f32, f32) {
        (self.x + p[0] / 100.0 * self.w, self.y + p[1] / 100.0 * self.h)
    }

    /// 一個零件的引線：從編號圈的邊緣到零件上的那一點（太短的不畫，同前端）
    fn leader(self, part: &Part) -> Option<((f32, f32), (f32, f32))> {
        let (bx, by) = self.at(part.balloon);
        let (cx, cy) = self.at(part.at);
        let len = (cx - bx).hypot(cy - by);
        if len <= BALLOON_R {
            return None;
        }
        let (ux, uy) = ((cx - bx) / len, (cy - by) / len);
        Some(((bx + ux * BALLOON_R, by + uy * BALLOON_R), (cx, cy)))
    }
}

/// 圖紙底下的點格與左上、右上、左下三個角的對位記號（`drawGrid`，鋪完的那一刻：reveal = 1）
fn draw_grid(ctx: &mut Ctx, w: f32, h: f32) {
    let reach = w.hypot(h) * 1.05;
    let mut y = GRID / 2.0;
    while y < h {
        let mut x = GRID / 2.0;
        while x < w {
            let d = x.hypot(y);
            // 剛鋪到的那一圈亮一點，像墨剛印上去（鋪完時只剩離左上角最遠的那個角）
            let fresh = (1.0 - (reach - d) / 120.0).max(0.0);
            ctx.set_fill(if fresh > 0.0 { amber(0.15 + 0.5 * fresh) } else { ink(0.13) });
            ctx.fill_rect(x, y, 1.0, 1.0);
            x += GRID;
        }
        y += GRID;
    }
    ctx.set_stroke(ink(0.35));
    ctx.set_line_width(1.0);
    for (x, y, dx, dy) in [(0.5, 0.5, 1.0, 1.0), (w - 0.5, 0.5, -1.0, 1.0), (0.5, h - 0.5, 1.0, -1.0)] {
        ctx.begin_path();
        ctx.move_to(x + dx * 18.0, y);
        ctx.line_to(x, y);
        ctx.line_to(x, y + dy * 18.0);
        ctx.stroke();
    }
}

/// 一圈很淡的琥珀色光：亮起來的那一塊底下墊著（`halo`）
fn halo(ctx: &mut Ctx, x: f32, y: f32, r: f32) {
    ctx.set_fill(Gradient::radial(x, y, 0.0, x, y, r).stop(0.0, amber(0.22)).stop(1.0, amber(0.0)));
    ctx.fill_rect(x - r, y - r, r * 2.0, r * 2.0);
}

/// 尺寸線兩端的箭頭（實心小三角，尖端在 (x, y)，朝 ang 的方向）
fn arrow(ctx: &mut Ctx, x: f32, y: f32, ang: f32) {
    let s = 6.0;
    ctx.begin_path();
    ctx.move_to(x, y);
    ctx.line_to(x - s * (ang - 0.3).cos(), y - s * (ang - 0.3).sin());
    ctx.line_to(x - s * (ang + 0.3).cos(), y - s * (ang + 0.3).sin());
    ctx.close_path();
    ctx.fill();
}

/// 一道訊號：一個亮點拖一小段尾巴（`pulse`，上行的琥珀色那種）。`at` 把 0–1 的進度換成座標
fn pulse(ctx: &mut Ctx, at: impl Fn(f32) -> (f32, f32), p: f32) {
    for k in (0..=4).rev() {
        let q = p - k as f32 * 0.012;
        if !(0.0..=1.0).contains(&q) {
            continue;
        }
        let (x, y) = at(q);
        let a = if k == 0 { 0.95 } else { 0.35 * (1.0 - k as f32 / 5.0) };
        ctx.dot(x, y, if k == 0 { 2.2 } else { 1.4 }, amber(a));
    }
}

/// 底稿染成琥珀色的一份（`tintOf`：畫上底稿、`source-in` 填琥珀色 → 線的形狀、琥珀的顏色）
fn tint_of(art: &Pixmap) -> Pixmap {
    let mut out = art.clone();
    for px in out.data_mut().as_chunks_mut::<4>().0 {
        let a = u16::from(px[3]);
        for (c, v) in px[..3].iter_mut().zip(amber_rgb()) {
            *c = ((u16::from(v) * a + 127) / 255) as u8;
        }
    }
    out
}

pub struct Setup {
    art: Art,
    /// 點格、對位記號、退暗的底稿：每一格都一樣的部分
    back: Pixmap,
    /// `LIT` 每個零件亮起來時疊上去的那一層：底下那圈光、範圍裡染成琥珀色的底稿（帶光暈）
    lit: Vec<Pixmap>,
}

impl Setup {
    pub fn new() -> Self {
        let src =
            load_image(include_bytes!("../../../../../public/illustrations/setup/sheet-white-build.webp"));
        let art_h = (ART_W as f32 * src.height() as f32 / src.width() as f32).round();
        // 前端的底稿是 <img> 縮到圖紙上，瀏覽器縮小時會好好重新取樣；這裡先縮好再原尺寸貼
        let img = resize_image(&src, ART_W, art_h as u32);
        let art = Art { x: ART_X, y: ART_Y, w: ART_W as f32, h: art_h };

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(ground());
        draw_grid(&mut ctx, W as f32, H as f32);
        // 滑過零件時底稿退暗（`.su-sheet.has-on .su-art { opacity: 0.45 }`）
        ctx.set_alpha(0.45);
        ctx.draw_image(&img, art.x, art.y);

        let tint = tint_of(&img);
        let lit = LIT
            .iter()
            .map(|&i| {
                let part = &PARTS[i];
                let mut ctx = Ctx::new(W as u32, H as u32);
                let (cx, cy) = art.at(part.at);
                halo(&mut ctx, cx, cy, art.w * 0.12);
                // 範圍裡疊上琥珀色的底稿，帶一圈光（shadowBlur 8）
                ctx.save();
                ctx.begin_path();
                for poly in part.poly {
                    for (k, &uv) in poly.as_chunks::<2>().0.iter().enumerate() {
                        let (x, y) = art.at(uv);
                        if k == 0 { ctx.move_to(x, y) } else { ctx.line_to(x, y) }
                    }
                    ctx.close_path();
                }
                ctx.clip();
                ctx.set_shadow(amber(0.9), 8.0);
                ctx.draw_image(&tint, art.x, art.y);
                ctx.restore();
                ctx.pixmap
            })
            .collect();
        Self { art, back: ctx.pixmap, lit }
    }

    /// 尺寸線（`drawDrawing` 的後半，拉滿的那一刻：pull = 1；數字與它底下那塊底色不畫）
    fn draw_dim(&self, ctx: &mut Ctx) {
        let [a, b, off] = DIM;
        let (ax, ay) = self.art.at(a);
        let (bx, by) = self.art.at(b);
        let (ox, oy) = (off[0] / 100.0 * self.art.w, off[1] / 100.0 * self.art.h);
        let (a2x, a2y, b2x, b2y) = (ax + ox, ay + oy, bx + ox, by + oy);
        ctx.set_stroke(ink(0.55));
        ctx.set_fill(ink(0.75));
        ctx.set_line_width(1.0);
        // 延伸線：從量的那兩點往外拉，超過尺寸線一點點
        let ext = 1.0 + 6.0 / ox.hypot(oy).max(1.0);
        ctx.set_line_dash(&[]);
        ctx.begin_path();
        ctx.move_to(ax + ox * 0.15, ay + oy * 0.15);
        ctx.line_to(ax + ox * ext, ay + oy * ext);
        ctx.move_to(bx + ox * 0.15, by + oy * 0.15);
        ctx.line_to(bx + ox * ext, by + oy * ext);
        ctx.stroke();
        let ang = (b2y - a2y).atan2(b2x - a2x);
        ctx.begin_path();
        ctx.move_to(a2x, a2y);
        ctx.line_to(b2x, b2y);
        ctx.stroke();
        arrow(ctx, a2x, a2y, ang + PI);
        arrow(ctx, b2x, b2y, ang);
    }
}

impl super::Scene for Setup {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        // 這一格滑過的是哪一個零件（`on`），它的引線描到哪裡（`grow`，1 是描完、零件亮著）
        let seg = (index / SEGMENT) % LIT.len();
        let f = index % SEGMENT;
        let (slot, grow) = if f < SWITCH {
            (seg, 1.0)
        } else {
            ((seg + 1) % LIT.len(), ((f - SWITCH + 1) as f32 / TRACE as f32).min(1.0))
        };
        let on = LIT[slot];

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        if grow >= 1.0 {
            ctx.draw_image(&self.lit[slot], 0.0, 0.0);
        }

        // 引線：從編號圈的邊緣拉到零件上的一個點；亮著的那個是琥珀色
        ctx.set_line_width(1.0);
        for (i, part) in PARTS.iter().enumerate() {
            let Some(((sx, sy), (cx, cy))) = self.art.leader(part) else { continue };
            let lit = i == on && grow >= 1.0;
            let color = if lit { amber(0.95) } else { ink(0.4) };
            ctx.set_stroke(color);
            ctx.begin_path();
            ctx.move_to(sx, sy);
            ctx.line_to(cx, cy);
            ctx.stroke();
            ctx.dot(cx, cy, if lit { 3.0 } else { 2.0 }, color);
            if i == on && grow < 1.0 {
                // 換到這個零件：引線照描出來的那段從編號圈長出去，前緣是一顆琥珀色的訊號點
                let along = |p: f32| (sx + (cx - sx) * p, sy + (cy - sy) * p);
                let (ex, ey) = along(grow);
                ctx.set_stroke(amber(0.95));
                ctx.begin_path();
                ctx.move_to(sx, sy);
                ctx.line_to(ex, ey);
                ctx.stroke();
                pulse(&mut ctx, along, grow);
            }
        }

        self.draw_dim(&mut ctx);

        // 編號圈（DOM 疊在畫布上面）：墊一層紙色、細框；滑過的那個整顆填成琥珀色。編號是字，不畫
        for (i, part) in PARTS.iter().enumerate() {
            let (bx, by) = self.art.at(part.balloon);
            let hit = i == on;
            ctx.dot(bx, by, BALLOON_R, if hit { amber(1.0) } else { Rgba(ground(), 1.0) });
            ctx.set_stroke(if hit { amber(1.0) } else { ink(0.7) });
            ctx.begin_path();
            ctx.arc(bx, by, BALLOON_R - 0.5, 0.0, TAU, false);
            ctx.stroke();
        }
        ctx.pixmap
    }
}

/// 沒用原站白色主機圖紙的站（上傳自己的圖、圖紙包、或第一艙沒開）：別人的站分享出去不能還是原作者的主機。
/// 只畫點格與退暗的貨艙俯視圖（`bay-top.webp`，畫面上那個空貨艙），不會動
pub struct SetupBare {
    back: Pixmap,
}

impl Default for SetupBare {
    fn default() -> Self {
        Self::new()
    }
}

impl SetupBare {
    pub fn new() -> Self {
        let src = load_image(include_bytes!("../../../../../public/illustrations/setup/bay-top.webp"));
        // 直的那張（1493×2000）：高度貼著右半邊的圖紙區，跟原本的底稿放在同一塊
        let h = (H as f32 - ART_Y * 2.0).max(1.0);
        let w = (h * src.width() as f32 / src.height() as f32).round();
        let img = resize_image(&src, w as u32, h as u32);
        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.clear(ground());
        draw_grid(&mut ctx, W as f32, H as f32);
        ctx.set_alpha(0.45);
        ctx.draw_image(&img, ART_X + (ART_W as f32 - w) / 2.0, ART_Y);
        Self { back: ctx.pixmap }
    }
}

impl super::Scene for SetupBare {
    fn frames(&self) -> usize {
        1
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, _index: usize) -> Pixmap {
        self.back.clone()
    }
}
