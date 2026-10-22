// 手記那片天空（星軌）底下的那棵樹：從地平線一根一根長出枝幹。
// 「宙と木」的木。純 2D canvas，一次畫完就停，不跑常駐迴圈。
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
  const leaves: [number, number, number][] = [];
  const grow = (x: number, y: number, ang: number, len: number, w: number, depth: number, maxDepth: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w, depth: maxDepth - depth });
    if (depth === 0) {
      leaves.push([x2, y2, maxDepth]);
      return;
    }
    const k = depth > 5 ? 2 : R() < 0.45 ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (0.5 + R() * 0.3) + (R() - 0.5) * 0.35;
      const lift = (-Math.PI / 2 - (ang + spread)) * 0.12;
      grow(x2, y2, ang + spread + lift, len * (0.72 + R() * 0.12), Math.max(0.6, w * 0.66), depth - 1, maxDepth);
    }
  };
  grow(baseX, baseY, -Math.PI / 2 + 0.04, 64 * scale, 9 * scale, 7, 7);
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
    const scale = H / 420;
    const ground = (x: number) => H * 0.86 - Math.sin((x / W) * 3.1 + 0.6) * H * 0.04;
    const baseX = W * 0.62;
    const { segs, leaves, R } = growTree(baseX, ground(baseX) + 2, scale);
    const leafDots = leaves.flatMap(([x, y]) =>
      Array.from({ length: 3 }, () => [x + (R() - 0.5) * 12 * scale, y + (R() - 0.5) * 9 * scale, (2 + R() * 4) * scale]),
    );
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 1 : 1800;
    const t0 = performance.now();
    let raf = 0;
    const ink = '#020306';
    const draw = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // 地平線後面一點暖光（城市的光害），黑色的樹才有東西襯著
      const glow = ctx.createRadialGradient(W * 0.55, H * 1.02, 0, W * 0.55, H * 1.02, W * 0.75);
      glow.addColorStop(0, `rgba(255,168,96,${0.2 * p})`);
      glow.addColorStop(0.45, `rgba(255,140,80,${0.07 * p})`);
      glow.addColorStop(1, 'rgba(255,140,80,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      // 地平線先出現，再一層一層長枝
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ground(x));
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      const reach = p * 8.5;
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
      ctx.fillStyle = ink;
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
