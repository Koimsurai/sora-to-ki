// 作品頁的螺旋航線（about/Works）：中心是起點，越新的作品越外圈；整條航線慢慢轉，塵埃沿著它往外流。
// 每件作品平常是星圖上的天體符號（跟螺旋同一套平面的點與線），滑過才展開成立體的那顆星。
// 星長什麼樣子全由數據決定：
//   中間的點  程式碼量
//   一圈      一種語言（線型分語言：實線 TypeScript、虛線 Rust、點線 Python…）
//   外圈小點  GitHub 星星
//   地貌      主要語言（Rust 是坑坑洞洞的岩石、TS/JS 是一條一條帶的氣態、Python 是有冰冠的冰）
//   自轉      最後一次推送越近轉得越快
// 這裡只有幾何與畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const LIGHT = (() => {
  const v = [-0.55, 0.5, 0.67];
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as [number, number, number];
})();

export interface WorkStats {
  name: string;
  commits: number;
  stars: number;
  pushedDaysAgo: number;
  languages: { name: string; bytes: number }[];
}

type Vec3 = [number, number, number];

export interface Body {
  size: number;
  langs: [string, number][];
  span: number;
  tilt: number;
  roll: number;
  rings: [number, number][];
  surface: (p: Vec3) => number;
  moons: { r: number; phase: number; speed: number }[];
  spinSpeed: number;
}

const hash = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0) / 4294967295;
};
const seeded = (seed: number) => {
  let x = Math.floor(seed * 2147483646) + 1;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
};

const rotWith =
  (tilt: number, roll: number) =>
  (x0: number, y0: number, z0: number, spin: number): Vec3 => {
    let x = x0;
    let y = y0;
    let z = z0;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    [x, z] = [x * cs + z * sn, -x * sn + z * cs];
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    return [x, y, z];
  };
