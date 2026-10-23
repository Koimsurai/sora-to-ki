// 換頁轉場：每一頁都從一個點出發、收回一個點，一筆連下去（與頁面的約定見 store/pageTransition）。
//
//   收：換頁先被擋下來（history 的 blocker），舊的那一頁在原地收進一個點——頁面自己收
//       （土星收進衛星、彗尾縮回彗核），或預設的一圈遮罩把整頁收進錨點。收的同時點在那裡亮起來
//   飛：收完才放行換頁。點帶著收進去時的方向飛出去；新的一頁一報到就量出錨點，
//       從點「現在的位置與速度」接一條三次曲線過去（速度連續，不會轉折），最後一段可以由頁面指定
//   長：落地之後新的一頁從錨點長出來。頁面可以接手那條線，不接手的話線收回點裡、一圈遮罩擴開
//
// 上一頁、下一頁也走同一套（popstate 一樣會問 blocker）。只換語系、進出後台、要求減少動態的訪客不演。
// 轉場中又換頁：舊的直接收尾，這一次不演。
import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import {
  after,
  currentPage,
  markTransitionFrom,
  takeTransitionFrom,
  type Departure,
  type GrowTakeover,
  type Pt,
} from '@/store/pageTransition';
import './TransitionLayer.css';

/** 預設的收：一圈遮罩收進錨點 */
const LEAVE_MS = 380;
const GROW_MS = 480;
/** 落地後那條線收回點裡 */
const TRAIL_IN_MS = 360;
/** 新的一頁最多等多久還沒報到，就飛到預設的位置 */
const WAIT_LIMIT_MS = 1500;
/** 點飛行的基準速度（px/ms）：決定一段路要飛多久 */
const SPEED = 1.6;
const AMBER = '233, 193, 122';
const INK = '241, 236, 227';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const len = (p: Pt) => Math.hypot(p.x, p.y);
const unit = (p: Pt): Pt => {
  const l = len(p) || 1;
  return { x: p.x / l, y: p.y / l };
};

interface Flight {
  points: Pt[];
  /** 每一點從起點量起的路長 */
  cum: number[];
  total: number;
  at: number;
  dur: number;
  /** 弧長隨時間的三次式 s(τ) = aτ³ + bτ² + cτ：c 是起飛時的速度，終點速度為 0 */
  a: number;
  b: number;
  c: number;
}

interface Run {
  phase: 'leave' | 'fly' | 'grow';
  t0: number;
  from: Pt;
  pos: Pt;
  /** px/ms */
  vel: Pt;
  launchAt: number;
  last: number;
  flight: Flight | null;
  trail: Pt[];
  to: Pt | null;
  growAt: number;
  takeover: GrowTakeover | undefined;
  main: HTMLElement;
  oldFirst: Element | null;
  oldGeneration: number;
  resolvedAt: number;
  reach: number;
}

const mainOf = () => document.querySelector<HTMLElement>('.main-content-container > main');

/** 頁面沒報錨點時的預設：第一個標題的左邊，沒有標題就畫面上方中間 */
function defaultAnchor(main: HTMLElement): Pt {
  // 先找 h1，沒有才找 h2、h3；只認看得到的（給螢幕閱讀器的隱藏標題只有 1px）
  for (const selector of ['h1', 'h2, h3']) {
    for (const heading of main.querySelectorAll(selector)) {
      const r = heading.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && r.top < window.innerHeight)
        return { x: Math.max(16, r.left - 14), y: r.top + r.height / 2 };
    }
  }
  return { x: window.innerWidth / 2, y: Math.min(window.innerHeight * 0.3, 260) };
}

/** 蓋滿整個畫面的圓，圓心在 p */
const coverRadius = (p: Pt) =>
  Math.hypot(Math.max(p.x, window.innerWidth - p.x), Math.max(p.y, window.innerHeight - p.y));

const circleAt = (main: HTMLElement, p: Pt, r: number) => {
  const box = main.getBoundingClientRect();
  main.style.clipPath = `circle(${r.toFixed(1)}px at ${(p.x - box.left).toFixed(1)}px ${(p.y - box.top).toFixed(1)}px)`;
};

