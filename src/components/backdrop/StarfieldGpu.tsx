// WebGPU 太空背景（星空 + 土星，單 canvas）——正式預設（2026-07-19 翻線，舊 pmndrs 雙 canvas 棧退役）。
//
// 架構：
//   主路徑   = worker + OffscreenCanvas（spaceGpuWorker.ts，自製極簡協定）
//   fallback = 主執行緒直接跑同一個 runner（無 OffscreenCanvas 的瀏覽器）
//   backend  = WebGPU（有 adapter）/ WebGL2（three 自動 fallback）——同一份場景碼四種組合全吃
// 場景/渲染全在 lib/starfieldGpu.ts；本元件只管 canvas 元素、訊息、徽章/量測 overlay。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// type-only：編譯期抹除，不影響 lazy dynamic import 的 chunk 邊界
import type { InitTiming, PerfReport, StarfieldRunner } from '@/lib/starfieldGpu';
import { palette, type Palette } from '@/lib/palette';
import { currentTheme, onTheme, type Theme } from '@/lib/theme';
import { currentFold, subscribeFold } from '@/lib/viewportFold';
import { MAIN_SECTIONS } from '@/data/siteSections';
import { useEnabledSections } from '@/data/siteConfig';

/** 徽章上的一行：開頁多久之後就緒、各段各花多少（土星出來得慢時看是卡在哪一段） */
const describeInit = (t?: InitTiming) =>
  `就緒於 ${Math.round(performance.now())} ms${t ? `（偵測 ${t.probe}・GPU ${t.device}・編譯 ${t.compile}・首幀 ${t.first}）` : ''}`;
import { takeSpaceWorker } from './prewarm';
import { isArriving } from '@/store/pageTransition';
import { onShowcase, setShowcaseReady } from '@/store/themeShowcase';
import { skyPan, subscribeSkyPan } from '@/store/skyPan';
import {
  publishSatellites,
  publishSaturnGrow,
  subscribeSaturnCollapse,
  subscribeSatelliteGlow,
  type SatelliteScreen,
  type SaturnGrow,
} from '@/store/homeOrbit';

const canOffscreen =
  typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

/** 已經 transfer 給 worker 的 canvas（transferControlToOffscreen 一張只能做一次） */
const transferred = new WeakSet<HTMLCanvasElement>();

/** 離開首頁時土星收成一點要多久（runner 的縮放 lerp 大約這麼久收斂） */
const SATURN_COLLAPSE_MS = 550;

/** 自己畫天空的頁面上，星空等多久才建（那幾頁的進場動畫：收藏頁俯衝 2 秒＋名字淡入 0.9 秒、手記 1.8 秒） */
const BARE_DEFER_MS = 3000;

/**
 * 什麼時候建星空。自己畫天空的頁面（hooks/useBareSky：收藏、關於、手記）重整進來時先不建：
 * 建 GPU device 會佔住 GPU 執行緒將近百毫秒，剛好落在那一頁進場動畫的中間，頁面自己的畫布排在後面，
 * 整個畫面頓一下（收藏頁實測 67–85ms）。星空在那幾頁本來就淡出不畫，等進場跑完、主執行緒閒下來再建；
 * 還沒建就離開那一頁的話馬上建。回傳取消
 */
function whenSkyNeeded(start: () => void): () => void {
  const root = document.documentElement;
  if (root.dataset.sky !== 'bare') {
    start();
    return () => undefined;
  }
  let idle = 0;
  const cleanup = () => {
    mo.disconnect();
    window.clearTimeout(timer);
    if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
  };
  const go = () => {
    cleanup();
    start();
  };
  const mo = new MutationObserver(() => {
    if (root.dataset.sky !== 'bare') go();
  });
  mo.observe(root, { attributes: true, attributeFilter: ['data-sky'] });
  const timer = window.setTimeout(() => {
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 1000 });
    else go();
  }, BARE_DEFER_MS);
  return cleanup;
}

/** runner 還沒就緒時徽章顯示的字串，同時是 canvas 淡入的開關 */
const BACKEND_PENDING = '初始化中…';

const canvasStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 1,
};

interface StarfieldGpuProps {
  /** 土星僅首頁顯示（對齊舊架構的 isOnHomePage gating） */
  isOnHomePage?: boolean;
  /** false 時土星維持 epsilon 縮放（管線先編譯好）；true 放大到原尺寸 */
  animateSaturn?: boolean;
  /** 手機：星星減量（只看掛載當下的值） */
  lite?: boolean;
  zIndex?: number | string;
}

