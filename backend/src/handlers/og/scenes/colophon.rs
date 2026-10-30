//! 此站點的六分儀（`src/components/about/colophonSky.ts` 逐行移植，換頁的點照
//! `layout/TransitionLayer.tsx`）：一具六分儀對著星空，這個站的材料、字、天空、規則與授權各是一顆星，
//! 望遠鏡對準其中一顆、拉出一條虛線視線，測著的那顆是琥珀色。
//!
//! 第一格是測好的那一刻：六分儀對準了，視線的點慢慢往星那邊流，其餘的星微微閃。
//! 動態是換頁進來的那一段：視線收掉、星變回白色，琥珀點從最右邊那顆星進來，由右往左把星
//! 一顆顆掃過去、身後留下星座線，最後一顆是要測的那顆，再落到望遠鏡的鏡筒前端；
//! 落地時那顆星亮成琥珀色，星座線從第一顆星沿著來的方向收掉，剩下的那段淡成視線，接回第一格。
//!
//! 六分儀整個過程都不動（前端換一顆星時它會轉過去，但它一轉整張圖都在變，每格都等於整張圖），
//! 所以這張只測同一顆星。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::suboptimal_flops,
    reason = "幾何照抄 TS 原版、運算順序對照著寫；座標是畫布範圍內的浮點數，格數很小"
)]

use std::f32::consts::{PI, TAU};

use tiny_skia::Pixmap;

use super::super::apng::{H, W};
use super::super::canvas::{Ctx, Gradient, amber, ground, ink, load_image_sized};

const FRAMES: usize = 160;
const FRAME_MS: u32 = 100;
const LOOP_S: f32 = FRAMES as f32 * FRAME_MS as f32 / 1000.0;

/// 六分儀線稿（880×775）：左右翻過來畫，望遠鏡才朝右上方。翻過來之後目鏡在 `EYE`、
/// 鏡筒前端在 `FRONT`（原圖比例）
const SEXTANT: &[u8] = include_bytes!("../../../../../public/illustrations/sextant.webp");
const RATIO: f32 = 775.0 / 880.0;
const EYE: [f32; 2] = [0.034, 0.523];
const FRONT: [f32; 2] = [0.381, 0.377];
/// 六分儀最多轉多少（弧度）
const TURN_MIN: f32 = -0.55;
const TURN_MAX: f32 = 0.4;

/// 星（`STAR_KEYS` 的順序）與它們在寬螢幕上的位置（`WIDE`，場景寬高的比例）
const STARS: [[f32; 2]; 8] = [
    [0.42, 0.22], // material
    [0.55, 0.12], // type
    [0.69, 0.2],  // sky
    [0.82, 0.11], // rule1
    [0.5, 0.33],  // rule2
    [0.57, 0.42], // rule3
    [0.9, 0.24],  // license
    [0.68, 0.08], // qa
];

// ── 構圖 ─────────────────────────────────────────────────────────
// 前端的寬螢幕是六分儀在左下、星散在右上，整片場景橫跨全寬。分享圖的左邊是字，所以兩樣都收進
// 右半邊：星照 `WIDE` 的比例擺在 1440×900 的場景上，整組等比縮到 0.6 倍、挪到右上角
// （不等比壓的話，點畫星座時由右往左那條曲線會變成又尖又陡的鋸齒）；六分儀擺在它們下方。
/// 星的那組：場景的大小（縮過）與挪過去的位置
const SKY_W: f32 = 1440.0 * 0.6;
const SKY_H: f32 = 900.0 * 0.6;
const SKY_X: f32 = 378.0;
const SKY_Y: f32 = 26.0;
/// 六分儀的中心與寬
const SEX_CX: f32 = 896.0;
const SEX_CY: f32 = 448.0;
const SEX_SIZE: f32 = 340.0;
/// 測的是哪一顆。前端一進來測的是「材料」，但它在這組比例裡是最左邊那顆，在分享圖上
/// 六分儀轉到極限也對不準它（前端的六分儀離星很遠，這裡擠在同一個角落）；「授權」在右邊，
/// 對得準、視線也最長
const TARGET: usize = 6;

