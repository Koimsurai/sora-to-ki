//! 仿 `CanvasRenderingContext2D` 的一小層，底下是 tiny-skia（takumi 本來就帶的光柵化器）。
//!
//! 為什麼要仿 canvas：OG 圖的每一張背景都是站上某一頁的畫布（`src/components/**/*Sky.ts`），
//! 那些程式全是 canvas 2D 寫的。API 長得一樣，移植就幾乎是逐行對照——
//! `ctx.arc(...)` 還是 `ctx.arc(...)`，顏色從 `rgba(${INK}, a)` 變成 `ink(a)`。
//! 之後前端那頁改了畫法，回頭改這邊也是對著同一行改。
//!
//! 只做到那些頁面用得到的部分：路徑（直線、弧、橢圓、二次與三次曲線）、填色與描邊、
//! 線寬、虛線、全域透明度、`lighter` 疊加、兩種漸層、變換的 save／restore、貼圖。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_possible_wrap,
    clippy::too_many_arguments,
    dead_code,
    reason = "照抄 canvas 的 API 形狀（arc 有六個參數），整套補齊、各頁只用到其中一部分；座標轉整數的地方都在畫布範圍內"
)]

use std::f32::consts::TAU;

use tiny_skia::{
    BlendMode, Color, FillRule, GradientStop, LineCap, LinearGradient, Paint, PathBuilder, Pixmap,
    PixmapPaint, Point, RadialGradient, Rect, Shader, SpreadMode, Stroke, StrokeDash, Transform,
};

/// 站上的三個顏色（`index.css`：`--ground`、`--paper`、`--amber`）
pub const GROUND: [u8; 3] = [10, 10, 12];
pub const INK: [u8; 3] = [241, 236, 227];
pub const AMBER: [u8; 3] = [233, 193, 122];

/// 一個顏色加透明度，對應 canvas 的 `rgba(r, g, b, a)`
#[derive(Clone, Copy, Debug)]
pub struct Rgba(pub [u8; 3], pub f32);

pub const fn ink(a: f32) -> Rgba {
    Rgba(INK, a)
}
pub const fn amber(a: f32) -> Rgba {
    Rgba(AMBER, a)
}

impl Rgba {
    fn color(self, global: f32) -> Color {
        let [r, g, b] = self.0;
        Color::from_rgba8(r, g, b, ((self.1 * global).clamp(0.0, 1.0) * 255.0).round() as u8)
    }
}

/// `createLinearGradient` / `createRadialGradient` 加上 `addColorStop` 的結果
#[derive(Clone, Debug)]
pub enum Gradient {
    Linear { x0: f32, y0: f32, x1: f32, y1: f32, stops: Vec<(f32, Rgba)> },
    Radial { x0: f32, y0: f32, r0: f32, x1: f32, y1: f32, r1: f32, stops: Vec<(f32, Rgba)> },
}

impl Gradient {
    pub const fn linear(x0: f32, y0: f32, x1: f32, y1: f32) -> Self {
        Self::Linear { x0, y0, x1, y1, stops: Vec::new() }
    }
    pub const fn radial(x0: f32, y0: f32, r0: f32, x1: f32, y1: f32, r1: f32) -> Self {
        Self::Radial { x0, y0, r0, x1, y1, r1, stops: Vec::new() }
    }
    #[must_use]
    pub fn stop(mut self, at: f32, c: Rgba) -> Self {
        match &mut self {
            Self::Linear { stops, .. } | Self::Radial { stops, .. } => stops.push((at, c)),
        }
        self
    }
}

/// 填色／描邊用什麼：純色或漸層
#[derive(Clone, Debug)]
pub enum Style {
    Solid(Rgba),
    Gradient(Gradient),
}

impl From<Rgba> for Style {
    fn from(c: Rgba) -> Self {
        Self::Solid(c)
    }
}
impl From<Gradient> for Style {
    fn from(g: Gradient) -> Self {
        Self::Gradient(g)
    }
}

#[derive(Clone)]
struct State {
    transform: Transform,
    fill: Style,
    stroke: Style,
    line_width: f32,
    line_cap: LineCap,
    dash: Vec<f32>,
    alpha: f32,
    lighter: bool,
}

pub struct Ctx {
    pub pixmap: Pixmap,
    state: State,
    stack: Vec<State>,
    path: PathBuilder,
    /// 目前這段子路徑有沒有起點（canvas 的 arc 在沒有起點時會自己 moveTo）
    open: bool,
}

impl Ctx {
    /// 一張全透明的畫布
    pub fn new(w: u32, h: u32) -> Self {
        Self {
            pixmap: Pixmap::new(w, h).expect("OG 畫布的尺寸是常數，不會是 0"),
            state: State {
                transform: Transform::identity(),
                fill: ink(1.0).into(),
                stroke: ink(1.0).into(),
                line_width: 1.0,
                line_cap: LineCap::Butt,
                dash: Vec::new(),
                alpha: 1.0,
                lighter: false,
            },
            stack: Vec::new(),
            path: PathBuilder::new(),
            open: false,
        }
    }

