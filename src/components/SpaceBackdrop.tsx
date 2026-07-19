// 桌面太空背景。手機完全不載這支（App 以 !isMobile 閘控 + lazy）。
//
// 架構（為了把桌面 TBT 壓下來、又保留 18000 星）：
//   ‧ 星空（兩層 Stars + 碎片 + 閃爍星，27k 點，per-frame 成本大宗）→ OffscreenCanvas worker，
//     渲染整個搬離主執行緒（@react-three/offscreen）。不支援 OffscreenCanvas 的瀏覽器
//     （Safari < 16.4）自動降級成主執行緒 fallback（同一個 StarfieldWorkerScene）。
//   ‧ Saturn（單一物件，但有貼圖 / 捲動 / cursor / bloom 後處理等 DOM 依賴，無法進 worker）
//     留在主執行緒 Canvas；單物件成本遠低於 27k 點。
//   ‧ 自適應 DPR（PerformanceMonitor）只掛在 Saturn canvas：弱機自動降解析度。
//
// 穩健性（Chromium 137 移除 SwiftShader fallback 後補的）：
//   ‧ 掛載前已由 SpaceBackdropShell probe 過 WebGL；這裡處理 runtime 才炸的情況。
//   ‧ worker 建 context 失敗 → offscreen 套件 postMessage {type:'error'} → 我們停發
//     props 訊息（套件的 handleProps 沒 try/catch，繼續發會在 worker 內重複 throw）
//     並 terminate；套件自身會切到主執行緒 fallback。
//   ‧ Saturn canvas webglcontextlost → 本 session 內卸載（優雅消失，不留凍結畫面）。
import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { PerformanceMonitor, StatsGl } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Canvas as OffscreenCanvas } from '@react-three/offscreen';
import Saturn3D from './Saturn3D';
import DomSpaceEffects from './DomSpaceEffects';
import StarfieldWorkerScene from './StarfieldWorkerScene';
import { parsePerfKnobs, isDefaultKnobs } from '../lib/perfKnobs';

const fixedFull: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' };

// 有 EffectComposer 時 canvas 自身的 AA/depth/stencil buffer 沒人用（渲染走 composer
// 的 framebuffer，canvas 只收最終全螢幕 quad）→ 關掉省頻寬，畫質由 composer 的
// MSAA 決定（postprocessing 官方建議配置）。
const glFlags = { antialias: false, stencil: false, depth: false } as const;

// 星空 canvas 的 props 拉成模組常數：offscreen 套件對 props 有 useEffect([worker, props])，
// inline 物件每次 re-render 都是新 identity → 白發 postMessage + worker 內 root.configure。
const STARFIELD_CAMERA = { position: [0, 0, 5] as [number, number, number] };
const STARFIELD_DPR: [number, number] = [1, 2];
const STARFIELD_STYLE: React.CSSProperties = { ...fixedFull, zIndex: 1 };

// 模組級單例：整個 app 生命週期只起一個星空 worker（避免重掛載/重渲染重複 spawn、重複下載 832K）。
// worker 曾失敗（該機 worker 內建不出 WebGL context）就不再 respawn——重試只會再炸一次。
let _spaceWorker: Worker | null = null;
let _workerFailed = false;
function getSpaceWorker(): Worker | null {
  if (_workerFailed) return null;
  if (!_spaceWorker && typeof Worker !== 'undefined') {
    _spaceWorker = new Worker(new URL('../workers/spaceWorker.tsx', import.meta.url), { type: 'module' });
  }
  return _spaceWorker;
}

interface SpaceBackdropProps {
  isMobile: boolean;
  isOnHomePage: boolean;
  animateSaturn: boolean;
  saturnZIndex: number;
}

