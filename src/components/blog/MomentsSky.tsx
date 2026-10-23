// 碎念的點陣天空（畫布上的 D）：星雲、琥珀色的土星。固定在視窗上當背景，往下捲時不跟著走，
// 只是慢慢退暗（讀到下面的碎念時只剩底紋）。滑鼠在頁面上移動會激起一點一點的琥珀色火花：念頭閃過。
// 畫法在 lib/ditherScene。
//
// 有 3D 星空時，土星不畫在這裡：3D 那顆土星會停到這個位置、碎成同一個格子的像素
// （見 store/skyAnchor 與 lib/starfieldGpu 的 blink），這張畫布只畫星雲、星星與火花，
// 而且是跟著畫面從大方塊收回細格子的那一刻一顆一顆長出來。沒有 3D（手機、沒有硬體加速）才自己畫土星。
import { useEffect, useRef } from 'react';
import { createDitherScene, type DitherLayout } from '@/lib/ditherScene';
import { flightElapsed } from '@/lib/skyFlight';
import { claimSkyAnchor } from '@/store/skyAnchor';

const CELL = 5;
/**
 * 列表：土星在右上方、星雲在它左邊一片。單則頁：土星縮小停在右上角，只留一小團星雲。
 * 位置都是相對視窗；土星半徑相對短邊
 */
const LAYOUTS = {
  list: {
    saturn: { x: 0.74, y: 0.34, r: 0.13 },
    nebula: { x: 0.5, y: 0.14, w: 0.2, h: 0.24 },
    haze: 0.35,
  },
  detail: {
    saturn: { x: 0.86, y: 0.2, r: 0.065 },
    nebula: { x: 0.72, y: 0.06, w: 0.12, h: 0.16 },
    haze: 0.3,
  },
} satisfies Record<string, Pick<DitherLayout, 'nebula' | 'haze'> & { saturn: NonNullable<DitherLayout['saturn']> }>;
/** 從別頁換過來時，點陣在轉場的哪一段長出來（ms）：畫面從最粗的方塊收回來的那一段 */
const GROW_FROM = 550;
const GROW_MS = 550;
/** 一秒畫幾次（星星明滅與火花）。轉場與捲動都不靠它，所以不必跟螢幕更新率一樣 */
const FPS = 24;

export default function MomentsSky({ variant = 'list' }: { variant?: keyof typeof LAYOUTS }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const host = cv?.parentElement;
    if (!cv || !ctx || !host) return;
    const layout = LAYOUTS[variant];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 有沒有 3D 星空要等探測出結果（<html data-flight>）：還不知道的時候先不畫土星，
    // 確定沒有才自己畫。位置一律送，沒有 3D 的話沒有人收
    const root = document.documentElement;
    const flown = flightElapsed('moments');
    const growStart = performance.now() + (flown === null ? 0 : GROW_FROM - flown);
    const sendAnchor = claimSkyAnchor();
    let scene: ReturnType<typeof createDitherScene> | null = null;
    let w = 0;
    let h = 0;
    let t = 0;
    let last = -1;
    let raf = 0;

    const reveal = () => (reduce ? 1 : Math.min(1, Math.max(0, (performance.now() - growStart) / GROW_MS)));
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
        saturn: own ? layout.saturn : null,
        nebula: layout.nebula,
        // 3D 星空自己有星星，這裡只留少數幾顆會閃的
        stars: Math.round((w * h) / (own ? 9000 : 30000)),
        seed: 23,
        haze: layout.haze,
        floor: 0.18,
      });
      sendAnchor({
        x: w * layout.saturn.x,
        y: h * layout.saturn.y,
        r: Math.min(w, h) * layout.saturn.r,
        gx: 0,
        gy: 0,
      });
      paint();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (last < 0) last = now;
      const dt = (now - last) / 1000;
      if (dt < 1 / FPS - 0.002) return;
      last = now;
      t += Math.min(dt, 0.2);
      paint();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const mo = new MutationObserver(fit);
    mo.observe(root, { attributes: true, attributeFilter: ['data-flight'] });
    if (!reduce) raf = requestAnimationFrame(loop);

    // 往下捲時退暗（3D 那顆土星由 starfieldGpu 照同一條曲線退暗）
    const onScroll = () => {
      cv.style.opacity = String(1 - 0.6 * Math.min(1, window.scrollY / (window.innerHeight * 0.8)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // 滑鼠劃過：沿路激起火花（間隔一點，不要一路連成線）
    let lastSpark = 0;
    const onMove = (e: PointerEvent) => {
      if (reduce || !scene) return;
      const now = performance.now();
      if (now - lastSpark < 60) return;
      lastSpark = now;
      scene.spark(e.clientX, e.clientY, t);
    };
    host.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll);
      host.removeEventListener('pointermove', onMove);
    };
  }, [variant]);

  return <canvas ref={ref} className="tk-sky" aria-hidden="true" />;
}
