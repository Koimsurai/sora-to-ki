// 關於：整頁是一段下墜。往下捲就是往下掉，經過的每一層是我的某一年；落地時只留「就此落下」，
// 之後繼續往地底挖：地表是手上的東西，第一層是做過的事，最深的地心才是「Stay hungry, stay foolish.」。
// 近景（掠過的細線、地平線與樹、返回艙、地層、高度計）畫在 fallSky。
import { Fragment, useEffect, useRef } from 'react';
import { defaultLocale } from '@/lib/locales';
import { useTranslation } from 'react-i18next';
import { useAboutContent } from '@/data/pageContent';
import { useSiteConfig } from '@/data/siteConfig';
import { pickText } from '@/lib/i18nText';
import OwnerFillHint from '@/components/common/OwnerFillHint';
import { usePageTransition } from '@/hooks/usePageTransition';
import { currentFold } from '@/lib/viewportFold';
import { useBareSky } from '@/hooks/useBareSky';
import { after, isArriving, isRejoining, transitionDot, type Pt } from '@/store/pageTransition';
import { createFallSky, METER_BOTTOM, METER_TOP, meterMark, meterProgress, phases, smooth } from './fallSky';
import './AboutFall.css';
import { sameTitle } from '@/lib/pageTitle';

/**
 * 每一年的排法輪著換，往下掉的時候不會一直看到同一種版面：
 *   left  靠左（年份在上）      right 靠右、貼著高度計那一側
 *   wide  年份很大很淡、字壓在上面  split 年份一欄、字一欄
 */
const LAYOUTS = ['left', 'split', 'right', 'wide', 'left', 'right', 'split', 'wide'] as const;

const CHUTE_SRC = '/illustrations/reentry-parachute.webp';

/** 句號拆出來：琥珀點就是它（「坐穩了。」「就此落下。」） */
const splitStop = (s: string) => (/[。.]$/.test(s) ? [s.slice(0, -1), s.slice(-1)] : [s, '']);
/** 句號在畫面上的位置：全形句號的點在字框的左下 */
const stopPoint = (el: HTMLElement | null): Pt | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  const full = el.textContent === '。';
  return { x: r.left + r.width * (full ? 0.3 : 0.5), y: r.top + r.height * (full ? 0.72 : 0.78) };
};
const mix = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
/** 點從句號正上方多高的地方開始直直掉下來；鏡頭跟著它掉，最後 FALL_SHOWN_PX 才停下來看它掉進句號 */
const FALL_IN_PX = 1500;
const FALL_SHOWN_PX = 260;
/** 這一頁的轉場慢一點：自由落體要有掉了一陣子的感覺，太快會像平移過去 */
const FALL_PACE = 0.5;
/** 換主題之後接回來、還在開頭的時候：點從句號正上方多高的地方直直掉進去 */
const REJOIN_DROP_PX = 260;
/** 捲到這裡以前（視窗高的幾成）點還算在標題的句號上，接回來時直接掉進句號，不走高度計 */
const REJOIN_RULER_FROM = 0.2;
/** 沿著高度計往下滑的速度（px/ms）：慢到看得見讀數一路往下數 */
const REJOIN_PACE = 0.45;
/** 滑下去時星星拉成條紋的強度（換算成捲動距離的幾成）：全速會整片變成雨 */
const REJOIN_STREAK = 0.3;
/** 頁面在文件裡的位置（offsetTop 一路加上去）：換頁時整頁被轉場平移，量 getBoundingClientRect 會把平移算進去 */
const docTop = (el: HTMLElement) => {
  let y = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) y += node.offsetTop;
  return y;
};

