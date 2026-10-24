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
import { createStation, drawPasses, drawReception, RX_TOTAL, rxStage } from './downlink';
import { framesOf, overview, type Frame } from './frames';
import PhotoViewer from './PhotoViewer';
import './Photos.css';

/** 一欄至少多寬（像素）：寬螢幕三欄、平板兩欄、手機一欄 */
const COLUMN_PX = 300;
/** 照片進畫面多少才開始接收 */
const RX_THRESHOLD = 0.35;
/** 同時進畫面的幾張錯開開始（毫秒），像一格一格排隊下傳 */
const RX_STAGGER_MS = 220;
/** 地面站的畫布多久畫一次（毫秒）：動得很慢，30fps 就夠 */
const STATION_FRAME_MS = 33;

/** 這次瀏覽已經收過的：虛擬清單捲回來會重新掛上，收過的直接顯示，不再收一次 */
const received = new Set<string>();
/** 下一張可以開始收的時間 */
let nextSlot = 0;

const monoFont = (px: number) => {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim() || 'monospace';
  return `${px}px ${family}`;
};

/** 一格畫面：還沒收過的，進畫面時跑一次接收；收完（或收過）就是一般的圖 */
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
    let timer = 0;
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
    const run = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const start = performance.now();
      let last = 0;
      const loop = (now: number) => {
        const sec = (now - start) / 1000;
        if (sec >= RX_TOTAL) {
          finish();
          return;
        }
        raf = requestAnimationFrame(loop);
        // 0 與 1 閃得太快會晃眼：一秒換二十幾次就好
        if (now - last < 40) return;
        last = now;
        drawReception(ctx, img, w, h, sec, font);
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
      };
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const now = performance.now();
        const at = Math.max(now, nextSlot);
        nextSlot = at + RX_STAGGER_MS;
        // 圖載不到就不收了，直接換成一般的 <img>（它自己會顯示載不到的樣子）
        const begin = () => {
          if (img.complete) {
            if (img.naturalWidth > 0) run();
            else finish();
            return;
          }
          img.addEventListener('load', run, { once: true });
          img.addEventListener('error', finish, { once: true });
        };
        timer = window.setTimeout(begin, at - now);
      },
      { threshold: RX_THRESHOLD },
    );
    io.observe(box);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      img.removeEventListener('load', run);
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
      <span className="ph-shot" style={{ height }}>
        {done ? (
          <img src={photo.thumbnailUrl} alt="" width={width} height={height} decoding="async" />
        ) : (
          <canvas ref={canvasRef} aria-hidden="true" />
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
      <div className="ph-top">
        <div className="ph-left">
          <header className="ph-head">
            <div className="ph-head-title">
              <h1>{t('photos.heading')}</h1>
              <span>Photos</span>
            </div>
            <p>{t('photos.subtitle')}</p>
          </header>
          <div className="ph-station">
            <canvas ref={stationRef} aria-label={t('photos.stationLabel')} />
            <span className="ph-station-name" aria-hidden="true">
              {t('photos.station')}
            </span>
          </div>
        </div>
        <div className="ph-log">
          <b>{isPending ? '—' : stats.total}</b>
          <span>FRAMES RECEIVED{stats.from && stats.to ? ` · ${stats.from} – ${stats.to}` : ''}</span>
          {stats.lenses.map(([lens, n]) => (
            <div key={lens} className="ph-log-row">
              <span>{lens}</span>
              <span>{n}</span>
            </div>
          ))}
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
          maxColumnCount={3}
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
