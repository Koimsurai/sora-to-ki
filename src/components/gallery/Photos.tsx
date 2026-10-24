// 照片：一座地面站。在太空拍的照片要經過一趟傳輸才看得到——相機把畫面轉成 0 和 1，天線把訊號送回地球，
// 深空網路的巨型天線接住，再解碼、上色（gallery/downlink）。每一張照片第一次進到畫面時，先是一片 0 與 1，
// 接著一行一行收成黑白，最後一道掃過去把顏色映射回來；收完就只剩一般的圖。
// 頁首是地面站與遠處的探測器、收到幾格、各鏡頭幾張，下面一條是每個月收到幾張。點一張打開檢視器。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { Masonry } from 'masonic';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { after, isArriving } from '@/store/pageTransition';
import { openViewerAtom, photosAtom } from '@/store/photoStore';
import { createStation, drawPasses, noiseUrls, RX_PHASES, RX_TOTAL, rxStage } from './downlink';
import { framesOf, overview, type Frame } from './frames';
import PhotoViewer from './PhotoViewer';
import './Photos.css';
import { sameTitle } from '@/lib/pageTitle';

/** 一欄至少多寬（像素）：照片牆鋪滿整頁，寬螢幕五欄左右、手機一欄 */
const COLUMN_PX = 320;
/** 照片進畫面多少才開始接收 */
const RX_THRESHOLD = 0.35;
/** 同時最多收幾張：其他的排隊（一整排同時開始太吵，也像一格一格在下傳） */
const RX_MAX = 6;
/** 排隊的超過這麼多張時，每一張收快一點（最快幾倍），不然一整個畫面要等很久才收完 */
const RX_RUSH_AT = 4;
const RX_RUSH_MAX = 2;
/** 遙測那一行（RX 42%）多久更新一次（毫秒）：動畫本身交給 CSS，這裡只換字 */
const RX_STATUS_MS = 100;
/** 一次最多讓幾張開始收：同一刻開始的太多，看起來像一整片一起閃 */
const RX_BEGIN_PER_TICK = 2;
/** 地面站的畫布多久畫一次（毫秒）：動得很慢，30fps 就夠 */
const STATION_FRAME_MS = 33;
/** 進場：琥珀點沿訊號路徑走的那一段分幾格；落進天線後饋源亮多久、整頁收下來要多久（毫秒） */
const SIGNAL_STEPS = 16;
const CAUGHT_MS = 1200;
const REVEAL_MS = 1100;
/** 退場：照片先退成黑白、再一行一行收回去（毫秒）；點發射出去的速度（px/ms） */
const EXIT_GRAY_MS = 220;
const EXIT_COVER_MS = 520;
const EXIT_MS = EXIT_GRAY_MS + EXIT_COVER_MS + 60;
const LAUNCH_SPEED = 1.1;

/** 整頁遮罩收與蓋的緩動（ease-in-out 的三次方那條） */
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
/** masonic 捲動時會在整個格子上掛 will-change: contents，正在收的那幾格會被重新分層、閃一下；固定成 auto */
const MASONRY_STYLE = { willChange: 'auto' } as const;

/** 這次瀏覽已經收過的：虛擬清單捲回來會重新掛上，收過的直接顯示，不再收一次 */
const received = new Set<string>();
/** 收到一半的收到哪裡（秒）：卡片被虛擬清單卸下又掛回來時接著收，不從頭再來一次 */
const progress = new Map<string, number>();

/** 畫布上的等寬字：讀一次 CSS 變數就記住（每張卡片都去讀的話，捲動時會一直重算樣式） */
let monoFamily: string | null = null;
const monoFont = (px: number) => {
  monoFamily ??= getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim() || 'monospace';
  return `${px}px ${monoFamily}`;
};

/** 雜訊貼圖的字級；這支模組一載進來就先開始編，換頁飛進來時遮罩上已經有 0 與 1 */
const NOISE_FONT_PX = 9;
if (typeof document !== 'undefined') void noiseUrls(monoFont(NOISE_FONT_PX));

/** 一張正在收（或排隊等著收）的照片 */
interface RxJob {
  /** 開始收；speed 是這一張收得比平常快幾倍 */
  begin: (speed: number) => void;
  /** 換一次遙測的字；回傳 true 表示收完了 */
  step: () => boolean;
}

/**
 * 接收的排程：同時最多收 RX_MAX 張，照進畫面的先後排隊。接收本身是 CSS 動畫（只動 transform 與
 * opacity，交給合成器，捲動時也不卡主執行緒），這裡只管誰先誰後、以及每隔一下換遙測的字
 */
