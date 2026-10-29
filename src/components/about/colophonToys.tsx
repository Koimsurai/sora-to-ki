// 此站點目鏡裡的三個玩具：直接拿站上真的東西來玩，而且一步一步拆開，看它當初是怎麼想出來的。
// 規則 01 一個畫面只有一個訊號：首頁的土星（about/colophonSaturn），從一顆球畫到刷痕、雲帶、環、
//         五顆衛星（一次只亮一顆）、背景的星軌。
// 規則 02 只用點與線：照片頁的接收（gallery/downlink 的 RX_PHASES），0 與 1、一行一行收成黑白、
//         一道掃過去上色；最後看只用點會怎樣。
// 規則 03 由數據長出來：作品頁的星體（about/worksSky），調數字長一顆，再放上作品頁的螺旋。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RX_PHASES } from '@/components/gallery/downlink';
import { statsOf, useWorkEntries, useWorkStats } from '@/data/works';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { palette } from '@/lib/palette';
import { createTrails, drawOrbits, renderSaturn, satelliteAt, SATURN_STEPS } from './colophonSaturn';
import { bodiesOf, createSpiral, drawBody, drawGlyph, workStatsOf, type WorkStats } from './worksSky';

const { paper: INK, amber: AMBER } = palette();
const TAU = Math.PI * 2;

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
  return { w, h, dpr };
}

/** 每一幀叫 draw（約 60fps），回傳停止的函式；draw 拿到的是從開始算的秒數與距上一幀的秒數 */
function loop(draw: (t: number, dt: number) => void) {
  let raf = 0;
  let last = 0;
  let start = -1;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (start < 0) start = now;
    if (now - last < 16) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    draw((now - start) / 1000, dt);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 步驟條：01 02 03⋯ 一個一個點，下面是這一步在想什麼。
 * 點同一步會重播那一步的動畫（run 會變），「下一步」走到最後一步再回到第一步
 */
function Steps({
  ns,
  keys,
  step,
  onStep,
}: {
  ns: string;
  keys: readonly string[];
  step: number;
  onStep: (i: number) => void;
}) {
  const { t } = useTranslation();
  const key = keys[step];
  return (
    <div className="cl-steps">
      <fieldset className="cl-seg">
        <legend className="sr-only">{t('colophon.stepsLabel')}</legend>
        {keys.map((k, i) => (
          <button key={k} type="button" aria-pressed={i === step} title={t(`${ns}.${k}.t`)} onClick={() => onStep(i)}>
            {String(i + 1).padStart(2, '0')}
          </button>
        ))}
        <button type="button" className="cl-next" onClick={() => onStep((step + 1) % keys.length)}>
          {step === keys.length - 1 ? t('colophon.stepAgain') : t('colophon.stepNext')}
        </button>
      </fieldset>
      <div className="cl-step" key={key} aria-live="polite">
        <b>{t(`${ns}.${key}.t`)}</b>
        <p>{t(`${ns}.${key}.d`)}</p>
      </div>
    </div>
  );
}

/** 一步一步走的狀態：step 是第幾步，run 每次點下去都會變（同一步再點一次就重播） */
function useSteps() {
  const [state, setState] = useState({ step: 0, run: 0 });
  return { ...state, go: (step: number) => setState((s) => ({ step, run: s.run + 1 })) };
}

function Scope({ children }: { children: ReactNode }) {
  return <div className="cl-scope">{children}</div>;
}

/** 滑桿：拉過的那段是實線、還沒拉到的是點線（--p 是拉到幾 %，樣式在 Colophon.css） */
function Range({
  label,
  value,
  onChange,
  min,
  max,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  return (
    <label className="cl-range">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <em>
        {value}
        {unit}
      </em>
    </label>
  );
}

/** 規則 01：首頁的土星，一步一步畫出來；畫到衛星那一步可以自己點一顆 */
export function SaturnToy() {
  const { t } = useTranslation();
  const { step, run, go } = useSteps();
  const [on, setOn] = useState(0);
  const onRef = useRef(on);
  onRef.current = on;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const satsRef = useRef<{ x: number; y: number }[]>([]);
  const withMoons = step >= SATURN_STEPS.indexOf('satellites');
  const withTrails = step >= SATURN_STEPS.indexOf('trails');

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = reduced();
    let planet: { key: string; img: HTMLCanvasElement } | null = null;
    const trails = createTrails(90);
    return loop((time) => {
      const { w, h, dpr } = fit(cv, ctx);
      const t = reduce ? 0 : time;
      // 衛星那一步起要把整組縮小，才放得下最外圈的軌道
      const R = (withMoons ? 0.078 : 0.19) * w;
      const size = Math.round(w * dpr);
      const key = `${step}:${size}`;
      if (planet?.key !== key) planet = { key, img: renderSaturn(step, size, R * dpr) };
      if (withTrails) trails(ctx, w, h, reduce ? 3 : time, t);
      if (withMoons) {
        drawOrbits(ctx, w / 2, h / 2, R, t, onRef.current);
        satsRef.current = [0, 1, 2, 3, 4].map((i) => satelliteAt(i, w / 2, h / 2, R, t));
      }
      ctx.drawImage(planet.img, 0, 0, w, h);
    });
  }, [step, run, withMoons, withTrails]);

  return (
    <>
      <Scope>
        <canvas
          key={`${step}-${run}`}
          ref={cvRef}
          className={withMoons ? 'cl-toy-canvas is-clickable' : 'cl-toy-canvas'}
          aria-label={t('colophon.saturnToy')}
          onPointerDown={(e) => {
            if (!withMoons) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            let best = -1;
            let bestD = 24;
            satsRef.current.forEach((s, i) => {
              const d = Math.hypot(s.x - x, s.y - y);
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            });
            if (best >= 0) setOn(best);
          }}
        />
      </Scope>
      <Steps ns="colophon.steps.saturn" keys={SATURN_STEPS} step={step} onStep={go} />
    </>
  );
}

