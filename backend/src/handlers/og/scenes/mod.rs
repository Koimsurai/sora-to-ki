//! 每一頁的分享圖背景。一頁一個檔案，畫法照那一頁前端的畫布逐行移植（檔頭寫著對照的檔案）。
//!
//! 構圖的共同規矩：字在左邊（72–712px），畫面的主角放在右半邊；左邊會被 `apng::compose`
//! 壓暗，放在那裡的東西只剩一點影子。動的東西越小越好（見 `apng` 的檔頭），
//! 而且要剛好在一圈裡走完，最後一格接得回第一格；第一格本身要是完整的一張圖。

use tiny_skia::Pixmap;

pub mod about;
pub mod collection;
pub mod colophon;
pub mod friends;
pub mod log;
pub mod messages;
pub mod moments;
pub mod notes;
pub mod photos;
pub mod saturn;
pub mod setup;
mod starfield;
pub mod works;

pub use about::About;
pub use collection::Collection;
pub use colophon::Colophon;
pub use friends::Friends;
pub use log::Log;
pub use messages::Messages;
pub use moments::Moments;
pub use notes::{Notes, SkyPost};
pub use photos::Photos;
pub use saturn::Saturn;
pub use setup::{Setup, SetupBare};
pub use works::Works;

pub trait Scene: Send + Sync {
    /// 一圈幾格
    fn frames(&self) -> usize;
    /// 每格幾毫秒
    fn frame_ms(&self) -> u32;
    /// 第 `index` 格（0..frames），不透明
    fn frame(&self, index: usize) -> Pixmap;
}