const rx = (() => {
  const waiting: RxJob[] = [];
  const active = new Set<RxJob>();
  let timer = 0;
  const tick = () => {
    timer = 0;
    for (const job of active) if (job.step()) active.delete(job);
    let begun = 0;
    while (active.size < RX_MAX && waiting.length > 0 && begun < RX_BEGIN_PER_TICK) {
      const job = waiting.shift();
      if (!job) break;
      job.begin(Math.min(RX_RUSH_MAX, 1 + Math.max(0, waiting.length - RX_RUSH_AT) / RX_RUSH_AT));
      active.add(job);
      begun++;
    }
    if ((active.size > 0 || waiting.length > 0) && timer === 0) timer = window.setTimeout(tick, RX_STATUS_MS);
  };
  const kick = () => {
    if (timer === 0) timer = window.setTimeout(tick, 0);
  };
  return {
    /** first：收到一半被卸下又掛回來的，插到隊伍最前面 */
    add(job: RxJob, first = false) {
      if (first) waiting.unshift(job);
      else waiting.push(job);
      kick();
    },
    remove(job: RxJob) {
      const i = waiting.indexOf(job);
      if (i >= 0) waiting.splice(i, 1);
      active.delete(job);
    },
  };
})();

/** 接收動畫的時間點（0 到 1）：第 sec 秒在整段裡的位置 */
const at = (sec: number) => sec / RX_TOTAL;

/**
 * 一層從某一邊一點一點露出來：外層往反方向推出去、內層推回來（內容就不會跟著滑），
 * 兩層只動 transform。from 與 to 是開始與露完的秒數
 */
function reveal(outer: HTMLElement, inner: HTMLElement, axis: 'X' | 'Y', from: number, to: number) {
  const timing: KeyframeAnimationOptions = { duration: RX_TOTAL * 1000, fill: 'both', easing: 'linear' };
  const frames = (sign: 1 | -1) => [
    { transform: `translate${axis}(${sign * 100}%)`, offset: 0 },
    { transform: `translate${axis}(${sign * 100}%)`, offset: at(from) },
    { transform: `translate${axis}(0)`, offset: at(to) },
    { transform: `translate${axis}(0)`, offset: 1 },
  ];
  return [outer.animate(frames(-1), timing), inner.animate(frames(1), timing)];
}

/** 掃描線：那一段的時候亮著，其他時候不見 */
function line(el: HTMLElement, from: number, to: number) {
  return el.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: at(from) },
      { opacity: 1, offset: Math.min(1, at(from) + 0.01) },
      { opacity: 1, offset: Math.max(0, at(to) - 0.01) },
      { opacity: 0, offset: at(to) },
      { opacity: 0, offset: 1 },
    ],
    { duration: RX_TOTAL * 1000, fill: 'both' },
  );
}

