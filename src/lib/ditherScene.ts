// 碎念的點陣天空（畫布上的 D）：一團星雲、一顆土星，用 4×4 Bayer 矩陣二值化成一格一格的點。
// 土星是琥珀色的點、星雲與環是冷白的點，大片的黑留著。星星各自明滅，偶爾有一顆「閃過」
// （一瞬間亮成琥珀色再暗回去）；也可以從外面丟火花進來（碎念頁的滑鼠）。
//
// 星雲、土星、環這些不會動的亮度只算一次存起來，每幀只把會動的星星與火花疊上去——
// 一整頁那麼大的畫面也跑得動（每格都重算星雲的話，大畫面一幀要幾百萬次運算）。
// 首頁的碎念窗與碎念頁共用。座標都是 CSS 像素。
import { rng } from './horizon';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const AMBER = '#e9b864';
const SPARK = '#ffa046';
const BRIGHT = '#e3e9ff';
const DIM = '#9eadd1';
/** 每隔幾秒閃一顆 */
const FLASH_EVERY = 2.6;

export interface DitherLayout {
  /** 一格幾個 CSS 像素 */
  cell: number;
  /**
   * 土星的中心與半徑（相對畫面寬高；半徑是相對短邊）。null 是不畫：碎念頁有 3D 星空時，
   * 土星是 3D 那顆停到這個位置、碎成像素（見 lib/starfieldGpu 的 perch），這裡只留星雲與星星
   */
  saturn: { x: number; y: number; r: number } | null;
  /** 星雲所在的範圍（相對座標） */
  nebula: { x: number; y: number; w: number; h: number };
  stars: number;
  seed: number;
  /** 星雲的濃度（1 是窗裡的預設；大畫面要淡一點，不然像一整片灰毯子） */
  haze?: number;
  /**
   * 比這個還暗的就不畫。很淡的地方 Bayer 矩陣會排出一張規則的稀疏網格，大畫面上看起來像
   * 一塊方形的灰網；切掉之後星雲只剩有形狀的那幾團
   */
  floor?: number;
}

interface Spark {
  x: number;
  y: number;
  born: number;
}

