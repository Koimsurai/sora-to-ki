// 換頁轉場：每一頁都從一個點出發、收回一個點（與頁面的約定見 store/pageTransition）。
//
// 三拍，約一秒：
//   收（0.35 秒）：舊的那一頁留一張快照（複製 <main>），往出發點收、淡掉；出發點亮成琥珀色
//   飛（0.3 秒） ：點沿一條弧線飛到新一頁的錨點，身後拉出一條線
//   長（0.45 秒）：新的一頁從錨點長出來——頁面自己接手，或預設的一圈遮罩從錨點擴開
//
// 新的一頁在「長」之前藏著（html[data-pt]），但照常排版，錨點才量得到。新的一頁還沒報到（資料慢），
// 點就停在出發點慢慢閃著等。上一頁、下一頁沒有「點了哪裡」，出發點用舊頁面自己的錨點。
// 轉場中又換頁：舊的直接收尾，從頭開始新的。要求減少動態的訪客直接換頁。
import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import {
  currentPage,
  markTransitionFrom,
  takeTransitionFrom,
  type GrowTakeover,
  type Pt,
} from '@/store/pageTransition';
import './TransitionLayer.css';

const COLLAPSE_MS = 350;
const FLY_MS = 300;
const GROW_MS = 450;
/** 新的一頁最多等多久還沒報到，就飛到預設的位置 */
const WAIT_LIMIT_MS = 1500;
const AMBER = '233, 193, 122';
const INK = '241, 236, 227';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Run {
  t0: number;
  from: Pt;
  to: Pt | null;
  ctrl: Pt | null;
  flyAt: number;
  growAt: number;
  trail: Pt[];
  ghost: HTMLElement | null;
  main: HTMLElement;
  oldFirst: Element | null;
  oldGeneration: number;
  takeover: GrowTakeover | undefined;
  /** 預設遮罩要擴到多大才蓋滿畫面 */
  reach: number;
}

const mainOf = () => document.querySelector<HTMLElement>('.main-content-container > main');

/** 頁面沒報錨點時的預設：第一個標題的左邊，沒有標題就畫面上方中間 */
function defaultAnchor(main: HTMLElement): Pt {
  const heading = main.querySelector('h1, h2, h3');
  if (heading) {
    const r = heading.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight) return { x: Math.max(16, r.left - 14), y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: Math.min(window.innerHeight * 0.3, 260) };
}

/** 快照：把 <main> 複製一份蓋在原地。畫布複製不到內容，另外把像素畫過去 */
function snapshot(main: HTMLElement): HTMLElement {
  const ghost = document.createElement('div');
  ghost.className = 'pt-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  const clone = main.cloneNode(true) as HTMLElement;
  const from = main.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    const src = from.item(i) as HTMLCanvasElement | null;
    if (!src) return;
    try {
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
    } catch {
      /* 3D 的畫布讀不到像素，就讓它空著：它本來也在淡出 */
    }
  });
  clone.style.transform = `translateY(${-window.scrollY}px)`;
  ghost.append(clone);
  return ghost;
}