/** 一格畫面：還沒收過的，進畫面時排隊收一次；收完（或收過）就是一般的圖 */
function FrameCard({ data, width, onOpen }: { data: Frame; width: number; onOpen: (f: Frame) => void }) {
  const { t } = useTranslation();
  const { photo } = data;
  const [done, setDone] = useState(() => received.has(photo.id));
  const boxRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rxRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const height = Math.round(width / photo.aspectRatio);

  useEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    const layer = rxRef.current;
    if (done || !box || !img || !layer) return;
    let raf = 0;
    const finish = () => {
      received.add(photo.id);
      progress.delete(photo.id);
      raf = requestAnimationFrame(() => setDone(true));
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return () => cancelAnimationFrame(raf);
    }
    const part = (name: string) => layer.querySelector<HTMLElement>(`.ph-rx-${name}`);
    const gray = part('gray');
    const grayIn = part('gray > span');
    const color = part('color');
    const colorIn = part('color > span');
    const scanLine = part('scan');
    const sweepLine = part('sweep');
    if (!gray || !grayIn || !color || !colorIn || !scanLine || !sweepLine) return;
    const status = statusRef.current;
    let anims: Animation[] = [];
    const job: RxJob = {
      begin: (speed) => {
        layer.classList.add('is-on');
        anims = [
          ...reveal(gray, grayIn, 'Y', RX_PHASES.scan[0], RX_PHASES.scan[1]),
          ...reveal(color, colorIn, 'X', RX_PHASES.color[0], RX_PHASES.color[1]),
          line(scanLine, RX_PHASES.scan[0], RX_PHASES.scan[1]),
          line(sweepLine, RX_PHASES.color[0], RX_PHASES.color[1]),
        ];
        const resume = (progress.get(photo.id) ?? 0) * 1000;
        for (const a of anims) {
          a.playbackRate = speed;
          a.currentTime = resume;
        }
      },
      step: () => {
        const first = anims.at(0);
        if (!first) return false;
        const ms = Number(first.currentTime ?? 0);
        const sec = ms / 1000;
        progress.set(photo.id, sec);
        if (first.playState === 'finished' || sec >= RX_TOTAL) {
          finish();
          return true;
        }
        if (status) {
          const { stage, scan } = rxStage(sec);
          const kbps = (2 + Math.sin(sec * 7) * 0.6).toFixed(1);
          status.textContent =
            stage === 'acquire'
              ? 'ACQUIRING SIGNAL…'
              : stage === 'rx'
                ? `RX ${Math.round(scan * 100)}% · ${kbps} kbps`
                : 'DECODED · COLOR MAPPING';
        }
        return false;
      },
    };
    // 圖要先載好、接收那幾層的圖也先解碼完才排隊：沒解碼完的圖，捲動中瀏覽器會先畫一幀空的（那幾層滑進來時閃一下）。
    // 載不到就不收了，直接顯示一般的 <img>（它自己會顯示載不到的樣子）
    let alive = true;
    const queue = () => {
      if (img.naturalWidth === 0) {
        finish();
        return;
      }
      const decoding = [img, ...layer.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined));
      void Promise.all(decoding).then(() => {
        if (alive) rx.add(job, progress.has(photo.id));
      });
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (img.complete) queue();
        else {
          img.addEventListener('load', queue, { once: true });
          img.addEventListener('error', finish, { once: true });
        }
      },
      { threshold: RX_THRESHOLD },
    );
    io.observe(box);
    return () => {
      alive = false;
      io.disconnect();
      rx.remove(job);
      // 收到一半被卸下：記住收到哪裡（掛回來時接著收）
      const first = anims.at(0);
      if (first && first.playState !== 'finished') progress.set(photo.id, Number(first.currentTime ?? 0) / 1000);
      for (const a of anims) a.cancel();
      cancelAnimationFrame(raf);
      img.removeEventListener('load', queue);
      img.removeEventListener('error', finish);
    };
  }, [done, photo.id]);

  return (
    <button
      ref={boxRef}
      type="button"
      className="ph-frame"
      onClick={() => onOpen(data)}
      aria-label={t('photos.frame', { date: data.date || data.no })}
    >
      {/* 圖一開始就在（先藏著、先解碼）；接收是疊在上面的幾層，收完拿掉、圖直接露出來 */}
      <span className="ph-shot" style={{ height }}>
        <img
          ref={imgRef}
          className={done ? undefined : 'is-pending'}
          src={photo.thumbnailUrl}
          alt=""
          width={width}
          height={height}
          decoding="async"
        />
        {!done && (
          <span ref={rxRef} className="ph-rx" aria-hidden="true">
            <span className="ph-rx-noise" />
            <span className="ph-rx-noise is-b" />
            {/* 掃描線放在那一層裡面、貼著它露出來的那一邊，跟著一起走。這兩張圖 decoding="sync"：滑進來的那一幀一定要畫得出來 */}
            <span className="ph-rx-gray">
              <span>
                <img src={photo.thumbnailUrl} alt="" decoding="sync" />
              </span>
              <i className="ph-rx-scan" />
            </span>
            <span className="ph-rx-color">
              <span>
                <img src={photo.thumbnailUrl} alt="" decoding="sync" />
              </span>
              <i className="ph-rx-sweep" />
            </span>
          </span>
        )}
      </span>
      <span className="ph-tel" aria-hidden="true">
        <span>
          <b>FRAME {data.no}</b>
          {data.date && ` · ${data.date}`}
        </span>
        <span>{data.exposure || '—'}</span>
        <span ref={statusRef} className={done ? undefined : 'is-live'}>
          {done ? [data.lens, 'RECEIVED'].filter(Boolean).join(' · ') : 'STANDBY'}
        </span>
      </span>
    </button>
  );
}