export default function AboutFall() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? defaultLocale();
  // 每一年、技能、經歷、地心那一句都是站長填的（後台「頁面」或 MCP）；沒填的區塊整塊不出現
  const about = useAboutContent();
  const { description } = useSiteConfig();
  const zh = lang.startsWith('zh');
  // 期間寫成「2025/7 — Now」；這一頁不用破折號，中文介面也把 Now 換成「現在」
  const period = (p: string) => p.replace(' — ', ' ～ ').replace('Now', zh ? '現在' : 'Now');

  const chapters = about.chapters.map((c, i) => ({
    key: `${i}-${c.year}`,
    now: c.year === 'NOW',
    year: c.year === 'NOW' ? t('aboutFall.now') : c.year.replace('-', ' – '),
    title: pickText(c.title, lang),
    subtitle: pickText(c.subtitle, lang),
    line: pickText(c.line, lang),
  }));
  const now = chapters.find((c) => c.now);
  const empty = chapters.length === 0 && about.skills.length === 0 && about.jobs.length === 0;

  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLElement>(null);
  const labelsRef = useRef({ fall: '', dig: '' });
  labelsRef.current = { fall: t('aboutFall.fallMeter'), dig: t('aboutFall.digMeter') };
  const titleStopRef = useRef<HTMLSpanElement>(null);
  const landStopRef = useRef<HTMLSpanElement>(null);
  /** 琥珀點現在在哪（轉場的「收」從這裡出發） */
  const dotRef = useRef<Pt | null>(null);
  /** 上一幀量到的版面（接回來時排點的路線要用） */
  const stateRef = useRef<Parameters<typeof meterMark>[0] | null>(null);
  /**
   * 這一趟是開場（重新整理、直接打開）：捲動位置是瀏覽器還原的真的位置，不是上一頁留下來還沒重設的。
   * 開場的標記（html[data-boot]）在點還在飛的時候就拿掉了，所以自己記到點落地為止
   */
  const restoredRef = useRef(false);
  const [title, titleStop] = splitStop(t('aboutFall.title'));
  const [land, landStop] = splitStop(t('aboutFall.land'));

  // 背景的星星讓位：這一頁的星都畫成下墜的參照
  useBareSky();
  /**
   * 點落在哪：平常是「坐穩了。」的句號。捲在下面重新整理（捲動位置被還原）的話句號在畫面外，
   * 落在讀者現在的位置（高度計上，或著地後「就此落下。」的句號）
   */
  const deep = () => {
    const s = stateRef.current;
    return Boolean(restoredRef.current && s && s.top >= s.h * REJOIN_RULER_FROM);
  };
  const landing = () => (deep() ? dotRef.current : stopPoint(titleStopRef.current));
  usePageTransition({
    // 點飛進來，停成「坐穩了。」的句號
    anchor: landing,
    // 這一頁是往下掉：點最後是從正上方直直掉進句號的，鏡頭跟著它往下，頁面從下面升上來
    arrive: () => {
      const p = landing();
      if (!p) return null;
      // 捲在下面重新整理：頁面就在還原的位置，鏡頭不跟著掉那一大段（跟拍會把整頁拖過來），只看最後那段掉進來
      const from = deep() ? FALL_SHOWN_PX : FALL_IN_PX;
      const drop: Pt[] = [];
      for (let d = from; d >= 0; d -= 6) drop.push({ x: p.x, y: p.y - d });
      return { approach: drop, join: Math.round((from - FALL_SHOWN_PX) / 6), pace: FALL_PACE };
    },
    // 換主題之後接回來：重新掉一次，落回剛剛的高度。點先到高度計最上面（36,000 km；往下挖時是地表），
    // 順著尺滑到現在的高度（讀數跟著往下數，見下面的 slide），著地之後再落進「就此落下。」的句號。
    // 還在開頭的話照一般進場，從正上方直直掉進「坐穩了。」的句號
    rejoin: () => {
      const s = stateRef.current;
      const dot = dotRef.current;
      if (!s || !dot) return null;
      if (s.top < s.h * REJOIN_RULER_FROM) return [{ x: dot.x, y: dot.y - REJOIN_DROP_PX }, dot];
      const route = [meterMark(s, 0), meterMark(s)];
      const end = route[1];
      if (Math.hypot(dot.x - end.x, dot.y - end.y) > 1) route.push(dot);
      return route;
    },
    rejoinPace: REJOIN_PACE,
    // 收：字退掉，琥珀點帶著往下掉的速度離開
    leave: () => {
      const point = dotRef.current;
      if (!point) return null;
      pageRef.current?.classList.add('is-leaving');
      return { point, velocity: { x: 0, y: 0.8 }, done: after(300) };
    },
  });

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    const page = pageRef.current;
    if (!cv || !ctx || !page) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const chute = new Image();
    chute.src = CHUTE_SRC;
    const sky = createFallSky(window.innerWidth < 760 ? 280 : 720, chute);
    const mono = getComputedStyle(root).getPropertyValue('--mono-font').trim() || 'monospace';
    const chapterEls = [...page.querySelectorAll<HTMLElement>('.af-ch')];
    let raf = 0;
    let last = 0;
    let lastY = window.scrollY;
    let travelled = 0;
    let speed = 0;
    /** 接回來時點在尺上滑到哪（0 到 1）；null 是平常，記號照捲動位置 */
    let slide: number | null = null;
    const onScroll = () => {
      // 換頁時捲動位置被重設（從上一頁的捲動位置跳回頂端）不算往下掉：不然一進來星星全被拉成條紋。
      // 帶正負號：往上捲時星星往下走，拖尾要畫在另一邊
      if (!root.dataset.pt) travelled += window.scrollY - lastY;
      lastY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      const land = landRef.current;
      const layer = layerRef.current;
      const core = coreRef.current;
      if (!land || !layer || !core) return;
      // 速度：這一幀捲了多少，平滑一下（px/s）
      speed += (travelled / Math.max(dt, 0.016) - speed) * Math.min(1, dt * 6);
      travelled = 0;
      const cw = window.innerWidth;
      const h = window.innerHeight;
      // 摺疊機書本式：下墜（琥珀點、高度計、地平線、降落傘）只在左頁，右頁是一年一年的字
      const fold = currentFold();
      const w = fold?.pose === 'book' ? fold.first.x + fold.first.width : cw;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(cw * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (w < cw) ctx.clearRect(0, 0, cw, h);
      // 換頁的點還在飛：上一頁的捲動位置可能還沒重設，這時一律當作在最上面（不然雲層、高度計會先冒出來一下）。
      // 換主題之後接回來、重新整理（開場）不一樣：頁面沒換或捲動位置被還原了，捲動位置是真的
      const rejoining = isRejoining();
      if (root.hasAttribute('data-boot')) restoredRef.current = true;
      else if (!isArriving()) restoredRef.current = false;
      const real = rejoining || restoredRef.current;
      const top = isArriving() && !real ? 0 : window.scrollY - docTop(page);
      const state = {
        w,
        h,
        top,
        landTop: land.offsetTop,
        layerTop: layer.offsetTop,
        maxScroll: page.offsetHeight - h,
      };
      stateRef.current = state;
      // 接回來時點沿著尺往下滑：記號與讀數跟著它，從尺頂數下來；點離開尺（著地後落進句號）就停在現在的高度。
      // 滑過的距離換算成捲了多少，星星照樣拉成條紋：看起來就是又掉了一次
      if (rejoining && top >= h * REJOIN_RULER_FROM) {
        const target = meterProgress(state);
        const p = transitionDot();
        const onRuler = p && Math.abs(p.x - meterMark(state, 0).x) < 2;
        const was = slide ?? 0;
        // 不在尺上：還沒飛到尺頂（停在 0），或已經滑完、往句號去了（一幀可能跨過尺底，直接補到現在的高度）
        const next = onRuler ? (p.y - METER_TOP) / Math.max(1, h - METER_TOP - METER_BOTTOM) : was > 0 ? target : 0;
        slide = Math.min(target, Math.max(was, next));
        if (!reduce && target > 0) travelled += ((slide - was) / target) * top * REJOIN_STREAK;
      } else slide = null;
      // 琥珀點：開頭是「坐穩了。」的句號；往下捲它就跟著你往下掉，落到右邊的高度計上；
      // 著地時停成「就此落下。」的句號；往下挖時又回到高度計上
      const meter = meterMark(state);
      const { landK, dig } = phases(state);
      const startDot = stopPoint(titleStopRef.current) ?? meter;
      const landDot = stopPoint(landStopRef.current) ?? meter;
      let dot = mix(startDot, meter, smooth(0, h * 0.4, state.top));
      dot = mix(dot, landDot, smooth(0.55, 1, landK));
      dot = mix(dot, meter, smooth(0, h * 0.35, dig));
      dotRef.current = dot;
      sky.draw(ctx, {
        w,
        h,
        t: now / 1000,
        dt: reduce ? 0 : dt,
        top,
        speed: reduce ? 0 : Math.max(-1, Math.min(1, speed / 2500)),
        landTop: land.offsetTop,
        layerTop: layer.offsetTop,
        coreMid: core.offsetTop + core.offsetHeight / 2,
        chapterMids: chapterEls.map((c) => c.offsetTop + c.offsetHeight / 2),
        maxScroll: page.offsetHeight - h,
        labels: labelsRef.current,
        mono,
        // 轉場還藏著這一頁時，點由轉場畫
        dot: isArriving() ? null : dot,
        slide,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="af" ref={pageRef}>
      <canvas className="af-sky" ref={canvasRef} aria-hidden="true" />

      <header className="af-top">
        <p className="af-kick">
          {t('aboutFall.kick')}
          {!sameTitle(t('aboutFall.kick'), 'About') && <span>About</span>}
        </p>
        <h1>
          {title}
          <span className="af-stop" ref={titleStopRef}>
            {titleStop}
          </span>
        </h1>
        <p className="af-hint">{t('aboutFall.hint')}</p>
      </header>

      <div id="journey">
        {chapters.map((c, i) => (
          <section key={c.key} className={`af-ch af-ch--${LAYOUTS[i % LAYOUTS.length]}`} aria-label={c.year}>
            <div className={c.now ? 'af-year is-word' : 'af-year'}>{c.year}</div>
            <h2 className="af-title">{c.title}</h2>
            <div className="af-sub">{c.subtitle}</div>
            <p className="af-beat">{c.line}</p>
          </section>
        ))}
      </div>

      <section className="af-land" ref={landRef}>
        <p>{t('aboutFall.landPre')}</p>
        <h2>
          {land}
          <span className="af-stop" ref={landStopRef}>
            {landStop}
          </span>
        </h2>
        {now ? (
          <p className="af-now">
            <span>Now</span>
            {now.title}
          </p>
        ) : (
          // 沒有「現在」那一章（含還沒填）：落地處放站台的一句話介紹
          description && <p className="af-now">{description}</p>
        )}
      </section>

      {/* 地表這一層一定要在：天空用它的位置算「開始往下挖」，沒有技能也留著它 */}
      <section className={about.skills.length > 0 ? 'af-layer' : 'af-layer is-bare'} ref={layerRef}>
        {about.skills.length > 0 && (
          <>
            <span className="af-lab">{t('aboutFall.surface')}</span>
            <h2>
              {t('aboutFall.surfaceTitle')}
              <small>{t('aboutFall.surfaceSub')}</small>
            </h2>
            <ul className="af-skills">
              {about.skills.map((g, gi) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key
                <li key={gi}>
                  <span>{pickText(g.label, lang)}</span>
                  <p>
                    {g.items.map((s) => (
                      <Fragment key={s}>
                        <span>{s}</span>{' '}
                      </Fragment>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {about.jobs.length > 0 && (
        <section className="af-layer">
          <span className="af-lab">{t('aboutFall.layer1')}</span>
          <h2>{t('aboutFall.layer1Title')}</h2>
          <ul className="af-jobs">
            {about.jobs.map((j, i) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <li key={i}>
                <time>{period(j.period)}</time>
                <p>
                  <b>{pickText(j.title, lang)}</b>
                  <span>{pickText(j.role, lang)}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="af-core" ref={coreRef}>
        <span className="af-lab">{t('aboutFall.core')}</span>
        <p>{t('aboutFall.coreLine')}</p>
        {about.quote?.text && (
          <>
            <blockquote>
              {about.quote.text.split('\n').map((line, i, all) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key
                <Fragment key={i}>
                  {line}
                  {i < all.length - 1 && <br />}
                </Fragment>
              ))}
            </blockquote>
            {about.quote.cite && <cite>{about.quote.cite}</cite>}
          </>
        )}
      </section>

      {empty && <OwnerFillHint page="about" />}
    </div>
  );
}