fn star_at(i: usize) -> (f32, f32) {
    let [x, y] = STARS[i];
    (SKY_X + x * SKY_W, SKY_Y + y * SKY_H)
}

/// 望遠鏡本來的方向（翻過來之後，從目鏡指向鏡筒前端）
fn axis() -> f32 {
    ((FRONT[1] - EYE[1]) * RATIO).atan2(FRONT[0] - EYE[0])
}

/// 六分儀轉了 turn 之後，翻過來的圖上 (u, v) 那一點在畫面上的位置（`pointOn`）
fn point_on(turn: f32, u: f32, v: f32) -> (f32, f32) {
    let dx = (u - 0.5) * SEX_SIZE;
    let dy = (v - 0.5) * SEX_SIZE * RATIO;
    let (s, c) = turn.sin_cos();
    (SEX_CX + dx * c - dy * s, SEX_CY + dx * s + dy * c)
}

/// 鏡筒前端（`frontOf`）
fn front_of(turn: f32) -> (f32, f32) {
    point_on(turn, FRONT[0], FRONT[1])
}

/// 要對準這顆星，六分儀該轉多少（`turnFor`：鏡筒前端會跟著轉，迭代三次）
fn turn_for(i: usize) -> f32 {
    let (sx, sy) = star_at(i);
    let mut turn = 0.0;
    for _ in 0..3 {
        let (fx, fy) = front_of(turn);
        turn = (sy - fy).atan2(sx - fx) - axis();
    }
    turn.clamp(TURN_MIN, TURN_MAX)
}

/// 換頁進來時點畫的星座（`planConstellation`）：最右邊那顆進來、由右往左掃過其餘的星，
/// 最後一顆是要測的那顆，再接到鏡筒前端；星與星之間是 Catmull–Rom 曲線。
/// 回傳取好點的曲線與那顆星在曲線上的第幾點
fn plan_constellation(front: (f32, f32)) -> (Vec<(f32, f32)>, usize) {
    let mut others: Vec<(f32, f32)> = (0..STARS.len()).filter(|&k| k != TARGET).map(star_at).collect();
    // JS 的 sort 是穩定排序，sort_by 也是
    others.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut knots = others;
    knots.push(star_at(TARGET));
    knots.push(front);
    const STEPS: usize = 14;
    let mut path = vec![knots[0]];
    let mut target_at = 0;
    let n = knots.len();
    for i in 0..n - 1 {
        let p0 = knots[i.saturating_sub(1)];
        let (p1, p2) = (knots[i], knots[i + 1]);
        let p3 = knots[(i + 2).min(n - 1)];
        for k in 1..=STEPS {
            let t = k as f32 / STEPS as f32;
            let (t2, t3) = (t * t, t * t * t);
            let at = |a: f32, b: f32, c: f32, d: f32| {
                0.5 * (2.0 * b
                    + (-a + c) * t
                    + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2
                    + (-a + 3.0 * b - 3.0 * c + d) * t3)
            };
            path.push((at(p0.0, p1.0, p2.0, p3.0), at(p0.1, p1.1, p2.1, p3.1)));
        }
        if i + 1 == n - 2 {
            target_at = path.len() - 1;
        }
    }
    (path, target_at)
}

/// 折線上每一點到起點的累計長度（`cumulative`）
fn cumulative(path: &[(f32, f32)]) -> Vec<f32> {
    let mut out = vec![0.0];
    for w in path.windows(2) {
        let last = out[out.len() - 1];
        out.push(last + (w[1].0 - w[0].0).hypot(w[1].1 - w[0].1));
    }
    out
}

/// 折線上長度 d 處的點（`strokeSpan` 裡的 `point`）
fn point_at(path: &[(f32, f32)], cum: &[f32], d: f32) -> (f32, f32) {
    let mut i = 1;
    while i < path.len() - 1 && cum[i] < d {
        i += 1;
    }
    let u = (d - cum[i - 1]) / (cum[i] - cum[i - 1]).max(1e-6);
    (path[i - 1].0 + (path[i].0 - path[i - 1].0) * u, path[i - 1].1 + (path[i].1 - path[i - 1].1) * u)
}

