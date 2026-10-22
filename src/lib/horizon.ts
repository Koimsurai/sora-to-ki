// 手記天空底下那片地景的共用工具：前後兩層（背景的遠山、手記頁裡的近地與樹）
// 用同一個種子與同一個面板範圍，才會像同一片地。

/** 決定性的亂數（mulberry32）：每次畫出來的山形都一樣 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 一維的分形雜訊（幾層 value noise 疊起來），回傳約 -1..1。
 * 正弦波疊出來的山太規則，一看就是函數；這個才有「稜線」的感覺。
 */
export function ridgeNoise(seed: number, octaves = 5) {
  const R = rng(seed);
  const table = Float32Array.from({ length: 512 }, () => R() * 2 - 1);
  const at = (i: number) => table[((i % 512) + 512) % 512];
  const smooth = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return at(i) * (1 - u) + at(i + 1) * u;
  };
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += smooth(x * freq + o * 37.1) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };
}

/** 手記面板在視窗裡的左右邊界（跟 NotesSky.css 的 .notes-page：max-width 880、左右 24 的留白一致） */
export function panelSpan(width: number) {
  const left = (width - Math.min(width, 880)) / 2 + 24;
  return { left, right: width - left };
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface Seg {
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  w1: number;
  w2: number;
  depth: number;
}

/** 枝的層數（第 0 層是樹幹） */
export const TREE_DEPTH = 8;

/** 長一棵樹：枝幹（依長出來的先後排好、略帶彎曲、由粗到細）與葉叢 */
export function growTree(baseX: number, baseY: number, scale: number) {
  const R = rng(21);
  const segs: Seg[] = [];
  const leaves: { x: number; y: number; r: number; depth: number }[] = [];
  const grow = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    const bend = (R() - 0.5) * 0.5;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const cx = (x + x2) / 2 + Math.cos(ang + Math.PI / 2) * len * bend * 0.3;
    const cy = (y + y2) / 2 + Math.sin(ang + Math.PI / 2) * len * bend * 0.3;
    const w2 = Math.max(0.6 * scale, w * 0.68);
    segs.push({ x1: x, y1: y, cx, cy, x2, y2, w1: w, w2, depth: TREE_DEPTH - depth });
    // 葉子長在最後三層：末梢一大叢、往內越來越疏，樹冠才有厚度（只長在末梢的話像一圈花椰菜）
    if (depth <= 2) {
      const n = [14, 6, 3][depth];
      const spread = [13, 10, 8][depth];
      for (let i = 0; i < n; i++) {
        leaves.push({
          x: x2 + (R() - 0.5) * spread * scale,
          y: y2 + (R() - 0.65) * spread * 0.75 * scale,
          r: (1.3 + R() * 2.8) * scale,
          depth: TREE_DEPTH - depth,
        });
      }
    }
    if (depth === 0) return;
    const k = depth > TREE_DEPTH - 2 ? 2 : R() < 0.45 ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (0.5 + R() * 0.3) + (R() - 0.5) * 0.35;
      // 往上長的趨勢：越往外越往天空彎，也稍微往右（迎著光）
      const lift = (-Math.PI / 2 + 0.08 - (ang + spread)) * 0.14;
      grow(x2, y2, ang + spread + lift, len * (0.7 + R() * 0.14), w2, depth - 1);
    }
  };
  grow(baseX, baseY, -Math.PI / 2 + 0.05, 46 * scale, 9 * scale, TREE_DEPTH);
  return { segs, leaves };
}

/**
 * 畫一棵樹（progress 0–1：從樹幹一層一層長到葉子）。
 * 先用偏移一點的 rim 色畫一次、再用 color 蓋上去，剪影的左上緣留下一道月光。
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  tree: ReturnType<typeof growTree>,
  progress: number,
  color: string,
  rim: string,
) {
  const reach = progress * (TREE_DEPTH + 1.6);
  const pass = (fill: string, dx: number, dy: number) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineCap = 'round';
    for (const s of tree.segs) {
      const k = Math.min(1, Math.max(0, reach - s.depth));
      if (k <= 0) continue;
      // 長到一半的枝沿著曲線取前段（de Casteljau 切開），不是直直地伸出去
      const qx = (1 - k) * (1 - k) * s.x1 + 2 * (1 - k) * k * s.cx + k * k * s.x2;
      const qy = (1 - k) * (1 - k) * s.y1 + 2 * (1 - k) * k * s.cy + k * k * s.y2;
      const mx = s.x1 + (s.cx - s.x1) * k;
      const my = s.y1 + (s.cy - s.y1) * k;
      ctx.lineWidth = (s.w1 + s.w2) / 2;
      ctx.beginPath();
      ctx.moveTo(s.x1 + dx, s.y1 + dy);
      ctx.quadraticCurveTo(mx + dx, my + dy, qx + dx, qy + dy);
      ctx.stroke();
    }
    for (const l of tree.leaves) {
      const k = Math.min(1, Math.max(0, reach - l.depth - 0.4));
      if (k <= 0) continue;
      ctx.beginPath();
      ctx.arc(l.x + dx, l.y + dy, l.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  pass(rim, -0.8, -0.8);
  pass(color, 0, 0);
}
