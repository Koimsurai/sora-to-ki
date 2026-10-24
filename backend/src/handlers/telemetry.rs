//! `GET /api/telemetry`：這台伺服器的幾個即時數字（設備頁 HOME SERVER 那張圖紙的遙測）。
//!
//! 刻意只給不會被拿來利用的數字：CPU 溫度、負載、記憶體用量、APU 整顆的功耗，都取整。
//! **不給運作時間**（看得出多久沒重開、核心多久沒更新）、容器、服務、版本、IP、主機名。
//! 讀的是 `/sys/class/hwmon` 與 `/proc`（容器裡看到的就是主機的），回應由路由層快取 30 秒，
//! 所以不管多少人在看，最多每 30 秒才真的去讀一次。

use std::fs;
use std::path::{Path, PathBuf};

use axum::Json;
use serde::Serialize;

/// `GET /api/telemetry` 的回應。每個欄位讀不到就是 null（例如換了機器、沒有那顆感測器）
#[derive(Debug, Default, PartialEq, Eq, Serialize, specta::Type, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    /// CPU 溫度（°C）：k10temp 的 Tctl
    pub cpu_temp: Option<u32>,
    /// 一分鐘平均負載除以邏輯核心數（百分比，可能超過 100）
    pub load: Option<u32>,
    /// 記憶體用了幾成（百分比）：(總量 − 可用) / 總量
    pub memory: Option<u32>,
    /// APU 整顆的功耗（W）：amdgpu 的 power1_input（APU 回報的是整顆封裝）
    pub power: Option<u32>,
}

/// 找名字是 `name` 的那個 hwmon 目錄（hwmon 的編號開機時才決定，不能寫死）
fn hwmon_named(root: &Path, name: &str) -> Option<PathBuf> {
    fs::read_dir(root)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| fs::read_to_string(p.join("name")).is_ok_and(|n| n.trim() == name))
}

fn read_u64(path: &Path) -> Option<u64> {
    fs::read_to_string(path).ok()?.trim().parse().ok()
}

/// 千分之一的單位（毫攝氏度）四捨五入成整數
fn round_thousandths(v: u64) -> u32 {
    u32::try_from((v + 500) / 1000).unwrap_or(u32::MAX)
}

/// `/proc/loadavg` 的第一個數字（一分鐘平均）
fn parse_loadavg(s: &str) -> Option<f64> {
    s.split_whitespace().next()?.parse().ok()
}

/// `/proc/cpuinfo` 裡有幾個邏輯核心（容器的 cgroup 限制不影響主機的負載，所以照主機的算）
fn parse_cpu_count(s: &str) -> usize {
    s.lines().filter(|l| l.starts_with("processor")).count()
}

/// `/proc/meminfo` → 用了幾成
fn parse_memory(s: &str) -> Option<u32> {
    let field = |key: &str| -> Option<u64> {
        let line = s.lines().find(|l| l.starts_with(key))?;
        line.split_whitespace().nth(1)?.parse().ok()
    };
    let total = field("MemTotal:")?;
    let available = field("MemAvailable:")?;
    if total == 0 {
        return None;
    }
    let used = total.saturating_sub(available);
    u32::try_from((used * 100 + total / 2) / total).ok()
}

/// 負載換成百分比：一分鐘平均負載 / 核心數
fn load_percent(load: f64, cpus: usize) -> Option<u32> {
    if cpus == 0 || !load.is_finite() || load < 0.0 {
        return None;
    }
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        clippy::cast_precision_loss,
        reason = "負載已確認是非負的有限數，核心數只有幾十，乘 100 再四捨五入遠小於 u32 上限"
    )]
    let pct = (load / cpus as f64 * 100.0).round() as u32;
    Some(pct)
}

/// 讀一次。`hwmon` 與 `proc` 是根目錄（測試時換成假的目錄）
pub fn read(hwmon: &Path, proc_root: &Path) -> Telemetry {
    let cpu_temp =
        hwmon_named(hwmon, "k10temp").and_then(|d| read_u64(&d.join("temp1_input"))).map(round_thousandths);
    let power = hwmon_named(hwmon, "amdgpu").and_then(|d| {
        read_u64(&d.join("power1_input"))
            .or_else(|| read_u64(&d.join("power1_average")))
            // 微瓦 → 瓦
            .map(|uw| round_thousandths(uw / 1000))
    });
    let cpus = fs::read_to_string(proc_root.join("cpuinfo")).map_or(0, |s| parse_cpu_count(&s));
    let load = fs::read_to_string(proc_root.join("loadavg"))
        .ok()
        .and_then(|s| parse_loadavg(&s))
        .and_then(|l| load_percent(l, cpus));
    let memory = fs::read_to_string(proc_root.join("meminfo")).ok().and_then(|s| parse_memory(&s));
    Telemetry { cpu_temp, load, memory, power }
}

