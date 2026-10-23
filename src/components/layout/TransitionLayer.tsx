// 換頁轉場：每一頁都從一個點出發、收回一個點，一筆連下去（與頁面的約定見 store/pageTransition）。
//
//   收：換頁先被擋下來（history 的 blocker），舊的那一頁在原地收進一個點——頁面自己收
//       （土星收進衛星、彗尾縮回彗核），或預設的一圈遮罩把整頁收進錨點。收的同時點在那裡亮起來
//   飛：收完才放行換頁。像電影追一個對象：鏡頭先移到琥珀點上、把它放在畫面正中間；點出發，鏡頭跟著它，
//       它一直在正中間，背景的星空也跟著鏡頭慢慢挪（視差），新的一頁從它要去的那一側進來；
//       快接上頁面自己的線（星軌、彗尾、航線…）時鏡頭煞停，點順著那條線走完最後一段、落在錨點。
//       點身後是一道會散掉的彗尾：越舊的地方越淡、過一會就消失，所以落地時留下的只有頁面自己的那條線
//
//   座標：世界座標裡，舊的一頁擺在原位、新的一頁往點飛去的方向挪了 offset。鏡頭 cam 是世界到畫面的位移
//   （畫面 = 世界 − cam），一開始是 0、停下時剛好是 offset，新的一頁就回到原位
//   長：落地之後頁面接手自己的進場（星軌長出來、彗尾長出來…）；頁面可以接手那條線
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
  type Pt,
} from '@/store/pageTransition';
import './TransitionLayer.css';

/** 預設的收：一圈遮罩收進錨點 */
const LEAVE_MS = 380;
const GROW_MS = 480;
/** 彗尾：一個點畫下去之後多久散掉（ms） */
const TAIL_MS = 760;
/** 新的一頁最多等多久還沒報到，就飛到預設的位置 */
const WAIT_LIMIT_MS = 1500;
/** 點飛行的基準速度（px/ms）：決定一段路要飛多久 */
const SPEED = 1.6;
/** 飛行時間的上下限（ms，不含對焦） */
const FLY_MIN_MS = 700;
const FLY_MAX_MS = 1400;
/** 對焦：鏡頭移到點上要多久（ms） */
const ACQUIRE_MIN_MS = 140;
const ACQUIRE_MAX_MS = 360;
/** 跟拍那段至少飛多遠（視窗短邊的倍數） */
const TRAVEL = 0.42;
/** 點已經在錨點上、頁面那一點還在動的時候（手記推近），新的一頁提早多久開始長：兩段疊在一起，中間不會空掉 */
const STILL_OVERLAP_MS = 300;
/** 背景星空跟著鏡頭挪多少（遠的東西動得少） */
const SKY_PARALLAX = 0.14;
/** 彗尾的塵埃多久熄掉 */
const DUST_LIFE_MS = 900;
const AMBER = '233, 193, 122';
const INK = '241, 236, 227';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const lerp = (p: Pt, q: Pt, k: number): Pt => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
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
  /** 對焦（鏡頭移到點上）要多久；這段時間點停在 start */
  acquire: number;
  start: Pt;
  /** 鏡頭在路長的這一段裡煞停（點快接上頁面的線的時候） */
  brakeFrom: number;
  brakeTo: number;
}

