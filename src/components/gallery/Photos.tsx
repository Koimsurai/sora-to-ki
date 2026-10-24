// 照片：一座地面站。在太空拍的照片要經過一趟傳輸才看得到——相機把畫面轉成 0 和 1，天線把訊號送回地球，
// 深空網路的巨型天線接住，再解碼、上色（gallery/downlink）。每一張照片第一次進到畫面時，先是一片 0 與 1，
// 接著一行一行收成黑白，最後一道掃過去把顏色映射回來；收完就換成一般的圖。
// 頁首是地面站與遠處的探測器、收到幾格、各鏡頭幾張，下面一條是每個月收到幾張。點一張打開檢視器。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { Masonry } from 'masonic';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { isArriving } from '@/store/pageTransition';
import { openViewerAtom, photosAtom } from '@/store/photoStore';
import { createStation, drawPasses, drawReception, grayscaleOf, RX_TOTAL, rxStage } from './downlink';
import { framesOf, overview, type Frame } from './frames';
import PhotoViewer from './PhotoViewer';
import './Photos.css';

/** 一欄至少多寬（像素）：照片牆鋪滿整頁，寬螢幕五欄左右、手機一欄 */
const COLUMN_PX = 320;
/** 照片進畫面多少才開始接收 */
const RX_THRESHOLD = 0.35;
/** 同時最多收幾張：其他的排隊（一次收太多張，每一張都會變卡） */
const RX_MAX = 8;
/** 排隊的超過這麼多張時，每一張收快一點（最快幾倍），不然一整個畫面要等很久才收完 */
const RX_RUSH_AT = 4;
const RX_RUSH_MAX = 2;
/** 接收動畫多久畫一次（毫秒）：0 與 1 閃得太快會晃眼，30fps 剛好 */
const RX_FRAME_MS = 33;
/** 捲動停下來多久之後才接著收（毫秒）：捲的時候先停住，捲動本身才會順 */
const RX_SCROLL_REST_MS = 140;
/** 接收畫布最多幾倍解析度：0 與 1 的小字 1.5 倍就清楚，2 倍的畫布要多畫將近一倍的像素 */
const RX_DPR = 1.5;
/** 地面站的畫布多久畫一次（毫秒）：動得很慢，30fps 就夠 */
const STATION_FRAME_MS = 33;

/** 這次瀏覽已經收過的：虛擬清單捲回來會重新掛上，收過的直接顯示，不再收一次 */
const received = new Set<string>();

/** 畫布上的等寬字：讀一次 CSS 變數就記住（每張卡片都去讀的話，捲動時會一直重算樣式） */
let monoFamily: string | null = null;
const monoFont = (px: number) => {
  monoFamily ??= getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim() || 'monospace';
  return `${px}px ${monoFamily}`;
};

/** 一張正在收（或排隊等著收）的照片：每一幀往前收 dt 毫秒，回傳 true 表示收完了 */
interface RxJob {
  /** speed：這一張收得比平常快幾倍 */
  begin: (speed: number) => void;
  step: (dt: number) => boolean;
}

/**
 * 接收的排程：全部共用一個動畫迴圈，同時最多收 RX_MAX 張，照進畫面的先後排隊。
 * 每一張各跑一個 requestAnimationFrame 的話，捲快一點就有十幾個迴圈同時在畫。
 * 正在捲的時候整個停住（時間也不算），停下來才接著收
 */
