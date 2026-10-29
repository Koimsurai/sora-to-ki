// 此站點：一具六分儀對著星空（about/colophonSky）。這個站的材料、字、天空、三條規則與授權各是一顆星；
// 點一顆星，六分儀轉過去對準它、望遠鏡拉出一條視線，目鏡裡就是那一條的說明，規則的那三顆是可以動手玩的玩具
// （about/colophonToys：首頁的土星、照片的接收、作品的星，都一步一步拆開）。往下捲是航海日誌：原本的 Q&A（about/colophonQa）。
// 換頁進來時琥珀點落在望遠鏡的鏡筒前端，視線從那裡拉到第一顆星；離開時點從正在測的那顆星飛走。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LinkCard } from '@/components/common/LinkCard';
import { usePageTransition } from '@/hooks/usePageTransition';
import { LocaleLink } from '@/i18n/locale-link';
import { lookupOr } from '@/lib/tableLookup';
import { sameTitle } from '@/lib/pageTitle';
import { after, isArriving, transitionDot } from '@/store/pageTransition';
import { COLOPHON_QA } from './colophonQa';
import {
  cumulative,
  drawColophon,
  frontOf,
  planConstellation,
  progressOn,
  SEXTANT_SRC,
  STAR_KEYS,
  starAt,
  strokeSpan,
  turnFor,
  type StarKey,
} from './colophonSky';
import { PhotoToy, SaturnToy, WorkToy } from './colophonToys';
import './Colophon.css';

/** 視線從望遠鏡拉到星要多久（秒） */
const SIGHT_S = 0.7;
/** 星座線的墨色（--paper） */
const INK_RGB = '241, 236, 227';
/** 點畫星座時飛的速度倍率（比一般換頁快一點） */
const CONSTELLATION_PACE = 1.5;
/** 落地後星座線收掉的時間 */
const CONSTELLATION_FADE_MS = 900;
const MELT_MS = 1200;
/** 收：場景淡掉的時間（毫秒） */
const ERASE_MS = 500;
/** 收完時點從那顆星飛走的速度（px/ms） */
const LEAVE_SPEED = 0.8;

/** 每一頁在這片天空裡是什麼（目鏡「天空」那一格） */
const SKY_PAGES = [
  ['/', 'home'],
  ['/blog', 'notes'],
  ['/thinking', 'moments'],
  ['/portfolio', 'works'],
  ['/watch', 'collection'],
  ['/photos', 'photos'],
  ['/setup', 'setup'],
  ['/friends', 'friends'],
  ['/messages', 'messages'],
  ['/history', 'log'],
  ['/about', 'about'],
] as const;

const stripNumber = (q: string) => q.replace(/^(\d+\.\s*|Q:\s*)/, '');

