// 航行日誌的畫布：從地表升空。仰角看一段點畫的地球邊緣，火箭從發射台離地，
// 沿著一個垂直於地面的平面爬升：往遠方是時間（從站點誕生到今天），離地高度是累積的 GitHub 貢獻。
// 改版是軌跡上的節點；每天的貢獻是地上沿著地面軌跡排開的燈（一天一盞、一週七排），近大遠小。
// 火箭的角度照重力轉向：離地時垂直，之後慢慢往下壓，平滑地變，不跟著每天的資料抖。
// 地表照真實的地理畫：發射台在台灣，往右是東、往遠方是北；陸地用首頁土星那種刻線畫，看得出台灣、福建沿海、九州與琉球。
// 這裡只畫點、線與插圖，字（里程碑的名字、遙測讀數、提示）是疊在上面的 DOM。

import LAND_DATA from '@/data/landAroundTaiwan.json';

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const GROUND = '10, 10, 12';
const TAU = Math.PI * 2;
const DAY_MS = 86400000;
/** 字型：地上的月份刻度是數字，用等寬字畫在畫布上（數字不需要裁字） */
const MONO = '10px "Fira Code Variable", "Fira Code", ui-monospace, monospace';

/** 火箭線稿（public/illustrations/rocket-ascent.webp，568×878）：噴嘴出口與機鼻的位置（原圖比例） */
const ROCKET = { src: '/illustrations/rocket-ascent.webp', nozzle: [0.074, 0.957], nose: [0.968, 0.017] } as const;
export const ROCKET_SRC = ROCKET.src;
/** 火箭畫多長（噴嘴到機鼻，CSS 像素，會跟著遠近縮放） */
const ROCKET_LEN = 120;
/** 火焰的點活多久（秒） */
const FLAME_LIFE = 0.55;

// ── 世界：地球半徑 R，軌跡在 z = 0 的平面上，θ 是繞地心的角度（往右是時間）──
const R = 4000;
/** 發射台的角度與整段時間跨過的角度 */
const THETA0 = -0.085;
const SPAN = 0.16;
/** 累積貢獻最多爬到多高 */
const ALT_MAX = 320;
/** 地上的燈一排隔多寬（一週七排，往鏡頭這邊排開） */
const LANE = 22;
/** 軌道的平滑程度（天）：越大越順 */
const SMOOTH_DAYS = 14;
/** 大氣層頂在多高：火箭穿過去之後星空才浮出來 */
const ATMOSPHERE = 40;

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
/** 地心往 θ 方向的單位向量（離地的「上」） */
const radial = (th: number): V3 => [Math.sin(th), Math.cos(th), 0];
/** θ 方向的地面切線（往右、往未來） */
const downrange = (th: number): V3 => [Math.cos(th), -Math.sin(th), 0];

interface ScreenPoint {
  x: number;
  y: number;
  /** 透視縮放（近的大） */
  s: number;
}

export interface LogFrame {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 換頁進來後火箭從發射台爬到現在的進度（0–1） */
  grow: number;
  /** 換頁離開的進度（0–1）：火箭沿機身方向飛走，其他的淡掉 */
  erase: number;
  /** 滑鼠在畫面上的水平位置（-1–1，沒有是 0）：鏡頭跟著輕微轉一點 */
  look: number;
  /** 滑到的里程碑索引（沒有是 -1） */
  milestone: number;
  /** 滑到的那一天（沒有是 -1） */
  day: number;
  rocket: HTMLImageElement | null;
}

const dayIndex = (start: number, date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - start) / DAY_MS);

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 火箭畫多長：跟著遠近縮放，窄螢幕再小一點 */
const rocketLen = (w: number, s: number) =>
  ROCKET_LEN * Math.min(1.3, Math.max(0.6, s)) * Math.min(1, Math.max(0.55, w / 1100));

interface Camera {
  eye: V3;
  project: (p: V3) => ScreenPoint | null;
}

