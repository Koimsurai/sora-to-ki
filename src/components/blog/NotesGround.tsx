// 手記面板「前面」的那片近地與樹（遠山在面板後面，見 backdrop/NotesHorizon）。
// 面板的下緣埋在這片地裡：進場時面板從地底升上來、退場時沉回去，延伸到底的面板因此有了著地的地方。
// 面板正下方的地是平的、邊緣被面板的光照成琥珀色，往兩側才隆起成坡，坡上一棵樹——「宙と木」的木。
import { useEffect, useRef } from 'react';
import { drawTree, growTree, panelSpan, ridgeNoise, rng, smoothstep } from '@/lib/horizon';
import { flightElapsed } from '@/lib/skyFlight';

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
    // 地面升上來的時間由 CSS 管（.is-arriving 的 --arrive-delay）；樹等地面快到位才開始長
    const elapsed = flightElapsed('notes');
    const delay = (elapsed === null ? 0 : Math.max(0, 900 - elapsed)) + 900;
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
      if (room >= 220) {
        const scale = Math.min(1.1, Math.max(0.75, H / 290)) * Math.min(1, room / 300);
        // 先在原點長一次量樹冠寬度，再把整棵樹擺到「樹冠左緣不碰到面板」的位置：它畫在面板前面
        const probe = growTree(0, 0, scale);
        const crownLeft = Math.min(...probe.leaves.map((l) => l.x - l.r));
        const x = Math.max(right + room * 0.5, right + 16 - crownLeft);
        tree = growTree(x, H - height(x) + 2, scale);
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

      // 樹：一層一層長枝，左上緣一道月光
      if (tree) drawTree(ctx, tree, p, GROUND_TOP, MOON);
      if (p < 1) raf = requestAnimationFrame(frame);
    };

    layout();
    raf = requestAnimationFrame(frame);
    // 畫好了才開始升起（CSS 的動畫掛在 .is-drawn 上）：在手記頁重新整理時，頁面先由伺服器畫出來、
    // 這裡要等 hydration 才跑，動畫要是一掛上就播，等 canvas 有東西時早就播完了
    cv.classList.add('is-drawn');
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
