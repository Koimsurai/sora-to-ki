// 手記那片天空（星軌）底下的地平線：遠山、近處的坡，坡上一棵樹。「宙と木」的木。
// 橫跨整個視窗底部，往上淡進天空——不是一塊貼在角落的圖。純 2D canvas，畫完就停。
import { useEffect, useRef } from 'react';
import './NotesTree.css';

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  depth: number;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 長一棵樹：回傳枝幹（依長出來的先後排好）與葉叢的位置 */
function growTree(baseX: number, baseY: number, scale: number) {
  const R = rng(21);
  const segs: Seg[] = [];
  const leaves: [number, number][] = [];
  const grow = (x: number, y: number, ang: number, len: number, w: number, depth: number, maxDepth: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w, depth: maxDepth - depth });
    if (depth === 0) {
      leaves.push([x2, y2]);
      return;
    }
    const k = depth > 5 ? 2 : R() < 0.45 ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (0.5 + R() * 0.3) + (R() - 0.5) * 0.35;
      const lift = (-Math.PI / 2 - (ang + spread)) * 0.12;
      grow(x2, y2, ang + spread + lift, len * (0.72 + R() * 0.12), Math.max(0.5, w * 0.66), depth - 1, maxDepth);
    }
  };
  grow(baseX, baseY, -Math.PI / 2 + 0.04, 30 * scale, 4.5 * scale, 7, 7);
  return { segs, leaves, R };
}

export default function NotesTree({ shown }: { shown: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !shown) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const R0 = rng(7);
    const phase = [R0() * 6, R0() * 6, R0() * 6];
    // 遠山：起伏大、顏色淺（被大氣蓋住）；近坡：平緩、最暗，樹長在上面
    const far = (x: number) =>
      H * 0.62 -
      (Math.sin((x / W) * 5.1 + phase[0]) * 0.06 + Math.sin((x / W) * 11.3 + phase[1]) * 0.025) * H;
    const near = (x: number) => H * 0.84 - Math.sin((x / W) * 2.2 + phase[2]) * H * 0.05;
    const scale = H / 260;
    const treeX = W * 0.8;
    const { segs, leaves, R } = growTree(treeX, near(treeX) + 1, scale);
    const leafDots = leaves.flatMap(([x, y]) =>
      Array.from({ length: 3 }, () => [x + (R() - 0.5) * 6 * scale, y + (R() - 0.5) * 5 * scale, (1 + R() * 2.2) * scale]),
    );
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 1 : 2200;
    const t0 = performance.now();
    let raf = 0;
    const ridge = (f: (x: number) => number) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) ctx.lineTo(x, f(x));
      ctx.lineTo(W, H);
      ctx.closePath();
    };
    const draw = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      const ease = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // 大氣：地平線附近最亮、往上淡到完全透明（canvas 的上緣是 0，看不出邊界）
      const haze = ctx.createLinearGradient(0, 0, 0, H);
      haze.addColorStop(0, 'rgba(70, 64, 96, 0)');
      haze.addColorStop(0.55, `rgba(70, 64, 96, ${0.18 * ease})`);
      haze.addColorStop(0.75, `rgba(96, 78, 92, ${0.28 * ease})`);
      haze.addColorStop(1, `rgba(96, 78, 92, ${0.28 * ease})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = ease;
      ctx.fillStyle = '#0d0e18';
      ridge(far);
      ctx.fill();
      ctx.fillStyle = '#04050a';
      ridge(near);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 樹：地形出來之後，一層一層長枝
      ctx.strokeStyle = '#04050a';
      ctx.fillStyle = '#04050a';
      ctx.lineCap = 'round';
      const reach = Math.max(0, p - 0.25) / 0.75 * 8.5;
      for (const s of segs) {
        const k = Math.min(1, Math.max(0, reach - s.depth));
        if (k <= 0) continue;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k);
        ctx.stroke();
      }
      const leafK = Math.min(1, Math.max(0, reach - 7.5));
      for (const [x, y, r] of leafDots) {
        ctx.beginPath();
        ctx.arc(x, y, r * leafK, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  return <canvas ref={ref} className={`notes-tree${shown ? ' is-shown' : ''}`} aria-hidden="true" />;
}
