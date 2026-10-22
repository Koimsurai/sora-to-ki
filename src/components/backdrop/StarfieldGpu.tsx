// WebGPU 太空背景（星空 + 土星，單 canvas）——正式預設（2026-07-19 翻線，舊 pmndrs 雙 canvas 棧退役）。
//
// 架構：
//   主路徑   = worker + OffscreenCanvas（spaceGpuWorker.ts，自製極簡協定）
//   fallback = 主執行緒直接跑同一個 runner（無 OffscreenCanvas 的瀏覽器）
//   backend  = WebGPU（有 adapter）/ WebGL2（three 自動 fallback）——同一份場景碼四種組合全吃
// 場景/渲染全在 lib/starfieldGpu.ts；本元件只管 canvas 元素、訊息、徽章/量測 overlay。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// type-only：編譯期抹除，不影響 lazy dynamic import 的 chunk 邊界
import type { PerfReport, SkyMode, StarfieldRunner } from '@/lib/starfieldGpu';
import type { IntroPhase } from '@/lib/introTimeline';

const canOffscreen =
  typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

/** 已經 transfer 給 worker 的 canvas（transferControlToOffscreen 一張只能做一次） */
const transferred = new WeakSet<HTMLCanvasElement>();

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
  zIndex?: number | string;
  /**
   * 播首訪開場（畫在這張 canvas 上，見 lib/hyperspace.ts）。只看掛載當下的值：
   * device lost 之後重建不會重播。
   */
  intro?: boolean;
  /** 開場的各個階段 */
  onIntroPhase?: (phase: IntroPhase) => void;
  /** 開場播不下去了（初始化失敗、或播到一半 GPU 掉了）——呼叫端要自己收尾、把內容放出來 */
  onIntroAbort?: () => void;
  /** 轉成 true＝跳過開場 */
  skipIntro?: boolean;
  /** 這一頁的天空（見 lib/starfieldGpu.ts 的 SkyMode） */
  sky?: SkyMode;
}