/** 半徑 radius 的球從鏡頭看過去的輪廓（畫面上那一段連續的弧，照順序） */
function silhouette(cam: Camera, radius: number, w: number, h: number) {
  const eyeLen = Math.hypot(cam.eye[0], cam.eye[1], cam.eye[2]);
  const k = (radius * radius) / (eyeLen * eyeLen);
  const center = mul(cam.eye, k);
  const rad = radius * Math.sqrt(1 - k);
  const nrm = norm(cam.eye);
  const u = norm(cross(nrm, [0, 0, 1]));
  const v = cross(nrm, u);
  const n = 360;
  const pts: (ScreenPoint | null)[] = [];
  for (let s = 0; s < n; s++) {
    const ang = (s / n) * TAU;
    const p = cam.project(add(center, add(mul(u, Math.cos(ang) * rad), mul(v, Math.sin(ang) * rad))));
    pts.push(p && p.x > -3 * w && p.x < 4 * w && p.y > -3 * h && p.y < 4 * h ? p : null);
  }
  // 取最長的一段連續可見的點（繞圈的，所以從一個空缺後面開始數）
  const gap = pts.findIndex((p) => !p);
  if (gap < 0) return pts.filter((p): p is ScreenPoint => p !== null);
  let best: ScreenPoint[] = [];
  let run: ScreenPoint[] = [];
  for (let s = 1; s <= n; s++) {
    const p = pts[(gap + s) % n];
    if (p) run.push(p);
    else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  return run.length > best.length ? run : best;
}

/** 發射台在台灣（跟收藏頁地球上的琥珀點同一個地方）；往右是東、往遠方是北 */
const PAD_LAT = 23.7;
const PAD_LON = 121;
/** 地表一個世界單位是幾度：放大到台灣周邊，發射台底下是看得清楚的一整座島 */
const DEG_PER_UNIT = 0.008;
/** 地表最近畫到哪（橫向位置）：再近就到鏡頭底下了 */
const NEAR_Z = 900;

/** 台灣周邊的陸地（data/landAroundTaiwan.json）：Natural Earth 50m land（公有領域）的多邊形，
 *  用 Sutherland–Hodgman 裁到畫面看得到的這一塊（北緯 14–43、東經 113–134），再以 0.03° 做 Douglas–Peucker 簡化。
 *  一塊陸地是幾個環（第一個是外圈，其餘是湖），每個環是一串 [經度×100, 緯度×100, …]。這裡換成地表座標（θ、橫向位置） */
const LAND: [number, number][][][] = LAND_DATA.map((poly) =>
  poly.map((ring) => {
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const lon = ring[i] / 100;
      const lat = ring[i + 1] / 100;
      pts.push([THETA0 + (lon - PAD_LON) / (R * DEG_PER_UNIT), (PAD_LAT - lat) / DEG_PER_UNIT]);
    }
    return pts;
  }),
);

/** 地表上 θ、橫向位置的那一點（橫向也照著地球的弧度往下彎） */
const surfaceAt = (a: number, z: number): V3 => {
  const r = radial(a);
  const bend = (z * z) / (2 * R);
  return [r[0] * (R - bend), r[1] * (R - bend), z];
};

/** 海面的點：一片稀疏的經緯點，固定一組 */
const SURFACE = (() => {
  const out: [number, number][] = [];
  for (let a = THETA0 - 0.2; a <= THETA0 + SPAN + 0.2; a += 0.012) {
    for (let z = -2200; z <= 1000; z += 48) out.push([a, z]);
  }
  return out;
})();

