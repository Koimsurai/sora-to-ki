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
import { after, isArriving } from '@/store/pageTransition';
import { COLOPHON_QA } from './colophonQa';
import { drawColophon, frontOf, SEXTANT_SRC, STAR_KEYS, starAt, turnFor, type StarKey } from './colophonSky';
import { PhotoToy, SaturnToy, WorkToy } from './colophonToys';
import './Colophon.css';
import { sameTitle } from '@/lib/pageTitle';

/** 視線從望遠鏡拉到星要多久（秒） */
const SIGHT_S = 0.7;
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

  const box = () => {
    const el = boxRef.current;
    return el ? { r: el.getBoundingClientRect(), w: el.clientWidth, h: el.clientHeight } : null;
  };

  usePageTransition({
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
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (isArriving()) return;
      if (start < 0) start = now;
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
      const real = (now - start) / 1000;
      const goal = turnFor(targetRef.current, w, h);
      // 換了一顆星：六分儀轉過去，轉得差不多了視線才重新拉出來
      if (aimed !== targetRef.current) {
        aimed = targetRef.current;
        sightFrom = -1;
      }
      turnRef.current = reduce ? goal : turnRef.current + (goal - turnRef.current) * Math.min(1, dt * 4);
      if (sightFrom < 0 && Math.abs(goal - turnRef.current) < 0.02) sightFrom = real;
      const sight = reduce ? 1 : sightFrom < 0 ? 0 : Math.min(1, (real - sightFrom) / SIGHT_S);
      const erase = leaveRef.current === null ? 0 : Math.min(1, (now - leaveRef.current) / ERASE_MS);
      drawColophon(ctx, {
        w,
        h,
        t: reduce ? 0 : real,
        turn: turnRef.current,
        target: targetRef.current,
        sight,
        hover: hoverRef.current,
        appear: Math.min(1, reduce ? 1 : real / 0.6) * (1 - erase),
        img,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

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
    license: (
      <a className="cl-repo" href="https://github.com/timo9378/sora-to-ki" target="_blank" rel="noopener noreferrer">
        github.com/timo9378/sora-to-ki
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
        <section className="cl-eyepiece" key={target} aria-live="polite" aria-labelledby="cl-eyepiece-title">
          <span className="cl-k">{t(`colophon.star.${target}`)}</span>
          <h2 id="cl-eyepiece-title">{t(`colophon.title_${target}`)}</h2>
          <p>{t(`colophon.text_${target}`)}</p>
          <div className="cl-content">{panel[target]}</div>
        </section>
      </div>

      {/* 航海日誌：原本的 Q&A */}
      <section className="cl-log" aria-labelledby="cl-log-title">
        <h2 id="cl-log-title">{t('colophon.logTitle')}</h2>
        <p className="cl-log-intro">{qa.intro}</p>
        <details open>
          <summary>{stripNumber(qa.q1)}</summary>
          <p>{qa.a1}</p>
        </details>
        <details>
          <summary>{stripNumber(qa.q2)}</summary>
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
        </details>
        <details>
          <summary>{stripNumber(qa.q3)}</summary>
          <p>
            {qa.a3} <code>thumbhash</code> {qa.a3_mid}
          </p>
          <LinkCard href="https://koimsurai.com/blog/21" />
        </details>
        <details>
          <summary>{stripNumber(qa.q4)}</summary>
          <p>{qa.a4}</p>
        </details>
        <details>
          <summary>{stripNumber(qa.q5)}</summary>
          <p>{qa.a5_p1}</p>
          <p>
            {qa.a5_p2_pre}
            <LocaleLink to="/messages">{qa.a5_p2_link}</LocaleLink>
            {qa.a5_p2_post}
          </p>
        </details>
        <h3>{qa.nameHeading}</h3>
        <details>
          <summary>{stripNumber(qa.q6)}</summary>
          <p>{qa.a6}</p>
        </details>
        <details>
          <summary>{stripNumber(qa.q7)}</summary>
          <p>{qa.a7}</p>
        </details>
        <details>
          <summary>{stripNumber(qa.q8)}</summary>
          <p>{qa.a8}</p>
        </details>
      </section>
    </div>
  );
}
