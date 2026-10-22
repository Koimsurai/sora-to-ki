// 手記面板「前面」的那片近地與樹（遠山在面板後面，見 backdrop/NotesHorizon）。
// 面板的下緣埋在這片地裡：進場時面板從地底升上來、退場時沉回去，延伸到底的面板因此有了著地的地方。
// 面板正下方的地是平的、邊緣被面板的光照成琥珀色，往兩側才隆起成坡，坡上一棵樹——「宙と木」的木。
import { useEffect, useRef } from 'react';
import { flightElapsed, panelSpan, ridgeNoise, rng, smoothstep } from '@/lib/horizon';

interface Seg {
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

/** 長一棵樹：枝幹（依長出來的先後排好、略帶彎曲、由粗到細）與葉叢 */
function growTree(baseX: number, baseY: number, scale: number) {
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
    segs.push({ x1: x, y1: y, cx, cy, x2, y2, w1: w, w2, depth: 7 - depth });
    // 葉子長在最後兩層：末梢一大叢、倒數第二層零星幾片
    if (depth <= 1) {
      const n = depth === 0 ? 7 : 2;
      for (let i = 0; i < n; i++) {
        leaves.push({
          x: x2 + (R() - 0.5) * 9 * scale,
          y: y2 + (R() - 0.6) * 7 * scale,
          r: (1.1 + R() * 2.3) * scale,
          depth: 7 - depth,
        });
      }
    }
    if (depth === 0) return;
    const k = depth > 5 ? 2 : R() < 0.4 ? 3 : 2;
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (0.5 + R() * 0.3) + (R() - 0.5) * 0.35;
      // 往上長的趨勢：越往外越往天空彎，也稍微往右（迎著光）
      const lift = (-Math.PI / 2 + 0.08 - (ang + spread)) * 0.14;
      grow(x2, y2, ang + spread + lift, len * (0.7 + R() * 0.14), w2, depth - 1);
    }
  };
  grow(baseX, baseY, -Math.PI / 2 + 0.05, 34 * scale, 6 * scale, 7);
  return { segs, leaves };
}

const GROUND_TOP = '#070810';
const GROUND_BOTTOM = '#020306';
const MOON = 'rgba(176, 168, 220, 0.32)';

