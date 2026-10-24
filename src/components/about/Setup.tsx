// 設備：六張工程圖，每一個分類一張（about/setupSheets）。兩台主機與桌面是工程概念設計圖：
// 爆炸軸測的線稿當底稿，編號圈、引線、尺寸線、零件表與標題欄是程式疊上去的；
// 滑過編號或零件表的一列，底稿上那個零件就染成琥珀色。
// SHEET 0 是老家那台：沒有照片，機殼是憑記憶畫的點狀草圖（點會微微晃），規格像開機自檢一行一行打出來。
// 網路是配線圖，智慧家庭是訊號流程圖。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import { isArriving } from '@/store/pageTransition';
import {
  drawDrawing,
  drawFlowLines,
  drawFlowPulses,
  drawGrid,
  drawHiddenPart,
  drawNetLines,
  drawNetPulses,
  drawSketch,
  sketchDots,
  tintOf,
  type Rect,
} from './setupDraw';
import { APPLIANCES, GEAR, type GearItem } from './setupGear';
import {
  MEMORY_AT,
  NET,
  PART_TAG,
  partArt,
  POST_LINES,
  SHEETS,
  SMART,
  SUBSYSTEMS,
  type Drawing,
  type Subsystem,
} from './setupSheets';
import TelemetryPanel from './TelemetryPanel';
import './Setup.css';

/** 換頁轉場的點落在圖紙左上角之後，點格從那個角鋪開要多久（毫秒） */
const REVEAL_MS = 900;
/** 老家那張的草圖多久畫一次（毫秒）：點只是微微晃，30fps 就夠 */
const SKETCH_FRAME_MS = 33;
/** 開機自檢一行打出來的間隔（毫秒） */
const POST_STEP_MS = 380;
/** 老家那台的插圖（約 2012 年的桌機），原圖的寬高比 */
const HOME_PC = { src: '/illustrations/home-pc-2012.webp', ratio: 886 / 713 };
/** 工程概念設計圖描出來要多久（毫秒）：底稿先描、引線再長出去、尺寸線最後拉開 */
const DRAWING_MS = 1600;
/** 編號圈的半徑（像素，跟 Setup.css 的 .su-balloon 一樣） */
const BALLOON_R = 11;

/** 圖紙描出來時，離左上角（點落下的對位記號）每遠一個圖紙寬，晚多久才描（毫秒） */
const PLOT_SPREAD_MS = 700;

/** 一樣東西在圖紙上的 (x, y)：離左上角越遠越晚描出來（CSS 變數 --plot） */
const plotDelay = (x: number, y: number) =>
  ({ '--plot': `${Math.round(Math.hypot(x, y * 0.75) * PLOT_SPREAD_MS)}ms` }) as React.CSSProperties;

/** 子系統代號 → 翻譯檔的 key（setup.sheet.subsystem.*） */
const SUBSYSTEM_KEY: Record<Subsystem, string> = {
  'C&DH': 'cdh',
  EPS: 'eps',
  TCS: 'tcs',
  DATA: 'data',
  COMM: 'comm',
  BUS: 'bus',
  STRUCT: 'struct',
  CREW: 'crew',
};

const ITEMS = new Map<string, GearItem>(GEAR.flatMap((c) => c.items.map((it) => [it.id, it] as const)));
const itemOf = (id: string) => ITEMS.get(id);

/** 底稿在圖紙上的範圍（像素） */
const artRect = (d: Drawing, w: number, h: number): Rect => ({
  x: d.x * w,
  y: d.y * h,
  w: d.w * w,
  h: d.w * w * d.ratio,
});

