// 碎念頁頁首的那片點陣天空（畫布上的 D）：星雲、琥珀色的土星，邊緣淡進背景。
// 滑鼠在頁首移動會激起一點一點的琥珀色火花：念頭閃過。畫法在 lib/ditherScene。
// 12fps 一格一格跳（跟碎念頁的 3D 天空同一個節奏），滑出畫面就停。
//
// 有 3D 星空時，土星不畫在這裡：3D 那顆土星會停到這個位置、原地碎成同一個格子的像素
// （見 store/skyAnchor 與 lib/starfieldGpu 的 perch），這張畫布只畫星雲、星星與火花，
// 而且是跟著土星碎開的那一刻一顆一顆長出來。沒有 3D（手機、沒有硬體加速）才自己畫土星。
import { useEffect, useRef } from 'react';
import { createDitherScene } from '@/lib/ditherScene';
import { flightElapsed } from '@/lib/skyFlight';
import { claimSkyAnchor } from '@/store/skyAnchor';

const CELL = 5;
const SATURN = { x: 0.6, y: 0.5, r: 0.17 };
/** 從首頁或手記飛過來時，點陣在飛行的哪一段長出來（ms）：土星停下、碎成像素的那一段 */
const GROW_FROM = 1300;
const GROW_MS = 900;

export default function MomentsSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const host = cv?.parentElement;
    if (!cv || !ctx || !host) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 有沒有 3D 星空要等探測出結果（<html data-flight>）：還不知道的時候先不畫土星，
    // 確定沒有才自己畫。位置一律送，沒有 3D 的話沒有人收
    const root = document.documentElement;
    const flown = flightElapsed('moments');
    const growStart = performance.now() - (flown ?? 0) + GROW_FROM;
    const anchor = claimSkyAnchor();
    let scene: ReturnType<typeof createDitherScene> | null = null;
    let w = 0;
    let h = 0;
    let t = 0;
    let last = -1;
    let raf = 0;

    const reveal = () =>
      flown === null || reduce ? 1 : Math.min(1, Math.max(0, (performance.now() - growStart) / GROW_MS));
    const paint = () => {
      if (!scene) return;
      ctx.clearRect(0, 0, w, h);
      scene.draw(ctx, t, reveal());
    };
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const own = root.dataset.flight === '0';
      scene = createDitherScene(w, h, {
        cell: CELL,
        saturn: own ? SATURN : null,
        nebula: { x: 0.12, y: 0.3, w: 0.28, h: 0.4 },
        stars: Math.round((w * h) / (own ? 7000 : 14000)),
        seed: 23,
        haze: 0.45,
      });
      const r = cv.getBoundingClientRect();
      const left = r.left + window.scrollX;
      const top = r.top + window.scrollY;
      anchor.set({
        x: left + w * SATURN.x,
        y: top + h * SATURN.y,
        r: Math.min(w, h) * SATURN.r,
        gx: left,
        gy: top,
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
    const mo = new MutationObserver(fit);
    mo.observe(root, { attributes: true, attributeFilter: ['data-flight'] });
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
      mo.disconnect();
      io.disconnect();
      host.removeEventListener('pointermove', onMove);
      if (w && h) {
        // 離開：土星從「現在在畫面上的位置」出發飛走（換頁時捲動會被拉回頂端，不能用頁面座標）
        const r = cv.getBoundingClientRect();
        anchor.release({
          x: r.left + w * SATURN.x,
          y: r.top + h * SATURN.y,
          r: Math.min(w, h) * SATURN.r,
          gx: r.left,
          gy: r.top,
        });
      }
    };
  }, []);

  return <canvas ref={ref} className="tk-sky" aria-hidden="true" />;
}