const rx = (() => {
  const waiting: RxJob[] = [];
  const active = new Set<RxJob>();
  let raf = 0;
  let last = 0;
  let scrolledAt = -Infinity;
  if (typeof window !== 'undefined') {
    window.addEventListener(
      'scroll',
      () => {
        scrolledAt = performance.now();
      },
      { passive: true },
    );
  }
  const pump = () => {
    while (active.size < RX_MAX && waiting.length > 0) {
      const job = waiting.shift();
      if (!job) break;
      job.begin(Math.min(RX_RUSH_MAX, 1 + Math.max(0, waiting.length - RX_RUSH_AT) / RX_RUSH_AT));
      active.add(job);
    }
    if (active.size > 0 && raf === 0) raf = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    raf = 0;
    if (now - scrolledAt < RX_SCROLL_REST_MS) {
      last = 0;
    } else if (now - last >= RX_FRAME_MS) {
      // 剛從捲動停下來（或第一幀）：從一格的時間接著算，停住的那段不算
      const dt = last === 0 ? RX_FRAME_MS : Math.min(100, now - last);
      last = now;
      for (const job of active) if (job.step(dt)) active.delete(job);
      pump();
    }
    if (active.size > 0 && raf === 0) raf = requestAnimationFrame(tick);
  };
  return {
    add(job: RxJob) {
      waiting.push(job);
      pump();
    },
    remove(job: RxJob) {
      const i = waiting.indexOf(job);
      if (i >= 0) waiting.splice(i, 1);
      active.delete(job);
      pump();
    },
  };
})();

/** 一格畫面：還沒收過的，進畫面時排隊收一次；收完（或收過）就是一般的圖 */
function FrameCard({ data, width, onOpen }: { data: Frame; width: number; onOpen: (f: Frame) => void }) {
  const { t } = useTranslation();
  const { photo } = data;
  const [done, setDone] = useState(() => received.has(photo.id));
  const boxRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const height = Math.round(width / photo.aspectRatio);

  useEffect(() => {
    const box = boxRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (done || !box || !cv || !ctx) return;
    let raf = 0;
    const finish = () => {
      received.add(photo.id);
      raf = requestAnimationFrame(() => setDone(true));
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return () => cancelAnimationFrame(raf);
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = photo.thumbnailUrl;
    const font = monoFont(9);
    const status = statusRef.current;
    let sec = 0;
    let pace = 1;
    let gray: HTMLCanvasElement | null = null;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, RX_DPR);
    const job: RxJob = {
      begin: (speed) => {
        pace = speed;
        gray = grayscaleOf(img, w, h, dpr);
      },
      step: (dt) => {
        sec += (dt / 1000) * pace;
        if (sec >= RX_TOTAL || !gray) {
          finish();
          return true;
        }
        drawReception(ctx, img, gray, w, h, sec, font);
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
    // 圖要先載好才排隊；載不到就不收了，直接換成一般的 <img>（它自己會顯示載不到的樣子）
    const queue = () => {
      if (img.naturalWidth === 0) {
        finish();
        return;
      }
      // 排隊的時候先鋪一片 0 與 1（還在找訊號），不要是一格空白
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawReception(ctx, img, cv, w, h, 0, font);
      rx.add(job);
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
      io.disconnect();
      rx.remove(job);
      cancelAnimationFrame(raf);
      img.removeEventListener('load', queue);
      img.removeEventListener('error', finish);
    };
  }, [done, photo.id, photo.thumbnailUrl]);

  return (
    <button
      ref={boxRef}
      type="button"
      className="ph-frame"
      onClick={() => onOpen(data)}
      aria-label={t('photos.frame', { date: data.date || data.no })}
    >
      {/* 圖一開始就在（先藏著、先解碼），收完時畫布拿掉、圖直接露出來，換的那一下不會閃 */}
      <span className="ph-shot" style={{ height }}>
        <img
          className={done ? undefined : 'is-pending'}
          src={photo.thumbnailUrl}
          alt=""
          width={width}
          height={height}
          decoding="async"
        />
        {!done && <canvas ref={canvasRef} aria-hidden="true" />}
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

  // 換頁轉場的琥珀點落在探測器的天線上：訊號就是從那裡發出來的
  usePageTransition({
    anchor: () => {
      const cv = stationRef.current;
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      const p = station.transmitter(r.width, performance.now() / 1000);
      return { x: r.left + p.x, y: r.top + p.y };
    },
  });

  // 地面站：探測器慢慢晃、訊號一圈一圈傳過來；捲出畫面就停
  useEffect(() => {
    const cv = stationRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(cv);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
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
      station.draw(ctx, w, h, reduce ? 0 : now / 1000, !isArriving());
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [station]);

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
    <div className="ph">
      <header className="ph-head">
        <div className="ph-head-title">
          <h1>{t('photos.heading')}</h1>
          <span>Photos</span>
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