    pub fn width(&self) -> f32 {
        self.pixmap.width() as f32
    }
    pub fn height(&self) -> f32 {
        self.pixmap.height() as f32
    }

    /// 整張填滿一個不透明的顏色
    pub fn clear(&mut self, c: [u8; 3]) {
        self.pixmap.fill(Color::from_rgba8(c[0], c[1], c[2], 255));
    }

    // ── 狀態 ────────────────────────────────────────────
    pub fn save(&mut self) {
        self.stack.push(self.state.clone());
    }
    pub fn restore(&mut self) {
        if let Some(s) = self.stack.pop() {
            self.state = s;
        }
    }
    pub fn set_fill(&mut self, s: impl Into<Style>) {
        self.state.fill = s.into();
    }
    pub fn set_stroke(&mut self, s: impl Into<Style>) {
        self.state.stroke = s.into();
    }
    pub const fn set_line_width(&mut self, w: f32) {
        self.state.line_width = w;
    }
    pub const fn set_round_cap(&mut self, round: bool) {
        self.state.line_cap = if round { LineCap::Round } else { LineCap::Butt };
    }
    /// `setLineDash([...])`；空的就是實線
    pub fn set_line_dash(&mut self, dash: &[f32]) {
        self.state.dash = dash.to_vec();
    }
    /// `globalAlpha`
    pub const fn set_alpha(&mut self, a: f32) {
        self.state.alpha = a;
    }
    /// `globalCompositeOperation = 'lighter'`（true）或 `'source-over'`（false）
    pub const fn set_lighter(&mut self, on: bool) {
        self.state.lighter = on;
    }

    // ── 變換 ────────────────────────────────────────────
    pub fn translate(&mut self, x: f32, y: f32) {
        self.state.transform = self.state.transform.pre_translate(x, y);
    }
    pub fn scale(&mut self, sx: f32, sy: f32) {
        self.state.transform = self.state.transform.pre_scale(sx, sy);
    }
    pub fn rotate(&mut self, rad: f32) {
        self.state.transform = self.state.transform.pre_concat(Transform::from_rotate(rad.to_degrees()));
    }
    /// `setTransform(a, b, c, d, e, f)`
    pub fn set_transform(&mut self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) {
        self.state.transform = Transform::from_row(a, b, c, d, e, f);
    }