/// `GET /api/telemetry`
#[utoipa::path(get, path = "/api/telemetry", tag = "home",
    responses((status = 200, description = "伺服器的幾個即時數字（溫度、負載、記憶體、功耗），快取 30 秒", body = Telemetry)))]
pub async fn telemetry() -> Json<Telemetry> {
    Json(read(Path::new("/sys/class/hwmon"), Path::new("/proc")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 假的 /sys/class/hwmon 與 /proc：每個測試一個獨立的暫存目錄
    fn fixture(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("telemetry-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("hwmon/hwmon0")).unwrap();
        fs::create_dir_all(root.join("hwmon/hwmon3")).unwrap();
        fs::create_dir_all(root.join("hwmon/hwmon6")).unwrap();
        fs::create_dir_all(root.join("proc")).unwrap();
        fs::write(root.join("hwmon/hwmon0/name"), "nvme\n").unwrap();
        fs::write(root.join("hwmon/hwmon3/name"), "k10temp\n").unwrap();
        fs::write(root.join("hwmon/hwmon3/temp1_input"), "81625\n").unwrap();
        fs::write(root.join("hwmon/hwmon6/name"), "amdgpu\n").unwrap();
        fs::write(root.join("hwmon/hwmon6/power1_input"), "42500000\n").unwrap();
        fs::write(root.join("proc/loadavg"), "5.10 4.07 4.22 6/48021 32181\n").unwrap();
        fs::write(root.join("proc/cpuinfo"), "processor\t: 0\nfoo\nprocessor\t: 1\n").unwrap();
        fs::write(
            root.join("proc/meminfo"),
            "MemTotal:       1000 kB\nMemFree:  100 kB\nMemAvailable:   250 kB\n",
        )
        .unwrap();
        root
    }

    #[test]
    fn reads_every_field_from_the_real_layout() {
        let root = fixture("all");
        let t = read(&root.join("hwmon"), &root.join("proc"));
        assert_eq!(t, Telemetry { cpu_temp: Some(82), load: Some(255), memory: Some(75), power: Some(43) });
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_sensors_are_null_not_errors() {
        let root = fixture("missing");
        fs::remove_dir_all(root.join("hwmon/hwmon3")).unwrap();
        fs::remove_file(root.join("hwmon/hwmon6/power1_input")).unwrap();
        fs::write(root.join("hwmon/hwmon6/power1_average"), "9400000").unwrap();
        fs::remove_file(root.join("proc/cpuinfo")).unwrap();
        let t = read(&root.join("hwmon"), &root.join("proc"));
        assert_eq!(t.cpu_temp, None);
        // power1_input 不在就退回 power1_average
        assert_eq!(t.power, Some(9));
        // 不知道有幾顆核心就不算負載
        assert_eq!(t.load, None);
        assert_eq!(t.memory, Some(75));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn nothing_readable_gives_all_nulls() {
        let t = read(Path::new("/nonexistent/hwmon"), Path::new("/nonexistent/proc"));
        assert_eq!(t, Telemetry::default());
    }

    #[test]
    fn parsers_reject_garbage() {
        assert_eq!(parse_loadavg(""), None);
        assert_eq!(parse_loadavg("x 1 2"), None);
        assert_eq!(parse_memory("MemTotal: 0 kB\nMemAvailable: 0 kB"), None);
        assert_eq!(parse_memory("MemFree: 1 kB"), None);
        assert_eq!(load_percent(1.0, 0), None);
        assert_eq!(load_percent(f64::NAN, 4), None);
        assert_eq!(load_percent(-1.0, 4), None);
        assert_eq!(load_percent(2.0, 4), Some(50));
        assert_eq!(round_thousandths(499), 0);
        assert_eq!(round_thousandths(500), 1);
    }
}
