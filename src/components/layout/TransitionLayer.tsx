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
// 上一頁、下一頁也走同一套（popstate 一樣會問 blocker）。只換語系、進出後台、要求減少動態的訪客不演；
// 從一篇文章換到另一篇也不演——文章頁自己原地換（左欄留著滑、標題內文目錄換掉，見 blog/BlogPost）。
// 轉場中又換頁：舊的直接收尾，這一次不演。
import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import { isBotUserAgent } from '@/lib/bot';
import { onPalette, palette } from '@/lib/palette';
import { PLANETS, saturnGrowAt, saturnRingOnScreen } from '@/lib/saturnSpec';
import { currentTheme, onTheme } from '@/lib/theme';
import { currentFold, offCrease } from '@/lib/viewportFold';
import {
  after,
  reportBoot,
  reportTransition,
  currentPage,
  markTransitionFrom,
  setArrive,
  setRejoining,
  setTransitionDot,
  takeTransitionFrom,
  type Departure,
  type Pt,
} from '@/store/pageTransition';
import { latestSaturnGrow, subscribeSatellites } from '@/store/homeOrbit';
import { clamp, cumulative, easeIn, flightAt, smooth, type Flight } from '@/lib/transition/geometry';
import type { PaintStyle } from '@/lib/transition/paint';
import { createLocalHost, createWorkerHost, type SceneHost } from '@/lib/transition/host';
import { GROW_MS, LEAVE_MS, type Phase, type PlanInput, type SceneEffects } from '@/lib/transition/scene';
import { setSkyFlight, setSkyPan } from '@/store/skyPan';
import './TransitionLayer.css';

/** 單篇文章的路徑（語系前綴已剝掉）：`blog/<slug 或 id>` */
const ARTICLE = /^blog\/[^/]+$/;
/** 新的一頁最多等多久還沒報到，就飛到預設的位置（飛行本身怎麼排見 lib/transition/scene） */
const WAIT_LIMIT_MS = 1500;
/** 開場：第一次來最少停多久（從這次載入開始算）、同一個分頁重新整理時最少多久、最多等多久就飛 */
const BOOT_MIN_MS = 1100;
const BOOT_QUICK_MS = 300;
const BOOT_WAIT_MS = 3500;
/** 那一圈畫滿之後停一下再飛；夜色淡掉要多久（跟 index.css 的 #boot 一樣） */
const BOOT_CLOSE_MS = 260;
/** 不交棒的時候，環收回點裡要多久（跟 index.css 的 data-boot-collapse 一樣） */
const BOOT_COLLAPSE_MS = 250;
const BOOT_FADE_MS = 520;
/** 開場那道行星環最外圈的半徑與它那個框的邊長（px，跟 __root.tsx 的 BOOT_RINGS、index.css 的 .boot-ring 一樣） */
const BOOT_RING_R = 26;
const BOOT_RING_BOX = 80;
/** 3D 的環在透視下外緣看起來小一點（實測差 7%）：小環長到剛好疊在它上面 */
const BOOT_RING_PERSPECTIVE = 0.93;
/** 星球長到幾成時小環追上它（之後兩道環一樣大）；3D 一直沒回報就自己長；交棒收掉的保險時間；最多等這一頁開始長多久 */
const BOOT_RING_CATCH = 0.6;
const BOOT_RING_ALONE_MS = 600;
const BOOT_RING_GROW_MS = 2000;
const BOOT_RING_WAIT_MS = 2500;
/** 背景星空跟著鏡頭挪多少（遠的東西動得少） */
const SKY_PARALLAX = 0.14;
/** 一趟轉場最久跑多久：超過就當作出事了，直接收掉（不讓畫面卡在半路） */
const RUN_LIMIT_MS = 8000;
/**
 * 主題（lib/theme）：編排全站一份，畫法跟著主題換——尾巴（tail）、彈弓、預言的落點、開場交棒的環。
 * 配色與主題在模組載入時讀一次（主題在 paint 之前就掛上了，比這支早），頁面開著時換了就跟著換。
 * 畫的時候讀 PAINT（lib/transition/paint）
 */
let THEME = currentTheme();
let RING_OUTER = PLANETS[THEME].ring.outer;
const { paper, amber, ground } = palette();
const PAINT: PaintStyle = { ink: paper, amber, ground, theme: THEME };
onPalette((p) => {
  PAINT.ink = p.paper;
  PAINT.amber = p.amber;
  PAINT.ground = p.ground;
});
onTheme((theme) => {
  THEME = theme;
  PAINT.theme = theme;
  RING_OUTER = PLANETS[theme].ring.outer;
});

