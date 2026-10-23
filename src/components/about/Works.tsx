// 作品：一條從中心往外長的螺旋航線。最中心是起點，越新的作品越外圈；作品多了螺旋就再往外長一圈。
// 每件作品的樣子由 GitHub 的數據長出來（about/worksSky），字是一般的連結，位置每幀跟著那顆星。
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { WORKS, worksQueryOptions } from '@/data/works';
import { parseServerDate } from '@/lib/serverDate';
import { lookupOr } from '@/lib/tableLookup';
import { isArriving } from '@/store/pageTransition';
import { bodyOf, createSpiral } from './worksSky';
import './Works.css';

/** 滑鼠離一顆星多近才算滑到它（CSS 像素） */
const NEAR_PX = 70;
/** 螺旋從中心長出來的時間（秒） */
const GROW_S = 1.6;

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function Works() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const { data: live = [] } = useQuery(worksQueryOptions);
  // 數據：後端有就用後端的，沒有（私有 repo 拿不到、後端還沒更新）就用量好的備用值
  const works = useMemo(() => {
    const now = Date.now();
    return WORKS.map((w) => {
      const stats = live.find((r) => r.repo.toLowerCase() === w.repo.toLowerCase()) ?? { repo: w.repo, ...w.fallback };
      const created = parseServerDate(stats.created_at);
      return {
        ...w,
        url: stats.url,
        year: `${created.getFullYear()}.${pad2(created.getMonth() + 1)}`,
        body: bodyOf({
          name: w.name,
          commits: stats.commits,
          stars: stats.stars,
          pushedDaysAgo: Math.max(0, (now - parseServerDate(stats.pushed_at).getTime()) / 86400000),
          languages: stats.languages,
        }),
      };
    });
  }, [live]);

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<(HTMLElement | null)[]>([]);
  const focusRef = useRef(-1);

  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spiral = createSpiral(works.map((w) => w.body));
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
      // 換頁轉場還藏著這一頁：等露出來才開始長
      if (isArriving()) return;
      if (start < 0) start = now;
      if (now - last < 25) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const t = reduce ? 0 : (now - start) / 1000;
      const grow = reduce ? 1 : Math.min(1, 1 - Math.pow(1 - t / GROW_S, 3));
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let near = focusRef.current;
      if (near < 0 && pointer) {
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
      const placed = spiral.draw(ctx, { w, h, t, dt: reduce ? 0 : dt, near, grow });
      const cx = w / 2;
      const cy = h / 2;
      placed.forEach((p, i) => {
        const el = labelsRef.current[i];
        if (!el) return;
        // 字往外長：沿著從中心指向這一顆的方向，放在星體外面；起點那顆放正上方
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        const right = dx >= 0;
        let lx = p.x + (dx / d) * p.reach + (right ? 0 : -lw);
        let ly = p.y + (dy / d) * p.reach - lh / 2;
        if (i === 0) {
          lx = p.x - lw / 2;
          ly = p.y - p.reach - lh;
        }
        el.classList.toggle('is-left', i !== 0 && !right);
        el.classList.toggle('is-on', i === near);
        lx = Math.max(12, Math.min(w - lw - 12, lx));
        ly = Math.max(12, Math.min(h - lh - 12, ly));
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        el.style.opacity = String(p.appear * (near < 0 || i === near ? 1 : 0.4));
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerleave', onLeave);
    };
  }, [works]);

  return (
    <div className="wk">
      <header className="wk-head">
        <div className="wk-title">
          <h1>{t('works.title')}</h1>
          <span className="wk-latin">Works</span>
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
                <span className="wk-what">{lookupOr(w.what, lang, w.what['zh-TW'])}</span>
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
        <ul className="wk-legend">
          <li>{t('works.legendCore')}</li>
          <li>{t('works.legendRings')}</li>
          <li>{t('works.legendMoons')}</li>
          <li>{t('works.legendHover')}</li>
        </ul>
      </div>
    </div>
  );
}
