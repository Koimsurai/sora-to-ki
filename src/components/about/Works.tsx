// 作品：一條從中心往外長的螺旋航線。最中心是起點，越新的作品越外圈；作品多了螺旋就再往外長一圈。
// 每件作品的樣子由 GitHub 的數據長出來（about/worksSky），字是一般的連結，位置每幀跟著那顆星。
// 換頁進來時琥珀點落在起點，接著當筆尖沿著航線往外畫，最後停在最新那一件，變成它的衛星；
// 離開時航線從起點往外擦掉、收進那顆衛星，點順著航線往外飛走。
import { useEffect, useMemo, useRef } from 'react';
import { defaultLocale } from '@/lib/locales';
import { useTranslation } from 'react-i18next';
import { statsOf, useWorkEntries, useWorkStats } from '@/data/works';
import OwnerFillHint from '@/components/common/OwnerFillHint';
import { usePageTransition } from '@/hooks/usePageTransition';
import { parseServerDate } from '@/lib/serverDate';
import { pickText } from '@/lib/i18nText';
import { after, isArriving } from '@/store/pageTransition';
import FoldIndex from '@/components/common/FoldIndex';
import { bodiesOf, createSpiral, frameOf, workStatsOf } from './worksSky';
import './Works.css';
import { sameTitle } from '@/lib/pageTitle';

/** 滑鼠離一顆星多近才算滑到它（CSS 像素） */
const NEAR_PX = 70;
/** 琥珀點從起點畫到最新那一件的時間（秒） */
const GROW_S = 2.4;
/** 收：航線擦掉的時間（毫秒） */
const ERASE_MS = 520;
/** 筆尖落地後光暈退掉的時間（秒） */
const SETTLE_S = 0.9;
/** 收完時點離開的速度（px/ms） */
const LEAVE_SPEED = 0.8;

const pad2 = (n: number) => String(n).padStart(2, '0');
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;