export default function TransitionLayer() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let run: Run | null = null;
    let raf = 0;

    // 出發點：點連結的那一刻記下來。連結自己標了點（首頁的衛星）就用那個點，
    // 不然滑鼠、觸控用點下去的位置，鍵盤用連結的左邊
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest('a[href]');
      if (!a) return;
      const tagged = a.closest<HTMLElement>('[data-tx]');
      if (tagged?.dataset.tx) {
        markTransitionFrom({ x: Number(tagged.dataset.tx), y: Number(tagged.dataset.ty ?? 0) });
      } else if (e.detail > 0) {
        markTransitionFrom({ x: e.clientX, y: e.clientY });
      } else {
        const r = a.getBoundingClientRect();
        markTransitionFrom({ x: r.left, y: r.top + r.height / 2 });
      }
    };
    document.addEventListener('click', onClick, true);

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const finish = (r: Run) => {
      r.ghost?.remove();
      r.main.style.clipPath = '';
      delete root.dataset.pt;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (run === r) run = null;
    };

    const dot = (p: Pt, radius: number, glow: number, alpha = 1) => {
      if (glow > 0.01) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
        g.addColorStop(0, `rgba(${AMBER}, ${0.55 * glow * alpha})`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${AMBER}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const line = (points: Pt[], alpha: number) => {
      if (points.length < 2 || alpha <= 0.01) return;
      ctx.strokeStyle = `rgba(${INK}, ${0.7 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    };

    const frame = (now: number) => {
      const r = run;
      if (!r) return;
      raf = requestAnimationFrame(frame);
      fit();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const t = now - r.t0;

      // 收：快照往出發點收、淡掉
      const k = clamp(t / COLLAPSE_MS);
      if (r.ghost) {
        r.ghost.style.opacity = String(1 - easeIn(k));
        r.ghost.style.transform = `scale(${1 - 0.04 * easeOut(k)})`;
        if (k >= 1) {
          r.ghost.remove();
          r.ghost = null;
        }
      }

      // 等新的一頁報到，量出錨點才起飛
      if (!r.to && t >= COLLAPSE_MS) {
        const page = currentPage();
        const rendered = page.generation !== r.oldGeneration || r.main.firstElementChild !== r.oldFirst;
        if (rendered || t > COLLAPSE_MS + WAIT_LIMIT_MS) {
          const fresh = page.generation !== r.oldGeneration ? page.handle : null;
          r.to = fresh?.anchor?.() ?? defaultAnchor(r.main);
          // 弧線：控制點在兩點中間、往側邊推出去一段，距離越長弧越大
          const dx = r.to.x - r.from.x;
          const dy = r.to.y - r.from.y;
          const bend = Math.min(0.28 * Math.hypot(dx, dy), 220);
          const len = Math.hypot(dx, dy) || 1;
          r.ctrl = { x: (r.from.x + r.to.x) / 2 - (dy / len) * bend, y: (r.from.y + r.to.y) / 2 + (dx / len) * bend };
          r.flyAt = now;
        }
      }

      if (!r.to || !r.ctrl) {
        // 還在收、或在等：點停在出發點，亮起來、慢慢閃
        const wait = t > COLLAPSE_MS ? 0.75 + 0.25 * Math.sin((t - COLLAPSE_MS) / 160) : 1;
        dot(r.from, 1.6 + 1.4 * easeOut(k), easeOut(k) * wait);
        return;
      }

      // 飛：沿弧線過去，身後拉出一條線
      const f = clamp((now - r.flyAt) / FLY_MS);
      const e = easeInOut(f);
      const u = 1 - e;
      const head = {
        x: u * u * r.from.x + 2 * u * e * r.ctrl.x + e * e * r.to.x,
        y: u * u * r.from.y + 2 * u * e * r.ctrl.y + e * e * r.to.y,
      };
      const last = r.trail.at(-1);
      if (!last || Math.hypot(head.x - last.x, head.y - last.y) > 1.5) r.trail.push(head);

      if (f < 1) {
        line(r.trail, 1);
        dot(head, 3, 1);
        return;
      }

      // 長：新的一頁顯示出來；頁面接手的話交給它，不然從錨點擴開一圈遮罩
      if (!r.growAt) {
        r.growAt = now;
        root.dataset.pt = 'grow';
        const page = currentPage();
        const fresh = page.generation !== r.oldGeneration ? page.handle : null;
        r.takeover = fresh?.onGrow?.({ from: r.from, to: r.to, trail: r.trail.slice() });
        r.reach = Math.hypot(
          Math.max(r.to.x, window.innerWidth - r.to.x),
          Math.max(r.to.y, window.innerHeight - r.to.y),
        );
      }
      const g = clamp((now - r.growAt) / GROW_MS);
      if (!r.takeover) {
        const box = r.main.getBoundingClientRect();
        r.main.style.clipPath = `circle(${(r.reach * easeOut(g)).toFixed(1)}px at ${(r.to.x - box.left).toFixed(1)}px ${(r.to.y - box.top).toFixed(1)}px)`;
      }
      if (r.takeover !== 'trail') {
        line(r.trail, 1 - easeOut(g));
        dot(r.to, 3 * (1 - g), 1 - g, 1 - g);
      }
      if (g >= 1) {
        cancelAnimationFrame(raf);
        finish(r);
      }
    };

    const unsubscribe = router.subscribe('onBeforeNavigate', (evt) => {
      const fromPath = evt.fromLocation?.pathname;
      if (!fromPath || !evt.pathChanged) return;
      const a = stripLocalePrefix(fromPath);
      const b = stripLocalePrefix(evt.toLocation.pathname);
      // 只換語系、或進出後台：不演
      if (a === b || a.startsWith('admin') || b.startsWith('admin')) return;
      const main = mainOf();
      if (!main || reduce.matches) {
        takeTransitionFrom();
        return;
      }
      if (run) finish(run);
      cancelAnimationFrame(raf);

      const page = currentPage();
      const from = takeTransitionFrom() ?? page.handle?.anchor?.() ?? defaultAnchor(main);
      const ghost = snapshot(main);
      ghost.style.transformOrigin = `${from.x}px ${from.y}px`;
      main.parentElement?.append(ghost);
      root.dataset.pt = 'out';
      run = {
        t0: performance.now(),
        from,
        to: null,
        ctrl: null,
        flyAt: 0,
        growAt: 0,
        trail: [from],
        ghost,
        main,
        oldFirst: main.firstElementChild,
        oldGeneration: page.generation,
        takeover: undefined,
        reach: 0,
      };
      raf = requestAnimationFrame(frame);
    });

    return () => {
      unsubscribe();
      document.removeEventListener('click', onClick, true);
      cancelAnimationFrame(raf);
      if (run) finish(run);
    };
  }, [router]);

  return <canvas ref={canvasRef} className="pt-canvas" aria-hidden="true" />;
}
