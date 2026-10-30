//! 航行日誌的地面：發射台周圍的海岸線，內陸的話再加上河流與湖。
//!
//! 發射台是站長在哪裡（站台設定的 `launch_pad`），火箭從那裡升空。地面只描線：
//! Natural Earth 50m 的陸地（`data/geo/land.json`，見 scripts/geo/natural-earth.ts）裁到畫面
//! 看得到的那一塊、簡化，前端（components/about/logSky.ts）與分享圖（og/scenes/log.rs）畫同一份。
//!
//! 發射台附近 [`INLAND_KM`] 內沒有海岸（丹佛、馬德里那種內陸城市）時，畫面上會只剩地上的點，
//! 所以補上河流與湖，畫得比海岸線淡。海邊的城市不加，免得線太雜。
//!
//! 預設發射台（台灣）用原本手裁的那份（`data/geo/taiwan.json`），畫面跟以前一模一樣。

use std::sync::{Arc, LazyLock};

use axum::{Json, extract::State};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::{error::AppError, state::AppState};

/// 發射台：緯度、經度（度）
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type, utoipa::ToSchema)]
pub struct LaunchPad {
    pub lat: f64,
    pub lon: f64,
}

/// 沒設定時的發射台：台灣
pub const DEFAULT_PAD: LaunchPad = LaunchPad { lat: 23.7, lon: 121.0 };

/// 緯度能填到哪：再往兩極，經度一度窄到畫面要橫跨半個地球
pub const LAT_LIMIT: f64 = 70.0;

/// `GET /api/site/ground` 的回應
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type, utoipa::ToSchema)]
pub struct Ground {
    pub lat: f64,
    pub lon: f64,
    /// 陸地：[塊][環][經度×100, 緯度×100, …]，環首尾相接（最後一點不重複）
    pub land: Vec<Vec<Vec<i32>>>,
    /// 河流與湖：[線][經度×100, 緯度×100, …]，線不封閉（湖的環已經把起點接在最後）。海邊的發射台是空的
    pub water: Vec<Vec<i32>>,
}

/// 附近多少公里內有海岸就不加河流與湖
const INLAND_KM: f64 = 300.0;
/// 簡化的容許誤差（度）：台灣那份當初也是 0.03°
const TOLERANCE: f64 = 0.03;

const TAIWAN: &str = include_str!("../../data/geo/taiwan.json");
const LAND: &str = include_str!("../../data/geo/land.json");
const LAKES: &str = include_str!("../../data/geo/lakes.json");
const RIVERS: &str = include_str!("../../data/geo/rivers.json");

type Polygons = Vec<Vec<Vec<i32>>>;
type Lines = Vec<Vec<i32>>;

static WORLD: LazyLock<(Polygons, Polygons, Lines)> = LazyLock::new(|| {
    let parse_p = |s: &str| serde_json::from_str::<Polygons>(s).expect("data/geo 是 repo 裡產好的靜態檔");
    let rivers = serde_json::from_str::<Lines>(RIVERS).expect("data/geo 是 repo 裡產好的靜態檔");
    (parse_p(LAND), parse_p(LAKES), rivers)
});

/// 上一次算好的那一份：發射台很少改，一份就夠
static CACHE: LazyLock<Mutex<Option<Arc<Ground>>>> = LazyLock::new(|| Mutex::new(None));

/// 這個發射台的地面（同一個位置只算一次）
pub fn ground_for(pad: LaunchPad) -> Arc<Ground> {
    let mut cache = CACHE.lock();
    if let Some(g) = cache.as_ref()
        && g.lat.to_bits() == pad.lat.to_bits()
        && g.lon.to_bits() == pad.lon.to_bits()
    {
        return Arc::clone(g);
    }
    let g = Arc::new(compute(pad));
    *cache = Some(Arc::clone(&g));
    g
}

fn compute(pad: LaunchPad) -> Ground {
    if pad == DEFAULT_PAD {
        let land = serde_json::from_str(TAIWAN).expect("data/geo/taiwan.json 是 repo 裡的靜態檔");
        return Ground { lat: pad.lat, lon: pad.lon, land, water: Vec::new() };
    }
    let b = BoundingBox::around(pad);
    let (world_land, lakes, rivers) = &*WORLD;
    let land = clip_polygons(world_land, &b);
    let water = if nearest_coast_km(&land, &b, pad) > INLAND_KM {
        let mut w: Lines = clip_polygons(lakes, &b)
            .into_iter()
            .flatten()
            .map(|mut ring| {
                // 湖是環：把起點接到最後，當成一條線畫
                ring.extend_from_slice(&[ring[0], ring[1]]);
                ring
            })
            .collect();
        w.extend(clip_lines(rivers, &b));
        w
    } else {
        Vec::new()
    };
    Ground { lat: pad.lat, lon: pad.lon, land, water }
}