const PHOTO_STEPS = ['raw', 'bits', 'gray', 'color', 'dots'] as const;
/** 規則 02 拿來示範的那張照片 */
const TOY_PHOTO = 'IMG_2635';
/** 照片頁一張照片收黑白、上色各要幾秒（跟照片頁一樣） */
const SCAN_S = RX_PHASES.scan[1] - RX_PHASES.scan[0];
const COLOR_S = RX_PHASES.color[1] - RX_PHASES.color[0];
/** 0 與 1 多久換一次（秒） */
const BITS_SWAP_S = 0.07;

/** 規則 02：照片頁怎麼收下一張照片；最後一步看只用點會怎樣 */
export function PhotoToy() {
  const { t } = useTranslation();
  const { step, run, go } = useSteps();
  const [cell, setCell] = useState(5);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const { data: photos = [] } = useQuery({
    queryKey: ['gallery', 'photos'],
    queryFn: loadPhotosManifest,
    staleTime: 10 * 60 * 1000,
  });
  // 用 IMG_2635（作者挑的）；照片庫裡找不到就挑一張橫的，圓形目鏡裡放得比較滿
  const src = (photos.find((p) => p.id === TOY_PHOTO) ?? photos.find((p) => p.aspectRatio > 1.2) ?? photos.at(0))
    ?.thumbnailUrl;
  const key = PHOTO_STEPS[step];

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !src) return;
    const img = new Image();
    img.src = src;
    const reduce = reduced();
    let gray: HTMLCanvasElement | null = null;
    let bits: { at: number; rows: string[] } | null = null;
    /** 照片蓋滿畫布（cover），畫在 (0, 0, w, h) */
    const cover = (g: CanvasRenderingContext2D, w: number, h: number) => {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      g.drawImage(
        img,
        (w - img.naturalWidth * s) / 2,
        (h - img.naturalHeight * s) / 2,
        img.naturalWidth * s,
        img.naturalHeight * s,
      );
    };
    const grayOf = (w: number, h: number, dpr: number) => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d');
      if (g) {
        g.filter = 'grayscale(1) contrast(1.05)';
        g.scale(dpr, dpr);
        cover(g, w, h);
      }
      return c;
    };
    const drawBits = (w: number, h: number, time: number) => {
      ctx.font = '10px "Fira Code", ui-monospace, monospace';
      const cols = Math.ceil(w / 6.2) + 1;
      if (!bits || time - bits.at > BITS_SWAP_S) {
        const rows: string[] = [];
        for (let y = 9; y < h; y += 11) {
          let line = '';
          for (let x = 0; x < cols; x++) line += Math.random() < 0.5 ? '0' : '1';
          rows.push(line);
        }
        bits = { at: time, rows };
      }
      ctx.fillStyle = `rgba(${INK}, 0.22)`;
      bits.rows.forEach((line, k) => ctx.fillText(line, 0, 9 + k * 11));
    };
    const drawDots = (w: number, h: number) => {
      const cols = Math.max(1, Math.floor(w / cell));
      const rows = Math.max(1, Math.floor(h / cell));
      // 照片縮到「一格一個像素」，讀亮度
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return;
      cover(o, cols, rows);
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
          ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, TAU);
          ctx.fill();
        }
      }
    };
    let stop: (() => void) | null = null;
    const start = () => {
      stop = loop((time) => {
        const { w, h, dpr } = fit(cv, ctx);
        if (key === 'raw') return cover(ctx, w, h);
        if (key === 'dots') return drawDots(w, h);
        if (key === 'bits') return drawBits(w, h, time);
        if (!gray || gray.width !== Math.round(w * dpr)) gray = grayOf(w, h, dpr);
        // 收黑白：從上往下一行一行浮出來，正在收的那一行是一條琥珀色的線；還沒收到的地方是 0 與 1
        const scan = reduce || key === 'color' ? 1 : Math.min(1, time / SCAN_S);
        const y = scan * h;
        if (scan < 1) drawBits(w, h, time);
        ctx.drawImage(gray, 0, 0, gray.width, (gray.height * y) / h, 0, 0, w, y);
        if (scan < 1) {
          ctx.fillStyle = `rgba(${AMBER}, 0.9)`;
          ctx.fillRect(0, y - 0.5, w, 1);
        }
        if (key !== 'color') return;
        // 上色：一道從左掃到右，掃過的地方換回原本的顏色
        const sweep = reduce ? 1 : Math.min(1, time / COLOR_S);
        const x = sweep * w;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, x, h);
        ctx.clip();
        cover(ctx, w, h);
        ctx.restore();
        if (sweep < 1) {
          ctx.fillStyle = `rgba(${AMBER}, 0.9)`;
          ctx.fillRect(x - 0.5, 0, 1, h);
        }
      });
    };
    if (img.complete && img.naturalWidth) start();
    else img.onload = start;
    return () => {
      img.onload = null;
      stop?.();
    };
  }, [src, key, run, cell]);

  return (
    <>
      <Scope>
        <canvas key={`${step}-${run}`} ref={cvRef} className="cl-toy-canvas" aria-label={t('colophon.photoToy')} />
      </Scope>
      <Steps ns="colophon.steps.photo" keys={PHOTO_STEPS} step={step} onStep={go} />
      {key === 'dots' && (
        <Range label={t('colophon.cell')} value={cell} onChange={setCell} min={2} max={10} unit=" px" />
      )}
    </>
  );
}