/// 畫折線上 [d0, d1] 那一段（`strokeSpan`）
fn stroke_span(ctx: &mut Ctx, path: &[(f32, f32)], cum: &[f32], d0: f32, d1: f32) {
    if d1 <= d0 {
        return;
    }
    ctx.begin_path();
    let (sx, sy) = point_at(path, cum, d0);
    ctx.move_to(sx, sy);
    for i in 1..path.len() {
        if cum[i] > d0 && cum[i] < d1 {
            ctx.line_to(path[i].0, path[i].1);
        }
    }
    let (ex, ey) = point_at(path, cum, d1);
    ctx.line_to(ex, ey);
    ctx.stroke();
}

// ── 一圈的節奏（秒）────────────────────────────────────────────
/// 視線與琥珀色開始退掉
const FADE_AT: f32 = 5.0;
const FADE_S: f32 = 0.6;
/// 點在最右邊那顆星亮起來（`TransitionLayer` 的 `dot(p, 1 + 2k, k)`）
const DOT_AT: f32 = 5.9;
const DOT_IN_S: f32 = 0.38;
/// 飛完整條星座。前端是 `總長 / (1.6 px/ms × 1.5)`、上限 0.93 秒；分享圖一秒只有十格，
/// 照那個速度一格要跳一百多 px，所以放慢
const FLY_S: f32 = 2.2;
/// 落地後點縮掉（`GROW_MS`）
const GROW_S: f32 = 0.48;
/// 星座線從第一顆星收到測的那顆（`CONSTELLATION_FADE_MS`），剩下那段淡成視線（`MELT_MS`）
const RETRACT_S: f32 = 0.9;
const MELT_S: f32 = 1.2;
/// 點身後那段較亮的彗尾留多久（`TAIL_MS`）。整段彗尾每一格都在變淡，每一格都要存它，
/// 所以不跟著飛行放慢
const TAIL_S: f32 = 0.76;
/// 視線的點往星那邊流的速度（px/s，`lineDashOffset = -t × 18`）
const SIGHT_FLOW: f32 = 18.0;
/// 視線的點每秒挪幾次：點一挪，整條視線的像素都變了。十格挪一次是每格都存整條線，
/// 五格挪一次省一半；點本來就流得很慢（一次 3.6px），看不出是一步一步的
const SIGHT_STEPS: f32 = 5.0;
/// 星閃的頻率：前端是 1.7 rad/s，取一圈裡剛好整數次的那個（16 秒四次）
const TWINKLE: f32 = 4.0 * TAU / LOOP_S;

pub struct Colophon {
    back: Pixmap,
    /// 六分儀那一層（透明底，已經轉好、翻好，疊在星與線上面）
    sextant: Pixmap,
    front: (f32, f32),
    path: Vec<(f32, f32)>,
    cum: Vec<f32>,
    to_target: f32,
}

impl Colophon {
    pub fn new() -> Self {
        let turn = turn_for(TARGET);
        let front = front_of(turn);
        let (path, target_at) = plan_constellation(front);
        let cum = cumulative(&path);
        let to_target = cum[target_at];

        let mut back = Ctx::new(W as u32, H as u32);
        back.clear(ground());

        // 六分儀：翻過來、繞著中心轉到對準的角度（先縮到要畫的大小，見 `load_image_sized`）
        let (iw, ih) = (SEX_SIZE, SEX_SIZE * RATIO);
        let img = load_image_sized(SEXTANT, iw.round() as u32, ih.round() as u32);
        let mut layer = Ctx::new(W as u32, H as u32);
        layer.set_alpha(0.92);
        layer.translate(SEX_CX, SEX_CY);
        layer.rotate(turn);
        layer.scale(-1.0, 1.0);
        layer.draw_image_sized(&img, -iw / 2.0, -ih / 2.0, iw, ih);

        Self { back: back.pixmap, sextant: layer.pixmap, front, path, cum, to_target }
    }
}

