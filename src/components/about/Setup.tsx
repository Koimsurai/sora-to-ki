// 設備：六張工程圖，每一個分類一張（about/setupSheets）。兩台主機是「真的機殼線稿」放中間，
// 滑過兩側的零件，機殼上它裝的位置就亮起來；伺服器的側板是實心的，就用虛線把藏在後面的零件透視出來。
// SHEET 0 是老家那台：沒有照片，機殼是憑記憶畫的點狀草圖（點會微微晃），規格像開機自檢一行一行打出來。
// 網路是配線圖，智慧家庭是訊號流程圖，周邊是單純的線稿。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import { isArriving } from '@/store/pageTransition';
import {
  drawFlowLines,
  drawGlassPart,
  drawGrid,
  drawHiddenPart,
  drawNetLines,
  drawSketch,
  sketchDots,
  tintOf,
  type Rect,
} from './setupDraw';
import { APPLIANCES, GEAR, type GearItem } from './setupGear';
import {
  MEMORY_AT,
  MODEL5_AT,
  NET,
  P10C_AT,
  PART_TAG,
  partArt,
  POST_LINES,
  SHEETS,
  SMART,
  type Placed,
} from './setupSheets';
import './Setup.css';

/** 換頁轉場的點落在圖紙左上角之後，點格從那個角鋪開要多久（毫秒） */
const REVEAL_MS = 900;
/** 老家那張的草圖多久畫一次（毫秒）：點只是微微晃，30fps 就夠 */
const SKETCH_FRAME_MS = 33;
/** 開機自檢一行打出來的間隔（毫秒） */
const POST_STEP_MS = 380;
/** 老家那台的插圖（約 2012 年的桌機），原圖的寬高比 */
const HOME_PC = { src: '/illustrations/home-pc-2012.webp', ratio: 886 / 713 };

/** 圖紙描出來時，離左上角（點落下的對位記號）每遠一個圖紙寬，晚多久才描（毫秒） */
const PLOT_SPREAD_MS = 700;

/** 一樣東西在圖紙上的 (x, y)：離左上角越遠越晚描出來（CSS 變數 --plot） */
const plotDelay = (x: number, y: number) =>
  ({ '--plot': `${Math.round(Math.hypot(x, y * 0.75) * PLOT_SPREAD_MS)}ms` }) as React.CSSProperties;

const ITEMS = new Map<string, GearItem>(GEAR.flatMap((c) => c.items.map((it) => [it.id, it] as const)));
const itemOf = (id: string) => ITEMS.get(id);

/** 一個零件：線稿＋下面一行說明，中心點放在圖紙的 (x, y) */
function Part({
  placed,
  on,
  onHover,
}: {
  placed: Placed;
  on: boolean;
  onHover: (region: string | null, el: HTMLElement | null) => void;
}) {
  const [id, x, y, w, region] = placed;
  const it = itemOf(id);
  const ref = useRef<HTMLElement>(null);
  if (!it) return null;
  const hover = (v: boolean) => region && onHover(v ? region : null, v ? ref.current : null);
  return (
    <figure
      ref={ref}
      className={on ? 'su-part is-on' : 'su-part'}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, ...plotDelay(x, y) }}
    >
      <img src={partArt(id)} alt="" decoding="async" />
      {/* 裝在機殼裡的零件：滑過（觸控是點一下、鍵盤是聚焦）機殼上那一塊就亮 */}
      {region && (
        <button
          type="button"
          className="su-part-hit"
          aria-label={it.name}
          aria-pressed={on}
          onPointerEnter={(e) => e.pointerType === 'mouse' && hover(true)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && hover(false)}
          onFocus={() => hover(true)}
          onBlur={() => hover(false)}
          onClick={() => hover(!on)}
        />
      )}
      <figcaption className="su-callout">
        {PART_TAG[id] && <span className="su-tag">{PART_TAG[id]}</span>}
        <b>{it.name}</b>
        <span>{it.spec}</span>
      </figcaption>
    </figure>
  );
}