export default function NotesGround() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 從首頁飛過來的話，地面在鏡頭快抵達時才浮現（比面板早一點），樹再接著長
    const elapsed = flightElapsed();
    const groundDelay = elapsed === null ? 0 : Math.max(0, 900 - elapsed);
    cv.style.animationDelay = `${groundDelay}ms`;
    const delay = groundDelay + 500;
    const groundN = ridgeNoise(37);
    const tuftR = rng(5);
    let raf = 0;
    let t0 = performance.now() + delay;
    let W = 0;
    let H = 0;
    let height: (x: number) => number = () => 0;
    let tree: ReturnType<typeof growTree> | null = null;
    let tufts: { x: number; y: number; h: number; lean: number }[] = [];
    let span = { left: 0, right: 0 };

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      span = panelSpan(W);
      const { left, right } = span;
      // 地面的高度（從底邊往上量）：面板底下平平的一層；坡從面板邊緣往內一點就開始隆起，
      // 蓋過面板的兩個下角——面板看起來是插在地裡，不是擺在地上
      const inset = 36;
      height = (x: number) => {
        const d = x < left + inset ? left + inset - x : x > right - inset ? x - (right - inset) : 0;
        const rise = smoothstep(0, 300, d);
        return 34 + groundN(x / 90) * 4 + rise * (H * 0.2 + groundN(x / 420 + 9) * H * 0.07);
      };
      tufts = [];
      for (let x = 0; x < W; x += 3 + tuftR() * 9) {
        const inPanel = x > left && x < right;
        if (inPanel && tuftR() < 0.85) continue;
        tufts.push({ x, y: H - height(x), h: (2 + tuftR() * 7) * (inPanel ? 0.6 : 1), lean: (tuftR() - 0.5) * 0.8 });
      }
      // 樹長在右邊的坡上；視窗太窄、坡上沒位置就不長
      const room = W - right;
      if (room >= 200) {
        const x = right + room * 0.46;
        tree = growTree(x, H - height(x) + 2, Math.min(1.25, Math.max(0.75, H / 300)) * Math.min(1, room / 320));
      } else tree = null;
    };

    const ground = () => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 3; x += 3) ctx.lineTo(x, H - height(x));
      ctx.lineTo(W, H);
      ctx.closePath();
    };

    const frame = (now: number) => {
      const p = reduce ? 1 : Math.min(1, Math.max(0, (now - t0) / 2400));
      const { left, right } = span;
      ctx.clearRect(0, 0, W, H);

      // 面板沉進地裡的那一段先暗下來，字不會被地面硬切
      const sink = ctx.createLinearGradient(0, H - 170, 0, H - 34);
      sink.addColorStop(0, 'rgba(2, 3, 6, 0)');
      sink.addColorStop(1, 'rgba(2, 3, 6, 0.85)');
      ctx.fillStyle = sink;
      ctx.fillRect(left, H - 170, right - left, 170);

      const fill = ctx.createLinearGradient(0, H * 0.7, 0, H);
      fill.addColorStop(0, GROUND_TOP);
      fill.addColorStop(1, GROUND_BOTTOM);
      ctx.fillStyle = fill;
      ground();
      ctx.fill();

      // 地面邊緣的光：面板正下方是面板的琥珀色，往兩側變成淡淡的星光
      const mid = W / 2;
      const glow = ctx.createLinearGradient(0, 0, W, 0);
      const stop = (x: number) => Math.min(1, Math.max(0, x / W));
      glow.addColorStop(0, 'rgba(176, 168, 220, 0.1)');
      glow.addColorStop(stop(left - 260), 'rgba(176, 168, 220, 0.14)');
      glow.addColorStop(stop(left), 'rgba(233, 193, 122, 0.35)');
      glow.addColorStop(stop(mid), 'rgba(233, 193, 122, 0.5)');
      glow.addColorStop(stop(right), 'rgba(233, 193, 122, 0.35)');
      glow.addColorStop(stop(right + 260), 'rgba(176, 168, 220, 0.14)');
      glow.addColorStop(1, 'rgba(176, 168, 220, 0.1)');
      ctx.beginPath();
      for (let x = 0; x <= W + 3; x += 3) ctx.lineTo(x, H - height(x) + 0.5);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 草：沿著地面邊緣的細線
      ctx.strokeStyle = GROUND_TOP;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of tufts) {
        ctx.moveTo(t.x, t.y + 1);
        ctx.quadraticCurveTo(t.x + t.lean * 2, t.y - t.h * 0.6, t.x + t.lean * t.h, t.y - t.h);
      }
      ctx.stroke();

      const t = tree;
      if (t) {
        // 樹：一層一層長枝。先用偏移一點的淡色畫一次、再用地面的顏色蓋上去，留下左上緣一道月光
        const reach = p * 8.6;
        const pass = (color: string, dx: number, dy: number) => {
          ctx.fillStyle = color;
          ctx.strokeStyle = color;
          for (const s of t.segs) {
            const k = Math.min(1, Math.max(0, reach - s.depth));
            if (k <= 0) continue;
            // 長到一半的枝沿著曲線取前段（de Casteljau 切開），不是直直地伸出去
            const qx = (1 - k) * (1 - k) * s.x1 + 2 * (1 - k) * k * s.cx + k * k * s.x2;
            const qy = (1 - k) * (1 - k) * s.y1 + 2 * (1 - k) * k * s.cy + k * k * s.y2;
            const mx = s.x1 + (s.cx - s.x1) * k;
            const my = s.y1 + (s.cy - s.y1) * k;
            ctx.lineWidth = (s.w1 + s.w2) / 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(s.x1 + dx, s.y1 + dy);
            ctx.quadraticCurveTo(mx + dx, my + dy, qx + dx, qy + dy);
            ctx.stroke();
          }
          for (const l of t.leaves) {
            const k = Math.min(1, Math.max(0, reach - l.depth - 0.4));
            if (k <= 0) continue;
            ctx.beginPath();
            ctx.arc(l.x + dx, l.y + dy, l.r * k, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        pass(MOON, -0.8, -0.8);
        pass(GROUND_TOP, 0, 0);
      }
      if (p < 1) raf = requestAnimationFrame(frame);
    };

    layout();
    raf = requestAnimationFrame(frame);
    // observe 一開始會立刻回呼一次，那次不算「尺寸變了」
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      cancelAnimationFrame(raf);
      layout();
      t0 = -1e9; // 尺寸變了就直接畫完成的樣子
      raf = requestAnimationFrame(frame);
    });
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="notes-ground" aria-hidden="true" />;
}