/// 畫面看得到的範圍：台灣那份是北緯 14–43、東經 113–134（發射台在 23.7, 121），
/// 其他地方照同樣的偏移；經度方向照緯度放寬（高緯度一度比較窄）
#[derive(Debug, Clone, Copy)]
struct BoundingBox {
    w: f64,
    e: f64,
    s: f64,
    n: f64,
}

impl BoundingBox {
    fn around(pad: LaunchPad) -> Self {
        let k = DEFAULT_PAD.lat.to_radians().cos() / pad.lat.to_radians().cos();
        Self { w: pad.lon - 8.0 * k, e: pad.lon + 13.0 * k, s: pad.lat - 9.7, n: pad.lat + 19.3 }
    }

    fn contains(&self, (x, y): (f64, f64)) -> bool {
        x >= self.w && x <= self.e && y >= self.s && y <= self.n
    }

    /// 裁切出來的點在邊框上（不是真的海岸）
    fn on_edge(&self, (x, y): (f64, f64)) -> bool {
        const EPS: f64 = 1e-9;
        (x - self.w).abs() < EPS
            || (x - self.e).abs() < EPS
            || (y - self.s).abs() < EPS
            || (y - self.n).abs() < EPS
    }
}

type Pt = (f64, f64);

fn points(flat: &[i32]) -> Vec<Pt> {
    flat.as_chunks::<2>().0.iter().map(|[x, y]| (f64::from(*x) / 100.0, f64::from(*y) / 100.0)).collect()
}

#[allow(clippy::cast_possible_truncation, reason = "經緯度×100 遠在 i32 範圍內")]
fn flat(pts: &[Pt]) -> Vec<i32> {
    pts.iter().flat_map(|(x, y)| [(x * 100.0).round() as i32, (y * 100.0).round() as i32]).collect()
}

/// Sutherland–Hodgman：一個環裁到框裡（框外的部分沿著框邊接起來）
fn clip_ring(ring: &[Pt], b: &BoundingBox) -> Vec<Pt> {
    let lerp = |a: Pt, c: Pt, t: f64| (a.0 + (c.0 - a.0) * t, a.1 + (c.1 - a.1) * t);
    // 四條邊各裁一次：(哪一軸、界線、留下的是 >= 還是 <=)
    let edges = [(0, b.w, true), (0, b.e, false), (1, b.s, true), (1, b.n, false)];
    let mut pts = ring.to_vec();
    for (axis, at, keep_above) in edges {
        let v = |p: Pt| if axis == 0 { p.0 } else { p.1 };
        let inside = |p: Pt| if keep_above { v(p) >= at } else { v(p) <= at };
        let mut out = Vec::with_capacity(pts.len());
        for (i, &a) in pts.iter().enumerate() {
            let c = pts[(i + 1) % pts.len()];
            if inside(a) {
                out.push(a);
            }
            if inside(a) != inside(c) {
                out.push(lerp(a, c, (at - v(a)) / (v(c) - v(a))));
            }
        }
        pts = out;
        if pts.is_empty() {
            break;
        }
    }
    pts
}

/// Douglas–Peucker（開放的線）
fn simplify(pts: &[Pt]) -> Vec<Pt> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let (a, c) = (pts[0], pts[pts.len() - 1]);
    let (dx, dy) = (c.0 - a.0, c.1 - a.1);
    let len = dx.hypot(dy).max(f64::MIN_POSITIVE);
    let (mut far, mut at) = (0.0, 0);
    for (i, p) in pts.iter().enumerate().take(pts.len() - 1).skip(1) {
        let d = (dy * p.0 - dx * p.1 + c.0 * a.1 - c.1 * a.0).abs() / len;
        if d > far {
            (far, at) = (d, i);
        }
    }
    if far <= TOLERANCE {
        return vec![a, c];
    }
    let mut left = simplify(&pts[..=at]);
    left.pop();
    left.extend(simplify(&pts[at..]));
    left
}

/// 封閉的環：先從離起點最遠的那一點切成兩段再各自簡化（首尾同一點時直接簡化會塌成一點）
fn simplify_ring(ring: &[Pt]) -> Vec<Pt> {
    let d = |p: Pt| (p.0 - ring[0].0).hypot(p.1 - ring[0].1);
    let far = (0..ring.len()).max_by(|&i, &j| d(ring[i]).total_cmp(&d(ring[j]))).unwrap_or(0);
    let mut out = simplify(&ring[..=far]);
    out.pop();
    let mut back = ring[far..].to_vec();
    back.push(ring[0]);
    let mut tail = simplify(&back);
    tail.pop();
    out.extend(tail);
    out
}