export function createDitherScene(w: number, h: number, layout: DitherLayout) {
  const { cell } = layout;
  const floor = layout.floor ?? 0;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const base = new Float32Array(cols * rows);
  const amber = new Uint8Array(cols * rows);
  const extra = new Float32Array(cols * rows);
  const flare = new Float32Array(cols * rows);

  // ── 不會動的部分 ──
  const R = rng(layout.seed);
  // 每一團的大小跟著星雲的範圍走（首頁碎念窗的範圍是 0.32，那是原本調好的大小）
  const spread = Math.min(layout.nebula.w, layout.nebula.h) / 0.32;
  const blobs = Array.from({ length: 14 }, () => ({
    x: layout.nebula.x + R() * layout.nebula.w,
    y: layout.nebula.y + R() * layout.nebula.h,
    r: (0.08 + R() * 0.14) * spread,
    a: 0.25 + R() * 0.35,
  }));
  const sx = (layout.saturn?.x ?? 0) * w;
  const sy = (layout.saturn?.y ?? 0) * h;
  const sr = layout.saturn ? Math.min(w, h) * layout.saturn.r : 0;
  const ct = Math.cos(-0.32);
  const st = Math.sin(-0.32);
  const light = [-0.8, -0.45, 0.4];
  const ll = Math.hypot(...light);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const px = (x + 0.5) * cell;
      const py = (y + 0.5) * cell;
      // 星雲：幾團光暈疊起來之後用飽和曲線封頂（最亮 0.8），點陣才有疏密；兩組波疊出一絲一絲的雲紋
      let haze = 0;
      for (const b of blobs) {
        const dx = px / w - b.x;
        const dy = py / h - b.y;
        haze += b.a * Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
      }
      const wisp = 0.65 + 0.35 * Math.sin(px * 0.045 + py * 0.02) * Math.sin(py * 0.06 - px * 0.015);
      let lum = 0.8 * (1 - Math.exp(-haze * 1.4 * (layout.haze ?? 1))) * wisp;
      // 環（局部座標：轉正、把扁的橢圓拉回圓）與球面
      const rx = px - sx;
      const ry = py - sy;
      const ux = rx * ct + ry * st;
      const uy = (-rx * st + ry * ct) / 0.3;
      const rho = Math.hypot(ux, uy) / sr;
      const inPlanet = rx * rx + ry * ry < sr * sr;
      const ring = sr > 0 && rho > 1.45 && rho < 1.95 && Math.abs(rho - 1.7) > 0.05;
      if (inPlanet && !(ring && uy > 0)) {
        // 亮度留在 0–1 之間：明暗靠點的疏密表現（從左上方打光，背光那側疏）
        const nx = rx / sr;
        const ny = ry / sr;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const d = (nx * light[0] + ny * light[1] + nz * light[2]) / ll;
        lum = 0.09 + 0.75 * Math.pow(Math.max(0, d), 1.4);
        amber[i] = 1;
      } else if (ring) {
        lum = Math.max(lum, 0.5 - Math.abs(rho - 1.7) * 0.6);
      }
      base[i] = lum;
    }
  }

  const stars = Array.from({ length: layout.stars }, () => ({
    x: R() * cols,
    y: R() * rows,
    peak: 0.4 + Math.pow(R(), 3) * 1.1,
    phase: R() * Math.PI * 2,
    speed: 0.4 + R() * 1.2,
  }));
  const sparks: Spark[] = [];

  /** 在格子座標 (cx, cy) 疊一顆亮度 v 的星 */
  const stamp = (cx: number, cy: number, v: number, into: Float32Array) => {
    const rad = 0.7 + v * 1.1;
    const reach = Math.ceil(rad * 2.2);
    for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(rows, cy + reach); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(cols, cx + reach); x++) {
        into[y * cols + x] += v * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (rad * rad));
      }
    }
  };

  return {
    /** 從外面丟一顆火花進來（CSS 像素座標）：一瞬間亮成琥珀色、再暗回去 */
    spark(x: number, y: number, t: number) {
      if (sparks.length > 40) sparks.shift();
      sparks.push({ x: x / cell, y: y / cell, born: t });
    },

    /**
     * reveal（0–1）：亮度先乘上它再跟 Bayer 門檻比，點是一顆一顆長出來的（點陣自己的淡入），
     * 不是整張畫布調透明度
     */
    draw(ctx: CanvasRenderingContext2D, t: number, reveal = 1) {
      extra.fill(0);
      flare.fill(0);
      const k = Math.floor(t / FLASH_EVERY);
      const flashing = (k * 37) % Math.max(1, stars.length);
      const ft = (t - k * FLASH_EVERY) / 0.9;
      stars.forEach((s, i) => {
        const v = s.peak * (0.75 + 0.25 * Math.sin(t * s.speed + s.phase));
        stamp(s.x, s.y, v, extra);
        if (i === flashing && ft < 1) stamp(s.x, s.y, Math.sin(Math.PI * Math.min(1, ft * 1.6)) * (1 - ft) * 3, flare);
      });
      for (let n = sparks.length - 1; n >= 0; n--) {
        const age = (t - sparks[n].born) / 0.8;
        if (age >= 1) {
          sparks.splice(n, 1);
          continue;
        }
        stamp(sparks[n].x, sparks[n].y, Math.sin(Math.PI * Math.min(1, age * 2)) * (1 - age) * 2.6, flare);
      }
      // 不清畫面：底色由呼叫端決定（窗是一塊深色底，碎念頁是透明的）
      const size = cell - 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const lum = (base[i] + extra[i]) * reveal + flare[i];
          if (lum < floor || lum < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) continue;
          ctx.fillStyle = flare[i] > 1.1 ? SPARK : amber[i] ? AMBER : lum > 0.9 ? BRIGHT : DIM;
          ctx.fillRect(x * cell, y * cell, size, size);
        }
      }
    },
  };
}
