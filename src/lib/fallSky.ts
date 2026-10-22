// 關於頁的下墜（AboutFall）：蓋在 3D 星空上面的一張透明 canvas，畫「離你很近的東西」。
//   p（0–1）：下墜的進度。0 在最高處，1 剛好落地
//   ground（0–1）：落地之後繼續往下捲，星球的地表升上來佔滿畫面（站在地表上）
//   speed（0–1）：捲動的速度。星塵往上掠過的速度與拉長的程度跟著它，停下來時只剩很慢的飄
// 背景遠處的星是 3D 的那一片（換頁時同一片星空），這裡只加近景：
//   星塵 → 接近地表時的大氣光、星塵被燒成琥珀色 → 從下方升起的星球、落地時長出來的樹
//   → 落地之後繼續往下：一層一層往上走的地層紋路，最底下是地心的琥珀色光。
import { drawTree, growTree, ridgeNoise, rng, smoothstep } from './horizon';

export interface FallState {
  p: number;
  ground: number;
  speed: number;
  dt: number;
  /** 落地之後往地底挖了多深（0–1）：地層越來越暖，最底下是地心的光 */
  depth: number;
  /** 從地表開始往下捲了多少像素：地層紋路跟著內容一起往上走 */
  dig: number;
}

const GROUND = '#04050a';
const MOON = 'rgba(176, 168, 220, 0.4)';

export function createFallSky(count: number) {
  const R = rng(41);
  const motes = Array.from({ length: count }, () => ({ x: R(), y: R(), z: 0.25 + R() * 0.75 }));
  // 樹在原點長一次，畫的時候平移到星球頂上（星球一直在動，不用每幀重長）
  let tree: ReturnType<typeof growTree> | null = null;
  let treeFor = 0;

  return function draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: FallState) {
    ctx.clearRect(0, 0, w, h);
    const atmosphere = smoothstep(0.5, 0.92, s.p);
    // 進入大氣層那一段星塵被燒成琥珀色，快落地時又冷下來
    const heat = smoothstep(0.62, 0.8, s.p) * (1 - smoothstep(0.88, 0.97, s.p));

    // 大氣：底下越來越亮（藍紫），貼著地平線一道琥珀色
    if (atmosphere > 0) {
      const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
      g.addColorStop(0, 'rgba(70, 76, 140, 0)');
      g.addColorStop(0.75, `rgba(70, 76, 140, ${(0.3 * atmosphere).toFixed(3)})`);
      g.addColorStop(1, `rgba(233, 193, 122, ${(0.2 * atmosphere).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.35, w, h * 0.65);
    }

    // 星塵：往上掠過（我們在往下掉）
    const rise = (0.025 + s.speed * 1.4) * s.dt;
    const len = 2 + s.speed * 140;
    for (const m of motes) {
      m.y -= rise * m.z;
      if (m.y < -0.08) {
        m.y = 1.05 + Math.random() * 0.05;
        m.x = Math.random();
      }
      const x = m.x * w;
      const y = m.y * h;
      const a = (0.25 + s.speed * 0.5) * m.z;
      const warm = heat * (0.4 + s.speed * 0.6);
      const r = Math.round(220 + 35 * warm);
      const gch = Math.round(226 - 30 * warm);
      const b = Math.round(255 - 120 * warm);
      ctx.strokeStyle = `rgba(${r}, ${gch}, ${b}, ${Math.min(1, a).toFixed(3)})`;
      ctx.lineWidth = m.z * (1 + warm);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len * m.z);
      ctx.stroke();
    }

    // 星球：最後一段從下方升起，落地之後繼續升，地表佔滿畫面
    const up = smoothstep(0.8, 1, s.p);
    if (up > 0) {
      const top = h * (1.12 - 0.42 * up - 0.75 * s.ground);
      const radius = Math.max(w, h) * 1.7;
      const cx = w * 0.5;
      const cy = top + radius;
      const atmo = ctx.createRadialGradient(cx, cy, radius * 0.985, cx, cy, radius * 1.05);
      atmo.addColorStop(0, 'rgba(150, 140, 220, 0.45)');
      atmo.addColorStop(0.35, 'rgba(233, 193, 122, 0.16)');
      atmo.addColorStop(1, 'rgba(150, 140, 220, 0)');
      ctx.fillStyle = atmo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      ctx.fill();
      const body = ctx.createLinearGradient(0, top, 0, top + h * 0.8);
      body.addColorStop(0, '#12131f');
      body.addColorStop(1, GROUND);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(206, 196, 240, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI * 1.35, Math.PI * 1.65);
      ctx.stroke();

      // 落地的那一刻，星球頂上那棵樹長出來
      const grow = smoothstep(0.93, 1, s.p);
      if (grow > 0) {
        const scale = Math.min(1.3, Math.max(0.7, h / 620));
        if (!tree || treeFor !== scale) {
          tree = growTree(0, 0, scale);
          treeFor = scale;
        }
        // 偏右：落地的那句話在畫面中間，樹不能壓在字上
        const tx = cx + w * 0.3;
        const ty = cy - Math.sqrt(radius * radius - (w * 0.3) ** 2) + 2;
        ctx.save();
        ctx.translate(tx, ty);
        drawTree(ctx, tree, grow, GROUND, MOON);
        ctx.restore();
      }
    }

    // 地層：一條一條起伏的紋路，跟著捲動往上走；越深的地方越暖
    if (s.ground > 0.5) {
      const k = smoothstep(0.5, 1, s.ground);
      const GAP = 120;
      const off = s.dig * 0.85;
      const first = Math.floor(off / GAP);
      for (let i = 0; i <= Math.ceil(h / GAP) + 1; i++) {
        const id = first + i;
        const y = id * GAP - off;
        const n = strata(id);
        const warm = Math.min(1, s.depth * 1.2);
        ctx.strokeStyle = `rgba(${Math.round(150 + 90 * warm)}, ${Math.round(140 + 40 * warm)}, ${Math.round(210 - 90 * warm)}, ${(0.12 * k).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, y + n(x / 380) * 16);
        ctx.stroke();
      }
      // 地心
      if (s.depth > 0) {
        const core = ctx.createRadialGradient(w / 2, h * 1.15, 0, w / 2, h * 1.15, h * 0.9);
        core.addColorStop(0, `rgba(255, 196, 120, ${(0.55 * s.depth * s.depth).toFixed(3)})`);
        core.addColorStop(0.5, `rgba(233, 140, 70, ${(0.18 * s.depth * s.depth).toFixed(3)})`);
        core.addColorStop(1, 'rgba(233, 140, 70, 0)');
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, w, h);
      }
    }
  };
}

const strataCache = new Map<number, (x: number) => number>();
/** 每一條地層有自己固定的起伏（捲回來時同一條長得一樣） */
function strata(id: number) {
  let n = strataCache.get(id);
  if (!n) {
    n = ridgeNoise(500 + id, 3);
    strataCache.set(id, n);
  }
  return n;
}
