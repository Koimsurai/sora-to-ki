//! 背景＋字 → APNG。
//!
//! 第一格存整張；之後每一格只存「跟上一格不一樣的像素」：取變動範圍的外框當這一格的大小，
//! 框裡沒變的像素寫成全透明、用 `BlendOp::Over` 疊在上一格上，於是只有變的點會蓋上去。
//! 全透明的長串壓縮後幾乎不佔空間，一格常常只有幾 KB（每格都存整張的話，18 秒的圖會是幾十 MB）。
//!
//! 所以場景在設計動態時要記得：**一格裡變動的範圍越小越好**。整片在轉的星空、會飄的雜訊，
//! 每一格都等於整張圖。
//!
//! 第一格同時是「預設圖」：不播動畫的平台（多數社群網站）只顯示它，所以第一格本身要是完整的圖。
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    reason = "像素座標與 0–255 的色值，值域在畫布範圍內"
)]

use tiny_skia::Pixmap;

pub const W: usize = 1200;
pub const H: usize = 630;
/// 給 takumi 的 viewport
pub const SIZE: (u32, u32) = (W as u32, H as u32);

const GROUND: [f32; 3] = [10.0, 10.0, 12.0];

/// 字底下的那片漸層：左邊壓暗到幾成（往右漸淡，過了 66% 寬就沒有）。讓背景的線與星
/// 在字底下淡掉，字才讀得清楚
fn veil(x: usize) -> f32 {
    let u = x as f32 / W as f32;
    if u < 0.4 { 0.9 - 0.18 * u / 0.4 } else { (0.72 * (0.66 - u) / 0.26).max(0.0) }
}

/// 背景（不透明的畫布）壓上左邊的漸層、再疊上字那一層（takumi 畫出來的 RGBA，非預乘），
/// 轉成 8-bit RGBA。
///
/// ⚠ 漸層不放在 takumi 的 HTML 裡：它畫出來的半透明底色在低不透明度時顏色會偏
/// （存的是預乘再還原的值，alpha 幾 % 的時候 RGB 只剩一兩階），疊上去變成一條一條的直紋。
/// 在這裡用浮點數直接往底色壓就沒有這個問題。
pub fn compose(back: &Pixmap, overlay: &[u8]) -> Vec<u8> {
    let data = back.data();
    let mut out = Vec::with_capacity(W * H * 4);
    for i in 0..W * H {
        let o = &overlay[i * 4..i * 4 + 4];
        let a = f32::from(o[3]) / 255.0;
        let v = veil(i % W);
        for ch in 0..3 {
            let p = f32::from(data[i * 4 + ch]);
            let b = p + (GROUND[ch] - p) * v;
            out.push((f32::from(o[ch]) * a + b * (1.0 - a)).round().clamp(0.0, 255.0) as u8);
        }
        out.push(255);
    }
    out
}

/// 逐格編成 APNG（見檔頭）。`frames` 格、每格 `frame_ms` 毫秒，無限循環
pub fn encode(
    frames: usize,
    frame_ms: u32,
    mut next_frame: impl FnMut(usize) -> Vec<u8>,
) -> anyhow::Result<Vec<u8>> {
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, W as u32, H as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::High);
    enc.set_animated(frames as u32, 0)?;
    enc.set_frame_delay(frame_ms as u16, 1000)?;
    let mut writer = enc.write_header()?;
    let mut prev = next_frame(0);
    writer.write_image_data(&prev)?;
    writer.set_blend_op(png::BlendOp::Over)?;
    for index in 1..frames {
        let cur = next_frame(index);
        let (mut x0, mut y0, mut x1, mut y1) = (W, H, 0, 0);
        for y in 0..H {
            for x in 0..W {
                let o = (y * W + x) * 4;
                if cur[o..o + 3] != prev[o..o + 3] {
                    x0 = x0.min(x);
                    x1 = x1.max(x + 1);
                    y0 = y0.min(y);
                    y1 = y1.max(y + 1);
                }
            }
        }
        // 完全沒變的一格：還是要寫一格（格數已經寫在檔頭），寫一個透明像素
        if x1 == 0 {
            (x0, y0, x1, y1) = (0, 0, 1, 1);
        }
        let (fw, fh) = (x1 - x0, y1 - y0);
        let mut sub = vec![0u8; fw * fh * 4];
        for y in y0..y1 {
            for x in x0..x1 {
                let o = (y * W + x) * 4;
                if cur[o..o + 3] != prev[o..o + 3] {
                    let s = ((y - y0) * fw + (x - x0)) * 4;
                    sub[s..s + 4].copy_from_slice(&cur[o..o + 4]);
                }
            }
        }
        writer.reset_frame_position()?;
        writer.set_frame_dimension(fw as u32, fh as u32)?;
        writer.set_frame_position(x0 as u32, y0 as u32)?;
        writer.write_image_data(&sub)?;
        prev = cur;
    }
    writer.finish()?;
    Ok(out)
}