const WORK_STEPS = ['numbers', 'surface', 'rings', 'body', 'spiral'] as const;
const LANGS = ['TypeScript', 'Rust', 'Python', 'Go'] as const;
const OTHER_LANGS = ['CSS', 'Shell', 'HTML', 'Dockerfile', 'JavaScript'];

/** 規則 03：調數字長一顆星，一步一步看它怎麼長成，最後放上作品頁的螺旋 */
export function WorkToy() {
  const { t } = useTranslation();
  const { step, run, go } = useSteps();
  const [size, setSize] = useState(45);
  const [langs, setLangs] = useState(2);
  const [stars, setStars] = useState(6);
  const [commits, setCommits] = useState(120);
  const [pushed, setPushed] = useState(3);
  const [main, setMain] = useState<(typeof LANGS)[number]>('TypeScript');
  const cvRef = useRef<HTMLCanvasElement>(null);
  const entries = useWorkEntries();
  const live = useWorkStats(entries);
  const key = WORK_STEPS[step];

  // 你做的這顆排在作品頁所有作品的後面：地貌跟同一族的作品錯開（跟作品頁同一套規則），在螺旋上是最新的一顆
  const bodies = useMemo(() => {
    const now = Date.now();
    // 站上還沒有作品的話，就只有你做的這一顆
    const real = entries.map((w) => workStatsOf(w.name, statsOf(w, live), now));
    const total = 10 ** (4 + (size / 100) * 3);
    const languages: WorkStats['languages'] = [{ name: main, bytes: total * 0.62 }];
    for (let k = 1; k < langs; k++)
      languages.push({ name: OTHER_LANGS[k - 1] ?? 'Other', bytes: (total * 0.38) / k / 1.6 });
    return bodiesOf([...real, { name: `toy-${main}`, commits, stars, pushedDaysAgo: pushed, languages }]);
  }, [live, entries, size, langs, stars, commits, pushed, main]);
  const spiral = useMemo(() => createSpiral(bodies), [bodies]);

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = reduced();
    const body = bodies[bodies.length - 1];
    const n = bodies.length;
    return loop((time, dt) => {
      const { w, h } = fit(cv, ctx);
      const tt = reduce ? 0 : time;
      const spin = tt * body.spinSpeed * 2;
      const cx = w / 2;
      const cy = h / 2;
      if (key === 'numbers') {
        // 還沒長成任何東西：一個點
        ctx.fillStyle = `rgba(${INK}, 0.9)`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, TAU);
        ctx.fill();
        return;
      }
      if (key === 'spiral') {
        spiral.draw(ctx, { w, h, t: tt, dt, near: n - 1, grow: 1, erase: 0, settle: 1 });
        return;
      }
      if (key === 'body') {
        drawBody(ctx, cx, cy, Math.min((w * 0.42) / body.span, w * 0.2 * (0.55 + body.size)), body, spin, tt, 1, true);
        return;
      }
      // 符號：大小與地貌那一步先不畫環與衛星
      const rc = Math.min(w * 0.11 * (0.6 + body.size), (w * 0.42) / body.span);
      const shown = key === 'surface' ? { ...body, bands: [], moons: [], span: 1 } : body;
      drawGlyph(ctx, cx, cy, rc, shown, spin, tt, 1, false);
    });
  }, [bodies, spiral, key, run]);

  return (
    <>
      <Scope>
        <canvas key={`${step}-${run}`} ref={cvRef} className="cl-toy-canvas" aria-label={t('colophon.workToy')} />
      </Scope>
      <Steps ns="colophon.steps.work" keys={WORK_STEPS} step={step} onStep={go} />
      <div className="cl-controls">
        <Range label={t('colophon.genSize')} value={size} onChange={setSize} min={1} max={100} />
        <Range label={t('colophon.genLangs')} value={langs} onChange={setLangs} min={1} max={5} />
        <Range label={t('colophon.genStars')} value={stars} onChange={setStars} min={0} max={64} />
        <Range label={t('colophon.genCommits')} value={commits} onChange={setCommits} min={1} max={800} />
        <Range
          label={t('colophon.genPushed')}
          value={pushed}
          onChange={setPushed}
          min={0}
          max={365}
          unit={t('colophon.daysAgo')}
        />
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