/** 預設的收：一圈遮罩把整頁收進 point，越收越快 */
function defaultLeave(main: HTMLElement, point: Pt): Departure {
  const reach = coverRadius(point);
  const t0 = performance.now();
  const done = new Promise<void>((resolve) => {
    const step = (now: number) => {
      const k = clamp((now - t0) / LEAVE_MS);
      circleAt(main, point, reach * (1 - easeIn(k)));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return { point, done };
}

/** 三次 Hermite：從 p0（切向 m0）到 p1（切向 m1） */
function hermite(p0: Pt, m0: Pt, p1: Pt, m1: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return {
      x: h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
      y: h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
    };
  });
}

function pointAt(f: Flight, s: number): Pt {
  const { points, cum } = f;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const span = cum[i] - cum[i - 1] || 1;
  const k = clamp((s - cum[i - 1]) / span);
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * k,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * k,
  };
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

    // 出發點：點連結的那一刻記下來。連結自己標了點（首頁的衛星）就用那個點；
    // 內容裡的連結用點下去的位置（鍵盤是連結的左邊）；導覽列的連結不算，由頁面自己決定從哪裡收
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest('a[href]');
      if (!a) return;
      const tagged = a.closest<HTMLElement>('[data-tx]');
      if (tagged?.dataset.tx) {
        markTransitionFrom(
          { x: Number(tagged.dataset.tx), y: Number(tagged.dataset.ty ?? 0) },
          tagged.dataset.ptSource ?? null,
        );
      } else if (!a.closest('.main-content-container > main')) {
        markTransitionFrom(null);
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
      r.main.style.clipPath = '';
      delete root.dataset.pt;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (run === r) run = null;
    };

    const dot = (p: Pt, radius: number, alpha = 1) => {
      if (alpha <= 0.01) return;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
      g.addColorStop(0, `rgba(${AMBER}, ${0.5 * alpha})`);
      g.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    /** 線：從 start（0 到 1，依路長）畫到尾端；越舊的地方越淡，像一筆剛畫下去的墨 */
    const line = (points: Pt[], start: number, alpha: number) => {
      if (points.length < 2 || alpha <= 0.01) return;
      const cum = [0];
      for (let i = 1; i < points.length; i++)
        cum.push(cum[i - 1] + len({ x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }));
      const total = cum.at(-1) ?? 0;
      if (total < 1) return;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (let i = 1; i < points.length; i++) {
        const k = cum[i] / total;
        if (k < start) continue;
        const fade = Math.pow((k - start) / (1 - start || 1), 0.7);
        ctx.strokeStyle = `rgba(${INK}, ${(0.75 * fade * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
    };

    /** 新的一頁報到了：從點現在的位置與速度，接一條順的曲線到錨點 */
    const plan = (r: Run, now: number) => {
      const page = currentPage();
      const fresh = page.generation !== r.oldGeneration ? page.handle : null;
      const anchor = fresh?.anchor?.() ?? defaultAnchor(r.main);
      const arrival = fresh?.arrive?.({ pos: r.pos, vel: r.vel }) ?? null;
      const approach = arrival?.approach && arrival.approach.length > 1 ? arrival.approach : null;
      const target = approach ? approach[0] : anchor;
      const gap = { x: target.x - r.pos.x, y: target.y - r.pos.y };
      const dist = Math.max(1, len(gap));
      // 抵達的方向：頁面指定的那一段路的方向；沒指定就順著來的方向直接落進去，不繞回頭
      const inDir = approach
        ? unit({ x: approach[1].x - approach[0].x, y: approach[1].y - approach[0].y })
        : (arrival?.tangent ?? unit(gap));
      // 起飛的切向就是點現在的速度（換成「整段曲線」的尺度），太大的話夾住，免得繞一大圈
      const est = clamp(dist / SPEED, 220, 520);
      let m0 = { x: r.vel.x * est, y: r.vel.y * est };
      const m0Len = len(m0);
      if (m0Len > dist * 1.4) m0 = { x: (m0.x / m0Len) * dist * 1.4, y: (m0.y / m0Len) * dist * 1.4 };
      const m1 = { x: inDir.x * dist * 1.1, y: inDir.y * dist * 1.1 };
      const points = [...hermite(r.pos, m0, target, m1, 48), ...(approach ? approach.slice(1) : [])];
      const cum = [0];
      for (let i = 1; i < points.length; i++)
        cum.push(cum[i - 1] + len({ x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }));
      const total = Math.max(1, cum.at(-1) ?? 1);
      const dur = clamp(total / SPEED, 360, 820);
      const c = clamp((len(r.vel) * dur) / total, 0, 2.2);
      r.flight = { points, cum, total, at: now, dur, a: c - 2, b: 3 - 2 * c, c };
      r.to = points.at(-1) ?? anchor;
    };

    const frame = (now: number) => {
      const r = run;
      if (!r) return;
      raf = requestAnimationFrame(frame);
      fit();
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // 收：頁面往那一點收，點在那裡亮起來
      if (r.phase === 'leave') {
        const k = easeOut(clamp((now - r.t0) / LEAVE_MS));
        dot(r.from, 1 + 2 * k, k);
        return;
      }

      if (r.phase === 'fly') {
        const dt = Math.min(50, now - r.last);
        r.last = now;
        if (!r.flight) {
          const page = currentPage();
          const rendered =
            page.generation !== r.oldGeneration ||
            r.main.firstElementChild !== r.oldFirst ||
            (r.resolvedAt > 0 && now - r.resolvedAt > 32);
          if (rendered || now - r.launchAt > WAIT_LIMIT_MS) plan(r, now);
          else {
            // 新的一頁還沒報到：點順著原本的方向滑出去、慢慢減速，不停下來等
            r.pos = { x: r.pos.x + r.vel.x * dt, y: r.pos.y + r.vel.y * dt };
            const decay = Math.pow(0.96, dt / 16.7);
            r.vel = { x: r.vel.x * decay, y: r.vel.y * decay };
          }
        }
        if (r.flight) {
          const f = r.flight;
          const tau = clamp((now - f.at) / f.dur);
          const s = (f.a * tau * tau * tau + f.b * tau * tau + f.c * tau) * f.total;
          r.pos = pointAt(f, s);
          if (tau >= 1) {
            r.phase = 'grow';
            r.growAt = now;
          }
        }
        const lastPt = r.trail.at(-1);
        if (!lastPt || len({ x: r.pos.x - lastPt.x, y: r.pos.y - lastPt.y }) > 1.5) r.trail.push(r.pos);
        line(r.trail, 0, 1);
        dot(r.pos, 3);
        if (r.phase === 'fly') return;
      }

      // 長：新的一頁出來；頁面接手的話交給它，不然從錨點擴開一圈遮罩，那條線收回點裡
      const to = r.to ?? r.pos;
      if (r.growAt === now) {
        root.dataset.pt = 'grow';
        const page = currentPage();
        const fresh = page.generation !== r.oldGeneration ? page.handle : null;
        r.takeover = fresh?.onGrow?.({ from: r.from, to, trail: r.trail.slice() });
        r.reach = coverRadius(to);
      }
      const g = clamp((now - r.growAt) / GROW_MS);
      if (!r.takeover) circleAt(r.main, to, r.reach * easeOut(g));
      if (r.takeover !== 'trail') {
        line(r.trail, easeIn(clamp((now - r.growAt) / TRAIL_IN_MS)), 1);
        dot(to, 3 * (1 - easeOut(g)), 1 - g);
      }
      if (g >= 1) {
        cancelAnimationFrame(raf);
        finish(r);
      }
    };

    const unblock = router.history.block({
      enableBeforeUnload: false,
      blockerFn: async ({ currentLocation, nextLocation }) => {
        const a = stripLocalePrefix(currentLocation.pathname);
        const b = stripLocalePrefix(nextLocation.pathname);
        const main = mainOf();
        // 只換語系、進出後台、要求減少動態：不演
        if (a === b || a.startsWith('admin') || b.startsWith('admin') || reduce.matches || !main) {
          takeTransitionFrom();
          return false;
        }
        if (run) {
          cancelAnimationFrame(raf);
          finish(run);
          takeTransitionFrom();
          return false;
        }
        const page = currentPage();
        const mark = takeTransitionFrom();
        // 收的同時先把下一頁的資料抓起來，收完換頁時它多半已經好了
        void router
          .preloadRoute({ href: nextLocation.href } as Parameters<typeof router.preloadRoute>[0])
          .catch(() => undefined);
        const departure =
          page.handle?.leave?.({ from: mark?.pt ?? null, source: mark?.source ?? null }) ??
          defaultLeave(main, mark?.pt ?? page.handle?.anchor?.() ?? defaultAnchor(main));
        const r: Run = {
          phase: 'leave',
          t0: performance.now(),
          from: departure.point,
          pos: departure.point,
          // 頁面沒給方向（收進中心、預設的遮罩）：往左上慢慢滑出去——大部分頁面的錨點在左上的標題，
          // 新的一頁還沒好的時候點也不會停在原地等
          vel: departure.velocity ?? { x: -0.24, y: -0.32 },
          launchAt: 0,
          last: 0,
          flight: null,
          trail: [departure.point],
          to: null,
          growAt: 0,
          takeover: undefined,
          main,
          oldFirst: null,
          oldGeneration: 0,
          resolvedAt: 0,
          reach: 0,
        };
        run = r;
        root.dataset.pt = 'leave';
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
        // 頁面的收最久等 0.8 秒：換頁不能被一個沒收完的動畫卡住
        await Promise.race([departure.done, after(800)]);
        if (run !== r) return false;
        // 先把舊的藏起來再拿掉遮罩，舊頁不會閃回來一幀
        root.dataset.pt = 'out';
        main.style.clipPath = '';
        r.phase = 'fly';
        r.launchAt = r.last = performance.now();
        r.oldGeneration = currentPage().generation;
        r.oldFirst = main.firstElementChild;
        return false;
      },
    });

    // 同一個元件換資料（例如文章換一篇）時 generation 與 main 的第一個子元素都不會變，
    // 用路由「這次換頁處理完了」當作新的一頁已經畫好的訊號
    const unsubscribe = router.subscribe('onResolved', () => {
      if (run?.phase === 'fly') run.resolvedAt = performance.now();
    });

    return () => {
      unblock();
      unsubscribe();
      document.removeEventListener('click', onClick, true);
      cancelAnimationFrame(raf);
      if (run) finish(run);
    };
  }, [router]);

  return <canvas ref={canvasRef} className="pt-canvas" aria-hidden="true" />;
}