export default function StarfieldGpu({
  isOnHomePage = false,
  animateSaturn = true,
  lite = false,
  zIndex = 1,
}: StarfieldGpuProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState(BACKEND_PENDING);
  /** 建 runner 各段的時間＋從開頁到就緒（只給 ?debug=perf 的徽章看） */
  const [initInfo, setInitInfo] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [perf, setPerf] = useState<PerfReport | null>(null);
  const perfDebug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === 'perf', []);
  // 統一控制介面：worker 路徑=postMessage、主執行緒路徑=直呼 runner（見下兩個 effect）
  const controlRef = useRef<{
    scroll(y: number): void;
    saturn(v: boolean, a: boolean): void;
    glow(g: number[]): void;
    collapse(index: number): void;
    stars(visible: boolean): void;
    pan(x: number, y: number): void;
    sections(count: number): void;
    theme(theme: Theme, palette: Palette): void;
  } | null>(null);

  const liteRef = useRef(lite);
  // 開著幾個主要分區＝土星幾條軌道。建 runner 時帶進去（第一幀就對），之後站台設定改了再送一次
  const sections = useEnabledSections(MAIN_SECTIONS).length;
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
    controlRef.current?.sections(sections);
  }, [sections]);
  // 頁面開著時換了主題（lib/theme）：主星收成一點、換成新的再長出來。新的配色在這一刻已經套上 :root 了
  useEffect(() => onTheme((theme) => controlRef.current?.theme(theme, palette())), []);
  // 首頁以外換主題時新的主星出場一下（store/themeShowcase）：長出來、收回去、或被打斷直接藏。首頁本來就在顯示，不理它
  const homeRef = useRef(isOnHomePage);
  homeRef.current = isOnHomePage;
  useEffect(() => {
    let timer = 0;
    const off = onShowcase((cmd) => {
      if (cmd === 'collapse') {
        if (homeRef.current) controlRef.current?.saturn(true, false);
        return;
      }
      if (homeRef.current) return;
      window.clearTimeout(timer);
      if (cmd === 'show') controlRef.current?.saturn(true, true);
      else if (cmd === 'hide') {
        controlRef.current?.saturn(true, false);
        timer = window.setTimeout(() => controlRef.current?.saturn(false, false), SATURN_COLLAPSE_MS);
      } else controlRef.current?.saturn(false, false);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);
  // 能不能出場：3D 就緒、不是手機的精簡版（不畫主星）、沒有放棄 3D
  useEffect(() => {
    setShowcaseReady(backend !== BACKEND_PENDING && !liteRef.current && !failed);
    return () => setShowcaseReady(false);
  }, [backend, failed]);
  // ── GPU device / WebGL context 掉了之後的重建 ────────────────────────────
  //
  // 為什麼需要：device 掉了是永久的，three 只會 console.error 一行（在 worker 裡連那行都
  // 看不到），renderer 之後一幀都不會再畫。實測 loseContext 後 draw call 歸零，等 15 秒、
  // 換路由都不會回來。使用者看到的就是「星空停住、切回首頁土星也不出現，但流星還在跑」——
  // 流星是 CSS/DOM 特效，跟這條管線無關。
  //
  // 重建方式是 bump generation：它同時是 <canvas> 的 key（transferControlToOffscreen 一張
  // canvas 只能做一次，所以必須換一個新的 DOM 節點）與下面那個 effect 的依賴，
  // 於是舊 worker/runner 走正常的 cleanup 收掉，新的從頭建起來。
  const [generation, setGeneration] = useState(0);
  const recoveriesRef = useRef(0);
  const recoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 上限存在的理由：device 一直掉的機器（驅動有問題）不該無限重建，那比不顯示更糟。
  // 用完就收掉整個 3D，頁面留下黑紙與 CSS 星空。
  const MAX_RECOVERIES = 3;

  const recover = useCallback((reason: string) => {
    if (recoveriesRef.current >= MAX_RECOVERIES) {
      console.warn(`[StarfieldGpu] ${reason}；已重建 ${MAX_RECOVERIES} 次仍失敗，放棄 3D（留下 CSS 星空）`);
      setFailed(true);
      return;
    }
    recoveriesRef.current += 1;
    console.warn(`[StarfieldGpu] ${reason}；第 ${recoveriesRef.current} 次重建`);
    // 分頁還在背景時重建沒有意義（GPU 資源正是那時候被回收的），等切回來再做。
    if (document.hidden) {
      const once = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', once);
        setGeneration((g) => g + 1);
      };
      document.addEventListener('visibilitychange', once);
      return;
    }
    recoverTimerRef.current = setTimeout(() => setGeneration((g) => g + 1), 500);
  }, []);

  // 首頁衛星的亮度：首頁送過來就轉給 runner。控制介面就緒（backend 變了）時也補送一次
  useEffect(() => subscribeSatelliteGlow((g) => controlRef.current?.glow(g)), [backend]);
  // 換頁轉場的「收」：首頁要離開時，土星整組收進點下去的那顆衛星
  useEffect(() => subscribeSaturnCollapse((i) => controlRef.current?.collapse(i)), []);
  // 換頁的鏡頭移動時星空跟著轉（store/skyPan）。控制介面就緒時補送一次目前的位移
  useEffect(() => {
    const send = (p: { x: number; y: number }) => controlRef.current?.pan(p.x, p.y);
    send(skyPan());
    return subscribeSkyPan(send);
  }, [backend]);
  // 頁面自己畫背景時（hooks/useBareSky）、換主題的那幾秒，星星淡出讓位。控制介面就緒（backend 變了）時補送一次
  useEffect(() => {
    const root = document.documentElement;
    // 換主題的那幾秒（html[data-stage]，layout/ThemeSwitchDot）也淡出：燈暗下來，只剩那顆主星
    const sync = () => controlRef.current?.stars(root.dataset.sky !== 'bare' && root.dataset.stage === undefined);
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['data-sky', 'data-stage'] });
    return () => mo.disconnect();
  }, [backend]);

  useEffect(
    () => () => {
      clearTimeout(recoverTimerRef.current ?? undefined);
    },
    [],
  );

  // 捲動轉發（worker 無 window）+ 土星顯示（僅首頁）——控制介面就緒後立即同步當前狀態。
  // 離開首頁：走轉場的話土星已經收進那一點了（html[data-pt]），直接藏；沒走轉場就先收成一點再藏。
  // 換進首頁時點還在飛（store/pageTransition 的 isArriving），土星要等點落地才從那一點長出來
  const wasHomeRef = useRef(isOnHomePage);
  useEffect(() => {
    const onScroll = () => controlRef.current?.scroll(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    let timer = 0;
    let waitArrival: MutationObserver | null = null;
    const root = document.documentElement;
    if (wasHomeRef.current && !isOnHomePage && root.dataset.pt) {
      controlRef.current?.saturn(false, false);
    } else if (wasHomeRef.current && !isOnHomePage) {
      controlRef.current?.saturn(true, false);
      timer = window.setTimeout(() => controlRef.current?.saturn(false, false), SATURN_COLLAPSE_MS);
    } else if (isOnHomePage && isArriving()) {
      controlRef.current?.saturn(true, false);
      waitArrival = new MutationObserver(() => {
        if (isArriving()) return;
        waitArrival?.disconnect();
        controlRef.current?.saturn(true, animateSaturn);
      });
      // data-boot 也要看：開場的點從畫面正中間出發，而首頁的錨點就是正中間——一落地就結束（data-pt 拿掉），
      // 但開場的 data-boot 還要再過半秒才拿掉。只看 data-pt 的話，最後那次變化就沒人接，土星永遠停在一點
      // data-boot-ring 也要看：首頁交棒那一刻（go）土星就開始長，不等夜色拿掉
      waitArrival.observe(root, { attributes: true, attributeFilter: ['data-pt', 'data-boot', 'data-boot-ring'] });
    } else controlRef.current?.saturn(isOnHomePage, animateSaturn);
    wasHomeRef.current = isOnHomePage;
    controlRef.current?.scroll(window.scrollY);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      waitArrival?.disconnect();
    };
  }, [isOnHomePage, animateSaturn, backend]); // backend 變化 = runner 就緒的訊號，重新同步

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 該不該跑：分頁被隱藏時停（原本就有），有元素進入全螢幕時也停。
    //
    // 後者是在修一個實際的 bug：全螢幕影片連續 seek 到第 8~15 次會把媒體管線卡死
    // （`seeked` 永不回來、readyState 掉到 1、解碼格數 +0，只有退出全螢幕才恢復），
    // 而唯一有效的變因就是把頁面動畫停掉——停掉後同樣的測試 40/40 全過。
    // 詳細的排除過程寫在 SpaceBackdropShell 的註解裡。
    //
    // 全螢幕時這張 canvas 被 top layer 完全蓋住，停掉不影響任何看得到的東西。
    const shouldRun = () => !document.hidden && document.fullscreenElement === null;

    if (canOffscreen) {
      // ── worker 主路徑 ──
      // 一張 canvas 只能 transfer 一次。effect 在同一張 canvas 上重跑（React 開發模式會故意
      // 把 effect 跑兩次）就得換一張新的，跟 device lost 重建是同一個做法。
      if (transferred.has(canvas)) {
        setGeneration((g) => g + 1);
        return;
      }
      transferred.add(canvas);
      // 主程式一開始就先建好的那個（backdrop/prewarm，three.js 多半已經載好了）；重建時是新的一個
      const worker = takeSpaceWorker();
      const offscreen = canvas.transferControlToOffscreen();
      const cancelStart = whenSkyNeeded(() =>
        worker.postMessage(
          {
            type: 'init',
            canvas: offscreen,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            fold: currentFold(),
            dpr: window.devicePixelRatio,
            lite: liteRef.current,
            palette: palette(),
            theme: currentTheme(),
            sections: sectionsRef.current,
          },
          [offscreen],
        ),
      );
      // ⚠ 明送一次當下的狀態，不能只靠下面的 visibilitychange / fullscreenchange。
      //
      // 那兩個事件只在「狀態改變」時觸發，而這個元件是 lazy 的（three chunk 還要下載）——在它掛好之前就進全螢幕的話，事件早就發完了，
      // 監聽器接不到任何東西，runner 於是用預設值「跑」起來，整個全螢幕期間都在跟影片搶 GPU。
      // 實測：domcontentloaded 後 600ms 進全螢幕，一則 running 訊息都沒送出。
      // worker 端會把這個值存進 lastRunning，等 async init 完成後補套。
      worker.postMessage({ type: 'running', value: shouldRun() });
      controlRef.current = {
        scroll: (y) => worker.postMessage({ type: 'scroll', y }),
        saturn: (v, a) => worker.postMessage({ type: 'saturn', visible: v, animate: a }),
        glow: (g) => worker.postMessage({ type: 'glow', glow: g }),
        collapse: (index) => worker.postMessage({ type: 'collapse', index }),
        stars: (visible) => worker.postMessage({ type: 'stars', visible }),
        pan: (x, y) => worker.postMessage({ type: 'pan', x, y }),
        sections: (count) => worker.postMessage({ type: 'sections', count }),
        theme: (theme, colors) => worker.postMessage({ type: 'theme', theme, palette: colors }),
      };
      const onMsg = (
        e: MessageEvent<{
          type: string;
          backend?: string;
          timing?: InitTiming;
          report?: PerfReport;
          message?: string;
          positions?: SatelliteScreen[];
          at?: number;
          grow?: SaturnGrow;
        }>,
      ) => {
        if (e.data.type === 'satellites') publishSatellites(e.data.positions ?? [], e.data.at);
        else if (e.data.type === 'saturnGrow' && e.data.grow) publishSaturnGrow(e.data.grow);
        else if (e.data.type === 'ready') {
          setBackend(`${e.data.backend} · worker`);
          setInitInfo(describeInit(e.data.timing));
        } else if (e.data.type === 'perf') setPerf(e.data.report ?? null);
        else if (e.data.type === 'lost') recover(e.data.message ?? 'GPU device lost');
        else if (e.data.type === 'error') {
          // canvas 已 transfer、無法回收給主執行緒重用 → 本 session 放棄（頁面留下 CSS 星空）
          console.warn('[StarfieldGpu] worker 初始化失敗:', e.data.message);
          setFailed(true);
          worker.terminate();
        }
      };
      worker.addEventListener('message', onMsg);
      const onResize = () =>
        worker.postMessage({
          type: 'resize',
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          fold: currentFold(),
        });
      const onVis = () => worker.postMessage({ type: 'running', value: shouldRun() });
      // 摺疊機摺起來或攤開不一定會發 resize（見 lib/viewportFold），一起聽
      const unsubscribeFold = subscribeFold(onResize);
      document.addEventListener('visibilitychange', onVis);
      document.addEventListener('fullscreenchange', onVis);
      return () => {
        cancelStart();
        unsubscribeFold();
        document.removeEventListener('visibilitychange', onVis);
        document.removeEventListener('fullscreenchange', onVis);
        // terminate() 已經讓 worker 連同監聽器一起消失，但明寫出來才對稱、也不必讓
        // 讀者去推敲 addEventListener 的對應在哪。
        worker.removeEventListener('message', onMsg);
        worker.terminate();
      };
    }

    // ── 主執行緒 fallback（同一個 runner）──
    let disposed = false;
    let runnerHandle: StarfieldRunner | null = null;
    void import('@/lib/starfieldGpu')
      .then(async ({ createStarfieldRunner }) => {
        try {
          const {
            runner,
            backend: be,
            timing,
          } = await createStarfieldRunner({
            canvas,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            fold: currentFold(),
            dpr: window.devicePixelRatio,
            lite: liteRef.current,
            palette: palette(),
            theme: currentTheme(),
            sections: sectionsRef.current,
            onPerf: setPerf,
            onDeviceLost: (message) => {
              if (!disposed) recover(message);
            },
            onSatellites: publishSatellites,
            onSaturnGrow: publishSaturnGrow,
          });
          if (disposed) {
            runner.dispose();
            return;
          }
          runnerHandle = runner;
          // runner 預設是跑的，而 init 是 async——這段期間發生的 visibility/fullscreen 變化
          // 只會打到還是 null 的 runnerHandle 上、被靜默丟掉。補套一次當下的狀態，
          // 否則「冷啟動時就進全螢幕」會讓背景在影片播放中自己跑起來（worker 路徑同理，
          // 見 spaceGpuWorker 的 lastRunning）。
          runner.setRunning(shouldRun());
          controlRef.current = {
            scroll: (y) => runner.setScroll(y),
            saturn: (v, a) => runner.setSaturn(v, a),
            glow: (g) => runner.setSatelliteGlow(g),
            collapse: (index) => runner.collapseSaturnTo(index),
            stars: (visible) => runner.setStars(visible),
            pan: (x, y) => runner.setPan(x, y),
            sections: (count) => runner.setSections(count),
            theme: (theme, colors) => runner.setTheme(theme, colors),
          };
          setBackend(`${be} · main`);
          setInitInfo(describeInit(timing));
        } catch (err) {
          console.warn('[StarfieldGpu] 主執行緒初始化失敗:', err);
          setFailed(true);
        }
      })
      .catch((err: unknown) => {
        // 這支 chunk 本身載不起來：走主執行緒這條的多半是沒有 OffscreenCanvas 的舊 iOS（16.4 以前），
        // three 裡的 class static block 它解析不了（GlitchTip 上的「Unexpected token '{'」）。
        // 收掉 3D，頁面留下 CSS 星空，不要變成沒人接的 promise rejection
        console.warn('[StarfieldGpu] 3D 模組載入失敗:', err);
        if (!disposed) setFailed(true);
      });
    const onResize = () => runnerHandle?.setSize(canvas.clientWidth, canvas.clientHeight, currentFold());
    const onVis = () => runnerHandle?.setRunning(shouldRun());
    const unsubscribeFold = subscribeFold(onResize);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onVis);
    return () => {
      disposed = true;
      unsubscribeFold();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onVis);
      runnerHandle?.dispose();
    };
    // generation 變化 = device lost 之後要整組重建（canvas 換了新的 DOM 節點，見上面的註解）
  }, [generation, recover]);

  // 初始化失敗（無 WebGPU 也無 WebGL 的機器）→ 優雅消失，頁面留下 CSS 星空
  if (failed) return null;

  return (
    <>
      {/* key=generation：transferControlToOffscreen 一張 canvas 只能做一次，
          device lost 之後必須換一個全新的 DOM 節點才重建得起來 */}
      {/* runner 就緒前透明、就緒後淡入：worker 建場景＋編 shader 要將近一秒，頁面早就畫好了，
          星空直接冒出來會像閃一下。opacity 只走合成，不會讓這張 canvas 多畫任何東西。 */}
      <canvas
        key={generation}
        ref={canvasRef}
        style={{
          ...canvasStyle,
          zIndex,
          opacity: backend === BACKEND_PENDING ? 0 : 1,
          transition: 'opacity var(--dur-1000) ease',
        }}
      />
      {/* backend 徽章：?debug=perf 才顯示（正式訪客不看 debug 資訊） */}
      {perfDebug && (
        <div
          style={{
            position: 'fixed',
            bottom: 8,
            right: 8,
            zIndex: 99999,
            padding: '6px 10px',
            background: 'rgba(0,0,0,.75)',
            color: backend.startsWith('WebGPU') ? '#7fdcff' : '#ffd27f',
            font: '12px/1.5 monospace',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          StarfieldGpu · {backend} · TSL bloom
          {initInfo && ` · ${initInfo}`}
          {perf &&
            ` · ${perf.fps.toFixed(0)} fps · ${perf.avgMs.toFixed(2)} ms${perf.gpuMs != null ? ` · GPU ${perf.gpuMs.toFixed(2)} ms` : ''}${perf.quality ? ` · 品質降級 L${perf.quality}` : ''} · ${perf.idle ? '閒置' : '活動'} · vsync ${perf.vsyncMs.toFixed(1)} ms · 時鐘差 ${perf.clockSkewMs.toFixed(0)} ms`}
        </div>
      )}
    </>
  );
}