export default function Colophon() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const qa = lookupOr(COLOPHON_QA, lang, COLOPHON_QA['zh-TW']);
  /** 問答目前看的是第幾題 */
  const [qaAt, setQaAt] = useState(0);
  const [target, setTarget] = useState<StarKey>('material');
  const [hover, setHover] = useState<StarKey | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const turnRef = useRef(0);
  const leaveRef = useRef<number | null>(null);
  /**
   * 換頁進來時點畫的星座（場景座標，最後一點是鏡筒前端）：飛的時候身後留下星座線，
   * 落地後從第一顆星沿著來的方向收掉，剩下最後那段（目標星到鏡筒）就是視線
   */
  const constellationRef = useRef<{
    path: { x: number; y: number }[];
    cum: number[];
    drawn: number;
    /** 曲線從起點到正在測的那顆星有多長：收的時候收到這裡為止 */
    toTarget: number;
  } | null>(null);

  const box = () => {
    const el = boxRef.current;
    return el ? { r: el.getBoundingClientRect(), w: el.clientWidth, h: el.clientHeight } : null;
  };

  usePageTransition({
    // 點飛進來時從最右邊那顆星進來，由右往左把星一顆顆掃過去，最後一顆是正在測的那顆，再接到鏡筒前端
    arrive: () => {
      const b = box();
      if (!b || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const front = frontOf(b.w, b.h, turnFor(targetRef.current, b.w, b.h));
      const { path, targetAt } = planConstellation(targetRef.current, front, b.w, b.h);
      const cum = cumulative(path);
      constellationRef.current = { path, cum, drawn: 0, toTarget: cum[targetAt] };
      // 星與星之間飛快一點；鏡頭在第一顆星停下
      return {
        approach: path.map((q) => ({ x: b.r.left + q.x, y: b.r.top + q.y })),
        join: 0,
        pace: CONSTELLATION_PACE,
      };
    },
    // 錨點是望遠鏡的鏡筒前端：點落在這裡，視線從這裡拉到第一顆星
    anchor: () => {
      const b = box();
      if (!b) return null;
      const f = frontOf(b.w, b.h, turnFor(targetRef.current, b.w, b.h));
      return { x: b.r.left + f.x, y: b.r.top + f.y };
    },
    leave: () => {
      const b = box();
      if (!b) return null;
      leaveRef.current = performance.now();
      pageRef.current?.classList.add('is-leaving');
      const s = starAt(targetRef.current, b.w, b.h);
      const point = { x: b.r.left + s.x, y: b.r.top + s.y };
      return {
        point,
        velocity: { x: 0.5 * LEAVE_SPEED, y: -0.85 * LEAVE_SPEED },
        follow: () => point,
        done: after(ERASE_MS),
      };
    },
  });

  // 場景的大小：星的名字照它擺
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 六分儀與視線
  useEffect(() => {
    const el = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!el || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const img = new Image();
    img.src = SEXTANT_SRC;
    let raf = 0;
    let last = 0;
    let start = -1;
    let aimed: StarKey | null = null;
    let sightFrom = 0;
    /** 點畫星座進來的：落地那一刻，視線已經是畫好的（星座最後那一段），不用再從鏡筒拉一次 */
    let sightDone = false;
    let landedAt = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const con = constellationRef.current;
      const arriving = isArriving();
      if (arriving && !con) return;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const goal = turnFor(targetRef.current, w, h);
      ctx.lineWidth = 1;

      // 點正在畫星座：星先亮著（六分儀還沒出來），點身後的線畫到點走到的地方
      if (arriving && con) {
        const d = transitionDot();
        const r = el.getBoundingClientRect();
        if (d) con.drawn = Math.max(con.drawn, progressOn(con.path, con.cum, { x: d.x - r.left, y: d.y - r.top }));
        drawColophon(ctx, {
          w,
          h,
          t: now / 1000,
          turn: goal,
          target: targetRef.current,
          sight: 0,
          hover: null,
          appear: 1,
          sextant: 0,
          img,
        });
        ctx.strokeStyle = `rgba(${INK_RGB}, 0.55)`;
        strokeSpan(ctx, con.path, con.cum, 0, con.drawn);
        return;
      }

      if (start < 0) {
        start = now;
        if (con) {
          // 落地：六分儀已經對準那顆星，視線就是星座最後那一段
          landedAt = now;
          turnRef.current = goal;
          aimed = targetRef.current;
          sightDone = true;
        }
      }
      const real = (now - start) / 1000;
      // 換了一顆星：六分儀轉過去，轉得差不多了視線才重新拉出來
      if (aimed !== targetRef.current) {
        aimed = targetRef.current;
        sightFrom = -1;
        sightDone = false;
      }
      turnRef.current = reduce ? goal : turnRef.current + (goal - turnRef.current) * Math.min(1, dt * 4);
      if (sightFrom < 0 && Math.abs(goal - turnRef.current) < 0.02) sightFrom = real;
      const sight = reduce || sightDone ? 1 : sightFrom < 0 ? 0 : Math.min(1, (real - sightFrom) / SIGHT_S);
      const erase = leaveRef.current === null ? 0 : Math.min(1, (now - leaveRef.current) / ERASE_MS);
      const fadeIn = Math.min(1, reduce ? 1 : real / 0.6);
      drawColophon(ctx, {
        w,
        h,
        t: reduce ? 0 : real,
        turn: turnRef.current,
        target: targetRef.current,
        sight,
        hover: hoverRef.current,
        // 點畫星座進來的：星本來就亮著，只有六分儀淡進來
        appear: (landedAt >= 0 ? 1 : fadeIn) * (1 - erase),
        sextant: fadeIn * (1 - erase),
        img,
      });
      // 星座從第一顆星沿著來的方向收掉，最後剩下目標星到鏡筒那段（跟視線疊在一起）
      if (con && landedAt >= 0) {
        const k = Math.min(1, (now - landedAt) / CONSTELLATION_FADE_MS);
        // 收完之後剩下的那段實線慢慢淡成底下的點線視線，不是一幀就拿掉
        const melt = Math.min(1, Math.max(0, (now - landedAt - CONSTELLATION_FADE_MS) / MELT_MS));
        const { toTarget } = con;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        ctx.strokeStyle = `rgba(${INK_RGB}, ${0.55 * (1 - melt)})`;
        // 畫在已經畫好的東西後面：跟視線一樣被六分儀的圖蓋住那一截，收到最後兩條才疊得剛好
        ctx.globalCompositeOperation = 'destination-over';
        strokeSpan(ctx, con.path, con.cum, toTarget * e, con.cum[con.cum.length - 1]);
        ctx.globalCompositeOperation = 'source-over';
        if (melt >= 1) constellationRef.current = null;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const qaItems: { q: string; a: ReactNode }[] = [
    { q: stripNumber(qa.q1), a: <p>{qa.a1}</p> },
    {
      q: stripNumber(qa.q2),
      a: (
        <p>
          {qa.a2_pre}
          <code>React 19</code>
          {qa.a2_mid1}
          <code>TanStack Start</code>
          {qa.a2_mid2}
          <code>Vite</code>
          {qa.a2_mid3}
          <code>Tailwind CSS</code>
          {qa.a2_mid4}
          <code>Three.js</code>
          {qa.a2_mid5}
          <code>Rust</code>
          {qa.a2_mid6}
          <code>SQLite</code>
          {qa.a2_mid7}
          <code>Docker</code>
          {qa.a2_tail}
        </p>
      ),
    },
    {
      q: stripNumber(qa.q3),
      a: (
        <>
          <p>
            {qa.a3} <code>thumbhash</code> {qa.a3_mid}
          </p>
          <LinkCard href="https://koimsurai.com/blog/21" />
        </>
      ),
    },
    { q: stripNumber(qa.q4), a: <p>{qa.a4}</p> },
    {
      q: stripNumber(qa.q5),
      a: (
        <>
          <p>{qa.a5_p1}</p>
          <p>
            {qa.a5_p2_pre}
            <LocaleLink to="/messages">{qa.a5_p2_link}</LocaleLink>
            {qa.a5_p2_post}
          </p>
        </>
      ),
    },
    { q: stripNumber(qa.q6), a: <p>{qa.a6}</p> },
    { q: stripNumber(qa.q7), a: <p>{qa.a7}</p> },
    { q: stripNumber(qa.q8), a: <p>{qa.a8}</p> },
  ];

  const panel: Record<StarKey, ReactNode> = {
    material: (
      <ul className="cl-swatches">
        <li>
          <i className="is-ground" />
          {t('colophon.swatchGround')}
        </li>
        <li>
          <i className="is-paper" />
          {t('colophon.swatchPaper')}
        </li>
        <li>
          <i className="is-amber" />
          {t('colophon.swatchAmber')}
        </li>
      </ul>
    ),
    type: (
      <ul className="cl-fonts">
        <li>
          <b className="is-serif">宙と木</b>
          <span>{t('colophon.fontSerif')}</span>
        </li>
        <li>
          <b className="is-latin">Koimsurai</b>
          <span>{t('colophon.fontLatin')}</span>
        </li>
        <li>
          <b className="is-mono">2026.10.24</b>
          <span>{t('colophon.fontMono')}</span>
        </li>
        {/* 文章的字體切換另外三種；MiSans 的授權要求註明有用到它 */}
        <li className="cl-fonts-note">{t('colophon.fontReading')}</li>
      </ul>
    ),
    sky: (
      <ul className="cl-pages">
        {SKY_PAGES.map(([to, key]) => (
          <li key={key}>
            <LocaleLink to={to}>{key === 'home' ? t('colophon.homePage') : t(`siteNav.${key}`)}</LocaleLink>
            <span>{t(`colophon.skyIs.${key}`)}</span>
          </li>
        ))}
      </ul>
    ),
    rule1: <SaturnToy />,
    rule2: <PhotoToy />,
    rule3: <WorkToy />,
    qa: (
      <div className="cl-qa">
        {/* 左邊題目、右邊答案：點題目換答案，目鏡的高度固定，不會因為打開一題就往上頂 */}
        <ul className="cl-qa-list" role="tablist" aria-label={qa.qaHeading}>
          {qaItems.map((it, i) => (
            <li key={it.q}>
              <button
                type="button"
                role="tab"
                id={`cl-qa-q${i}`}
                aria-selected={i === qaAt}
                aria-controls="cl-qa-answer"
                onClick={() => setQaAt(i)}
              >
                {it.q}
              </button>
            </li>
          ))}
        </ul>
        <div className="cl-qa-answer" id="cl-qa-answer" role="tabpanel" aria-labelledby={`cl-qa-q${qaAt}`} key={qaAt}>
          {qaItems[qaAt]?.a}
        </div>
      </div>
    ),
    license: (
      <a className="cl-repo" href="https://github.com/Koimsurai/sora-to-ki" target="_blank" rel="noopener noreferrer">
        github.com/Koimsurai/sora-to-ki
      </a>
    ),
  };

  return (
    <div className="cl" ref={pageRef}>
      <div className="cl-scene">
        <div className="cl-sky" ref={boxRef}>
          <canvas ref={canvasRef} aria-hidden="true" />
          {size.w > 0 &&
            STAR_KEYS.map((key) => {
              const s = starAt(key, size.w, size.h);
              return (
                <button
                  key={key}
                  type="button"
                  className={`cl-star${key === target ? ' is-on' : ''}${s.x > size.w * 0.75 ? ' is-left' : ''}`}
                  style={{ left: s.x, top: s.y }}
                  aria-pressed={key === target}
                  onClick={() => setTarget(key)}
                  onPointerEnter={() => setHover(key)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                >
                  {t(`colophon.star.${key}`)}
                </button>
              );
            })}
        </div>

        <header className="cl-head">
          <div className="cl-title">
            <h1>{t('colophon.title')}</h1>
            {!sameTitle(t('colophon.title'), 'Colophon') && <span className="cl-latin">Colophon</span>}
          </div>
          <p>{t('colophon.subtitle')}</p>
          <p className="cl-hint">{t('colophon.hint')}</p>
        </header>

        {/* 目鏡：正在測的那顆星的說明 */}
        {/* 換一顆星時目鏡重新對焦：字一行一行浮出來，視野從中間撐開（key 換了，動畫重來） */}
        <section
          className={`cl-eyepiece${target === 'qa' ? ' is-qa' : ''}`}
          key={target}
          aria-live="polite"
          aria-labelledby="cl-eyepiece-title"
        >
          <span className="cl-k">{t(`colophon.star.${target}`)}</span>
          <h2 id="cl-eyepiece-title">{target === 'qa' ? qa.qaHeading : t(`colophon.title_${target}`)}</h2>
          <p>{target === 'qa' ? qa.intro : t(`colophon.text_${target}`)}</p>
          <div className="cl-content">{panel[target]}</div>
        </section>
      </div>
    </div>
  );
}