export default function StarfieldGpu({
  isOnHomePage = false,
  animateSaturn = true,
  zIndex = 1,
  intro = false,
  onIntroPhase,
  onIntroAbort,
  skipIntro = false,
  sky = 'default',
}: StarfieldGpuProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState(BACKEND_PENDING);
  const [failed, setFailed] = useState(false);
  const [perf, setPerf] = useState<PerfReport | null>(null);
  const perfDebug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === 'perf', []);
  // ?intro-at=毫秒：開場停在那一刻（見 StarfieldInit.introFreezeAt）
  const introFreezeAt = useMemo(() => {
    const v = Number(new URLSearchParams(window.location.search).get('intro-at') ?? Number.NaN);
    return Number.isFinite(v) ? v : undefined;
  }, []);
  // ?transition=burst：換頁時土星迸成星塵（比較用）；預設是飛行
  const transition = useMemo(
    () => (new URLSearchParams(window.location.search).get('transition') === 'burst' ? 'burst' : 'travel'),
    [],
  );
  // 統一控制介面：worker 路徑=postMessage、主執行緒路徑=直呼 runner（見下兩個 effect）
  const controlRef = useRef<{
    scroll(y: number): void;
    saturn(v: boolean, a: boolean): void;
    skip(): void;
    sky(mode: SkyMode): void;
  } | null>(null);

  // 開場只在第一次建 runner 時播；之後的重建（device lost）一律不播
  const [introMode] = useState(intro);
  const introPendingRef = useRef(intro);
  const introRunningRef = useRef(false);
  const skipRef = useRef(skipIntro);
  skipRef.current = skipIntro;
  const phaseRef = useRef(onIntroPhase);
  phaseRef.current = onIntroPhase;
  const abortRef = useRef(onIntroAbort);
  abortRef.current = onIntroAbort;
  const handlePhase = useCallback((phase: IntroPhase) => {
    introPendingRef.current = false;
    introRunningRef.current = phase !== 'done';
    phaseRef.current?.(phase);
  }, []);
  /** 建 runner 時要不要播開場：第一次建完就清掉 */
  const introOfferedRef = useRef(intro);
  const abortIntro = useCallback(() => {
    if (!introPendingRef.current && !introRunningRef.current) return;
    introPendingRef.current = false;
    introRunningRef.current = false;
    abortRef.current?.();
  }, []);

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
  // 用完就收掉整個 3D，由 shell 的 DOM 特效兜底。
  const MAX_RECOVERIES = 3;

  const recover = useCallback(
    (reason: string) => {
      // 開場播到一半 GPU 掉了：重建的 runner 不會重播，所以開場就停在這裡，交給呼叫端收尾
      abortIntro();
      if (recoveriesRef.current >= MAX_RECOVERIES) {
        console.warn(`[StarfieldGpu] ${reason}；已重建 ${MAX_RECOVERIES} 次仍失敗，放棄 3D（DOM 特效繼續）`);
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
    },
    [abortIntro],
  );

  // 初始化失敗或放棄 3D：開場不會來了
  useEffect(() => {
    if (failed) abortIntro();
  }, [failed, abortIntro]);

  useEffect(() => {
    if (skipIntro) controlRef.current?.skip();
  }, [skipIntro]);

  useEffect(
    () => () => {
      clearTimeout(recoverTimerRef.current ?? undefined);
    },
    [],
  );

  // 天空要比土星先送：離開首頁時，runner 照「要去哪一片天空」選飛行路線（關於頁是往下墜）。
  // effect 依宣告順序執行，所以這一段必須寫在土星那一段前面
  useEffect(() => {
    controlRef.current?.sky(sky);
  }, [sky, backend]);

  // 捲動轉發（worker 無 window）+ 土星顯示（僅首頁）——控制介面就緒後立即同步當前狀態
  useEffect(() => {
    const onScroll = () => controlRef.current?.scroll(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    controlRef.current?.saturn(isOnHomePage, animateSaturn);
    controlRef.current?.scroll(window.scrollY);
    return () => window.removeEventListener('scroll', onScroll);
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
    const playIntro = introOfferedRef.current;
    introOfferedRef.current = false;
    // 開場還沒開始就被收掉（effect 重跑、或掛載後馬上卸載）→ 把「要播」還回去給下一次
    const returnIntro = () => {
      if (playIntro && introPendingRef.current) introOfferedRef.current = true;
    };

    if (canOffscreen) {
      // ── worker 主路徑 ──
      // 一張 canvas 只能 transfer 一次。effect 在同一張 canvas 上重跑（React 開發模式會故意
      // 把 effect 跑兩次）就得換一張新的，跟 device lost 重建是同一個做法。
      if (transferred.has(canvas)) {
        returnIntro();
        setGeneration((g) => g + 1);
        return;
      }
      transferred.add(canvas);
      // ⚠️ 這裡必須是字面相對路徑：vite 靠靜態分析 `new URL(…, import.meta.url)` 才認得出
      // 這是 worker 進入點並單獨打包，換成 @/ alias 它就認不出來了。
      const worker = new Worker(new URL('../../workers/spaceGpuWorker.ts', import.meta.url), { type: 'module' });
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          dpr: window.devicePixelRatio,
          intro: playIntro,
          introFreezeAt,
          transition,
        },
        [offscreen],
      );
      // ⚠ 明送一次當下的狀態，不能只靠下面的 visibilitychange / fullscreenchange。
      //
      // 那兩個事件只在「狀態改變」時觸發，而這個元件是 lazy 的（intro 播完才掛、
      // three chunk 還要下載）——在它掛好之前就進全螢幕的話，事件早就發完了，
      // 監聽器接不到任何東西，runner 於是用預設值「跑」起來，整個全螢幕期間都在跟影片搶 GPU。
      // 實測：domcontentloaded 後 600ms 進全螢幕，一則 running 訊息都沒送出。
      // worker 端會把這個值存進 lastRunning，等 async init 完成後補套。
      worker.postMessage({ type: 'running', value: shouldRun() });
      controlRef.current = {
        scroll: (y) => worker.postMessage({ type: 'scroll', y }),
        saturn: (v, a) => worker.postMessage({ type: 'saturn', visible: v, animate: a }),
        skip: () => worker.postMessage({ type: 'skip' }),
        sky: (mode) => worker.postMessage({ type: 'sky', mode }),
      };
      if (skipRef.current) controlRef.current.skip();
      const onMsg = (
        e: MessageEvent<{
          type: string;
          backend?: string;
          report?: PerfReport;
          message?: string;
          phase?: IntroPhase;
        }>,
      ) => {
        if (e.data.type === 'intro' && e.data.phase) handlePhase(e.data.phase);
        else if (e.data.type === 'ready') setBackend(`${e.data.backend} · worker`);
        else if (e.data.type === 'perf') setPerf(e.data.report ?? null);
        else if (e.data.type === 'lost') recover(e.data.message ?? 'GPU device lost');
        else if (e.data.type === 'error') {
          // canvas 已 transfer、無法回收給主執行緒重用 → 本 session 放棄（外層有 DOM 特效兜底）
          console.warn('[StarfieldGpu] worker 初始化失敗:', e.data.message);
          setFailed(true);
          worker.terminate();
        }
      };
      worker.addEventListener('message', onMsg);
      const onResize = () =>
        worker.postMessage({ type: 'resize', width: canvas.clientWidth, height: canvas.clientHeight });
      const onVis = () => worker.postMessage({ type: 'running', value: shouldRun() });
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVis);
      document.addEventListener('fullscreenchange', onVis);
      return () => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        document.removeEventListener('fullscreenchange', onVis);
        // terminate() 已經讓 worker 連同監聽器一起消失，但明寫出來才對稱、也不必讓
        // 讀者去推敲 addEventListener 的對應在哪。
        worker.removeEventListener('message', onMsg);
        worker.terminate();
        returnIntro();
      };
    }

    // ── 主執行緒 fallback（同一個 runner）──
    let disposed = false;
    let runnerHandle: StarfieldRunner | null = null;
    void import('@/lib/starfieldGpu').then(async ({ createStarfieldRunner }) => {
      try {
        const { runner, backend: be } = await createStarfieldRunner({
          canvas,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          dpr: window.devicePixelRatio,
          intro: playIntro,
          introFreezeAt,
          transition,
          onIntroPhase: handlePhase,
          onPerf: setPerf,
          onDeviceLost: (message) => {
            if (!disposed) recover(message);
          },
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
          skip: () => runner.skipIntro(),
          sky: (mode) => runner.setSky(mode),
        };
        if (skipRef.current) runner.skipIntro();
        setBackend(`${be} · main`);
      } catch (err) {
        console.warn('[StarfieldGpu] 主執行緒初始化失敗:', err);
        setFailed(true);
      }
    });
    const onResize = () => runnerHandle?.setSize(canvas.clientWidth, canvas.clientHeight);
    const onVis = () => runnerHandle?.setRunning(shouldRun());
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onVis);
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onVis);
      runnerHandle?.dispose();
      returnIntro();
    };
    // generation 變化 = device lost 之後要整組重建（canvas 換了新的 DOM 節點，見上面的註解）
  }, [generation, recover, handlePhase, introFreezeAt, transition]);

  // 初始化失敗（無 WebGPU 也無 WebGL 的機器）→ 優雅消失，DOM 特效由 shell 兜底
  if (failed) return null;

  return (
    <>
      {/* key=generation：transferControlToOffscreen 一張 canvas 只能做一次，
          device lost 之後必須換一個全新的 DOM 節點才重建得起來 */}
      {/* runner 就緒前透明、就緒後淡入：worker 建場景＋編 shader 要將近一秒，頁面早就畫好了，
          星空直接冒出來會像閃一下。opacity 只走合成，不會讓這張 canvas 多畫任何東西。
          播開場時不淡入：第一幀就是開場不透明的底色，要直接出現（以前開場層也是直接蓋上來的）。 */}
      <canvas
        key={generation}
        ref={canvasRef}
        style={{
          ...canvasStyle,
          zIndex,
          opacity: backend === BACKEND_PENDING ? 0 : 1,
          transition: introMode ? undefined : 'opacity var(--dur-1000) ease',
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
          {perf &&
            ` · ${perf.fps.toFixed(0)} fps · ${perf.avgMs.toFixed(2)} ms${perf.gpuMs != null ? ` · GPU ${perf.gpuMs.toFixed(2)} ms` : ''}${perf.quality ? ` · 品質降級 L${perf.quality}` : ''} · ${perf.idle ? '閒置' : '活動'} · vsync ${perf.vsyncMs.toFixed(1)} ms · 時鐘差 ${perf.clockSkewMs.toFixed(0)} ms`}
        </div>
      )}
    </>
  );
}