export default function Setup() {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState(1);
  const sheet = SHEETS[current];
  const [hover, setHover] = useState<{ region: string; el: HTMLElement | null } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const caseRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** 換頁轉場的點落地的時候（直接打開這頁就是第一幀） */
  const landedRef = useRef(-1);
  /** 點落地了沒：落地之後圖紙才開始描出來 */
  const [shown, setShown] = useState(false);

  /** 翻譯檔 setup.topo.* 有這個 key 就翻，沒有就是原文（型號、頻段、協定） */
  const topo = (k: string) => (i18n.exists(`setup.topo.${k}`) ? t(`setup.topo.${k}`) : k);

  // 換頁轉場的琥珀點落在圖紙的左上角（對位記號），點格從那裡鋪開
  usePageTransition({
    anchor: () => {
      const r = sheetRef.current?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top } : null;
    },
  });

  // 圖紙的大小：寬螢幕是 1200×900，窄螢幕維持同樣比例、可以左右拖
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 點格：點落地之後從左上角鋪開，鋪完就停
  useEffect(() => {
    const cv = gridRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || size.w === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const frame = (now: number) => {
      if (landedRef.current < 0 && !isArriving()) {
        landedRef.current = now;
        setShown(true);
      }
      const k = reduce ? 1 : landedRef.current < 0 ? 0 : Math.min(1, (now - landedRef.current) / REVEAL_MS);
      drawGrid(ctx, size.w, size.h, k);
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // 機殼線稿的琥珀色版本（玻璃側板那台滑過零件時用）：記著是哪一台的，換了圖紙就不算數
  const [tinted, setTinted] = useState<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const caseKey = sheet.kind === 'build' ? sheet.case.key : null;
  const tint = tinted?.key === caseKey ? tinted.canvas : null;
  useEffect(() => {
    const img = caseRef.current;
    if (!img || caseKey !== 'model5') return;
    const ready = () => setTinted({ key: caseKey, canvas: tintOf(img) });
    if (img.complete && img.naturalWidth > 0) {
      const raf = requestAnimationFrame(ready);
      return () => cancelAnimationFrame(raf);
    }
    img.addEventListener('load', ready, { once: true });
    return () => img.removeEventListener('load', ready);
  }, [caseKey]);

  // 老家那台的草圖：插圖取樣成點（大小變了才重取）
  const [homePc, setHomePc] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (sheet.kind !== 'memory' || homePc) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = HOME_PC.src;
    const ready = () => setHomePc(img);
    img.addEventListener('load', ready, { once: true });
    return () => img.removeEventListener('load', ready);
  }, [sheet.kind, homePc]);
  const sketchRect = useMemo<Rect>(() => {
    const W = Math.min(size.w * 0.46, size.h * 0.62 * HOME_PC.ratio);
    return { x: size.w * 0.05, y: size.h * 0.3, w: W, h: W / HOME_PC.ratio };
  }, [size]);
  const dots = useMemo(
    () => (homePc && sketchRect.w > 0 ? sketchDots(homePc, sketchRect.w, sketchRect.h) : []),
    [homePc, sketchRect],
  );

  // 圖紙上的線：滑過零件時亮起來的那一塊、配線圖與流程圖的線、老家的草圖（會微微晃，所以一直畫）
  useEffect(() => {
    const cv = fxRef.current;
    const ctx = cv?.getContext('2d');
    const box = sheetRef.current;
    if (!cv || !ctx || !box || size.w === 0) return;
    const { w, h } = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const local = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      const o = box.getBoundingClientRect();
      // 窄螢幕的圖紙是縮放過的：換回圖紙自己的座標
      const s = o.width / w;
      return { x: (r.left - o.left) / s, y: (r.top - o.top) / s, w: r.width / s, h: r.height / s };
    };
    const center = (el: HTMLElement | null) => {
      const img = el?.querySelector('img');
      if (!img) return null;
      const r = local(img);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    };
    const paint = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      if (sheet.kind === 'build' && hover && caseRef.current) {
        const from = center(hover.el);
        const rect = local(caseRef.current);
        if (from && sheet.case.key === 'model5') {
          const poly = MODEL5_AT[hover.region] as (typeof MODEL5_AT)[string] | undefined;
          if (poly) drawGlassPart(ctx, rect, tint, poly, from);
        } else if (from) {
          const at = P10C_AT[hover.region] as (typeof P10C_AT)[string] | undefined;
          if (at) drawHiddenPart(ctx, rect, at, from);
        }
      }
      if (sheet.kind === 'net') {
        drawNetLines(
          ctx,
          w,
          h,
          NET.buses,
          NET.nodes.filter((n) => n.end),
          NET.nodes.filter((n) => !n.id),
        );
      }
      if (sheet.kind === 'smart') {
        drawFlowLines(
          ctx,
          { x: w * 0.12 + 80, y: h * 0.5 },
          SMART.hubs.map((hb) => ({
            x: w * 0.42 - (hb.w * w) / 2 - 8,
            y: hb.y * h,
            out: w * 0.42 + (hb.w * w) / 2 + 170,
            to: w * 0.8 - 56,
          })),
        );
      }
      if (sheet.kind === 'memory') {
        drawSketch(ctx, dots, sketchRect, now / 1000);
        const at = hover ? (MEMORY_AT[hover.region] as (typeof MEMORY_AT)[string] | undefined) : undefined;
        if (at) drawHiddenPart(ctx, sketchRect, at, null);
      }
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sheet.kind !== 'memory' || reduce) {
      paint(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < SKETCH_FRAME_MS) return;
      last = now;
      paint(now);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sheet, hover, size, tint, dots, sketchRect]);

  // 窄螢幕的圖紙比畫面寬：換到一張圖紙時先捲到中間（機殼、配線圖的主幹都在中間）
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [current, size.w]);

  const pick = (i: number) => {
    setHover(null);
    setCurrent(i);
  };
  const onHover = (region: string | null, el: HTMLElement | null) => setHover(region ? { region, el } : null);

  return (
    <div className="su">
      <header className="su-head">
        <div className="su-head-title">
          <h1>{t('setup.heroTitle')}</h1>
          <span>Setup</span>
        </div>
        <p>{t('setup.subtitle')}</p>
      </header>

      <fieldset className="su-tabs">
        <legend className="sr-only">{t('setup.sheet.tabs')}</legend>
        {SHEETS.map((s, i) => (
          <button key={s.key} type="button" aria-pressed={i === current} onClick={() => pick(i)}>
            SHEET {s.no} · {s.kind === 'memory' ? t('setup.cat.base-ii.short') : s.title}
          </button>
        ))}
      </fieldset>

      <div className="su-scroll" ref={scrollRef}>
        <div
          ref={sheetRef}
          className={['su-sheet', hover ? 'has-on' : '', shown ? 'is-shown' : ''].filter(Boolean).join(' ')}
          data-kind={sheet.kind}
        >
          <canvas ref={gridRef} className="su-grid" aria-hidden="true" />

          {sheet.kind === 'build' && (
            <figure className="su-case" style={{ width: `${sheet.case.w * 100}%`, ...plotDelay(0.5, 0.42) }}>
              <img ref={caseRef} src={`/illustrations/setup/case-${sheet.case.key}.webp`} alt="" decoding="async" />
              <figcaption className="su-callout">
                <span className="su-tag">CASE</span>
                <b>{itemOf(sheet.case.id)?.name}</b>
                <span>{sheet.case.key === 'p10c' ? t('setup.sheet.p10cNote') : itemOf(sheet.case.id)?.spec}</span>
              </figcaption>
            </figure>
          )}

          {(sheet.kind === 'build' || sheet.kind === 'free') &&
            sheet.parts.map((p) => (
              <Part key={p[0]} placed={p} on={!!p[4] && hover?.region === p[4]} onHover={onHover} />
            ))}

          {sheet.kind === 'free' && (
            <div className="su-callout su-others">
              <span className="su-tag">OTHERS</span>
              {sheet.others.map((id) => {
                const it = itemOf(id);
                return it ? (
                  <span key={id}>
                    <b>{it.name}</b> · {it.spec}
                  </span>
                ) : null;
              })}
            </div>
          )}

          {sheet.kind === 'memory' && (
            <>
              <div className="su-callout su-memory-intro">
                <span className="su-tag">BASE II</span>
                <b>{t('setup.sheet.memoryTitle')}</b>
                <span>{t('setup.sheet.memoryText')}</span>
              </div>
              {/* 老家那台：規格像開機自檢一樣一行一行打出來，滑過哪一行，草圖上那個位置就亮 */}
              <div key={current} className="su-post" style={{ '--step': `${POST_STEP_MS}ms` } as React.CSSProperties}>
                <div className="su-post-head">KOIMSURAI BIOS · POWER-ON SELF TEST</div>
                {POST_LINES.map((ln, i) => (
                  <div
                    key={ln.label}
                    className={hover?.region === ln.region ? 'su-post-line is-on' : 'su-post-line'}
                    style={{ '--i': i } as React.CSSProperties}
                    onPointerEnter={() => onHover(ln.region, null)}
                    onPointerLeave={() => onHover(null, null)}
                  >
                    <span>{ln.label}</span>
                    <b>{ln.value}</b>
                    <em>OK</em>
                  </div>
                ))}
                <div className="su-post-foot" style={{ '--i': POST_LINES.length } as React.CSSProperties}>
                  PRESS F1 TO CONTINUE_
                </div>
              </div>
            </>
          )}

          {sheet.kind === 'net' && (
            <>
              <span className="su-callout su-at" style={{ left: '46%', top: '3%' }}>
                <span>{topo('internet')}</span>
              </span>
              <figure className="su-node" style={{ left: '46%', top: '10%', width: '7%' }}>
                <img src={partArt('zenwifi-bd5')} alt="" decoding="async" />
              </figure>
              <span className="su-callout su-at is-right" style={{ left: '50.5%', top: '10%' }}>
                <span className="su-tag">ROUTER</span>
                <b>{itemOf('zenwifi-bd5')?.name}</b>
                <span>WiFi 7 Mesh</span>
              </span>
              {NET.buses.map((b) => (
                <span key={b.label} className="su-callout su-at is-above" style={{ left: `${b.x * 100}%`, top: '30%' }}>
                  <span className="su-tag">{topo(b.sub)}</span>
                  <b>{topo(b.label)}</b>
                </span>
              ))}
              {NET.nodes.map((n) => (
                <figure
                  key={n.id ?? n.name}
                  className="su-node"
                  style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%`, ...plotDelay(n.x, n.y) }}
                >
                  {n.id && n.w && (
                    <img src={partArt(n.id)} alt="" decoding="async" style={{ width: `${n.w * 100}cqw` }} />
                  )}
                  <figcaption className="su-callout">
                    <b>{topo(n.name ?? itemOf(n.id ?? '')?.name ?? '')}</b>
                    {n.sub && <span>{topo(n.sub)}</span>}
                  </figcaption>
                  {n.end && (
                    <span className="su-callout su-end">
                      <span className="su-tag">{n.end[1]}</span>
                      <b>{topo(n.end[0])}</b>
                    </span>
                  )}
                </figure>
              ))}
            </>
          )}

          {sheet.kind === 'smart' && (
            <>
              <span className="su-callout su-at" style={{ left: '12%', top: '50%' }}>
                <span className="su-tag">HOME SERVER</span>
                <b>Home Assistant</b>
                <span>{t('setup.sheet.root')}</span>
              </span>
              {SMART.hubs.map((hb) => (
                <div key={hb.id}>
                  <figure
                    className="su-node is-row"
                    style={{ left: '42%', top: `${hb.y * 100}%`, ...plotDelay(0.42, hb.y) }}
                  >
                    <img src={partArt(hb.id)} alt="" decoding="async" style={{ width: `${hb.w * 100}cqw` }} />
                    <figcaption className="su-callout">
                      <b>{itemOf(hb.id)?.name}</b>
                    </figcaption>
                  </figure>
                  <span className="su-callout su-at" style={{ left: '80%', top: `${hb.y * 100}%` }}>
                    <span className="su-tag">{hb.via}</span>
                    <b>{t(`setup.sheet.to.${hb.to}`)}</b>
                  </span>
                </div>
              ))}
              <div className="su-callout su-at su-appliances" style={{ left: '12%', top: '86%' }}>
                <span className="su-tag">OTHERS</span>
                <b>{t('setup.appliances.title')}</b>
                <span>
                  {APPLIANCES.map((a) => `${a.name} ${t(`setup.appliances.types.${a.typeKey}`)}`).join(' · ')}
                </span>
              </div>
            </>
          )}

          <canvas ref={fxRef} className="su-fx" aria-hidden="true" />

          <div className="su-titleblock" aria-hidden="true">
            <span>SHEET</span>
            <span>{sheet.no} OF 5</span>
            <span>TITLE</span>
            <span>{sheet.title}</span>
            <span>DRAWN</span>
            <span>{sheet.kind === 'memory' ? t('setup.sheet.fromMemory') : '2026.10'}</span>
            <span>SCALE</span>
            <span>NTS</span>
          </div>
        </div>
      </div>
      <p className="su-drag" aria-hidden="true">
        {t('setup.sheet.drag')}
      </p>

      {/* 圖紙上的零件給螢幕閱讀器與搜尋引擎的版本：全部設備的清單 */}
      <div className="sr-only">
        {GEAR.map((c) => (
          <section key={c.id} aria-label={t(`setup.cat.${c.id}.short`)}>
            <h2>{t(`setup.cat.${c.id}.short`)}</h2>
            <ul>
              {c.items.map((it) => (
                <li key={it.id}>
                  {it.name}，{it.spec}
                  {it.roleKey ? `：${t(`setup.roles.${it.roleKey}`)}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
