// 404：失去聯繫。一個繫繩斷掉的太空人在黑裡慢慢漂、慢慢翻滾（layout/lostSky），
// 斷掉的那一端還在閃、還在發訊號，但每一道都斷在半路。
// 左邊記著最後回報的座標（就是打的網址）與訊號已經中斷多久；「重新建立連線」就是回首頁。
//
// 換頁進來時琥珀點落在繫繩斷端，變成那個還在閃的點；離開時點從斷端沿繫繩的方向飛出去。
//
// ⚠ 不畫星星：全站的太空背景就在後面跑，再鋪一層星點密度會變兩倍、視差也對不上。
// ⚠ 大字 404 是圖像（aria-hidden），另外給一段只有輔助技術讀得到的 404；
//   那句訊息必須是 <h1>：少了一級標題 axe 的 page-has-heading-one 會紅，而這一頁在
//   /ja/blog/1 之類沒有該語系版本的路徑上真的會被渲染到。
import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import { LocaleLink } from '@/i18n/locale-link';
import { openCommandPalette } from '@/store/commandPaletteStore';
import { after, isArriving } from '@/store/pageTransition';
import { ASTRONAUT_SRC, createLost } from './lostSky';
import './NotFound.css';

/** 太空人淡入的時間（秒） */
const APPEAR_S = 1.2;
/** 收：太空人淡掉的時間（毫秒） */
const ERASE_MS = 500;
/** 收完時點從斷端飛走的速度（px/ms） */
const LEAVE_SPEED = 0.8;

const pad2 = (n: number) => String(n).padStart(2, '0');

const NotFound = () => {
  const { t } = useTranslation();
  // 只取 pathname：query 可能帶 token 之類的東西，印在畫面上沒有必要
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const pageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const losRef = useRef<HTMLElement>(null);
  const lostRef = useRef(createLost());
  const clockRef = useRef(0);
  const leaveRef = useRef<number | null>(null);

  const end = () => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const p = lostRef.current.tether(box.clientWidth, box.clientHeight, clockRef.current);
    return { x: r.left + p.x, y: r.top + p.y, dir: p.dir };
  };

  usePageTransition({
    // 錨點是繫繩斷端：點落在這裡，變成那個還在閃、但沒有回應的點
    anchor: () => {
      const p = end();
      return p ? { x: p.x, y: p.y } : null;
    },
    leave: () => {
      const p = end();
      if (!p) return null;
      leaveRef.current = performance.now();
      pageRef.current?.classList.add('is-leaving');
      return {
        point: { x: p.x, y: p.y },
        velocity: { x: Math.cos(p.dir) * LEAVE_SPEED, y: Math.sin(p.dir) * LEAVE_SPEED },
        follow: () => {
          const q = end();
          return q ? { x: q.x, y: q.y } : p;
        },
        done: after(ERASE_MS),
      };
    },
  });

  // 訊號中斷多久：從打開這一頁算起，每秒跳一次，直接寫字
  useEffect(() => {
    const started = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - started) / 1000);
      if (losRef.current)
        losRef.current.textContent = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // 太空人
  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const img = new Image();
    img.src = ASTRONAUT_SRC;
    let raf = 0;
    let last = 0;
    let start = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (isArriving()) return;
      if (start < 0) start = now;
      if (now - last < 16) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const real = (now - start) / 1000;
      // 慢慢漂的時鐘從 20 秒起跳：一進來的姿勢就已經是漂了一陣子的樣子
      const time = reduce ? 20 : 20 + real;
      clockRef.current = time;
      lostRef.current.draw(ctx, {
        w,
        h,
        t: time,
        dt: reduce ? 0 : dt,
        appear: reduce ? 1 : Math.min(1, real / APPEAR_S),
        erase: leaveRef.current === null ? 0 : Math.min(1, (now - leaveRef.current) / ERASE_MS),
        img,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="nf-page" ref={pageRef}>
      <div className="nf-sky" ref={boxRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      {/* 前景濾鏡：左半邊壓暗一點，字不會壓在最亮的星空上 */}
      <div className="nf-scrim" />

      <div className="nf-inner">
        <span className="nf-sr">404</span>
        <span className="nf-code" aria-hidden="true">
          404
        </span>
        {/* ⚠ 必須是 <h1>，理由見檔頭。 */}
        <h1 className="nf-title">{t('notFound.lostMessage')}</h1>
        <p className="nf-sub">{t('notFound.subMessage')}</p>

        <p className="nf-addr">
          <span className="nf-addr-label">{t('notFound.requested')}</span>
          <code className="nf-addr-path">{pathname}</code>
          <span className="nf-addr-label">{t('notFound.lostFor')}</span>
          <b ref={losRef} suppressHydrationWarning>
            00:00:00
          </b>
        </p>

        <div className="nf-actions">
          <LocaleLink to="/" className="nf-link">
            {t('notFound.reconnect')}
          </LocaleLink>
          <LocaleLink to="/blog" className="nf-link">
            {t('notFound.toNotes')}
          </LocaleLink>
          <button type="button" className="nf-btn" onClick={openCommandPalette}>
            {t('notFound.search')}
            <kbd className="nf-kbd">⌘K</kbd>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
