// 桌面太空背景。手機完全不載這支（App 以 !isMobile 閘控 + lazy）。
//
// 架構（為了把桌面 TBT 壓下來、又保留 18000 星）：
//   ‧ 星空（兩層 Stars + 碎片 + 閃爍星，27k 點，per-frame 成本大宗）→ OffscreenCanvas worker，
//     渲染整個搬離主執行緒（@react-three/offscreen）。不支援 OffscreenCanvas 的瀏覽器
//     （Safari < 16.4）自動降級成主執行緒 fallback（同一個 StarfieldWorkerScene）。
//   ‧ Saturn（單一物件，但有貼圖 / 捲動 / cursor / bloom 後處理等 DOM 依賴，無法進 worker）
//     留在主執行緒 Canvas；單物件成本遠低於 27k 點。
//   ‧ 自適應 DPR（PerformanceMonitor）只掛在 Saturn canvas：弱機自動降解析度。
import { useEffect, useState, useMemo, Suspense } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Canvas as OffscreenCanvas } from '@react-three/offscreen';
import Saturn3D from './Saturn3D';
import ForegroundStars from './ForegroundStars';
import RandomShootingStars from './RandomShootingStars';
import RandomComets from './RandomComets';
import RandomUFOs from './RandomUFOs';
import CursorTrail from './CursorTrail';
import StarfieldWorkerScene from './StarfieldWorkerScene';

const fixedFull = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' };

// 模組級單例：整個 app 生命週期只起一個星空 worker（避免重掛載/重渲染重複 spawn、重複下載 832K）
let _spaceWorker = null;
function getSpaceWorker() {
  if (!_spaceWorker && typeof Worker !== 'undefined') {
    _spaceWorker = new Worker(new URL('../workers/spaceWorker.jsx', import.meta.url), { type: 'module' });
  }
  return _spaceWorker;
}

export default function SpaceBackdrop({
  isMobile, isOnHomePage, animateSaturn, saturnZIndex,
}) {
  const worker = useMemo(() => getSpaceWorker(), []);

  // Saturn canvas 的自適應畫質 + 分頁隱藏暫停
  const [dpr, setDpr] = useState(1.5);
  const [frameloop, setFrameloop] = useState('always');
  useEffect(() => {
    const onVis = () => setFrameloop(document.hidden ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <>
      {/* 星空：worker 渲染（z 在 Saturn 之下）。fallback 在不支援 OffscreenCanvas 時走主執行緒 */}
      <OffscreenCanvas
        worker={worker}
        fallback={<StarfieldWorkerScene />}
        camera={{ position: [0, 0, 5] }}
        dpr={[1, 2]}
        style={{ ...fixedFull, zIndex: 1 }}
      />

      {/* Saturn：主執行緒（貼圖/bloom/捲動互動需要 DOM）。intro 爆炸時 saturnZIndex 拉高 */}
      {isOnHomePage && (
        <Canvas
          camera={{ position: [0, 0, 5] }}
          dpr={dpr}
          frameloop={frameloop}
          gl={{ powerPreference: 'high-performance', antialias: true, alpha: true }}
          style={{ ...fixedFull, zIndex: saturnZIndex, background: 'transparent' }}
        >
          <PerformanceMonitor
            onDecline={() => setDpr((d) => Math.max(0.6, +(d - 0.4).toFixed(2)))}
            onIncline={() => setDpr((d) => Math.min(2, +(d + 0.3).toFixed(2)))}
          />
          <Suspense fallback={null}>
            <Saturn3D animate={animateSaturn} isMobile={isMobile} />
          </Suspense>
        </Canvas>
      )}

      {/* DOM 特效（非 WebGL）維持原本的 gating */}
      {isOnHomePage && <ForegroundStars count={isMobile ? 5 : 15} />}
      {isOnHomePage && !isMobile && <RandomShootingStars />}
      {isOnHomePage && !isMobile && <RandomComets />}
      {isOnHomePage && <RandomUFOs />}
      {!isMobile && <CursorTrail style={{ position: 'fixed', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }} />}
    </>
  );
}