/**
 * 首頁的 3D 土星畫出第一幀（3D 那邊開始回報衛星位置，store/homeOrbit）；確定沒有 GPU（html.no-gpu）或
 * 是爬蟲就不用等。開場等不到也不會卡：外面跟 BOOT_WAIT_MS 一起比
 */
const saturnDrawn = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const root = document.documentElement;
    let finished = false;
    // 已經有位置的話 subscribeSatellites 會當場呼叫回來（那時 unsubscribe 還沒指派），收尾放到下一個 microtask
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
      queueMicrotask(() => {
        unsubscribe();
        mo.disconnect();
      });
    };
    const mo = new MutationObserver(() => {
      if (root.classList.contains('no-gpu')) done();
    });
    const unsubscribe = subscribeSatellites((positions) => {
      if (positions.length) done();
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    signal.addEventListener('abort', done, { once: true });
    // 爬蟲不載 3D（backdrop/SpaceBackdropShell），等了也是白等
    if (root.classList.contains('no-gpu') || isBotUserAgent(navigator.userAgent)) done();
  });

/**
 * 一趟轉場在主執行緒這邊的事：頁面、頁面給的東西、量測。點與鏡頭的運動在場景裡（lib/transition/scene）
 */
interface Run {
  main: HTMLElement;
  /** 頁面給的那一點（收的時候點跟著它走；場景的 followUntil 之前，換頁之後也是） */
  follow: (() => Pt) | null;
  /** 舊頁收完留下的線，飛的時候接著畫，長的時候淡掉 */
  residue: ((ctx: CanvasRenderingContext2D) => void) | null;
  t0: number;
  oldFirst: Element | null;
  oldGeneration: number;
  resolvedAt: number;
  /** 這一頁其實沒換（換主題之後接回來，store/pageTransition 的 arriveFrom）：不走頁面那段路、不重演它的進場 */
  quiet: boolean;
  /** 站內換頁從哪一頁到哪一頁：跑完時上報這一趟順不順（store/pageTransition 的 reportTransition）；開場那一趟是 null */
  report: { from: string; to: string } | null;
  /** 這一趟的幀：上一幀的時間、幾幀、最長一幀、超過 50ms 的幾幀 */
  prevFrame: number;
  frames: number;
  maxFrame: number;
  longFrames: number;
  /** 收、飛、長各自最長的一幀：卡在哪一段，修的地方不一樣（飛的途中卡，多半是新的一頁正在掛上去） */
  phaseMax: Record<Phase, number>;
  /** 上一次在效能時間軸上標記的是哪一段（performance.mark，錄 trace 時看得到三段的起點） */
  marked: Phase | null;
  /** 頁面跟著鏡頭滑進來的那段（合成器上的 WAAPI）；沒有在跑是 null */
  anim: Animation | null;
}

/**
 * 頁面跟著鏡頭滑進來：跟拍那段的位移與透明度照 flightAt 每 16ms 取一格，交給合成器播。
 * 時間照 document.timeline（跟 performance.now() 同一個時鐘）對齊路線的起點
 */
