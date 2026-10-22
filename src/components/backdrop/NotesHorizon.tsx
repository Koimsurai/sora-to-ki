// 手記那片天空（星軌）底下的遠景：遠山、山霧、中景的丘陵。橫跨整個視窗底部，往上淡進天空。
// 最近的那片地與樹不在這裡——它們畫在手記面板的「前面」（blog/NotesGround），面板才像是從地裡升起來的；
// 這一層在面板後面。中景丘陵靠近面板的地方會被面板的光微微照亮，兩層是同一片地。
// 純 2D canvas，畫完就停。
import { useEffect, useRef } from 'react';
import { panelSpan, ridgeNoise } from '@/lib/horizon';
import './NotesHorizon.css';

type Ridge = (x: number) => number;

function draw(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
  const farN = ridgeNoise(11);
  const midN = ridgeNoise(23);
  // 遠山：起伏大、顏色淺（被大氣蓋住）；中景：平緩、更暗
  const far: Ridge = (x) => H * 0.5 - (farN((x / W) * 3.2) * 0.55 + 0.3) * H * 0.2;
  const mid: Ridge = (x) => H * 0.72 - (midN((x / W) * 5.5 + 3) * 0.6 + 0.25) * H * 0.1;
  const path = (f: Ridge) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 4; x += 4) ctx.lineTo(x, f(x));
    ctx.lineTo(W, H);
    ctx.closePath();
  };
  const rim = (f: Ridge, color: string) => {
    ctx.beginPath();
    for (let x = 0; x <= W + 4; x += 4) ctx.lineTo(x, f(x) + 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = k;

  // 天光：地平線附近最亮、往上淡到完全透明（canvas 上緣是 0，看不出邊界）
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, 'rgba(60, 56, 92, 0)');
  sky.addColorStop(0.45, 'rgba(70, 62, 104, 0.15)');
  sky.addColorStop(0.62, 'rgba(110, 88, 112, 0.25)');
  sky.addColorStop(1, 'rgba(110, 88, 112, 0.25)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 遠山：上淺下深，稜線一道淡淡的星光
  const farTop = H * 0.3;
  const farFill = ctx.createLinearGradient(0, farTop, 0, H * 0.75);
  farFill.addColorStop(0, '#1c1d30');
  farFill.addColorStop(1, '#0f101b');
  ctx.fillStyle = farFill;
  path(far);
  ctx.fill();
  rim(far, 'rgba(196, 186, 232, 0.2)');

  // 山霧：卡在兩道山之間
  const mist = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.82);
  mist.addColorStop(0, 'rgba(120, 110, 156, 0)');
  mist.addColorStop(0.55, 'rgba(120, 110, 156, 0.14)');
  mist.addColorStop(1, 'rgba(120, 110, 156, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, H * 0.52, W, H * 0.3);

  // 中景
  const midFill = ctx.createLinearGradient(0, H * 0.6, 0, H);
  midFill.addColorStop(0, '#0c0d17');
  midFill.addColorStop(1, '#06070d');
  ctx.fillStyle = midFill;
  path(mid);
  ctx.fill();
  rim(mid, 'rgba(176, 166, 214, 0.12)');

  // 面板的光照在中景上（只照山，不照天空）
  const { left, right } = panelSpan(W);
  ctx.save();
  path(mid);
  ctx.clip();
  const spill = ctx.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, (right - left) * 0.8);
  spill.addColorStop(0, 'rgba(233, 193, 122, 0.1)');
  spill.addColorStop(1, 'rgba(233, 193, 122, 0)');
  ctx.fillStyle = spill;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 貼地的薄霧
  const low = ctx.createLinearGradient(0, H * 0.8, 0, H);
  low.addColorStop(0, 'rgba(86, 78, 112, 0)');
  low.addColorStop(1, 'rgba(86, 78, 112, 0.15)');
  ctx.fillStyle = low;
  ctx.fillRect(0, H * 0.8, W, H * 0.2);
  ctx.globalAlpha = 1;
}

export default function NotesHorizon({ shown }: { shown: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !shown) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let t0 = performance.now();
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - t0) / 1200);
      draw(ctx, cv.clientWidth, cv.clientHeight, 1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    fit();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      fit();
      t0 = -1e9; // 尺寸變了就直接畫完成的樣子
      raf = requestAnimationFrame(frame);
    });
    ro.observe(cv);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [shown]);

  return <canvas ref={ref} className={`notes-horizon${shown ? ' is-shown' : ''}`} aria-hidden="true" />;
}
