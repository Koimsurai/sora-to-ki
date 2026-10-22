// 碎念頁頁首的那片點陣天空（畫布上的 D）：星雲、琥珀色的土星，邊緣淡進背景。
// 滑鼠在頁首移動會激起一點一點的琥珀色火花：念頭閃過。畫法在 lib/ditherScene。
// 12fps 一格一格跳（跟碎念頁的 3D 天空同一個節奏），滑出畫面就停。
import { useEffect, useRef } from 'react';
import { createDitherScene } from '@/lib/ditherScene';

export default function MomentsSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const host = cv?.parentElement;
    if (!cv || !ctx || !host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: ReturnType<typeof createDitherScene> | null = null;
    let w = 0;
    let h = 0;
    let t = 0;
    let last = -1;
    let raf = 0;

    const paint = () => {
      if (!scene) return;
      ctx.clearRect(0, 0, w, h);
      scene.draw(ctx, t);
    };
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = createDitherScene(w, h, {
        cell: 5,
        saturn: { x: 0.6, y: 0.5, r: 0.17 },
        nebula: { x: 0.12, y: 0.3, w: 0.28, h: 0.4 },
        stars: Math.round((w * h) / 7000),
        seed: 23,
        haze: 0.45,
      });
      paint();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last < 0) last = now;
      const dt = (now - last) / 1000;
      if (dt < 1 / 12 - 0.002) return;
      last = now;
      t += Math.min(dt, 0.2);
      paint();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      last = -1;
      if (e.isIntersecting && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(cv);

    // 滑鼠劃過：沿路激起火花（間隔一點，不要一路連成線）
    let lastSpark = 0;
    const onMove = (e: PointerEvent) => {
      if (reduce || !scene) return;
      const now = performance.now();
      if (now - lastSpark < 70) return;
      lastSpark = now;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      scene.spark(x, y, t);
    };
    host.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={ref} className="tk-sky" aria-hidden="true" />;
}
