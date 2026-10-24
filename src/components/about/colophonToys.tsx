// 此站點目鏡裡的三個玩具：直接拿站上真的東西來玩。
// 規則 01 一個畫面只有一個訊號：一片白點，點哪裡琥珀點就移過去，永遠只有一個。
// 規則 02 只用點與線：照片牆裡的一張照片變成點陣，格子越大越像一片星空。
// 規則 03 由數據長出來：作品頁的星體（about/worksSky 的 bodyOf／drawBody），調數字長一顆自己的。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { bodyOf, drawBody, type WorkStats } from './worksSky';

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';

/** 畫布跟著容器的大小、清掉、設好像素比；回傳 CSS 像素的寬高 */
function fit(cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { w, h };
}

/** 規則 01：點哪裡琥珀點就移過去 */
export function AmberToy() {
  const { t } = useTranslation();
  const cvRef = useRef<HTMLCanvasElement>(null);
  const goalRef = useRef<[number, number]>([0.5, 0.5]);
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let at: [number, number] = [0.5, 0.5];
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const { w, h } = fit(cv, ctx);
      const k = reduce ? 1 : Math.min(1, dt * 6);
      at = [at[0] + (goalRef.current[0] - at[0]) * k, at[1] + (goalRef.current[1] - at[1]) * k];
      const step = 14;
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          ctx.fillStyle = `rgba(${INK}, 0.35)`;
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }
      const ax = at[0] * w;
      const ay = at[1] * h;
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, 20);
      g.addColorStop(0, `rgba(${AMBER}, 0.6)`);
      g.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ax, ay, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.beginPath();
      ctx.arc(ax, ay, 3.6, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="cl-scope">
      <canvas
        ref={cvRef}
        className="cl-toy-canvas is-clickable"
        aria-label={t('colophon.rule1Toy')}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          goalRef.current = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
        }}
      />
    </div>
  );
}

/** 規則 02：照片牆裡的一張照片變成點陣 */
export function DitherToy() {
  const { t } = useTranslation();
  const [cell, setCell] = useState(5);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { data: photos = [] } = useQuery({
    queryKey: ['gallery', 'photos'],
    queryFn: loadPhotosManifest,
    staleTime: 10 * 60 * 1000,
  });
  // 挑一張橫的：圓形目鏡裡放得比較滿
  const src = photos.find((p) => p.aspectRatio > 1.2)?.thumbnailUrl ?? photos.at(0)?.thumbnailUrl;
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !src) return;
    const img = new Image();
    img.src = src;
    let cancelled = false;
    const draw = () => {
      if (cancelled || !img.naturalWidth) return;
      const { w, h } = fit(cv, ctx);
      const cols = Math.max(1, Math.floor(w / cell));
      const rows = Math.max(1, Math.floor(h / cell));
      // 照片縮到「一格一個像素」，讀亮度
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return;
      const scale = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      o.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      let px: Uint8ClampedArray;
      try {
        px = o.getImageData(0, 0, cols, rows).data;
      } catch {
        return;
      }
      ctx.fillStyle = `rgb(${INK})`;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const k = (y * cols + x) * 4;
          const lum = (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255;
          const r = (cell / 2) * Math.sqrt(lum) * 0.95;
          if (r < 0.25) continue;
          ctx.beginPath();
          ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    img.onload = draw;
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [src, cell]);
  return (
    <>
      <div className="cl-scope">
        <canvas ref={cvRef} className="cl-toy-canvas" aria-label={t('colophon.rule2Toy')} />
      </div>
      <label className="cl-range">
        <span>{t('colophon.cell')}</span>
        <input type="range" min={2} max={10} value={cell} onChange={(e) => setCell(Number(e.target.value))} />
        <em>{cell} px</em>
      </label>
    </>
  );
}

const LANGS = ['TypeScript', 'Rust', 'Python', 'Go'] as const;
const OTHER_LANGS = ['CSS', 'Shell', 'HTML', 'Dockerfile', 'JavaScript'];

/** 規則 03：調數字長一顆星 */
export function BodyToy() {
  const { t } = useTranslation();
  const [size, setSize] = useState(45);
  const [langs, setLangs] = useState(2);
  const [stars, setStars] = useState(6);
  const [commits, setCommits] = useState(120);
  const [main, setMain] = useState<(typeof LANGS)[number]>('TypeScript');
  const cvRef = useRef<HTMLCanvasElement>(null);
  const body = useMemo(() => {
    const total = 10 ** (4 + (size / 100) * 3);
    const languages: WorkStats['languages'] = [{ name: main, bytes: total * 0.62 }];
    for (let k = 1; k < langs; k++)
      languages.push({ name: OTHER_LANGS[k - 1] ?? 'Other', bytes: (total * 0.38) / k / 1.6 });
    const w: WorkStats = { name: `toy-${main}`, commits, stars, pushedDaysAgo: 3, languages };
    return bodyOf(w);
  }, [size, langs, stars, commits, main]);
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let start = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (start < 0) start = now;
      if (now - last < 16) return;
      last = now;
      const { w, h } = fit(cv, ctx);
      const time = reduce ? 0 : (now - start) / 1000;
      const S = (Math.min(w, h) * 0.42) / body.span;
      drawBody(ctx, w / 2, h / 2, S, body, time * 0.3, time, 1, body.moons.length > 0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [body]);
  const slider = (label: string, value: number, set: (n: number) => void, min: number, max: number, unit = '') => (
    <label className="cl-range">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} />
      <em>
        {value}
        {unit}
      </em>
    </label>
  );
  return (
    <>
      <div className="cl-scope">
        <canvas ref={cvRef} className="cl-toy-canvas" aria-label={t('colophon.rule3Toy')} />
      </div>
      <div className="cl-controls">
        {slider(t('colophon.genSize'), size, setSize, 1, 100)}
        {slider(t('colophon.genLangs'), langs, setLangs, 1, 5)}
        {slider(t('colophon.genStars'), stars, setStars, 0, 64)}
        {slider(t('colophon.genCommits'), commits, setCommits, 1, 800)}
        <fieldset className="cl-seg">
          <legend className="sr-only">{t('colophon.genMain')}</legend>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={main === l} onClick={() => setMain(l)}>
              {l === 'Go' ? t('colophon.genOther') : l}
            </button>
          ))}
        </fieldset>
      </div>
    </>
  );
}
