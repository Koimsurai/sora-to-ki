// 關於頁的近景（about/AboutFall）。整頁是一段下墜，背景的星星就是下墜的參照：
//   - 星：平常是點，捲得越快往上拉成越長的線（關於頁收掉了一般的背景星空，見 hooks/useBareSky）
//   - 地平線：落地時升上來的一顆星球的邊——近處有起伏、長著草，後面兩層更遠的山稜
//   - 樹：長在地平線上，有粗細、有樹葉，跟著風輕輕晃
//   - 返回艙：掛著降落傘一起降下，著地彈一下、揚起一陣土，傘慢慢塌下去躺在地上
//   - 地層：往下挖時一層一層越來越密的點線，地心一點琥珀光
//   - 高度計：右邊的尺，下墜時是離地表幾公里，往下挖時換成地表以下幾公尺
// 琥珀點（讀者）由頁面算位置（它會從標題的句號落到高度計上，著地時停在「就此落下。」的句號），
// 這裡只負責畫。畫布固定在視窗上，位置都由捲動算出來；這裡只有畫圖，不碰 React。
import type { Pt } from '@/store/pageTransition';

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 起點的高度（公里）：地球同步軌道那麼高 */
const TOP_KM = 36000;
/** 地底的深度刻度（公尺）：挖到地心是這麼深 */
const CORE_M = 320;

/** 返回艙插圖（public/illustrations/reentry-parachute.webp）：原圖尺寸、傘與艙的分界、吊帶的位置、腳底 */
const CW = 483;
const CH = 900;
const SPLIT = 0.78;
const RISER = [0.5, 0.6] as const;
const FOOT = 0.94;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const fmt = (n: number) => n.toLocaleString('en-US');