    // ── 路徑 ────────────────────────────────────────────
    pub fn begin_path(&mut self) {
        self.path = PathBuilder::new();
        self.open = false;
    }
    pub fn move_to(&mut self, x: f32, y: f32) {
        self.path.move_to(x, y);
        self.open = true;
    }
    pub fn line_to(&mut self, x: f32, y: f32) {
        if self.open {
            self.path.line_to(x, y);
        } else {
            self.move_to(x, y);
        }
    }
    pub fn quadratic_curve_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        self.path.quad_to(cx, cy, x, y);
    }
    pub fn bezier_curve_to(&mut self, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) {
        self.path.cubic_to(c1x, c1y, c2x, c2y, x, y);
    }
    pub fn close_path(&mut self) {
        self.path.close();
        self.open = false;
    }
    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.move_to(x, y);
        self.path.line_to(x + w, y);
        self.path.line_to(x + w, y + h);
        self.path.line_to(x, y + h);
        self.path.close();
        self.open = false;
    }

    /// `arc(cx, cy, r, a0, a1, ccw)`：跟 canvas 一樣，起點會用直線接上目前的路徑
    pub fn arc(&mut self, cx: f32, cy: f32, r: f32, a0: f32, a1: f32, ccw: bool) {
        self.ellipse(cx, cy, r, r, 0.0, a0, a1, ccw);
    }

    /// `ellipse(cx, cy, rx, ry, rotation, a0, a1, ccw)`，用三次曲線逼近（每段不超過 90°）
    pub fn ellipse(&mut self, cx: f32, cy: f32, rx: f32, ry: f32, rot: f32, a0: f32, a1: f32, ccw: bool) {
        // 角度範圍照 canvas 的規則：順時針時 a1 補到 a0 之後，掃過超過一圈就畫一整圈
        let sweep = if ccw {
            if a0 - a1 >= TAU { -TAU } else { -(a0 - a1).rem_euclid(TAU) }
        } else if a1 - a0 >= TAU {
            TAU
        } else {
            (a1 - a0).rem_euclid(TAU)
        };
        let (sr, cr) = rot.sin_cos();
        let pt = |a: f32| {
            let (s, c) = a.sin_cos();
            let (x, y) = (c * rx, s * ry);
            (cx + x * cr - y * sr, cy + x * sr + y * cr)
        };
        let (sx, sy) = pt(a0);
        self.line_to(sx, sy);
        let n = ((sweep.abs() / (TAU / 4.0)).ceil() as usize).max(1);
        let step = sweep / n as f32;
        let k = 4.0 / 3.0 * (step / 4.0).tan();
        for i in 0..n {
            let (b0, b1) = (a0 + step * i as f32, a0 + step * (i + 1) as f32);
            let d = |a: f32| {
                let (s, c) = a.sin_cos();
                let (x, y) = (-s * rx, c * ry);
                (x * cr - y * sr, x * sr + y * cr)
            };
            let (p0, p1) = (pt(b0), pt(b1));
            let (d0, d1) = (d(b0), d(b1));
            self.path.cubic_to(
                p0.0 + k * d0.0,
                p0.1 + k * d0.1,
                p1.0 - k * d1.0,
                p1.1 - k * d1.1,
                p1.0,
                p1.1,
            );
        }
    }

    // ── 畫 ──────────────────────────────────────────────
    fn paint(&self, style: &Style) -> Option<Paint<'static>> {
        let global = self.state.alpha;
        let stops =
            |s: &[(f32, Rgba)]| s.iter().map(|(at, c)| GradientStop::new(*at, c.color(global))).collect();
        let shader = match style {
            Style::Solid(c) => Shader::SolidColor(c.color(global)),
            Style::Gradient(Gradient::Linear { x0, y0, x1, y1, stops: s }) => LinearGradient::new(
                Point::from_xy(*x0, *y0),
                Point::from_xy(*x1, *y1),
                stops(s),
                SpreadMode::Pad,
                Transform::identity(),
            )?,
            Style::Gradient(Gradient::Radial { x0, y0, r0, x1, y1, r1, stops: s }) => RadialGradient::new(
                Point::from_xy(*x0, *y0),
                *r0,
                Point::from_xy(*x1, *y1),
                *r1,
                stops(s),
                SpreadMode::Pad,
                Transform::identity(),
            )?,
        };
        Some(Paint {
            shader,
            blend_mode: if self.state.lighter { BlendMode::Plus } else { BlendMode::SourceOver },
            anti_alias: true,
            ..Paint::default()
        })
    }

    pub fn fill(&mut self) {
        let Some(path) = self.path.clone().finish() else { return };
        if let Some(paint) = self.paint(&self.state.fill) {
            self.pixmap.fill_path(&path, &paint, FillRule::Winding, self.state.transform, None);
        }
    }

    pub fn stroke(&mut self) {
        let Some(path) = self.path.clone().finish() else { return };
        let Some(paint) = self.paint(&self.state.stroke) else { return };
        let stroke = Stroke {
            width: self.state.line_width,
            line_cap: self.state.line_cap,
            dash: if self.state.dash.is_empty() {
                None
            } else {
                StrokeDash::new(self.state.dash.clone(), 0.0)
            },
            ..Stroke::default()
        };
        self.pixmap.stroke_path(&path, &paint, &stroke, self.state.transform, None);
    }

    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32) {
        let Some(rect) = Rect::from_xywh(x, y, w, h) else { return };
        if let Some(paint) = self.paint(&self.state.fill) {
            self.pixmap.fill_rect(rect, &paint, self.state.transform, None);
        }
    }

    /// 一個實心圓（`beginPath(); arc(...); fill()` 的簡寫，移植時最常見的三行）
    pub fn dot(&mut self, x: f32, y: f32, r: f32, c: impl Into<Style>) {
        self.set_fill(c);
        self.begin_path();
        self.arc(x, y, r, 0.0, TAU, false);
        self.fill();
    }

    /// `drawImage(img, x, y)`（目前的變換、透明度與疊加方式照用）
    pub fn draw_image(&mut self, img: &Pixmap, x: f32, y: f32) {
        let paint = PixmapPaint {
            opacity: self.state.alpha,
            blend_mode: if self.state.lighter { BlendMode::Plus } else { BlendMode::SourceOver },
            quality: tiny_skia::FilterQuality::Bilinear,
        };
        let t = self.state.transform.pre_translate(x, y);
        self.pixmap.draw_pixmap(0, 0, img.as_ref(), &paint, t, None);
    }

    /// `drawImage(img, x, y, w, h)`：縮放到指定大小
    pub fn draw_image_sized(&mut self, img: &Pixmap, x: f32, y: f32, w: f32, h: f32) {
        self.save();
        self.translate(x, y);
        self.scale(w / img.width() as f32, h / img.height() as f32);
        self.draw_image(img, 0.0, 0.0);
        self.restore();
    }
}

/// 解一張編進執行檔的插圖（`public/illustrations/*.webp` 之類）成畫布能貼的圖（預乘 alpha）。
/// 用法：`load_image(include_bytes!("../../../../../public/illustrations/docking.webp"))`，
/// 解一次就好（放進場景的 struct 或 `LazyLock`）
pub fn load_image(bytes: &[u8]) -> Pixmap {
    let img = image::load_from_memory(bytes).expect("插圖是編進執行檔的常數，解不開代表檔案壞了").to_rgba8();
    let (w, h) = img.dimensions();
    let mut data = img.into_raw();
    for px in data.as_chunks_mut::<4>().0 {
        let a = u16::from(px[3]);
        for c in &mut px[..3] {
            *c = ((u16::from(*c) * a + 127) / 255) as u8;
        }
    }
    Pixmap::from_vec(data, tiny_skia::IntSize::from_wh(w, h).expect("插圖不會是 0×0"))
        .expect("長度剛好是 w×h×4")
}