const fn ease_out(t: f32) -> f32 {
    let k = 1.0 - t;
    1.0 - k * k * k
}

impl super::Scene for Colophon {
    fn frames(&self) -> usize {
        FRAMES
    }
    fn frame_ms(&self) -> u32 {
        FRAME_MS
    }
    fn frame(&self, index: usize) -> Pixmap {
        let t = index as f32 * FRAME_MS as f32 / 1000.0;
        let fly_at = DOT_AT + DOT_IN_S;
        let landed_at = fly_at + FLY_S;
        let total = self.cum[self.cum.len() - 1];
        // 視線與琥珀色：測好的時候是 1；退掉之後要等點落地才回來（落地那一刻視線就是畫好的）
        let measured = if t < FADE_AT {
            1.0
        } else if t < landed_at {
            1.0 - ((t - FADE_AT) / FADE_S).min(1.0)
        } else {
            1.0
        };

        let mut ctx = Ctx::new(W as u32, H as u32);
        ctx.draw_image(&self.back, 0.0, 0.0);
        ctx.set_line_width(1.0);

        // 星座線（在星與六分儀底下）：飛的時候畫到點走到的地方；落地後從第一顆星收掉，
        // 剩下測的那顆到鏡筒那段，再慢慢淡成底下的點線視線
        if t >= fly_at {
            let (from, alpha) = if t < landed_at {
                (0.0, 1.0)
            } else {
                let k = ((t - landed_at) / RETRACT_S).min(1.0);
                let e = if k < 0.5 { 2.0 * k * k } else { 1.0 - (-2.0 * k + 2.0).powi(2) / 2.0 };
                let melt = ((t - landed_at - RETRACT_S) / MELT_S).clamp(0.0, 1.0);
                (self.to_target * e, 1.0 - melt)
            };
            let drawn = if t < landed_at { fly(t - fly_at) * total } else { total };
            if alpha > 0.0 {
                ctx.set_stroke(ink(0.55 * alpha));
                stroke_span(&mut ctx, &self.path, &self.cum, from, drawn);
            }
        }

        // 視線：從鏡筒前端拉到那顆星的一條點線，點慢慢往星那邊流
        let (sx, sy) = star_at(TARGET);
        if measured > 0.0 {
            ctx.save();
            ctx.set_line_dash(&[2.0, 6.0]);
            ctx.set_line_dash_offset(-(t * SIGHT_STEPS).floor() / SIGHT_STEPS * SIGHT_FLOW);
            ctx.set_stroke(ink(0.45 * measured));
            ctx.begin_path();
            ctx.move_to(self.front.0, self.front.1);
            ctx.line_to(sx, sy);
            ctx.stroke();
            ctx.restore();
        }

        // 星：測著的那顆是琥珀色，其餘是白點，微微閃
        for i in 0..STARS.len() {
            let (x, y) = star_at(i);
            // 亮度只分五階、而且跟視線的點同一拍才換：連續變化的話每顆星每一格都在變，
            // 每格都得存它們；同一拍換，中間那一格就完全不用存
            let beat = (t * SIGHT_STEPS).floor() / SIGHT_STEPS;
            let tw = 0.75 + 0.25 * ((beat * TWINKLE + i as f32 * 2.1).sin() * 2.0).round() / 2.0;
            let on = if i == TARGET { measured } else { 0.0 };
            if on > 0.0 {
                ctx.set_fill(
                    Gradient::radial(x, y, 0.0, x, y, 22.0).stop(0.0, amber(0.55 * on)).stop(1.0, amber(0.0)),
                );
                ctx.begin_path();
                ctx.arc(x, y, 22.0, 0.0, TAU, false);
                ctx.fill();
            }
            // 前端是一瞬間換成琥珀色；這裡退掉的那半秒是白點在下、琥珀點在上淡掉
            if on < 1.0 {
                ctx.dot(x, y, 2.4, ink(0.8 * tw));
            }
            if on > 0.0 {
                ctx.dot(x, y, 2.4 + 1.2 * on, amber(on));
            }
        }

        ctx.draw_image(&self.sextant, 0.0, 0.0);

        // 換頁的點（`TransitionLayer`）：亮起來、沿著星座飛、落地後縮掉。身後的彗尾比星座線亮，
        // 照它畫下去多久了變淡
        if t >= DOT_AT && t < landed_at + GROW_S {
            let tail_from = (t - TAIL_S).max(fly_at);
            if t > fly_at && tail_from < landed_at {
                let steps = 24;
                let d_now = fly((t - fly_at).min(FLY_S)) * total;
                for k in 0..steps {
                    let (ta, tb) = (
                        tail_from + (t.min(landed_at) - tail_from) * k as f32 / steps as f32,
                        tail_from + (t.min(landed_at) - tail_from) * (k + 1) as f32 / steps as f32,
                    );
                    let age = 1.0 - (t - tb) / TAIL_S;
                    if age <= 0.0 {
                        continue;
                    }
                    let (a, b) = (fly(ta - fly_at) * total, (fly(tb - fly_at) * total).min(d_now));
                    ctx.set_stroke(ink(0.75 * age.powf(1.6)));
                    ctx.set_round_cap(true);
                    stroke_span(&mut ctx, &self.path, &self.cum, a, b);
                    ctx.set_round_cap(false);
                }
            }
            let (p, radius, alpha) = if t < fly_at {
                let k = ease_out((t - DOT_AT) / DOT_IN_S);
                (self.path[0], 1.0 + 2.0 * k, k)
            } else if t < landed_at {
                (point_at(&self.path, &self.cum, fly(t - fly_at) * total), 3.0, 1.0)
            } else {
                let g = ((t - landed_at) / GROW_S).min(1.0);
                (self.front, 3.0 * (1.0 - ease_out(g)), 1.0 - g)
            };
            if alpha > 0.01 {
                ctx.set_fill(
                    Gradient::radial(p.0, p.1, 0.0, p.0, p.1, 18.0)
                        .stop(0.0, amber(0.5 * alpha))
                        .stop(1.0, amber(0.0)),
                );
                ctx.begin_path();
                ctx.arc(p.0, p.1, 18.0, 0.0, TAU, false);
                ctx.fill();
                ctx.dot(p.0, p.1, radius, amber(alpha));
            }
        }
        ctx.pixmap
    }
}