export default function Photos() {
  const { t } = useTranslation();
  const setPhotos = useSetAtom(photosAtom);
  const openViewer = useSetAtom(openViewerAtom);
  const { data: photos = [], isPending } = useQuery({
    queryKey: ['gallery', 'photos'],
    queryFn: loadPhotosManifest,
    staleTime: 10 * 60 * 1000,
  });
  const frames = useMemo(() => framesOf(photos), [photos]);
  const stats = useMemo(() => overview(frames), [frames]);

  // 檢視器左右翻的順序跟頁面一樣（新到舊）
  useEffect(() => {
    setPhotos(frames.map((f) => f.photo));
  }, [frames, setPhotos]);

  const stationRef = useRef<HTMLCanvasElement>(null);
  const passesRef = useRef<HTMLCanvasElement>(null);
  const station = useMemo(() => createStation(), []);

  const pageRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  /** 換頁轉場的點落進天線的時候（直接打開這頁就是第一幀）、開始離開的時候；-1 是還沒 */
  const phaseRef = useRef({ landedAt: -1, leavingAt: -1 });

  // 0 與 1 的雜訊貼圖：整頁遮罩與接收中的每一格拿它當背景（CSS 變數），兩張交替就是在閃。
  // 編好之前只有紙色，一樣蓋得住底下
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let live = true;
    void noiseUrls(monoFont(NOISE_FONT_PX)).then(([a, b]) => {
      if (!live) return;
      page.style.setProperty('--ph-noise-a', `url("${a}")`);
      page.style.setProperty('--ph-noise-b', `url("${b}")`);
    });
    return () => {
      live = false;
    };
  }, []);

  /** 地面站畫布上的一點換成視窗座標 */
  const onStation = (pick: (w: number, h: number, t: number) => { x: number; y: number }) => {
    const cv = stationRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const p = pick(r.width, r.height, performance.now() / 1000);
    return { x: r.left + p.x, y: r.top + p.y };
  };

  // 進場：琥珀點就是那道訊號，最後一段沿著「探測器 → 天線」落進饋源；
  // 退場：照片退成黑白、0 與 1 從底下一行一行收回去，點從探測器的天線發射出去
  usePageTransition({
    anchor: () => onStation((_w, h) => station.receiver(h)),
    arrive: () => {
      const from = onStation((w, _h, t) => station.transmitter(w, t));
      const to = onStation((_w, h) => station.receiver(h));
      if (!from || !to) return null;
      return {
        approach: Array.from({ length: SIGNAL_STEPS + 1 }, (_, i) => ({
          x: from.x + ((to.x - from.x) * i) / SIGNAL_STEPS,
          y: from.y + ((to.y - from.y) * i) / SIGNAL_STEPS,
        })),
      };
    },
    leave: () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const from = onStation((w, _h, t) => station.transmitter(w, t));
      const to = onStation((_w, h) => station.receiver(h));
      if (!from || !to) return null;
      phaseRef.current.leavingAt = performance.now();
      pageRef.current?.classList.add('is-leaving');
      // 往探測器的外側飛出去（從天線看過去的方向）
      const len = Math.hypot(from.x - to.x, from.y - to.y) || 1;
      return {
        point: from,
        velocity: { x: ((from.x - to.x) / len) * LAUNCH_SPEED, y: ((from.y - to.y) / len) * LAUNCH_SPEED },
        done: after(EXIT_MS),
        follow: () => onStation((w, _h, t) => station.transmitter(w, t)) ?? from,
      };
    },
  });

  // 地面站：探測器慢慢晃、訊號一圈一圈傳過來；捲出畫面就停
  useEffect(() => {
    const cv = stationRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phase = phaseRef.current;
    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(cv);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (phase.landedAt < 0 && !isArriving()) phase.landedAt = now;
      if (!visible || now - last < STATION_FRAME_MS) return;
      last = now;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const caught = phase.landedAt < 0 || reduce ? 0 : Math.max(0, 1 - (now - phase.landedAt) / CAUGHT_MS);
      station.draw(ctx, w, h, reduce ? 0 : now / 1000, phase.landedAt >= 0 && phase.leavingAt < 0, caught);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [station]);

  // 整頁的遮罩：點還在飛的時候除了地面站都還沒收到；落進天線後一道掃描線從上往下把整頁收下來；
  // 離開時從底下一行一行收回去。收與蓋都是 transform 動畫（交給合成器，跟螢幕同一個更新率），
  // 這裡每一幀只看「落地了沒、要走了沒」，以及遮罩還在的時候地面站那一條要挖掉多少
  useEffect(() => {
    const veil = veilRef.current;
    const sheet = veil?.querySelector<HTMLElement>('.ph-veil-sheet');
    const noise = veil?.querySelector<HTMLElement>('.ph-veil-noise');
    const edge = veil?.querySelector<HTMLElement>('.ph-veil-edge');
    if (!veil || !sheet || !noise || !edge) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phase = phaseRef.current;
    let state: 'cover' | 'reveal' | 'gone' | 'leave' = 'cover';
    let anims: Animation[] = [];
    let band = '';
    /**
     * 遮罩那一層往下（k 從 0 到 1）或往上滑；裡面的雜訊反方向推回來，0 與 1 對齊視窗不跟著掃描線滑。
     * 掃描線只在動的那一段亮著
     */
    const slide = (from: number, to: number, duration: number, delay: number) => {
      for (const a of anims) a.cancel();
      const timing: KeyframeAnimationOptions = { duration, delay, easing: EASE_IN_OUT, fill: 'both' };
      anims = [
        sheet.animate(
          [{ transform: `translateY(${from * 100}vh)` }, { transform: `translateY(${to * 100}vh)` }],
          timing,
        ),
        noise.animate(
          [{ transform: `translateY(${-from * 100}vh)` }, { transform: `translateY(${-to * 100}vh)` }],
          timing,
        ),
        edge.animate([{ opacity: 1 }, { opacity: 1 }], { duration, delay }),
      ];
      return anims[0];
    };
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (phase.leavingAt >= 0 && state !== 'leave') {
        state = 'leave';
        veil.hidden = false;
        slide(1, 0, EXIT_COVER_MS, EXIT_GRAY_MS);
      } else if (phase.landedAt >= 0 && state === 'cover') {
        state = 'reveal';
        if (reduce) {
          state = 'gone';
          veil.hidden = true;
        } else {
          // 收完就整個藏起來（不留著一層全螢幕的圖層）；被取消的話（還沒收完就要走）finished 會 reject，不用管
          void slide(0, 1, REVEAL_MS, 0)
            .finished.then(() => {
              if (state !== 'reveal') return;
              state = 'gone';
              veil.hidden = true;
            })
            .catch(() => undefined);
        }
      }
      if (state === 'gone') return;
      // 地面站那一條（整頁寬）不蓋：點要沿著訊號從探測器飛到天線，得看得到它們。
      // 換頁轉場時整頁在滑，遮罩跟著頁面走，所以換成遮罩自己的座標；位置變了才換遮色片
      const r = stationRef.current?.getBoundingClientRect();
      const o = veil.getBoundingClientRect();
      const next = r
        ? `linear-gradient(#000 ${Math.round(r.top - o.top)}px, transparent 0 ${Math.round(r.bottom - o.top)}px, #000 0)`
        : '';
      if (next !== band) {
        band = next;
        veil.style.maskImage = next;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const a of anims) a.cancel();
    };
  }, []);

  // 接收紀錄：資料或寬度變了才重畫
  useEffect(() => {
    const cv = passesRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const paint = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPasses(ctx, w, h, stats.passes, monoFont(10));
    };
    const ro = new ResizeObserver(paint);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [stats.passes]);

  const busiest = stats.passes.reduce<[string, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null);

  return (
    <div className="ph" ref={pageRef}>
      <div ref={veilRef} className="ph-veil" aria-hidden="true">
        <div className="ph-veil-sheet">
          <div className="ph-veil-noise">
            <div className="is-b" />
          </div>
          <i className="ph-veil-edge" />
        </div>
      </div>
      <header className="ph-head">
        <div className="ph-head-title">
          <h1>{t('photos.heading')}</h1>
          {!sameTitle(t('photos.heading'), 'Photos') && <span>Photos</span>}
        </div>
        <p>{t('photos.subtitle')}</p>
      </header>
      {/* 天線在最左、探測器在最右，訊號橫越整頁；中間下方是接收紀錄 */}
      <div className="ph-station">
        <canvas ref={stationRef} aria-label={t('photos.stationLabel')} />
        <span className="ph-station-name" aria-hidden="true">
          {t('photos.station')}
        </span>
        <div className="ph-log">
          <b>{isPending ? '—' : stats.total}</b>
          <span>FRAMES RECEIVED{stats.from && stats.to ? ` · ${stats.from} – ${stats.to}` : ''}</span>
          <div className="ph-log-rows">
            {stats.lenses.map(([lens, n]) => (
              <div key={lens} className="ph-log-row">
                <span>{lens}</span>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ph-passes">
        <canvas
          ref={passesRef}
          aria-label={
            busiest ? t('photos.passesLabel', { month: busiest[0].replace('-', '.'), count: busiest[1] }) : undefined
          }
        />
      </div>

      {isPending ? (
        <p className="ph-wait">ACQUIRING SIGNAL…</p>
      ) : (
        <Masonry
          items={frames}
          itemKey={(f: Frame) => f.photo.id}
          columnWidth={COLUMN_PX}
          maxColumnCount={6}
          style={MASONRY_STYLE}
          columnGutter={28}
          rowGutter={40}
          overscanBy={2}
          render={({ data, width }) => <FrameCard data={data} width={width} onOpen={(f) => openViewer(f.photo)} />}
        />
      )}
      <PhotoViewer />
    </div>
  );
}