export function createLog(start: string, counts: number[], milestoneDates: string[]) {
  const N = Math.max(2, counts.length);
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const cum: number[] = [];
  counts.reduce((a, c, i) => (cum[i] = a + c), 0);
  const total = cum[cum.length - 1] || 1;
  const startDow = new Date(startMs).getDay();
  const msIndex = milestoneDates.map((d) => Math.max(0, Math.min(N - 1, dayIndex(startMs, d))));
  // 地上的月份刻度：每三個月一個
  const ticks: { i: number; label: string }[] = [];
  for (let m = new Date(startMs); ; m = new Date(m.getFullYear(), m.getMonth() + 3, 1)) {
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const i = Math.round((first.getTime() - startMs) / DAY_MS);
    if (i >= N) break;
    if (i > 0) ticks.push({ i, label: `${first.getFullYear()}.${String(first.getMonth() + 1).padStart(2, '0')}` });
  }
  const flame: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

  // 火箭走自己的軌道：累積貢獻先做高斯平滑（σ = SMOOTH_DAYS），畫出來是一條順的升空曲線，
  // 每天的起伏留給地上的燈。高度可以取小數天，爬升時火箭連續地動，不會一天跳一格
  const alt = (() => {
    const out: number[] = [];
    const k = Math.ceil(SMOOTH_DAYS * 3);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let wsum = 0;
      for (let j = -k; j <= k; j++) {
        const c = cum[Math.max(0, Math.min(N - 1, i + j))] ?? 0;
        const wt = Math.exp(-(j * j) / (2 * SMOOTH_DAYS * SMOOTH_DAYS));
        sum += c * wt;
        wsum += wt;
      }
      out.push((sum / wsum / total) * ALT_MAX);
    }
    // 起點貼地：平滑會把第一天抬起來一點，整條往下扣回去
    const lift = out[0] ?? 0;
    return out.map((a, idx) => Math.max(0, a - lift * (1 - idx / (N - 1))));
  })();
  const thetaOf = (i: number) => THETA0 + (i / (N - 1)) * SPAN;
  const altOf = (i: number) => {
    const c = Math.max(0, Math.min(N - 1, i));
    const a = Math.floor(c);
    const b = Math.min(N - 1, a + 1);
    return (alt[a] ?? 0) + ((alt[b] ?? 0) - (alt[a] ?? 0)) * (c - a);
  };
  /** 軌跡上第 i 天的位置（世界座標） */
  const pathAt = (i: number): V3 => mul(radial(thetaOf(i)), R + altOf(i));
  /** 第 i 天的燈在地上的位置：沿地面軌跡，一週七排往鏡頭這邊排開 */
  const lightAt = (i: number): V3 => {
    const dow = (startDow + i) % 7;
    const p = mul(radial(thetaOf(i)), R);
    return [p[0], p[1], 40 + dow * LANE];
  };

  /** 飛行路徑角：就是畫出來那條軌跡的切線，火箭永遠順著自己拖出來的線飛 */
  const gammaAt = (i: number) => {
    const a = Math.max(0, i - 4);
    const b = Math.min(N - 1, i + 4);
    const climb = altOf(b) - altOf(a);
    const run = ((b - a) / (N - 1)) * SPAN * R || 1;
    return Math.atan2(climb, run);
  };

  const camera = (w: number, h: number, look: number) => {
    const mid = THETA0 + SPAN * 0.55;
    const up0 = radial(mid);
    const target = mul(up0, R + 120);
    // 鏡頭在軌跡平面的前方偏左、離地有點高，往遠方的地平線看過去；滑鼠帶著它轉一點點
    const yaw = look * 0.05;
    const back: V3 = [Math.sin(yaw) * 1100, 0, Math.cos(yaw) * 1100];
    const eye = add(add(target, back), add(mul(up0, 230), mul(downrange(mid), -120)));
    const f = norm(sub(target, eye));
    const right = norm(cross(f, up0));
    const up = cross(right, f);
    const fl = Math.min(w * 1.1, h * 1.5);
    const cx = w * 0.5;
    const cy = h * 0.52;
    const project = (p: V3): ScreenPoint | null => {
      const d = sub(p, eye);
      const z = dot(d, f);
      if (z < 10) return null;
      return { x: cx + (fl * dot(d, right)) / z, y: cy - (fl * dot(d, up)) / z, s: 1100 / z };
    };
    /** 地表上這一點朝不朝向鏡頭（背面的不畫） */
    const facing = (p: V3) => dot(p, sub(eye, p)) > 0;
    return { eye, project, facing };
  };

  /** 火箭在第 i 天的位置與機身方向（螢幕上），離場時沿機身方向往前飛 fly 的距離 */
  const rocketAt = (cam: ReturnType<typeof camera>, i: number, fly: number) => {
    const th = thetaOf(i);
    const g = gammaAt(i);
    const dir = norm(add(mul(downrange(th), Math.cos(g)), mul(radial(th), Math.sin(g))));
    const base = add(pathAt(i), mul(dir, fly));
    const a = cam.project(base);
    const b = cam.project(add(base, mul(dir, 20)));
    if (!a || !b) return null;
    return { x: a.x, y: a.y, s: a.s, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  return {
    total,
    counts,
    /** 到第 i 天為止累積幾次貢獻 */
    cumAt: (i: number) => cum[Math.max(0, Math.min(cum.length - 1, i))] ?? 0,
    milestoneIndex: msIndex,
    /** 發射台在畫面上的位置（換頁的點落在這裡） */
    pad: (w: number, h: number) => camera(w, h, 0).project(pathAt(0)),
    /** 里程碑在畫面上的位置 */
    milestonesAt: (w: number, h: number, look: number) => {
      const cam = camera(w, h, look);
      return msIndex.map((i) => cam.project(pathAt(i)));
    },
    /** 第 i 天的燈在畫面上的位置 */
    lightOnScreen: (w: number, h: number, look: number, i: number) => camera(w, h, look).project(lightAt(i)),
    /** 火箭的機鼻：離開時點跟著它 */
    rocketNose: (w: number, h: number, look: number, erase: number) => {
      const cam = camera(w, h, look);
      const r = rocketAt(cam, N - 1, erase * erase * 900);
      if (!r) return null;
      const len = rocketLen(w, r.s);
      return { x: r.x + Math.cos(r.angle) * len, y: r.y + Math.sin(r.angle) * len, angle: r.angle };
    },
    /** 滑鼠在哪個里程碑或哪一天的燈上 */
    hit(w: number, h: number, look: number, px: number, py: number) {
      const cam = camera(w, h, look);
      let milestone = -1;
      let best = 14;
      msIndex.forEach((i, k) => {
        const p = cam.project(pathAt(i));
        if (!p) return;
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < best) {
          best = d;
          milestone = k;
        }
      });
      let day = -1;
      if (milestone < 0) {
        let bestDay = 7;
        for (let i = 0; i < counts.length; i++) {
          const p = cam.project(lightAt(i));
          if (!p) continue;
          const d = Math.hypot(px - p.x, py - p.y);
          if (d < bestDay) {
            bestDay = d;
            day = i;
          }
        }
      }
      return { milestone, day };
    },

    draw(ctx: CanvasRenderingContext2D, f: LogFrame) {
      const { w, h, t, dt, grow, erase, look, milestone, day, rocket } = f;
      ctx.clearRect(0, 0, w, h);
      const cam = camera(w, h, look);
      const fade = 1 - erase;
      // 火箭飛到哪一天（可以是小數：連續地動）
      const upto = Math.max(0, Math.min(N - 1, grow * (N - 1)));
      const tip = Math.floor(upto);

      // 天空：火箭還在大氣層裡時蓋一層暗幕，穿過大氣層頂之後星空才浮出來
      const through = smooth(Math.max(0, Math.min(1, (altOf(upto) - ATMOSPHERE * 0.6) / (ATMOSPHERE * 0.8))));
      if (through < 1) {
        ctx.fillStyle = `rgba(${GROUND}, ${0.92 * (1 - through) * fade})`;
        ctx.fillRect(0, 0, w, h);
      }

      // 地球：從鏡頭看過去的輪廓塗成不透明，把背後的星星擋掉（星空只在大氣層外）
      const earth = silhouette(cam, R, w, h);
      if (earth.length > 1) {
        ctx.fillStyle = `rgba(${GROUND}, ${fade})`;
        ctx.beginPath();
        earth.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        const first = earth[0];
        const last = earth[earth.length - 1];
        ctx.lineTo(last.x, h * 4);
        ctx.lineTo(first.x, h * 4);
        ctx.closePath();
        ctx.fill();
      }

      // 地表：一片稀疏的經緯點，朝鏡頭的那一面，越遠越淡
      for (const [a, z] of SURFACE) {
        const q = surfaceAt(a, z);
        if (!cam.facing(q)) continue;
        const s = cam.project(q);
        if (!s || s.x < -10 || s.x > w + 10 || s.y < -10 || s.y > h + 10) continue;
        ctx.fillStyle = `rgba(${INK}, ${Math.min(0.16, 0.04 + 0.08 * s.s) * fade})`;
        ctx.fillRect(s.x, s.y, 1.2, 1.2);
      }

      // 陸地：只描海岸線（線稿），細、淡一階，不壓住上面的字與每天的燈。
      // 照原本的點一段一段連，看不到的那段（地平線後面、比鏡頭近、超出畫面兩側）就提筆——
      // 不裁成封閉的形狀，才不會在地平線上多出一條裁切出來的直邊。整塊裁在地球的輪廓裡
      if (earth.length > 1) {
        ctx.save();
        ctx.beginPath();
        earth.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.lineTo(earth[earth.length - 1].x, h * 4);
        ctx.lineTo(earth[0].x, h * 4);
        ctx.closePath();
        ctx.clip();
        const seen = (a: number, z: number) =>
          z <= NEAR_Z && a >= THETA0 - 0.18 && a <= THETA0 + SPAN + 0.18 && cam.facing(surfaceAt(a, z));
        ctx.strokeStyle = `rgba(${INK}, ${0.42 * fade})`;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const poly of LAND) {
          for (const ring of poly) {
            let pen = false;
            // 環是首尾相接的：多走一個點回到起點，最後一段海岸也畫上
            for (let n = 0; n <= ring.length; n++) {
              const [a, z] = ring[n % ring.length];
              const s = seen(a, z) ? cam.project(surfaceAt(a, z)) : null;
              if (!s) {
                pen = false;
                continue;
              }
              if (pen) ctx.lineTo(s.x, s.y);
              else ctx.moveTo(s.x, s.y);
              pen = true;
            }
          }
        }
        ctx.stroke();
        ctx.lineJoin = 'miter';
        ctx.restore();
      }

      // 地平線：地球的邊緣，外面一層很薄的大氣光；再往上一層虛線是大氣層頂
      for (const [width, alpha] of [
        [18, 0.02],
        [6, 0.04],
        [3, 0.08],
        [1, 0.4],
      ] as const) {
        ctx.strokeStyle = `rgba(${INK}, ${alpha * fade})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        earth.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      const shell = silhouette(cam, R + ATMOSPHERE, w, h);
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = `rgba(${INK}, ${0.14 * fade})`;
      ctx.beginPath();
      shell.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);

      // 地面軌跡：發射台到今天正下方的一條點線，月份刻度標在上面
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = `rgba(${INK}, ${0.22 * fade})`;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < N; i += 4) {
        const p = cam.project(mul(radial(thetaOf(i)), R));
        if (!p) continue;
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = MONO;
      ctx.textAlign = 'center';
      // 窄螢幕上刻度會擠在一起：離上一個太近的就跳過
      let lastX = -Infinity;
      for (const tk of ticks) {
        const p = cam.project(mul(radial(thetaOf(tk.i)), R));
        if (!p || p.x - lastX < 56) continue;
        lastX = p.x;
        ctx.fillStyle = `rgba(${INK}, ${0.4 * fade})`;
        ctx.fillText(tk.label, p.x, p.y - 8);
      }

      // 地上的燈：每天一盞，火箭飛過去才亮；有貢獻的會微微閃
      for (let i = 0; i <= tip && i < counts.length; i++) {
        const p = cam.project(lightAt(i));
        if (!p) continue;
        const c = counts[i];
        const on = i === day;
        const flick = c ? 0.85 + 0.15 * Math.sin(t * 2.3 + i * 1.7) : 1;
        const r = (c ? Math.min(3.6, 0.9 + Math.sqrt(c) * 0.45) : 0.6) * Math.min(1.4, 0.55 + p.s * 0.6);
        ctx.fillStyle = `rgba(${INK}, ${(on ? 1 : c ? Math.min(1, 0.3 + c / 30) * flick : 0.1) * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, on ? r + 1.5 : r, 0, TAU);
        ctx.fill();
      }

      // 軌跡：從發射台爬到現在的一條線；底下垂幾條淡淡的線，看得出離地多高
      ctx.strokeStyle = `rgba(${INK}, ${0.6 * fade})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      pen = false;
      for (let i = 0; i <= tip; i++) {
        const p = cam.project(pathAt(i));
        if (!p) continue;
        if (pen) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
        pen = true;
      }
      const end = cam.project(pathAt(upto));
      if (end && pen) ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${INK}, ${0.06 * fade})`;
      for (let i = 0; i <= tip; i += 14) {
        const a = cam.project(pathAt(i));
        const b = cam.project(mul(radial(thetaOf(i)), R));
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // 改版的節點：火箭飛過去才出現
      msIndex.forEach((i, idx) => {
        if (i > tip) return;
        const p = cam.project(pathAt(i));
        if (!p) return;
        const on = idx === milestone;
        ctx.fillStyle = `rgba(${INK}, ${(on ? 1 : 0.75) * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, on ? 4.6 : 3, 0, TAU);
        ctx.fill();
        if (on) {
          ctx.strokeStyle = `rgba(${INK}, ${0.5 * fade})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, TAU);
          ctx.stroke();
        }
      });

      // 發射台：起點地上一個小三角
      const pad = cam.project(pathAt(0));
      if (pad) {
        ctx.strokeStyle = `rgba(${INK}, ${0.7 * fade})`;
        ctx.beginPath();
        ctx.moveTo(pad.x - 6, pad.y + 2);
        ctx.lineTo(pad.x, pad.y - 8);
        ctx.lineTo(pad.x + 6, pad.y + 2);
        ctx.closePath();
        ctx.stroke();
      }

      // 現在：軌跡最前端的琥珀點與火箭
      const here = cam.project(pathAt(upto));
      const rk = rocketAt(cam, upto, erase * erase * 900);
      if (here) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        const glow = ctx.createRadialGradient(here.x, here.y, 0, here.x, here.y, 16 + pulse * 8);
        glow.addColorStop(0, `rgba(${AMBER}, ${0.6 * fade})`);
        glow.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(here.x, here.y, 24, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${AMBER}, ${fade})`;
        ctx.beginPath();
        ctx.arc(here.x, here.y, 3.6, 0, TAU);
        ctx.fill();
      }
      if (rk) {
        // 火焰：從噴嘴往機身的反方向噴，近的是琥珀色、遠的變成墨色
        for (let n = 0; n < 3; n++) {
          const a = rk.angle + Math.PI + (Math.random() - 0.5) * 0.45;
          const sp = 30 + Math.random() * 45;
          flame.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0 });
        }
        for (let n = flame.length - 1; n >= 0; n--) {
          const p = flame[n];
          p.life += dt;
          if (p.life > FLAME_LIFE) {
            flame.splice(n, 1);
            continue;
          }
          const q = p.life / FLAME_LIFE;
          const px = Math.round((p.x + p.vx * p.life) / 2) * 2;
          const py = Math.round((p.y + p.vy * p.life) / 2) * 2;
          ctx.fillStyle = q < 0.35 ? `rgba(${AMBER}, ${0.9 * (1 - q)})` : `rgba(${INK}, ${0.6 * (1 - q) * fade})`;
          ctx.fillRect(px, py, 2, 2);
        }
        if (rocket?.complete && rocket.naturalWidth) {
          const rw = rocket.naturalWidth;
          const rh = rocket.naturalHeight;
          const ax = (ROCKET.nose[0] - ROCKET.nozzle[0]) * rw;
          const ay = (ROCKET.nose[1] - ROCKET.nozzle[1]) * rh;
          const sc = rocketLen(w, rk.s) / Math.hypot(ax, ay);
          ctx.save();
          ctx.translate(rk.x, rk.y);
          ctx.rotate(rk.angle - Math.atan2(ay, ax));
          ctx.drawImage(rocket, -ROCKET.nozzle[0] * rw * sc, -ROCKET.nozzle[1] * rh * sc, rw * sc, rh * sc);
          ctx.restore();
        }
      }
      return { tip, upto, now: here };
    },
  };
}