export default function Works() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? defaultLocale();
  // 清單是站長填的（後台「頁面」或 MCP）；數據：GitHub 有就用 GitHub 的，沒有（私有 repo、沒設 token）就用最後量到的
  const entries = useWorkEntries();
  const live = useWorkStats(entries);
  const works = useMemo(() => {
    const now = Date.now();
    const rows = entries.map((w) => {
      const stats = statsOf(w, live);
      return { w, stats, input: workStatsOf(w.name, stats, now) };
    });
    // 同一族（主要語言同一類）的作品各拿不同的地貌
    const bodies = bodiesOf(rows.map((r) => r.input));
    return rows.map(({ w, stats }, i) => {
      const created = parseServerDate(stats.created_at);
      return {
        ...w,
        url: stats.url,
        year: `${created.getFullYear()}.${pad2(created.getMonth() + 1)}`,
        body: bodies[i],
      };
    });
  }, [live, entries]);
  const spiral = useMemo(() => createSpiral(works.map((w) => w.body)), [works]);

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);
  /** 摺疊機摺起來時另一半的作品目錄：滑過哪一列，螺旋上那一顆就亮 */
  const indexRef = useRef<(HTMLLIElement | null)[]>([]);
  const focusRef = useRef(-1);
  /** 最近一幀的時間（秒）：錨點與收的位置要跟畫面上的一致 */
  const clockRef = useRef(0);
  const leaveRef = useRef<number | null>(null);

  const boxSize = () => {
    const box = boxRef.current;
    return box ? { r: box.getBoundingClientRect(), w: box.clientWidth, h: box.clientHeight } : null;
  };

  usePageTransition({
    // 錨點是起點：點落在這裡，接著變成筆尖
    anchor: () => {
      const b = boxSize();
      if (!b) return null;
      const [x, y] = spiral.point(b.w, b.h, clockRef.current, 0);
      return { x: b.r.left + x, y: b.r.top + y };
    },
    // 抵達的方向就是航線從起點出發的方向：點落地後不轉彎，直接順著畫下去
    arrive: () => {
      const b = boxSize();
      return b ? { tangent: spiral.tangent(b.w, b.h, clockRef.current, 0) } : null;
    },
    leave: () => {
      const b = boxSize();
      if (!b) return null;
      leaveRef.current = performance.now();
      pageRef.current?.classList.add('is-leaving');
      const moon = () => {
        const now = boxSize() ?? b;
        const [x, y] = spiral.moonOf(spiral.newest, now.w, now.h, clockRef.current);
        return { x: now.r.left + x, y: now.r.top + y };
      };
      const dir = spiral.tangent(b.w, b.h, clockRef.current, spiral.tLast);
      return {
        point: moon(),
        velocity: { x: dir.x * LEAVE_SPEED, y: dir.y * LEAVE_SPEED },
        follow: moon,
        done: after(ERASE_MS),
      };
    },
  });

  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pointer: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
    };
    const onLeave = () => {
      pointer = null;
    };
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerleave', onLeave);
    let raf = 0;
    let last = 0;
    let start = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 換頁轉場的點還在飛：等它落在起點才開始畫
      if (isArriving()) return;
      if (start < 0) start = now;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const t = reduce ? 0 : (now - start) / 1000;
      clockRef.current = t;
      const grow = reduce ? 1 : Math.min(1, easeOut(Math.min(1, t / GROW_S)));
      const erase = leaveRef.current === null ? 0 : easeIn(Math.min(1, (now - leaveRef.current) / ERASE_MS));
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let near = focusRef.current;
      if (near < 0 && pointer && leaveRef.current === null) {
        const [px, py] = pointer;
        let best = NEAR_PX;
        spiral.positions(w, h, t).forEach(([x, y], i) => {
          const d = Math.hypot(px - x, py - y);
          if (d < best) {
            best = d;
            near = i;
          }
        });
      }
      const settle = reduce ? 1 : Math.min(1, Math.max(0, (t - GROW_S) / SETTLE_S));
      const placed = spiral.draw(ctx, { w, h, t, dt: reduce ? 0 : dt, near, grow, erase, settle });
      const { cx, cy } = frameOf(w, h);
      // 尺寸先一次量完再寫（同首頁衛星的字，home/HomeOrbit）：讀寫交錯的話，每讀一次 offsetWidth
      // 瀏覽器就得把前一顆剛寫的樣式排一次版。這裡寫的 transform、opacity、is-left（只改對齊）、
      // is-on（只改說明那行的透明度）都不影響尺寸，量到的跟交錯時一樣
      const sizes = placed.map((_, i) => {
        const el = labelsRef.current[i];
        return el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
      });
      placed.forEach((p, i) => {
        const el = labelsRef.current[i];
        const size = sizes[i];
        if (!el || !size) return;
        // 字往外長：沿著從中心指向這一顆的方向，放在星體外面；起點那顆放正上方
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const { w: lw, h: lh } = size;
        const right = dx >= 0;
        let lx = p.x + (dx / d) * p.reach + (right ? 0 : -lw);
        let ly = p.y + (dy / d) * p.reach - lh / 2;
        if (i === 0) {
          lx = p.x - lw / 2;
          ly = p.y - p.reach - lh;
        }
        el.classList.toggle('is-left', i !== 0 && !right);
        el.classList.toggle('is-on', i === near);
        indexRef.current[i]?.classList.toggle('is-on', i === near);
        lx = Math.max(12, Math.min(w - lw - 12, lx));
        ly = Math.max(12, Math.min(h - lh - 12, ly));
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        // 收的時候字一起退掉（只剩航線收進最新那一顆）
        el.style.opacity = leaveRef.current === null ? String(p.appear * (near < 0 || i === near ? 1 : 0.4)) : '0';
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, [spiral]);

  return (
    <div className="wk" ref={pageRef}>
      <header className="wk-head">
        <div className="wk-title">
          <h1>{t('works.title')}</h1>
          {!sameTitle(t('works.title'), 'Works') && <span className="wk-latin">Works</span>}
        </div>
        <p>{t('works.subtitle')}</p>
      </header>

      <div className="wk-spiral" ref={boxRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <ol className="wk-labels">
          {works.map((w, i) => {
            const inner = (
              <>
                <span className="wk-name">
                  {w.name}
                  {w.origin && <em>{t('works.origin')}</em>}
                </span>
                <span className="wk-year">{w.year}</span>
                <span className="wk-what">{pickText(w.what, lang)}</span>
              </>
            );
            return (
              <li
                key={w.repo}
                className="wk-label"
                ref={(el) => {
                  labelsRef.current[i] = el;
                }}
              >
                {/* 私有的 repo 沒有連結：只是字（介紹仍然在文字裡，螢幕閱讀器讀得到） */}
                {w.url ? (
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onFocus={() => (focusRef.current = i)}
                    onBlur={() => (focusRef.current = -1)}
                  >
                    {inner}
                  </a>
                ) : (
                  <span>{inner}</span>
                )}
              </li>
            );
          })}
        </ol>
        {/* 摺疊機摺起來：另一半是作品目錄（common/FoldIndex），每一列名字、年份、一句介紹都攤開 */}
        <FoldIndex className="wk-index">
          {works.map((w, i) => {
            const inner = (
              <>
                <span className="wk-index-name">
                  {w.name}
                  {w.origin && <em>{t('works.origin')}</em>}
                </span>
                <span className="wk-index-year">{w.year}</span>
                <span className="wk-index-what">{pickText(w.what, lang)}</span>
              </>
            );
            const hover = {
              onPointerEnter: () => (focusRef.current = i),
              onPointerLeave: () => (focusRef.current = -1),
              onFocus: () => (focusRef.current = i),
              onBlur: () => (focusRef.current = -1),
            };
            return (
              <li
                key={w.repo}
                ref={(el) => {
                  indexRef.current[i] = el;
                }}
              >
                {w.url ? (
                  <a className="wk-index-a" href={w.url} target="_blank" rel="noopener noreferrer" {...hover}>
                    {inner}
                  </a>
                ) : (
                  <span className="wk-index-a" {...hover}>
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </FoldIndex>
        <ul className="wk-legend">
          <li>{t('works.legendCore')}</li>
          <li>{t('works.legendSurface')}</li>
          <li>{t('works.legendRings')}</li>
          <li>{t('works.legendMoons')}</li>
          <li>{t('works.legendHover')}</li>
        </ul>
      </div>
      {entries.length === 0 && <OwnerFillHint page="works" />}
    </div>
  );
}