function cameraAnimation(
  main: HTMLElement,
  { path: f, offset, w, h, blackhole }: { path: Flight; offset: Pt; w: number; h: number; blackhole: boolean },
) {
  const mid = { x: w / 2, y: h / 2 };
  const n = Math.max(2, Math.ceil(f.dur / 16));
  const frames = Array.from({ length: n + 1 }, (_, i) => {
    const { cam, tau } = flightAt(f, offset, mid, blackhole, f.acquire + (f.dur * i) / n);
    return {
      transform: `translate(${(offset.x - cam.x).toFixed(1)}px, ${(offset.y - cam.y).toFixed(1)}px)`,
      opacity: String(smooth(0.15, 0.55, tau)),
    };
  });
  const anim = main.animate(frames, { duration: f.dur, fill: 'forwards' });
  anim.startTime = f.at + f.acquire;
  return anim;
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

/** 預設的收：一圈遮罩把整頁收進 point，越收越快。alive() 變 false（被新的一趟取代）就停手，不再動遮罩 */
function defaultLeave(main: HTMLElement, point: Pt, alive: () => boolean): Departure {
  const reach = coverRadius(point);
  const t0 = performance.now();
  const done = new Promise<void>((resolve) => {
    const step = (now: number) => {
      if (!alive()) {
        resolve();
        return;
      }
      const k = clamp((now - t0) / LEAVE_MS);
      circleAt(main, point, reach * (1 - easeIn(k)));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return { point, done };
}

/**
 * 交給 worker 的那張 canvas 只能交一次（transferControlToOffscreen），React 開發模式卻會把 effect 跑兩次：
 * 宿主照 canvas 記住、一直沿用，效果回呼每次 effect 重新綁到這一次的
 */
const workerHosts = new WeakMap<HTMLCanvasElement, { host: SceneHost; bind: (fx: SceneEffects) => void }>();
function workerHost(canvas: HTMLCanvasElement) {
  let entry = workerHosts.get(canvas);
  if (!entry) {
    let current: SceneEffects | null = null;
    const fx: SceneEffects = {
      screen: (p) => current?.screen(p),
      page: (transform, opacity) => current?.page(transform, opacity),
      camera: (cam) => current?.camera(cam),
      planned: (plan) => current?.planned(plan),
      grow: (g) => current?.grow(g),
    };
    entry = {
      host: createWorkerHost(canvas, PAINT, fx),
      bind: (next) => {
        current = next;
      },
    };
    workerHosts.set(canvas, entry);
  }
  return entry;
}

export default function TransitionLayer() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let run: Run | null = null;
    let raf = 0;
    /** 第幾趟：新的一趟開始時加一，舊的那趟的遮罩看到不是自己就停手 */
    let epoch = 0;
    /** 之前每一趟鏡頭移動累積下來的星空位移 */
    let skyBase = { x: 0, y: 0 };

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

    /** 開場那顆點在畫面上的位置（index.css 的 --boot-cy），環的 --boot-ring-dx／dy 從這裡算 */
    let bootOrigin: Pt = { x: 0, y: 0 };

    // 點與鏡頭的運動、畫法在場景裡（lib/transition/scene）；碰 DOM 的事由場景回報、在這裡做
    const fx: SceneEffects = {
      screen(p) {
        setTransitionDot(p);
        // 開場交棒時那道小環套在點上跟著走（index.css 的 --boot-ring-dx／dy），點落在土星中心時環才長大
        if (root.dataset.bootRing === 'grow') {
          const boot = document.getElementById('boot');
          boot?.style.setProperty('--boot-ring-dx', `${(p.x - bootOrigin.x).toFixed(1)}px`);
          boot?.style.setProperty('--boot-ring-dy', `${(p.y - bootOrigin.y).toFixed(1)}px`);
        }
      },
      page(transform, opacity) {
        if (!run) return;
        // 跟拍的那段由合成器照關鍵影格走（planned），這裡不再一幀一幀寫；開始長（transform 是 ''）才收回來
        if (run.anim) {
          if (transform !== '') return;
          run.anim.cancel();
          run.anim = null;
        }
        if (transform !== null) run.main.style.transform = transform;
        run.main.style.opacity = String(opacity);
      },
      camera(cam) {
        setSkyPan(skyBase.x - cam.x * SKY_PARALLAX, skyBase.y - cam.y * SKY_PARALLAX);
      },
      planned({ translate, flight }) {
        if (!run) return;
        root.dataset.pt = 'fly';
        run.main.style.transition = 'none';
        run.main.style.opacity = '0';
        if (translate) run.main.style.transform = `translate(${translate.x}px, ${translate.y}px)`;
        run.anim?.cancel();
        run.anim = null;
        if (!flight) return;
        // 鏡頭的路一開始就排好了：頁面跟著鏡頭滑進來的那段交給合成器（WAAPI），星空的視差交給星空的 worker，
        // 主執行緒卡住（新的一頁正在掛上去、資料到了重繪）時兩者照樣走
        run.anim = cameraAnimation(run.main, flight);
        setSkyFlight({ ...flight, base: skyBase, parallax: SKY_PARALLAX });
      },
      grow({ from, to, trail, quiet }) {
        if (!run) return;
        root.dataset.pt = 'grow';
        // 開場那道行星環：這一刻 3D 土星開始長，環跟著長大淡掉交棒（index.css 的 data-boot-ring="go"）
        if (root.dataset.bootRing === 'grow') {
          root.dataset.bootRing = 'go';
          growBootRing();
          window.clearTimeout(bootTimer);
          bootTimer = window.setTimeout(endBoot, BOOT_RING_GROW_MS);
        }
        const page = currentPage();
        const fresh = page.generation !== run.oldGeneration ? page.handle : null;
        if (!quiet) fresh?.onGrow?.({ from, to, trail });
      },
    };
    // 場景跑在哪：轉場的 worker（點與彗尾照自己的時鐘畫，主執行緒卡住也照樣走），
    // 不支援 OffscreenCanvas 就在主執行緒（lib/transition/host）。網址帶 ?txw=0（或 localStorage 的 txw 是 0）
    // 一律在主執行緒（A/B 比較用）
    const top = topRef.current;
    let optOut: string | null = new URLSearchParams(window.location.search).get('txw');
    try {
      optOut ??= localStorage.getItem('txw');
    } catch {
      // 讀不到 localStorage（隱私模式）就照預設
    }
    const wantWorker = optOut !== '0';
    const shared = wantWorker && top && typeof top.transferControlToOffscreen === 'function' ? workerHost(top) : null;
    shared?.bind(fx);
    const host: SceneHost = shared?.host ?? createLocalHost(ctx, PAINT, fx);
    // 換配色、主題：worker 那邊讀不到這裡的 PAINT，照樣通知
    const offPalette = onPalette(() => host.restyle(PAINT));
    const offTheme = onTheme(() => host.restyle(PAINT));

    /** keep：馬上要接著跑新的一趟（轉場中又換頁），場景先別收，宿主要從它接 */
    const finish = (r: Run, keep = false) => {
      r.anim?.cancel();
      r.anim = null;
      setSkyFlight(null);
      r.main.style.clipPath = '';
      r.main.style.transform = '';
      r.main.style.opacity = '';
      r.main.style.transition = '';
      delete root.dataset.pt;
      setRejoining(false);
      // 星空停在鏡頭最後的位置，不歸位（歸位那一下會像整片背景被拉回去）
      const cam = host.state?.cam ?? { x: 0, y: 0 };
      skyBase = { x: skyBase.x - cam.x * SKY_PARALLAX, y: skyBase.y - cam.y * SKY_PARALLAX };
      setSkyPan(skyBase.x, skyBase.y);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (run === r) {
        run = null;
        if (!keep) host.end();
        setTransitionDot(null);
      }
    };

    /** 新的一頁報到了：讀它的錨點與它給的最後一段路，交給場景排路線 */
    const planInput = (r: Run): PlanInput => {
      const page = currentPage();
      const fresh = page.generation !== r.oldGeneration ? page.handle : null;
      // 摺疊機摺起來時，落點若在摺痕上就挪到那一半的中間（lib/viewportFold）
      const anchor = offCrease(fresh?.anchor?.() ?? defaultAnchor(r.main), currentFold());
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 頁面挑最後一段路時，點的位置是鏡頭開始煞停那一刻它在畫面上的位置：正中間
      const arrival = r.quiet ? null : (fresh?.arrive?.({ pos: { x: w / 2, y: h / 2 }, vel: { x: 0, y: 0 } }) ?? null);
      return { anchor, arrival, w, h, ring: root.dataset.bootRing === 'grow' };
    };

    /** quiet 那一趟的落點：頁面那條線的終點（它現在的那一點），沒有線就是錨點。會動的（作品頁的月亮）也追得上 */
    const quietLive = (r: Run) => {
      const page = currentPage();
      return page.handle?.rejoin?.()?.at(-1) ?? page.handle?.anchor?.() ?? defaultAnchor(r.main);
    };

    /** quiet 那一趟現在的路：從出發點接上頁面的線，或直接到落點。頁面的線會動，每一幀重讀 */
    const quietRoute = (r: Run, from: Pt) => {
      const page = currentPage();
      const line = page.handle?.rejoin?.() ?? null;
      const points = [from, ...(line && line.length > 1 ? line : [quietLive(r)])];
      const pace = line && line.length > 1 ? page.handle?.rejoinPace : undefined;
      return { route: { points, cum: cumulative(points) }, pace };
    };

    const frame = (now: number) => {
      const r = run;
      const sr = host.state;
      if (!r || !sr) return;
      raf = requestAnimationFrame(frame);
      // 幀與幀之間隔多久：主執行緒卡住（新的一頁掛上去）的那一下會在這裡變成一個長幀
      // 這一幀的間隔記在間隔當中的那一段（這一幀還沒改 phase）
      if (r.prevFrame) {
        const d = now - r.prevFrame;
        r.frames++;
        r.maxFrame = Math.max(r.maxFrame, d);
        r.phaseMax[sr.phase] = Math.max(r.phaseMax[sr.phase], d);
        if (d > 50) r.longFrames++;
      }
      r.prevFrame = now;
      if (r.marked !== sr.phase) {
        performance.mark(`transition:${sr.phase}`);
        r.marked = sr.phase;
      }
      try {
        if (now - r.t0 > RUN_LIMIT_MS) throw new Error('換頁轉場跑太久');
        fit();
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        // 舊頁留下的線：飛的時候接著畫（跟彗尾一樣照鏡頭位移），長的時候跟著新的一頁淡掉
        const residue = r.residue;
        if (residue && sr.phase !== 'leave') {
          const fadeOut = sr.phase === 'grow' ? 1 - clamp((now - sr.growAt) / GROW_MS) : 1;
          if (fadeOut > 0) {
            ctx.save();
            ctx.translate(-sr.cam.x, -sr.cam.y);
            ctx.globalAlpha = fadeOut;
            residue(ctx);
            ctx.restore();
          }
        }
        // 新的一頁報到了（或等太久）：讀它的錨點與路，交給場景排這一趟
        if (sr.phase === 'fly' && !r.quiet && !sr.planned) {
          const page = currentPage();
          const rendered =
            page.generation !== r.oldGeneration ||
            r.main.firstElementChild !== r.oldFirst ||
            (r.resolvedAt > 0 && now - r.resolvedAt > 32);
          if (rendered || now - sr.launchAt > WAIT_LIMIT_MS) host.plan(planInput(r), now);
        }
        // 頁面給的那一點：收的時候一直跟著它，之後只在場景的 followUntil 之前讀
        const follow = r.follow && (sr.phase === 'leave' || now < sr.followUntil) ? r.follow() : null;
        host.frame(now, {
          w: window.innerWidth,
          h: window.innerHeight,
          follow,
          quiet: r.quiet ? quietRoute(r, sr.from) : null,
        });
        if (host.done) {
          cancelAnimationFrame(raf);
          // 正常跑完才上報（出錯、被下一次換頁打斷、元件卸載都不算）
          if (r.report) {
            // 點在 worker 裡畫的話，照 worker 的幀算（看得到的是它）
            const own = { frames: r.frames, maxFrame: r.maxFrame, long: r.longFrames, phases: { ...r.phaseMax } };
            reportTransition({ ...r.report, ms: now - r.t0, ...(host.stats ?? own) });
          }
          finish(r);
        }
      } catch (err) {
        // 哪一頁的錨點、收的動畫出了錯：轉場直接收掉，頁面照常顯示，不會卡著一個點、整頁平移在半路
        console.error('[TransitionLayer]', err);
        cancelAnimationFrame(raf);
        finish(r);
      }
    };

    // 開場（html[data-boot]，見 __root.tsx 與 index.css 的 #boot）：等這一頁畫好、字與資源載完，
    // 畫滿那一圈，夜色中間那顆點就是這一趟的點——從畫面正中間飛向這一頁的錨點，跟站內換頁同一個動作。
    // 等太久（網路慢）也不卡：最多等 BOOT_WAIT_MS 就飛
    const bootAbort = new AbortController();
    let bootTimer = 0;
    let bootRingRaf = 0;
    /** 3D 土星在畫面上的「一個單位」（星球半徑）是幾 px；首頁交棒時才有 */
    let bootRingUnit = 0;
    const endBoot = () => {
      cancelAnimationFrame(bootRingRaf);
      root.removeAttribute('data-boot');
      delete root.dataset.bootRing;
      delete root.dataset.bootCollapse;
      const boot = document.getElementById('boot');
      for (const name of [
        '--boot-ring-dx',
        '--boot-ring-dy',
        '--boot-ring-size',
        '--boot-ring-a',
        '--boot-ring-back-a',
        '--boot-planet-r',
        '--boot-photon-a',
      ]) {
        boot?.style.removeProperty(name);
      }
    };
    // 小環跟著 3D 土星實際長到哪裡走（store/homeOrbit 的 latestSaturnGrow，3D 每畫一幀回報一次）：
    // 星球長出來時先追到星球表面那麼大、一直在星球外面，3D 的環從星球表面攤開時兩道一樣大，
    // 3D 的環亮起來多少、小環就淡多少。後半圈在星球後面的那段照星球此刻的大小挖掉
    // （index.css 的 --boot-planet-r），不會畫在星球表面上。3D 還沒開始長之前小環就停在原地等；
    // 一直等不到（3D 沒起來）就照同一張時間表（lib/saturnSpec 的 saturnGrowAt）自己長完
    const growBootRing = () => {
      // 逐幀的變數寫在 #boot 上，不寫在 <html>：根元素上的自訂屬性一變，整頁的樣式都要重算
      const boot = document.getElementById('boot');
      if (!boot) return;
      const start = performance.now();
      const step = (now: number) => {
        const reported = latestSaturnGrow();
        const alone = (now - start - BOOT_RING_ALONE_MS) / 1000;
        const { planet, ring } =
          reported && reported.at >= start ? reported : alone > 0 ? saturnGrowAt(alone) : { planet: 0, ring: 0 };
        const target = BOOT_RING_PERSPECTIVE * bootRingUnit * (1 + (RING_OUTER - 1) * ring);
        // 黑洞與參宿四：開場的光子環（恆星的輪廓）一直貼著 3D 那圈的實際大小——3D 還比它小時它留在原處等，追上之後一起長
        // （照吸積盤外緣的比例放大的話，交棒那一下畫面上會同時有兩圈光子環）
        const r =
          PLANETS[THEME].kind !== 'planet'
            ? Math.max(BOOT_RING_R, BOOT_RING_PERSPECTIVE * bootRingUnit * RING_OUTER * planet)
            : BOOT_RING_R + (target - BOOT_RING_R) * clamp(planet / BOOT_RING_CATCH);
        boot.style.setProperty('--boot-ring-size', `${(r / BOOT_RING_R) * BOOT_RING_BOX}px`);
        boot.style.setProperty('--boot-ring-a', (1 - ring).toFixed(3));
        boot.style.setProperty('--boot-ring-back-a', (0.7 * (1 - ring)).toFixed(3));
        boot.style.setProperty('--boot-planet-r', `${(bootRingUnit * planet).toFixed(1)}px`);
        // 黑洞：兩圈光子環合起來之後開場那圈很快淡掉——它疊在最上層，3D 那圈的下半段被盤擋住，它不會
        boot.style.setProperty('--boot-photon-a', (1 - clamp((planet - 0.35) / 0.12)).toFixed(3));
        if (ring < 1) bootRingRaf = requestAnimationFrame(step);
        else endBoot();
      };
      cancelAnimationFrame(bootRingRaf);
      bootRingRaf = requestAnimationFrame(step);
    };
    /**
     * 一趟「點從 center 出發、飛到這一頁的錨點、這一頁接手進場」：開場與主題出場之後（arriveFrom）都用它。
     * 這一頁早就報到了（oldGeneration −1：當成「新的一頁已經在」），第一幀就排路線
     */
    const arrivalRun = (center: Pt, main: HTMLElement, now: number, quiet = false): Run => {
      const r: Run = {
        main,
        follow: null,
        residue: null,
        t0: now,
        oldFirst: null,
        // 這一頁早就報到了：當成「新的一頁已經在」，第一幀就排路線
        oldGeneration: -1,
        resolvedAt: 0,
        quiet,
        report: null,
        prevFrame: 0,
        frames: 0,
        maxFrame: 0,
        longFrames: 0,
        phaseMax: { leave: 0, fly: 0, grow: 0 },
        marked: null,
        anim: null,
      };
      // quiet：落地之後點跟著頁面那條線的終點（會動的也追得上）
      if (quiet) r.follow = () => quietLive(r);
      host.begin(
        {
          phase: 'fly',
          t0: now,
          from: center,
          vel: { x: 0, y: 0 },
          followUntil: 0,
          trail: [{ ...center, t: now }],
          dust: [],
          carried: true,
          quiet,
        },
        false,
      );
      return r;
    };

    // 主題出場之後接回這一頁（store/pageTransition 的 arriveFrom）：點從那一點飛回錨點、這一頁接手進場
    setArrive((from, opts) => {
      const main = mainOf();
      if (!main || run || reduce.matches) return false;
      // 先藏起來再拿掉裁切：路線在下一幀才排（那時才設透明度），不然這一頁會整頁閃一下
      main.style.transition = 'none';
      main.style.opacity = '0';
      main.style.clipPath = '';
      run = arrivalRun(from, main, performance.now(), Boolean(opts?.quiet));
      root.dataset.pt = 'fly';
      setRejoining(run.quiet);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      return true;
    });

    const enter = async () => {
      if (!root.hasAttribute('data-boot')) return;
      const quick = root.dataset.boot === 'quick';
      const loaded = new Promise<void>((resolve) => {
        if (document.readyState === 'complete') resolve();
        else window.addEventListener('load', () => resolve(), { once: true, signal: bootAbort.signal });
      });
      // 兩幀：這一頁的元件掛上、量得到錨點
      const painted = new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      // 首頁：3D 的土星畫出第一幀才算載完（環要交棒給它）。確定沒有 GPU（html.no-gpu）就不等
      const home = stripLocalePrefix(window.location.pathname) === '';
      // 用物件記：在 then 裡改一個 let，型別檢查看不到，會把後面的判斷當成永遠是 false
      const sky = { ready: false };
      const skyDrawn = home
        ? saturnDrawn(bootAbort.signal).then(() => {
            sky.ready = true;
          })
        : Promise.resolve();
      // 記下最後等到的是哪一項（上報 BOOT 時帶著）：讀者那端慢在 JS 晚到、圖片、字型還是 3D，
      // 實驗室重現不了，只能從實地資料看
      const startedAt = performance.now();
      const wait = { last: 'none', done: false };
      const waitFor = (p: Promise<unknown>, name: string) =>
        p.then(() => {
          wait.last = name;
        });
      await Promise.race([
        Promise.all([
          waitFor(loaded, 'load'),
          waitFor(document.fonts.ready, 'fonts'),
          waitFor(painted, 'paint'),
          waitFor(skyDrawn, 'sky'),
        ]).then(() => {
          wait.done = true;
        }),
        after(BOOT_WAIT_MS),
      ]);
      const waitedAt = performance.now();
      // 第一次來的人多停一下，看得到那顆點在呼吸（performance.now() 從這次載入開始算）
      await after(Math.max(0, (quick ? BOOT_QUICK_MS : BOOT_MIN_MS) - performance.now()));
      // 畫滿那一圈（lib/bootRing：交給合成器轉，主執行緒忙也照樣走）
      window.__bootP?.(1);
      await after(BOOT_CLOSE_MS);
      // 首頁、3D 的土星已經畫出來：開場那道行星環長大到 3D 土星環的位置與大小，跟它交棒（index.css 的 #boot）。
      // 別頁、沒有 3D、等太久 3D 還沒好：環先收回點裡（index.css 的 data-boot-collapse），點再飛出去，
      // 跟換頁時土星收成一點是同一個動作
      const handoff = home && sky.ready && !root.classList.contains('no-gpu');
      if (!handoff && !reduce.matches) {
        root.dataset.bootCollapse = '';
        await after(BOOT_COLLAPSE_MS);
      }
      const main = mainOf();
      if (bootAbort.signal.aborted) return;
      if (!main || reduce.matches || run) {
        endBoot();
        return;
      }
      // 從開場那顆點的高度起飛（直拿時它在畫面中間偏上，見 index.css 的 --boot-cy）。
      // 橫的不能用量到的：#boot 與 3D 畫布的寬度扣掉了捲軸（html 是 overflow-y: scroll），
      // 這裡的座標卻是照整個視窗寬（innerWidth）算、再拉到那個寬度上畫的，量到的中心會少半條捲軸寬，
      // 點就會往右滑那幾 px、環跟著偏掉，落點跟 3D 土星錯開
      const dot = document.querySelector('.boot-dot')?.getBoundingClientRect();
      const center = { x: window.innerWidth / 2, y: dot ? dot.top + dot.height / 2 : window.innerHeight / 2 };
      bootOrigin = center;
      const r = arrivalRun(center, main, performance.now());
      run = r;
      if (handoff) {
        const ring = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold(), RING_OUTER);
        bootRingUnit = ring.r / RING_OUTER;
        // 環的位置不在這裡定：它套在點上跟著走（track），點落在土星中心（首頁的錨點）時剛好就位
        root.dataset.bootRing = 'grow';
      }
      root.dataset.pt = 'fly';
      root.dataset.boot = 'out';
      reportBoot({
        at: performance.now(),
        end: handoff ? 'ring' : 'collapse',
        startedAt,
        waitedAt,
        waitedFor: wait.done ? wait.last : 'cap',
      });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      // 首頁交棒時夜色淡掉、環留著，等這一頁開始長（3D 土星開始長）才長大淡掉，見下面的 grow；
      // 萬一一直沒等到（換頁被打斷），晚一點照樣收掉
      bootTimer = window.setTimeout(endBoot, root.dataset.bootRing ? BOOT_RING_WAIT_MS : BOOT_FADE_MS);
    };
    void enter();

    const unblock = router.history.block({
      enableBeforeUnload: false,
      blockerFn: async ({ currentLocation, nextLocation, action }) => {
        const a = stripLocalePrefix(currentLocation.pathname);
        const b = stripLocalePrefix(nextLocation.pathname);
        const main = mainOf();
        // 只換語系、進出後台、文章換文章、要求減少動態：不演
        if (
          a === b ||
          a.startsWith('admin') ||
          b.startsWith('admin') ||
          (ARTICLE.test(a) && ARTICLE.test(b)) ||
          reduce.matches ||
          !main
        ) {
          takeTransitionFrom();
          return false;
        }
        // 轉場還沒跑完又換頁：不丟掉那個點，從它現在的位置、帶著它現在的速度接一趟新的；
        // 這一頁（不管收到哪裡、長到哪裡）用遮罩收進那一點，上一趟的彗尾與塵埃帶過來照樣散完
        // （彗尾、塵埃與速度由宿主自己接，見 lib/transition/host 的 carried）
        const prev = host.state;
        const carry = run && prev ? { point: { ...prev.screen } } : null;
        if (run && carry) {
          cancelAnimationFrame(raf);
          finish(run, true);
        }
        const page = currentPage();
        const mark = takeTransitionFrom();
        // 收的同時先把下一頁的資料抓起來，收完換頁時它多半已經好了
        void router
          .preloadRoute({ href: nextLocation.href } as Parameters<typeof router.preloadRoute>[0])
          .catch(() => undefined);
        const mine = ++epoch;
        const alive = () => epoch === mine;
        const departure = carry
          ? defaultLeave(main, carry.point, alive)
          : (page.handle?.leave?.({ from: mark?.pt ?? null, source: mark?.source ?? null, to: b }) ??
            defaultLeave(main, mark?.pt ?? page.handle?.anchor?.() ?? defaultAnchor(main), alive));
        const t0 = performance.now();
        const r: Run = {
          main,
          follow: departure.follow ?? null,
          residue: departure.residue ?? null,
          t0,
          oldFirst: null,
          oldGeneration: 0,
          resolvedAt: 0,
          quiet: false,
          report: { from: currentLocation.pathname, to: nextLocation.pathname },
          prevFrame: 0,
          frames: 0,
          maxFrame: 0,
          longFrames: 0,
          phaseMax: { leave: 0, fly: 0, grow: 0 },
          marked: null,
          anim: null,
        };
        host.begin(
          {
            phase: 'leave',
            t0,
            from: departure.point,
            // 頁面沒給方向（收進中心、預設的遮罩）：往左上慢慢滑出去——大部分頁面的錨點在左上的標題，
            // 新的一頁還沒好的時候點也不會停在原地等
            vel: departure.velocity ?? { x: -0.24, y: -0.32 },
            followUntil: t0 + (departure.followMs ?? 0),
            trail: [{ ...departure.point, t: t0 }],
            dust: [],
            carried: carry !== null,
            quiet: false,
          },
          carry !== null,
        );
        run = r;
        root.dataset.pt = 'leave';
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
        // 頁面的收最久等 0.8 秒：換頁不能被一個沒收完的動畫卡住
        await Promise.race([departure.done, after(800)]);
        // 收到一半又換了一次頁：畫面交給新的那一趟，這一次的換頁要不要放行看是哪一種——
        //   點連結（PUSH / REPLACE）：作廢。放行的話它會比新的那一次晚推進歷史，網址被蓋回這一頁
        //   上一頁、下一頁：放行。瀏覽器已經先動了，擋下來的話歷史會被倒回去一格
        if (run !== r) return action === 'PUSH' || action === 'REPLACE';
        // 先把舊的藏起來再拿掉遮罩，舊頁不會閃回來一幀
        root.dataset.pt = 'out';
        main.style.clipPath = '';
        host.release(performance.now());
        r.oldGeneration = currentPage().generation;
        r.oldFirst = main.firstElementChild;
        return false;
      },
    });

    // 同一個元件換資料（例如文章換一篇）時 generation 與 main 的第一個子元素都不會變，
    // 用路由「這次換頁處理完了」當作新的一頁已經畫好的訊號
    const unsubscribe = router.subscribe('onResolved', () => {
      if (run && host.state?.phase === 'fly') run.resolvedAt = performance.now();
      // 沒有轉場在跑：確定畫面上沒有任何轉場留下的東西（平移、遮罩、半透明、畫布上的點）
      if (!run) {
        const main = mainOf();
        if (main) {
          main.style.clipPath = '';
          main.style.transform = '';
          main.style.opacity = '';
          main.style.transition = '';
        }
        delete root.dataset.pt;
        ctx.clearRect(0, 0, cv.width, cv.height);
      }
    });

    return () => {
      setArrive(null);
      bootAbort.abort();
      window.clearTimeout(bootTimer);
      cancelAnimationFrame(bootRingRaf);
      unblock();
      unsubscribe();
      document.removeEventListener('click', onClick, true);
      cancelAnimationFrame(raf);
      if (run) finish(run);
      offPalette();
      offTheme();
      // worker 那個沿用（canvas 交不了第二次），只收掉這一趟
      if (shared) host.end();
      else host.dispose();
    };
  }, [router]);

  // 下面那張畫頁面留下的線（residue，頁面自己的畫法，留在主執行緒）；上面那張是點與彗尾（場景，可能交給 worker）
  return (
    <>
      <canvas ref={canvasRef} className="pt-canvas" aria-hidden="true" />
      <canvas ref={topRef} className="pt-canvas" aria-hidden="true" />
    </>
  );
}