const lit = (x: number, y: number, z: number) => Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
const SPHERE: Vec3[] = Array.from({ length: 1400 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 1400;
  const r = Math.sqrt(1 - y * y);
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

/** 地貌：照主要語言決定星球表面長什麼樣子（回傳一個加在「留不留這個點」門檻上的值） */
function surfaceOf(lang: string, commits: number, rnd: () => number): (p: Vec3) => number {
  if (lang === 'Rust') {
    // 岩石：一個一個坑，坑裡沒有點、坑緣比較密
    const craters = Array.from({ length: 5 + Math.round(Math.log2(commits + 1)) }, () => {
      const z = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const r = Math.sqrt(1 - z * z);
      return { c: [Math.cos(a) * r, z, Math.sin(a) * r] as Vec3, r: 0.18 + rnd() * 0.22 };
    });
    return (p) => {
      for (const k of craters) {
        const d = Math.acos(Math.max(-1, Math.min(1, p[0] * k.c[0] + p[1] * k.c[1] + p[2] * k.c[2])));
        if (d < k.r * 0.72) return -0.7;
        if (d < k.r) return 0.45;
      }
      return 0.08;
    };
  }
  if (lang === 'TypeScript' || lang === 'JavaScript') {
    // 氣態：緯度上一條一條的帶（commit 越多帶越多）
    const n = Math.max(2, Math.min(9, Math.round(Math.log2(commits + 1))));
    return (p) => (Math.cos(Math.asin(p[1]) * n * 2) > 0.15 ? 0.4 : -0.28);
  }
  // 冰：表面很稀，兩極有冰冠
  if (lang === 'Python') return (p) => (Math.abs(p[1]) > 0.62 ? 0.75 : -0.3);
  // 其他：經線
  return (p) => (Math.abs(Math.sin(Math.atan2(p[2], p[0]) * 6)) < 0.14 ? 0.8 : -0.42);
}

export function bodyOf(w: WorkStats): Body {
  const total = w.languages.reduce((a, l) => a + l.bytes, 0) || 1;
  const list = w.languages
    .map((l) => [l.name, l.bytes / total] as [string, number])
    .filter(([, v]) => v >= 0.05)
    .sort((a, b) => b[1] - a[1]);
  if (!list.length) list.push(['Other', 1]);
  const seed = hash(w.name);
  const rnd = seeded(seed);
  const size = Math.min(1, Math.max(0.42, 0.4 + 0.15 * Math.log10(total / 1e4)));
  // 環：主要語言之外，每多一種語言多一圈帶，寬度照比例
  const rings: [number, number][] = [];
  if (list.length >= 2) {
    let r = 1.3;
    list.slice(1).forEach(([, share], k) => {
      const width = 0.22 + share * 1.1;
      const lines = Math.max(2, Math.round(width / 0.08));
      for (let j = 0; j < lines; j++) {
        rings.push([
          r + (j / lines) * width,
          0.2 + 0.42 * Math.sin((j / Math.max(1, lines - 1)) * Math.PI) * (1 - k * 0.2),
        ]);
      }
      r += width + 0.12;
    });
  }
  const outer = rings.length ? (rings.at(-1)?.[0] ?? 1) : 1;
  const moons = Array.from({ length: Math.min(4, Math.ceil(Math.log2(w.stars + 1))) }, (_, k) => {
    const r = outer + 0.45 + k * 0.42;
    return { r, phase: seed * TAU + k * 2.1, speed: 0.5 / Math.pow(r, 1.5) };
  });
  return {
    size,
    langs: list,
    span: Math.max(outer, moons.at(-1)?.r ?? 1),
    tilt: 0.15 + rnd() * 0.55,
    roll: (rnd() - 0.5) * 0.6,
    rings,
    surface: surfaceOf(list[0][0], w.commits, rnd),
    moons,
    spinSpeed: 0.04 + 0.22 * Math.exp(-w.pushedDaysAgo / 60),
  };
}

/** 立體的那顆星：點的星球（亮面密、暗面疏，地貌決定哪裡的點多）、線的環、點的衛星 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  S: number,
  b: Body,
  spin: number,
  t: number,
  dim: number,
  amber: boolean,
) {
  const R = rotWith(b.tilt, b.roll);
  const ring = (front: boolean) => {
    for (const [r, a] of b.rings) {
      ctx.strokeStyle = `rgba(${INK}, ${a * dim})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * TAU;
        const [x, y, z] = R(Math.cos(th) * r, 0, Math.sin(th) * r, 0);
        if (z >= 0 !== front || (z < 0 && x * x + y * y < 1)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(cx + x * S, cy - y * S);
        else ctx.moveTo(cx + x * S, cy - y * S);
        pen = true;
      }
      ctx.stroke();
    }
  };
  const moons = (front: boolean) => {
    b.moons.forEach((m, k) => {
      const a = m.phase + t * m.speed;
      const [x, y, z] = R(Math.cos(a) * m.r, 0, Math.sin(a) * m.r, 0);
      if (z >= 0 !== front || (z < 0 && x * x + y * y < 1)) return;
      const px = cx + x * S;
      const py = cy - y * S;
      if (amber && k === 0) {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 11);
        glow.addColorStop(0, `rgba(${AMBER}, 0.55)`);
        glow.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(${AMBER})`;
      } else ctx.fillStyle = `rgba(${INK}, ${0.85 * dim})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, S * 0.05), 0, TAU);
      ctx.fill();
    });
  };
  ring(false);
  moons(false);
  ctx.strokeStyle = `rgba(${INK}, ${0.12 * dim})`;
  ctx.beginPath();
  ctx.arc(cx, cy, S, 0, TAU);
  ctx.stroke();
  const dotScale = Math.min(1, S / 70) * 0.55 + 0.45;
  for (let i = 0; i < SPHERE.length; i++) {
    const p = SPHERE[i];
    const [x, y, z] = R(p[0], p[1], p[2], spin);
    if (z <= 0) continue;
    const l = lit(x, y, z);
    if ((i * 0.618034) % 1 > 0.26 + l * 0.95 + b.surface(p)) continue;
    const size = (0.7 + l * 1.3) * dotScale;
    ctx.fillStyle = `rgba(${INK}, ${(0.3 + l * 0.7) * dim})`;
    ctx.fillRect(cx + x * S - size / 2, cy - y * S - size / 2, size, size);
  }
  ring(true);
  moons(true);
}

/** 線型分語言 */
const DASH: Record<string, number[]> = {
  TypeScript: [],
  Rust: [4, 3],
  Python: [1, 3],
  JavaScript: [8, 3],
  CSS: [1, 1.6],
  Shell: [2, 5],
};

/** 星圖上的天體符號；回傳最外圈的半徑（字放在它外面） */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  b: Body,
  t: number,
  alpha: number,
  lit: boolean,
) {
  const core = 2 + 3.4 * b.size;
  let r = core + 5;
  if (alpha <= 0.01) return r + 5 * b.langs.length;
  b.langs.forEach(([name], k) => {
    ctx.setLineDash(DASH[name] ?? [2, 2]);
    ctx.strokeStyle = `rgba(${INK}, ${(k === 0 ? 0.6 : 0.36) * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    r += 5;
  });
  ctx.setLineDash([]);
  b.moons.forEach((m, k) => {
    const a = m.phase + t * m.speed * 2.5;
    const amber = lit && k === 0;
    ctx.fillStyle = amber ? `rgba(${AMBER}, ${alpha})` : `rgba(${INK}, ${0.8 * alpha})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2), amber ? 2 : 1.4, 0, TAU);
    ctx.fill();
  });
  ctx.fillStyle = lit && !b.moons.length ? `rgba(${AMBER}, ${alpha})` : `rgba(${INK}, ${0.95 * alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, core, 0, TAU);
  ctx.fill();
  return r;
}

/** 相鄰兩件作品在螺旋上隔多少弧度；最外一件之後還有一段「還沒做的」虛點 */
const STEP = 1.2;
const AHEAD = 2.4;

export interface SpiralFrame {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 滑過或聚焦的是第幾件，-1 是沒有 */
  near: number;
  /** 0 到 1：從中心長出來到哪裡 */
  grow: number;
}

export function createSpiral(bodies: Body[]) {
  const n = bodies.length;
  const tLast = (n - 1) * STEP;
  const flow = Array.from({ length: 320 }, () => ({
    th: Math.random() * (tLast + AHEAD),
    off: (Math.random() - 0.5) * 2,
    j: Math.random(),
  }));
  /** 每一顆展開成立體的程度（滑過時 0 → 1） */
  const open = bodies.map(() => 0);
  const newest = n - 1;

  /** 畫面座標：寬螢幕上螺旋拉成橢圓，把畫面鋪滿 */
  const placer = (w: number, h: number, t: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.42;
    const ry = h * 0.4;
    const spin = t * 0.025;
    return (th: number, off = 0): [number, number] => {
      const r = 0.13 + (0.87 * th) / (tLast + AHEAD);
      const a = th + spin;
      return [cx + Math.cos(a) * (r * rx + off), cy + Math.sin(a) * (r * ry + off * 0.8)];
    };
  };

  /** 每一件作品現在在畫面上的哪裡（找最近的那件、擺字都要用） */
  const positions = (w: number, h: number, t: number) => {
    const P = placer(w, h, t);
    return bodies.map((_, i) => P(i * STEP));
  };

  /** 畫一幀；回傳每一件的位置與符號外緣（字擺在外面） */
  function draw(ctx: CanvasRenderingContext2D, f: SpiralFrame) {
    const { w, h, t, dt, near, grow } = f;
    ctx.clearRect(0, 0, w, h);
    const P = placer(w, h, t);
    const reach = tLast * grow;
    // 航線：走過的是線，再往外（還沒做的）是虛點
    ctx.strokeStyle = `rgba(${INK}, 0.26)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 400; k++) {
      const [x, y] = P((k / 400) * reach);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    if (grow >= 1) {
      for (let th = tLast; th < tLast + AHEAD; th += 0.035) {
        const [x, y] = P(th);
        ctx.fillStyle = `rgba(${INK}, ${0.22 * (1 - (th - tLast) / AHEAD)})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    // 塵埃沿著航線往外流：時間
    for (const p of flow) {
      p.th += dt * (0.12 + 0.1 * p.j);
      if (p.th > tLast + AHEAD) p.th = Math.random() * 0.4;
      if (p.th > reach + 0.4) continue;
      const [x, y] = P(p.th, p.off * 7);
      ctx.fillStyle = `rgba(${INK}, ${0.15 + 0.35 * p.j * (1 - p.th / (tLast + AHEAD))})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    const unit = Math.min(w, h);
    return bodies.map((b, i) => {
      const [x, y] = P(i * STEP);
      // 還沒長到的作品先不出現
      const appear = Math.min(1, Math.max(0, (reach - i * STEP) / 0.6 + 1));
      const on = i === near;
      const lit = on || (near < 0 && i === newest);
      open[i] += ((on ? 1 : 0) - open[i]) * Math.min(1, dt * 7);
      const k = open[i] * open[i] * (3 - 2 * open[i]);
      // 平常是符號；滑過時符號淡掉、立體的那顆從中心長出來
      const gr = drawGlyph(ctx, x, y, b, t, (1 - k) * (near < 0 || on ? 1 : 0.5) * appear, lit);
      const S = Math.min(unit * 0.05 * (0.55 + b.size), (unit * 0.085) / b.span) * (0.4 + 0.6 * k);
      if (k > 0.02) drawBody(ctx, x, y, S, b, t * b.spinSpeed * 2 + i, t, k, b.moons.length > 0);
      return { x, y, reach: Math.max(gr + 6, S * b.span * k) + 12, appear };
    });
  }

  return { draw, positions };
}