interface Run {
  phase: 'leave' | 'fly' | 'grow';
  /** 收的時候點跟著頁面給的那一點走；followUntil 之前（換頁之後也是）都跟著它 */
  follow: (() => Pt) | null;
  followUntil: number;
  /** 舊頁收完留下的線，飛的時候接著畫，長的時候淡掉 */
  residue: ((ctx: CanvasRenderingContext2D) => void) | null;
  t0: number;
  from: Pt;
  /** 點在世界座標的位置（鏡頭還沒動之前跟畫面座標一樣） */
  pos: Pt;
  /** px/ms */
  vel: Pt;
  launchAt: number;
  last: number;
  flight: Flight | null;
  /** 點飛過的路（世界座標，t 是畫下去的時間：彗尾照它散掉） */
  trail: (Pt & { t: number })[];
  /** 錨點（新的一頁在原位時的畫面座標） */
  to: Pt | null;
  growAt: number;
  main: HTMLElement;
  oldFirst: Element | null;
  oldGeneration: number;
  resolvedAt: number;
  reach: number;
  /** 新的一頁在世界裡挪了多少；鏡頭現在的位移（畫面 = 世界 − cam） */
  offset: Pt;
  cam: Pt;
  /** 點不用飛（已經在錨點上）：鏡頭不動 */
  still: boolean;
  /** 彗尾的塵埃（世界座標） */
  dust: { x: number; y: number; vx: number; vy: number; life: number; size: number }[];
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
      // 連結自己報的名字（首頁衛星的序號、手記列表的 post:id），頁面的「收」照它決定怎麼收
      const source = a.closest<HTMLElement>('[data-pt-source]')?.dataset.ptSource ?? null;
      if (tagged?.dataset.tx) {
        markTransitionFrom({ x: Number(tagged.dataset.tx), y: Number(tagged.dataset.ty ?? 0) }, source);
      } else if (!a.closest('.main-content-container > main')) {
        markTransitionFrom(null, source);
      } else if (e.detail > 0) {
        markTransitionFrom({ x: e.clientX, y: e.clientY }, source);
      } else {
        const r = a.getBoundingClientRect();
        markTransitionFrom({ x: r.left, y: r.top + r.height / 2 }, source);
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
      r.main.style.transform = '';
      r.main.style.opacity = '';
      r.main.style.transition = '';
      delete root.dataset.pt;
      root.style.removeProperty('--pt-sky-x');
      root.style.removeProperty('--pt-sky-y');
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

    /** 彗尾：每一段照它畫下去多久了變淡，散完就不畫；回傳還有沒有沒散完的 */
    const tail = (points: Run['trail'], now: number) => {
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      let alive = false;
      for (let i = 1; i < points.length; i++) {
        const k = 1 - (now - points[i].t) / TAIL_MS;
        if (k <= 0) continue;
        alive = true;
        ctx.strokeStyle = `rgba(${INK}, ${(0.75 * Math.pow(k, 1.6)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
      return alive;
    };

    /**
     * 新的一頁報到了，排這一趟：
     *   對焦  鏡頭先移到點上，把它放到畫面正中間（點停在原地等鏡頭）
     *   跟拍  點出發，順著「頁面那條線」的方向直直飛，鏡頭跟著它、它一直在正中間
     *   煞停  快接上頁面的線時鏡頭慢慢停在新的一頁的原位；點不停，從畫面中間滑到那條線的起點，
     *         再順著那條線走完（沿著星軌、沿著彗尾…），落在錨點上
     * 跟拍那段在世界裡是一條直線，方向就是那條線起點的方向，所以接上去的那一下不會拐彎
     */
    const plan = (r: Run, now: number) => {
      const page = currentPage();
      const fresh = page.generation !== r.oldGeneration ? page.handle : null;
      const anchor = fresh?.anchor?.() ?? defaultAnchor(r.main);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mid = { x: w / 2, y: h / 2 };
      // 頁面挑最後一段路時，點的位置是鏡頭開始煞停那一刻它在畫面上的位置：正中間
      const arrival = fresh?.arrive?.({ pos: mid, vel: { x: 0, y: 0 } }) ?? null;
      const approach = arrival?.approach && arrival.approach.length > 1 ? arrival.approach : null;
      const target = approach ? approach[0] : anchor;
      const gap = { x: target.x - r.pos.x, y: target.y - r.pos.y };
      r.to = approach ? (approach.at(-1) ?? anchor) : anchor;
      // 點已經在錨點上了（手記的星軌直接被拉成文章的軌道）：不用飛，鏡頭不動，直接長
      r.still = Boolean(arrival?.still) || (!approach && len(gap) < 6);
      if (r.still) {
        r.flight = {
          points: [r.to, r.to],
          cum: [0, 0],
          total: 1,
          at: now,
          dur: 1,
          acquire: 0,
          start: { ...r.pos },
          brakeFrom: 0,
          brakeTo: 0,
        };
        r.offset = { x: 0, y: 0 };
        r.cam = { x: 0, y: 0 };
        root.dataset.pt = 'fly';
        r.main.style.transition = 'none';
        r.main.style.opacity = '0';
        return;
      }
      // 頁面那條線起點的方向：頁面指定的路的方向；沒指定就由畫面中心直直進去
      const fromMid = { x: target.x - mid.x, y: target.y - mid.y };
      const fallback = len(gap) > 40 ? unit(gap) : len(r.vel) > 0.01 ? unit(r.vel) : { x: 0, y: -1 };
      const inDir = approach
        ? unit({ x: approach[1].x - approach[0].x, y: approach[1].y - approach[0].y })
        : (arrival?.tangent ?? (len(fromMid) > 20 ? unit(fromMid) : fallback));
      // 煞停要多長：點要從畫面中間滑到那條線的起點，離得越遠煞得越久
      const brake = clamp(len(fromMid) * 1.1 + 160, 200, Math.min(w, h));
      const L = Math.max(Math.min(w, h) * TRAVEL, brake + 220);
      // 世界裡：從點現在的位置沿 inDir 直直飛 L，終點就是（挪過的）那條線的起點
      const end = { x: r.pos.x + inDir.x * L, y: r.pos.y + inDir.y * L };
      const O = { x: end.x - target.x, y: end.y - target.y };
      const shift = (p: Pt): Pt => ({ x: p.x + O.x, y: p.y + O.y });
      // 起步稍微帶一點點原本的方向，其餘是直的
      const v0 = len(r.vel) > 0.05 ? unit(r.vel) : inDir;
      const m0 = unit({ x: inDir.x + 0.3 * v0.x, y: inDir.y + 0.3 * v0.y });
      const lead = hermite(r.pos, { x: m0.x * L, y: m0.y * L }, end, { x: inDir.x * L, y: inDir.y * L }, 48);
      const points = [...lead, ...(approach ? approach.slice(1).map(shift) : [])];
      const cum = [0];
      for (let i = 1; i < points.length; i++)
        cum.push(cum[i - 1] + len({ x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y }));
      const total = Math.max(1, cum.at(-1) ?? 1);
      const sJoin = cum[lead.length - 1] ?? total;
      const acquire = clamp(len({ x: r.pos.x - mid.x, y: r.pos.y - mid.y }) / 2.2, ACQUIRE_MIN_MS, ACQUIRE_MAX_MS);
      r.flight = {
        points,
        cum,
        total,
        at: now,
        dur: clamp(total / SPEED, FLY_MIN_MS, FLY_MAX_MS),
        acquire,
        start: { ...r.pos },
        brakeFrom: Math.max(0, sJoin - Math.min(brake, sJoin * 0.8)),
        brakeTo: sJoin,
      };
      r.offset = O;
      r.cam = { x: 0, y: 0 };
      // 新的一頁在飛的時候就看得到（跟著鏡頭進來），不再藏著
      root.dataset.pt = 'fly';
      r.main.style.transition = 'none';
      r.main.style.opacity = '0';
      r.main.style.transform = `translate(${O.x}px, ${O.y}px)`;
    };

    /** 彗尾的塵埃：從點身上一路散出來，往後飄、慢慢熄 */
    const emitDust = (r: Run, p: Pt, back: Pt, dt: number) => {
      const n = Math.min(6, Math.ceil(dt / 6));
      for (let k = 0; k < n; k++) {
        const side = (Math.random() - 0.5) * 2;
        r.dust.push({
          x: p.x + (Math.random() - 0.5) * 3,
          y: p.y + (Math.random() - 0.5) * 3,
          vx: back.x * (0.02 + Math.random() * 0.05) - back.y * side * 0.03,
          vy: back.y * (0.02 + Math.random() * 0.05) + back.x * side * 0.03,
          life: 0,
          size: 0.8 + Math.random() * 1.2,
        });
      }
    };

    const drawDust = (r: Run, dt: number, alpha: number) => {
      const keep: Run['dust'] = [];
      for (const p of r.dust) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.life / DUST_LIFE_MS;
        if (k <= 0) continue;
        keep.push(p);
        ctx.fillStyle = `rgba(${INK}, ${(0.7 * k * k * alpha).toFixed(3)})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      r.dust = keep;
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
        dot(r.follow?.() ?? r.from, 1 + 2 * k, k);
        return;
      }

      // 舊頁留下的線、彗尾、塵埃都在世界裡：照鏡頭位移畫
      const world = (paint: () => void) => {
        ctx.save();
        ctx.translate(-r.cam.x, -r.cam.y);
        paint();
        ctx.restore();
      };
      // 舊頁留下的線：飛的時候接著畫，長的時候跟著新的一頁淡掉
      const residue = r.residue;
      if (residue) {
        const fadeOut = r.phase === 'grow' ? 1 - clamp((now - r.growAt) / GROW_MS) : 1;
        if (fadeOut > 0)
          world(() => {
            ctx.globalAlpha = fadeOut;
            residue(ctx);
          });
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
          else if (r.follow && now < r.followUntil) r.pos = r.follow();
          else {
            // 新的一頁還沒報到：點順著原本的方向滑出去、慢慢減速，不停下來等
            r.pos = { x: r.pos.x + r.vel.x * dt, y: r.pos.y + r.vel.y * dt };
            const decay = Math.pow(0.96, dt / 16.7);
            r.vel = { x: r.vel.x * decay, y: r.vel.y * decay };
          }
        }
        const prev = r.pos;
        if (r.flight) {
          const f = r.flight;
          const mid = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          const el = now - f.at;
          let tau = 0;
          if (r.still) {
            // 點已經在錨點上：頁面的那一點還在動的話（手記的星軌被推成文章的軌道）跟著它，動完才長
            if (r.follow && now < r.followUntil) r.pos = r.follow();
            else r.pos = r.to ?? r.pos;
            if (!r.follow || now >= r.followUntil - STILL_OVERLAP_MS) tau = 1;
          } else if (el < f.acquire) {
            // 對焦：點停在原地，鏡頭移過去把它放到正中間
            const k = smooth(0, 1, el / f.acquire);
            r.pos = f.start;
            r.cam = { x: (f.start.x - mid.x) * k, y: (f.start.y - mid.y) * k };
          } else {
            // 跟拍：點沿著路走（起步與落地都是緩的），鏡頭讓它一直在正中間；快接上頁面的線時鏡頭煞停
            tau = clamp((el - f.acquire) / f.dur);
            const s = ((1 - Math.cos(Math.PI * tau)) / 2) * f.total;
            r.pos = pointAt(f, s);
            const hold = f.brakeTo - f.brakeFrom < 1 ? (s >= f.brakeTo ? 1 : 0) : smooth(f.brakeFrom, f.brakeTo, s);
            r.cam = lerp({ x: r.pos.x - mid.x, y: r.pos.y - mid.y }, r.offset, hold);
            // 新的一頁 = 世界裡挪過的位置 − 鏡頭，鏡頭停下時剛好回到原位
            r.main.style.transform = `translate(${(r.offset.x - r.cam.x).toFixed(1)}px, ${(r.offset.y - r.cam.y).toFixed(1)}px)`;
            r.main.style.opacity = String(smooth(0.15, 0.55, tau));
          }
          // 背景的星空跟著鏡頭挪一點：是鏡頭在動，不是頁面在滑
          root.style.setProperty('--pt-sky-x', `${(-r.cam.x * SKY_PARALLAX).toFixed(1)}px`);
          root.style.setProperty('--pt-sky-y', `${(-r.cam.y * SKY_PARALLAX).toFixed(1)}px`);
          if (tau >= 1) {
            r.phase = 'grow';
            r.growAt = now;
          }
        }
        const moved = { x: r.pos.x - prev.x, y: r.pos.y - prev.y };
        const lastPt = r.trail.at(-1);
        if (!lastPt || len({ x: r.pos.x - lastPt.x, y: r.pos.y - lastPt.y }) > 1.5) r.trail.push({ ...r.pos, t: now });
        if (len(moved) > 0.2) emitDust(r, r.pos, unit({ x: -moved.x, y: -moved.y }), dt);
        world(() => {
          drawDust(r, dt, 1);
          tail(r.trail, now);
        });
        dot({ x: r.pos.x - r.cam.x, y: r.pos.y - r.cam.y }, 3);
        if (r.phase === 'fly') return;
      }

      // 長：新的一頁接手自己的進場；彗尾照樣散完，點慢慢暗下去，頁面自己的那一點在它底下亮起來
      const to = r.to ?? r.pos;
      if (r.growAt === now) {
        root.dataset.pt = 'grow';
        const page = currentPage();
        const fresh = page.generation !== r.oldGeneration ? page.handle : null;
        // 交給頁面的線換成新的一頁原位的座標
        const trail = r.trail.map((p) => ({ x: p.x - r.cam.x, y: p.y - r.cam.y }));
        fresh?.onGrow?.({ from: r.from, to, trail });
      }
      const g = clamp((now - r.growAt) / GROW_MS);
      r.main.style.transform = '';
      // 沒飛的（點本來就在錨點上）這時才淡入
      r.main.style.opacity = String(Math.max(Number(r.main.style.opacity || 0), easeOut(g)));
      ctx.save();
      ctx.translate(-r.cam.x, -r.cam.y);
      drawDust(r, Math.min(50, now - r.last), 1);
      const alive = tail(r.trail, now);
      ctx.restore();
      r.last = now;
      dot(r.follow && now < r.followUntil ? r.follow() : to, 3 * (1 - easeOut(g)), 1 - g);
      if (g >= 1 && !r.dust.length && !alive) {
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
          page.handle?.leave?.({ from: mark?.pt ?? null, source: mark?.source ?? null, to: b }) ??
          defaultLeave(main, mark?.pt ?? page.handle?.anchor?.() ?? defaultAnchor(main));
        const r: Run = {
          phase: 'leave',
          follow: departure.follow ?? null,
          followUntil: performance.now() + (departure.followMs ?? 0),
          residue: departure.residue ?? null,
          t0: performance.now(),
          from: departure.point,
          pos: departure.point,
          // 頁面沒給方向（收進中心、預設的遮罩）：往左上慢慢滑出去——大部分頁面的錨點在左上的標題，
          // 新的一頁還沒好的時候點也不會停在原地等
          vel: departure.velocity ?? { x: -0.24, y: -0.32 },
          launchAt: 0,
          last: 0,
          flight: null,
          trail: [{ ...departure.point, t: performance.now() }],
          to: null,
          growAt: 0,
          main,
          oldFirst: null,
          oldGeneration: 0,
          resolvedAt: 0,
          reach: 0,
          offset: { x: 0, y: 0 },
          cam: { x: 0, y: 0 },
          still: false,
          dust: [],
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