export default function SpaceBackdrop({
  isMobile, isOnHomePage, animateSaturn, saturnZIndex,
}: SpaceBackdropProps) {
  const worker = useMemo(() => getSpaceWorker(), []);
  // worker 內建 WebGL 失敗（offscreen 套件回報 error）→ 停發訊息。套件自身會切主執行緒 fallback。
  const workerDeadRef = useRef(false);
  // Saturn 的 WebGL context 中途遺失（GPU reset/process 崩潰）→ 本 session 卸載該 canvas
  const [saturnLost, setSaturnLost] = useState(false);
  // ?debug=perf 量測台：Saturn canvas 掛 StatsGl（FPS/CPU/GPU）+ 星空 worker 幀時 overlay。
  // 旋鈕（&msaa=0|2|4|8、&smaa=1）→ 兩條管線同時套用，A/B 畫質 vs 成本。
  const perfDebug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === 'perf', []);
  const knobs = useMemo(() => parsePerfKnobs(window.location.search), []);
  const [workerPerf, setWorkerPerf] = useState<{ fps: number; avgMs: number; msaa?: number; smaa?: boolean } | null>(null);

  useEffect(() => {
    if (!worker) return;
    // 與 offscreen 套件的 worker.onmessage（property 賦值）並存：addEventListener 不互蓋
    const onWorkerMessage = (e: MessageEvent<{ type?: string; fps?: number; avgMs?: number; msaa?: number; smaa?: boolean }>) => {
      if (e.data?.type === 'error') {
        workerDeadRef.current = true;
        _workerFailed = true;
        // 套件已切 fallback，死 worker 沒有留著的理由
        worker.terminate();
        _spaceWorker = null;
      } else if (e.data?.type === 'perf' && perfDebug) {
        setWorkerPerf({ fps: e.data.fps ?? 0, avgMs: e.data.avgMs ?? 0, msaa: e.data.msaa, smaa: e.data.smaa });
      }
    };
    worker.addEventListener('message', onWorkerMessage);
    return () => worker.removeEventListener('message', onWorkerMessage);
  }, [worker, perfDebug]);

  // 旋鈕轉發給 worker 場景（非預設才發；scene 的 listener 要等 init + mount，補兩次重送）
  useEffect(() => {
    if (!worker || isDefaultKnobs(knobs)) return;
    const send = () => {
      if (!workerDeadRef.current) worker.postMessage({ type: 'knobs', payload: knobs });
    };
    send();
    const t1 = setTimeout(send, 1500);
    const t2 = setTimeout(send, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [worker, knobs]);

  // Saturn canvas 的自適應畫質 + 分頁隱藏暫停
  const [dpr, setDpr] = useState(1.5);
  const [frameloop, setFrameloop] = useState<'always' | 'never'>('always');
  useEffect(() => {
    const onVis = () => {
      const fl = document.hidden ? 'never' : 'always';
      setFrameloop(fl); // Saturn（主執行緒 Canvas）的暫停/恢復
      // 星空 worker 的 rAF 不會隨分頁隱藏自動停（OffscreenCanvas in Worker 的已知行為）→
      // 離開分頁後背景仍持續跑。透過 @react-three/offscreen 的 'props' 訊息改 worker 內 r3f 的
      // frameloop，真正把 worker 的 render loop 停下；切回來時 delta 已在 scene 內夾住故不會暴衝。
      // worker 死了就別發——套件的 handleProps 沒 try/catch，每發一次就在 worker 內 throw 一次。
      if (!workerDeadRef.current) {
        worker?.postMessage({ type: 'props', payload: { frameloop: fl } });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [worker]);

  return (
    <>
      {/* 星空：worker 渲染（z 在 Saturn 之下）。fallback 在不支援 OffscreenCanvas / worker 內
          WebGL 失敗時走主執行緒。worker 為 null（曾失敗不 respawn / 無 Worker 支援）→
          直接掛主執行緒版；主執行緒也炸的話由外層 BackdropErrorBoundary 接。 */}
      {worker ? (
        <OffscreenCanvas
          worker={worker}
          fallback={<StarfieldWorkerScene />}
          camera={STARFIELD_CAMERA}
          dpr={STARFIELD_DPR}
          gl={glFlags}
          style={STARFIELD_STYLE}
        />
      ) : (
        <Canvas camera={STARFIELD_CAMERA} dpr={STARFIELD_DPR} gl={glFlags} style={STARFIELD_STYLE}>
          <StarfieldWorkerScene />
        </Canvas>
      )}

      {/* Saturn：主執行緒（貼圖/bloom/捲動互動需要 DOM）。intro 爆炸時 saturnZIndex 拉高 */}
      {isOnHomePage && !saturnLost && (
        <Canvas
          camera={{ position: [0, 0, 5] }}
          dpr={dpr}
          frameloop={frameloop}
          gl={{ powerPreference: 'high-performance', alpha: true, ...glFlags }}
          onCreated={({ gl }) => {
            // context 中途遺失（GPU reset）→ 優雅卸載，不留凍結的殘影 canvas。
            // preventDefault 表明我們自行處理，不等瀏覽器自動 restore（unmount 後也等不到）。
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setSaturnLost(true);
            });
          }}
          style={{ ...fixedFull, zIndex: saturnZIndex, background: 'transparent' }}
        >
          <PerformanceMonitor
            onDecline={() => setDpr((d) => Math.max(0.6, +(d - 0.4).toFixed(2)))}
            onIncline={() => setDpr((d) => Math.min(2, +(d + 0.3).toFixed(2)))}
          />
          {perfDebug && <StatsGl trackGPU horizontal={false} />}
          <Suspense fallback={null}>
            <Saturn3D animate={animateSaturn} isMobile={isMobile} msaa={knobs.msaa} smaa={knobs.smaa} />
          </Suspense>
        </Canvas>
      )}

      {/* 量測台：星空 worker 幀時（StatsGl 只能量主執行緒的 Saturn canvas，worker 靠探針回報）。
          msaa/smaa 由 worker 回報值顯示 = 自證旋鈕真的送達並生效 */}
      {perfDebug && workerPerf && (
        <div style={{
          position: 'fixed', top: 8, right: 8, zIndex: 99999, padding: '6px 10px',
          background: 'rgba(0,0,0,.75)', color: '#7fdc7f', font: '12px/1.5 monospace',
          borderRadius: 6, pointerEvents: 'none',
        }}>
          starfield worker: {workerPerf.fps.toFixed(0)} fps · {workerPerf.avgMs.toFixed(2)} ms
          {workerPerf.msaa !== undefined && ` · msaa ${workerPerf.msaa}${workerPerf.smaa ? '+smaa' : ''}`}
        </div>
      )}

      {/* DOM 特效（非 WebGL）——抽成 DomSpaceEffects 與 no-WebGL 降級路徑共用 */}
      <DomSpaceEffects isMobile={isMobile} isOnHomePage={isOnHomePage} />
    </>
  );
}