/// 飛了 s 秒時走到全長的幾成：起步與落地都是緩的（`(1 − cos πτ) / 2`）
fn fly(s: f32) -> f32 {
    let tau = (s / FLY_S).clamp(0.0, 1.0);
    (1.0 - (PI * tau).cos()) / 2.0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 測的那顆星要在六分儀轉得到的範圍裡：`turn_for` 超出範圍時會靜靜夾住，
    /// 望遠鏡就沒對準它（視線照樣畫，但不是從鏡筒延伸出去的方向）。構圖的數字改了先跑這條
    #[test]
    fn 六分儀對得準測的那顆星() {
        let turn = turn_for(TARGET);
        assert!(turn > TURN_MIN && turn < TURN_MAX, "轉到極限了（{turn}）：望遠鏡對不準那顆星");
        let (sx, sy) = star_at(TARGET);
        let (fx, fy) = front_of(turn);
        let aim = (sy - fy).atan2(sx - fx) - axis();
        assert!((aim - turn).abs() < 0.01, "鏡筒的方向跟視線差了 {} rad", aim - turn);
    }

    /// 星都在字的右邊、畫面裡（光暈也不出界）
    #[test]
    fn 星都在右半邊() {
        for i in 0..STARS.len() {
            let (x, y) = star_at(i);
            assert!(
                x >= 720.0 && x <= W as f32 - 24.0 && y >= 24.0 && y <= H as f32 - 24.0,
                "第 {i} 顆在 ({x}, {y})"
            );
        }
    }
}