fn clip_polygons(world: &Polygons, b: &BoundingBox) -> Polygons {
    world
        .iter()
        .filter_map(|poly| {
            let rings: Vec<Vec<i32>> = poly
                .iter()
                .filter_map(|ring| {
                    let clipped = clip_ring(&points(ring), b);
                    if clipped.len() < 3 {
                        return None;
                    }
                    let s = simplify_ring(&clipped);
                    (s.len() >= 3).then(|| flat(&s))
                })
                .collect();
            (!rings.is_empty()).then_some(rings)
        })
        .collect()
}

/// 線只留框裡的連續段（河流的點夠密，框邊不必算交點）
fn clip_lines(world: &Lines, b: &BoundingBox) -> Lines {
    let mut out = Vec::new();
    for line in world {
        let mut run: Vec<Pt> = Vec::new();
        for p in points(line).into_iter().chain(std::iter::once((f64::NAN, f64::NAN))) {
            if b.contains(p) {
                run.push(p);
            } else {
                if run.len() >= 2 {
                    out.push(flat(&simplify(&run)));
                }
                run.clear();
            }
        }
    }
    out
}

/// 發射台到最近一段真的海岸（不算裁切出來的框邊）有幾公里
fn nearest_coast_km(land: &Polygons, b: &BoundingBox, pad: LaunchPad) -> f64 {
    let kx = 111.32 * pad.lat.to_radians().cos();
    land.iter()
        .flatten()
        .flat_map(|ring| points(ring))
        .filter(|p| !b.on_edge(*p))
        .map(|(x, y)| ((x - pad.lon) * kx).hypot((y - pad.lat) * 110.57))
        .fold(f64::INFINITY, f64::min)
}

/// `GET /api/site/ground` —— 公開：航行日誌的地面（站長設的發射台周圍）
#[utoipa::path(get, path = "/api/site/ground", tag = "site", responses((status = 200, body = Ground)))]
pub async fn get_ground(State(_state): State<AppState>) -> Result<Json<Ground>, AppError> {
    Ok(Json((*ground_for(crate::handlers::site_config::launch_pad())).clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 預設發射台用原本那份台灣() {
        let g = compute(DEFAULT_PAD);
        let original: Polygons = serde_json::from_str(TAIWAN).unwrap();
        assert_eq!(g.land, original, "台灣的畫面要跟以前一模一樣");
        assert_eq!(g.water.len(), 0);
    }

    #[test]
    fn 海邊的城市只有海岸線() {
        let tokyo = compute(LaunchPad { lat: 35.68, lon: 139.69 });
        assert!(tokyo.land.len() > 10, "東京附近應該有一堆島");
        assert_eq!(tokyo.water.len(), 0, "海邊不加河流");
    }

    #[test]
    fn 內陸城市補上河流與湖() {
        let denver = compute(LaunchPad { lat: 39.74, lon: -104.99 });
        assert!(!denver.water.is_empty(), "丹佛附近沒有海岸，要有河流");
        for line in &denver.water {
            assert!(line.len() >= 4 && line.len() % 2 == 0, "每條線至少兩個點");
        }
    }

    #[test]
    fn 裁出來的都在框裡() {
        let pad = LaunchPad { lat: 51.5, lon: -0.12 };
        let b = BoundingBox::around(pad);
        let g = compute(pad);
        for p in g.land.iter().flatten().flat_map(|r| points(r)) {
            // 取整到 0.01° 會讓框邊上的點超出一點點
            assert!(
                p.0 >= b.w - 0.01 && p.0 <= b.e + 0.01 && p.1 >= b.s - 0.01 && p.1 <= b.n + 0.01,
                "{p:?}"
            );
        }
    }

    #[test]
    fn 同一個位置只算一次() {
        let pad = LaunchPad { lat: -33.87, lon: 151.21 };
        assert!(Arc::ptr_eq(&ground_for(pad), &ground_for(pad)));
    }

    #[test]
    fn 簡化保留形狀的轉折() {
        let line = vec![(0.0, 0.0), (1.0, 0.001), (2.0, 0.0), (3.0, 1.0)];
        assert_eq!(simplify(&line), vec![(0.0, 0.0), (2.0, 0.0), (3.0, 1.0)]);
    }
}