export default function Setup() {
  const { t, i18n } = useTranslation();
  const [current, setCurrent] = useState(1);
  const sheet = SHEETS[current];
  const drawing = sheet.kind === 'drawing' ? sheet.drawing : null;
  /** 滑過的零件（工程概念設計圖是零件 id，老家那張是草圖上的一塊） */
  const [hover, setHover] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLImageElement>(null);
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

  // 底稿的琥珀色版本（滑過零件時疊上去）：記著是哪一張的，換了圖紙就不算數
  const [tinted, setTinted] = useState<{ src: string; canvas: HTMLCanvasElement } | null>(null);
  const artSrc = drawing?.src ?? null;
  const tint = tinted?.src === artSrc ? tinted.canvas : null;
  useEffect(() => {
    const img = artRef.current;
    if (!img || !artSrc) return;
    const ready = () => setTinted({ src: artSrc, canvas: tintOf(img) });
    if (img.complete && img.naturalWidth > 0) {
      const raf = requestAnimationFrame(ready);
      return () => cancelAnimationFrame(raf);
    }
    img.addEventListener('load', ready, { once: true });
    return () => img.removeEventListener('load', ready);
  }, [artSrc]);

  // 工程概念設計圖描出來的起點：點落地之後、或換到這張圖紙的時候
  const introRef = useRef(-1);
  useEffect(() => {
    if (shown) introRef.current = performance.now();
  }, [shown, current]);

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

  // 圖紙上的線：設計圖的引線與尺寸線、滑過時亮起來的那一塊、配線圖與流程圖的線、老家的草圖（會微微晃，所以一直畫）
  useEffect(() => {
    const cv = fxRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || size.w === 0) return;
    const { w, h } = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** 設計圖描到哪裡（0–1）；點還沒落地是 0 */
    const intro = (now: number) =>
      reduce ? 1 : introRef.current < 0 ? 0 : Math.min(1, (now - introRef.current) / DRAWING_MS);
    const paint = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      if (sheet.kind === 'drawing') {
        const d = sheet.drawing;
        drawDrawing(ctx, artRect(d, w, h), tint, d.parts, d.dims, hover, intro(now), BALLOON_R);
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
        drawNetPulses(ctx, w, h, NET.buses, now / 1000);
      }
      if (sheet.kind === 'smart') {
        const root = { x: w * 0.12 + 80, y: h * 0.5 };
        const hubs = SMART.hubs.map((hb) => ({
          x: w * 0.42 - (hb.w * w) / 2 - 8,
          y: hb.y * h,
          out: w * 0.42 + (hb.w * w) / 2 + 170,
          to: w * 0.8 - 56,
          // 會回報的：溫濕度感測與門鈴
          reports: hb.id === 'switchbot-hub3' || hb.id === 'doorbell',
        }));
        drawFlowLines(ctx, root, hubs);
        drawFlowPulses(ctx, root, hubs, now / 1000);
      }
      if (sheet.kind === 'memory') {
        drawSketch(ctx, dots, sketchRect, now / 1000);
        const at = hover ? (MEMORY_AT[hover] as (typeof MEMORY_AT)[string] | undefined) : undefined;
        if (at) drawHiddenPart(ctx, sketchRect, at, null);
      }
    };
    // 一直在動的三張：老家的草圖在晃、配線圖與流程圖的線上有訊號在跑；設計圖只在描出來的那段動
    const moving = sheet.kind === 'memory' || sheet.kind === 'net' || sheet.kind === 'smart';
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      const drawingIn = sheet.kind === 'drawing' && intro(now) < 1;
      if (moving || drawingIn) raf = requestAnimationFrame(frame);
      // 設計圖描完的那一幀一定要畫（尺寸線的數字到最後才出來）
      if (!drawingIn && moving && now - last < SKETCH_FRAME_MS) return;
      last = now;
      paint(now);
    };
    if (reduce) {
      paint(performance.now());
      return;
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sheet, hover, size, tint, dots, sketchRect, shown]);

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

  /** 編號圈與零件表的一列共用：滑過（觸控是點一下、鍵盤是聚焦）就把那個零件亮起來 */
  const hoverProps = (id: string) => ({
    'aria-pressed': hover === id,
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHover(id),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHover(null),
    onFocus: () => setHover(id),
    onBlur: () => setHover(null),
    onClick: () => setHover(hover === id ? null : id),
  });

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

          {sheet.kind === 'drawing' && (
            <>
              <figure
                key={sheet.key}
                className="su-art"
                style={{
                  left: `${sheet.drawing.x * 100}%`,
                  top: `${sheet.drawing.y * 100}%`,
                  width: `${sheet.drawing.w * 100}%`,
                }}
              >
                <img ref={artRef} src={sheet.drawing.src} alt="" decoding="async" />
              </figure>

              {/* 編號圈：位置是底稿寬高的比例，換成圖紙的比例（圖紙高是寬的 0.75） */}
              {sheet.drawing.parts.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="su-balloon"
                  aria-label={itemOf(p.id)?.name}
                  style={{
                    left: `${(sheet.drawing.x + p.balloon[0] * sheet.drawing.w) * 100}%`,
                    top: `${(sheet.drawing.y + (p.balloon[1] * sheet.drawing.w * sheet.drawing.ratio) / 0.75) * 100}%`,
                    animationDelay: `${(i * 60 + 500).toFixed(0)}ms`,
                  }}
                  {...hoverProps(p.id)}
                >
                  {i + 1}
                </button>
              ))}

              {/* 零件表：圖紙右上；滑過一列，底稿上那個零件亮起來 */}
              <div key={`bom-${sheet.key}`} className="su-bom">
                <div className="su-bom-head" aria-hidden="true">
                  <span>NO</span>
                  <span>PART</span>
                  <span>SUBSYS</span>
                </div>
                <ol>
                  {sheet.drawing.parts.map((p, i) => {
                    const it = itemOf(p.id);
                    const tag = PART_TAG[p.id] as (typeof PART_TAG)[string] | undefined;
                    return it ? (
                      <li key={p.id}>
                        <button type="button" className="su-bom-row" {...hoverProps(p.id)}>
                          <span className="su-bom-no">{String(i + 1).padStart(2, '0')}</span>
                          <span className="su-bom-part">
                            <b>{it.name}</b>
                            <span>{it.spec}</span>
                          </span>
                          {tag && (
                            <span className="su-bom-tag">
                              <em>{tag[0]}</em>
                              {tag[1]}
                            </span>
                          )}
                        </button>
                      </li>
                    ) : null;
                  })}
                </ol>
                {sheet.others && (
                  <div className="su-others">
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
              </div>

              <dl className="su-legend" aria-label={t('setup.sheet.subsystemTitle')}>
                {SUBSYSTEMS.filter((s) => sheet.drawing.parts.some((p) => PART_TAG[p.id]?.[0] === s)).map((s) => (
                  <div key={s}>
                    <dt>{s}</dt>
                    <dd>{t(`setup.sheet.subsystem.${SUBSYSTEM_KEY[s]}`)}</dd>
                  </div>
                ))}
              </dl>

              {sheet.telemetry && <TelemetryPanel />}
            </>
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
                    className={hover === ln.region ? 'su-post-line is-on' : 'su-post-line'}
                    style={{ '--i': i } as React.CSSProperties}
                    onPointerEnter={() => setHover(ln.region)}
                    onPointerLeave={() => setHover(null)}
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
                <img src={partArt('router')} alt="" decoding="async" />
              </figure>
              <span className="su-callout su-at is-right" style={{ left: '50.5%', top: '10%' }}>
                <span className="su-tag">
                  <em>COMM</em> · ROUTER
                </span>
                <b>{itemOf('router')?.name}</b>
                <span>{itemOf('router')?.spec}</span>
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
                <span className="su-tag">MISSION CONTROL</span>
                <b>Home Assistant</b>
                <span>{t('setup.sheet.root')}</span>
              </span>
              {/* 線上跑的兩種訊號：琥珀色往外的是指令（上行），白色往回的是感測器回報（下行） */}
              <div className="su-links" aria-hidden="true">
                <span className="is-up">{t('setup.sheet.uplink')}</span>
                <span className="is-down">{t('setup.sheet.downlink')}</span>
              </div>
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
                  {APPLIANCES.map((a) => `${a.name} ${t(`setup.appliances.types.${a.typeKey}`)}`.trim()).join(' · ')}
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
            <span>{sheet.kind === 'drawing' ? 'UNIT' : 'SCALE'}</span>
            <span>{sheet.kind === 'drawing' ? 'mm · NTS' : 'NTS'}</span>
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