/** 有種子的亂數：樹、草、山稜每次打開都長一樣 */
function seeded(seed: number) {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    s = (Math.imul(s, 48271) + 1) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

export interface FallState {
  w: number;
  h: number;
  /** 秒 */
  t: number;
  dt: number;
  /** 頁面捲了多少（頁面座標） */
  top: number;
  /** 0 到 1：捲得多快（星就拉多長） */
  speed: number;
  /** 各段在頁面座標裡的位置 */
  landTop: number;
  layerTop: number;
  coreMid: number;
  chapterMids: number[];
  maxScroll: number;
  /** 高度計上的兩個字（已經翻好） */
  labels: { fall: string; dig: string };
  /** 字型堆疊（高度計的數字用等寬字） */
  mono: string;
  /** 琥珀點（讀者）在畫面上的位置；null 是轉場正在畫它，這裡不畫 */
  dot: Pt | null;
}

/** 下墜的三個進度：落下了多少、著地了沒、挖了多深（像素） */
export function phases(s: Pick<FallState, 'h' | 'top' | 'landTop' | 'layerTop'>) {
  const landAt = s.landTop - s.h * 0.25;
  return {
    landAt,
    pFall: clamp01(s.top / landAt),
    landK: smooth(landAt - s.h * 0.9, landAt, s.top),
    dig: Math.max(0, s.top - (s.layerTop - s.h * 0.75)),
  };
}

/** 高度計上的記號在畫面上的位置（琥珀點下墜時就停在這裡） */
export function meterMark(s: Pick<FallState, 'w' | 'h' | 'top' | 'landTop' | 'layerTop' | 'maxScroll'>): Pt {
  const { pFall, dig } = phases(s);
  const y0 = 96;
  const y1 = s.h - 80;
  const digSpan = Math.max(1, s.maxScroll - (s.layerTop - s.h * 0.75));
  const mark = dig > 0 ? clamp01(dig / digSpan) : pFall;
  return { x: s.w - (s.w < 760 ? 28 : 60), y: y0 + (y1 - y0) * mark };
}

export function createFallSky(starCount: number, chute: HTMLImageElement) {
  const rnd = seeded(0.37);
  // 星：大的近、小的遠，近的掠過得快、拉得長
  const stars = Array.from({ length: starCount }, () => {
    const near = Math.pow(rnd(), 2);
    return { x: rnd(), y: rnd(), size: 0.6 + near * 1.4, a: 0.18 + near * 0.55, depth: 0.35 + near };
  });
  // 樹：遞迴分叉，越往上越細；最細的那幾層末端長一團葉子
  const branches: { x1: number; y1: number; x2: number; y2: number; d: number }[] = [];
  const leaves: { x: number; y: number; r: number }[] = [];
  const grow = (x: number, y: number, ang: number, len: number, d: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    branches.push({ x1: x, y1: y, x2, y2, d });
    if (d >= 7) {
      for (let k = 0; k < 7; k++)
        leaves.push({ x: x2 + (rnd() - 0.5) * 16, y: y2 + (rnd() - 0.6) * 12, r: 0.8 + rnd() * 1.1 });
      return;
    }
    const spread = 0.32 + rnd() * 0.22;
    grow(x2, y2, ang - spread, len * (0.7 + rnd() * 0.1), d + 1);
    grow(x2, y2, ang + spread * (0.8 + rnd() * 0.4), len * (0.68 + rnd() * 0.1), d + 1);
    if (d < 3 && rnd() < 0.5) grow(x2, y2, ang + (rnd() - 0.5) * 0.2, len * 0.6, d + 2);
  };
  grow(0, 0, -Math.PI / 2 + 0.04, 46, 0);
  const treeH = Math.max(...branches.map((b) => -b.y2));
  // 草：沿著地平線一叢一叢的短線
  const grass = Array.from({ length: 260 }, () => ({
    x: rnd(),
    h: 2 + rnd() * 6,
    lean: (rnd() - 0.5) * 0.6,
    a: 0.2 + rnd() * 0.35,
  }));
  // 落地揚起的土
  const dust: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  let landedAt = -1;

  /** 地平線的高度：一顆很大的星球的邊，再加上一點起伏（越遠的山稜起伏越大、越淡） */
  const ridge = (x: number, cx: number, cy: number, R: number, layer: number) => {
    const base = cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
    const amp = [10, 22, 34][layer];
    const ph = layer * 1.7;
    const bump =
      Math.sin(x * 0.0042 + ph) * 0.55 + Math.sin(x * 0.011 + ph * 2) * 0.3 + Math.sin(x * 0.029 + ph * 3) * 0.15;
    return base - layer * 26 - amp * (bump * 0.5 + 0.5);
  };

  function draw(ctx: CanvasRenderingContext2D, s: FallState) {
    const { w, h, t, dt, top } = s;
    ctx.clearRect(0, 0, w, h);
    const { landAt, pFall, landK, dig } = phases(s);
    ctx.lineWidth = 1;

    // 星：下墜時往上掠過，捲得越快拉得越長；著地之後慢慢停下來、淡掉
    const sky = 1 - landK * 0.85;
    for (const st of stars) {
      st.y -= dt * (0.006 + s.speed * 1.6) * st.depth * (1 - landK);
      if (st.y < -0.15) {
        st.y = 1.05;
        st.x = rnd();
      }
      const x = st.x * (w - 120) + 10;
      const y = st.y * h;
      const len = s.speed * 140 * st.depth;
      const a = st.a * sky;
      if (len > 1) {
        const g = ctx.createLinearGradient(x, y, x, y + len);
        g.addColorStop(0, `rgba(${INK}, ${a.toFixed(3)})`);
        g.addColorStop(1, `rgba(${INK}, 0)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${INK}, ${a.toFixed(3)})`;
      ctx.fillRect(x - st.size / 2, y - st.size / 2, st.size, st.size);
    }

    // 地平線、樹、返回艙：落地時升上來，往下挖時跟著往上捲走
    const R = Math.max(w, h) * 1.6;
    const cx = w * 0.5;
    const horizonY = h - 150 + (1 - landK) * 220 - dig;
    const cy = horizonY + R;
    const narrow = w < 760;
    if (landK > 0.01 && horizonY > -h) {
      // 兩層遠山，再一層近處的地面
      for (let layer = 2; layer >= 0; layer--) {
        ctx.strokeStyle = `rgba(${INK}, ${[0.55, 0.2, 0.1][layer] * landK})`;
        ctx.beginPath();
        for (let x = -4; x <= w + 4; x += 4) {
          const y = ridge(x, cx, cy, R, layer);
          if (x <= -4) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 地面以下一點點的質地：幾排越來越稀的點
      for (let k = 1; k <= 4; k++) {
        ctx.fillStyle = `rgba(${INK}, ${(0.16 - k * 0.03) * landK})`;
        const gap = 5 + k * 3;
        for (let x = (k * 7) % gap; x < w; x += gap) ctx.fillRect(x, ridge(x, cx, cy, R, 0) + k * 9, 1, 1);
      }
      // 草：跟著風晃
      for (const g of grass) {
        const x = g.x * w;
        const y = ridge(x, cx, cy, R, 0);
        const lean = g.lean + Math.sin(t * 1.3 + x * 0.02) * 0.25;
        ctx.strokeStyle = `rgba(${INK}, ${g.a * landK})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean * g.h, y - g.h);
        ctx.stroke();
      }

      // 樹：越往上越細，跟著風晃（越高晃得越多）
      const tx = w * (narrow ? 0.16 : 0.2);
      const ty = ridge(tx, cx, cy, R, 0) + 2;
      const sway = (y: number) => Math.sin(t * 0.8) * 3 * Math.pow(-y / treeH, 2);
      for (const b of branches) {
        ctx.strokeStyle = `rgba(${INK}, ${landK * (0.85 - b.d * 0.06)})`;
        ctx.lineWidth = Math.max(0.6, 3.4 - b.d * 0.42);
        ctx.beginPath();
        ctx.moveTo(tx + b.x1 + sway(b.y1), ty + b.y1);
        ctx.lineTo(tx + b.x2 + sway(b.y2), ty + b.y2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      for (const l of leaves) {
        ctx.fillStyle = `rgba(${INK}, ${0.55 * landK})`;
        ctx.beginPath();
        ctx.arc(tx + l.x + sway(l.y) * 1.2, ty + l.y, l.r, 0, TAU);
        ctx.fill();
      }

      // 返回艙：從上面降下來，「就此落下」那一刻著地——彈一下、揚起一陣土，傘慢慢塌下去躺在地上
      if (chute.complete && chute.naturalWidth) {
        const gx = w * (narrow ? 0.7 : 0.76);
        const gy = ridge(gx, cx, cy, R, 0);
        const dh = Math.min(narrow ? 170 : 250, h * 0.34);
        const dw = CW * (dh / CH);
        if (landK > 0.995) {
          if (landedAt < 0) {
            landedAt = t;
            for (let k = 0; k < 46; k++) {
              const dir = k % 2 ? 1 : -1;
              dust.push({
                x: gx + dir * (4 + Math.random() * 10),
                y: gy,
                vx: dir * (20 + Math.random() * 70),
                vy: -(15 + Math.random() * 45),
                life: 0,
              });
            }
          }
        } else {
          landedAt = -1;
          dust.length = 0;
        }
        const since = landedAt < 0 ? 0 : t - landedAt;
        // 著地的那一下：彈起來又落回去，越彈越小
        const hop = landedAt < 0 ? 0 : -7 * Math.exp(-since * 5) * Math.abs(Math.sin(since * 13));
        const drop = Math.pow(1 - landK, 1.3) * (gy + dh);
        const footY = gy - drop + 2 + hop;
        const left = gx - dw / 2;
        const topY = footY - FOOT * dh;
        const swing = Math.sin(t * 0.9) * 0.07 * (1 - landK);
        const rx = left + RISER[0] * dw;
        const ry = topY + RISER[1] * dh;
        const c = easeOut(clamp01(since / 2.4));
        ctx.save();
        ctx.globalAlpha = landK;
        // 艙體
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(swing);
        ctx.translate(-rx, -ry);
        ctx.drawImage(chute, 0, SPLIT * CH, CW, (1 - SPLIT) * CH, left, topY + SPLIT * dh, dw, (1 - SPLIT) * dh);
        ctx.restore();
        // 傘：著地後失去支撐，往順風的一側倒、一邊塌扁，最後躺在地上
        ctx.save();
        ctx.globalAlpha = landK * (1 - 0.45 * c);
        ctx.translate(rx, ry);
        ctx.rotate(swing + c * 1.35);
        ctx.scale(1, 1 - 0.6 * c);
        ctx.translate(-rx + c * 10, -ry + c * 6);
        ctx.drawImage(chute, 0, 0, CW, SPLIT * CH, left, topY, dw, SPLIT * dh);
        ctx.restore();
        ctx.restore();
        // 揚起的土：往兩側噴、落回地面、淡掉
        for (const d of dust) {
          d.life += dt;
          d.vy += 90 * dt;
          d.x += d.vx * dt;
          d.y = Math.min(gy, d.y + d.vy * dt);
          d.vx *= 0.97;
          const a = Math.max(0, 1 - d.life / 1.3) * 0.7 * landK;
          if (a < 0.02) continue;
          ctx.fillStyle = `rgba(${INK}, ${a.toFixed(3)})`;
          ctx.fillRect(d.x, d.y - 1, 1.4, 1.4);
        }
      }
    }

    // 地層：地平線以下，一層一層越來越密的點線
    if (dig > 0) {
      for (let k = 1; k < 40; k++) {
        const ly = horizonY + 40 + k * 120;
        if (ly < -10) continue;
        if (ly > h + 10) break;
        const gap = Math.max(3, 14 - k * 0.9);
        ctx.fillStyle = `rgba(${INK}, ${Math.min(0.5, 0.12 + k * 0.03)})`;
        for (let x = 0; x < w; x += gap) ctx.fillRect(x, ly + Math.sin(x * 0.01 + k) * 6, 1.2, 1.2);
      }
      // 地心：一點琥珀色的光
      const cyCore = s.coreMid - top;
      if (cyCore < h + 200) {
        const g = ctx.createRadialGradient(w / 2, cyCore, 0, w / 2, cyCore, 260);
        g.addColorStop(0, `rgba(${AMBER}, 0.14)`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(w / 2, cyCore, 260, 0, TAU);
        ctx.fill();
      }
    }

    // 高度計：一條尺、每一年一道刻度、記號旁邊寫著現在的高度（或深度）
    const mark = meterMark(s);
    const y0 = 96;
    const y1 = h - 80;
    const digging = dig > 0;
    ctx.strokeStyle = `rgba(${INK}, 0.22)`;
    ctx.beginPath();
    ctx.moveTo(mark.x, y0);
    ctx.lineTo(mark.x, y1);
    ctx.stroke();
    if (!digging) {
      for (const mid of s.chapterMids) {
        const y = y0 + (y1 - y0) * clamp01((mid - h * 0.5) / landAt);
        ctx.strokeStyle = `rgba(${INK}, 0.35)`;
        ctx.beginPath();
        ctx.moveTo(mark.x - 5, y);
        ctx.lineTo(mark.x, y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = `rgba(${INK}, 0.7)`;
    ctx.beginPath();
    ctx.moveTo(mark.x - 8, mark.y);
    ctx.lineTo(mark.x + 3, mark.y);
    ctx.stroke();
    ctx.font = `11px ${s.mono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${INK}, 0.75)`;
    const reading = digging
      ? `${fmt(Math.round(clamp01(dig / Math.max(1, s.maxScroll - (s.layerTop - h * 0.75))) * CORE_M))} m`
      : `${fmt(Math.round(TOP_KM * Math.pow(1 - pFall, 1.7)))} km`;
    ctx.fillText(reading, mark.x - 14, mark.y + 4);
    ctx.fillStyle = `rgba(${INK}, 0.35)`;
    ctx.fillText(digging ? s.labels.dig : s.labels.fall, mark.x - 12, y0 - 16);

    // 琥珀點：讀者。下墜得越快，上面拖出一道越長的光
    if (s.dot) {
      const { x, y } = s.dot;
      const tail = s.speed * 60 * (1 - landK);
      if (tail > 1) {
        const g = ctx.createLinearGradient(x, y, x, y - tail);
        g.addColorStop(0, `rgba(${AMBER}, 0.6)`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - tail);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
      glow.addColorStop(0, `rgba(${AMBER}, 0.5)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
    }
  }

  return { draw };
}
