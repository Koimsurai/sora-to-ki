// 3D 背景（星空＋首頁土星）提早起跑。
//
// 原本 3D 要排一整串才開始：React 接手 → 背景殼（SpaceBackdropShell）的 chunk → GPU 探測 →
// StarfieldGpu 的 chunk（React.lazy，載好之後 Suspense 還會再等約 300ms 才顯示）→ effect 把 canvas 交給 worker →
// worker 這時才下載、解析自己那包 three.js（928KB，壓縮後 250KB）。實測一般電腦 0.85 秒才交出 canvas，
// 3D 要 1.1 秒（CPU 降速 4 倍時 1.8 秒）才畫得出第一幀，首頁的開場常常等不到它。
//
// 這裡在主程式一跑起來（__root 這個模組被執行時）就把這幾件事同時開始：建 worker（下載、解析 three.js）、
// GPU 探測、下載背景殼與 StarfieldGpu 的 chunk。都只是先準備好，畫面上什麼都不會變：worker 照樣等 StarfieldGpu
// 掛上、送 init（帶著 canvas）才真的開始畫。不會用到 3D 的情況照 SpaceBackdropShell 的規則先擋掉，
// 探測結果是軟體渲染時由它收掉（dropSpaceWorker）。

import { isBotUserAgent } from '@/lib/bot';
import { probeHardwareGpu } from '@/lib/webglSupport';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import type * as SpaceBackdropShellModule from './SpaceBackdropShell';
import type * as StarfieldGpuModule from './StarfieldGpu';

let early: Worker | null = null;
let starfield: Promise<typeof StarfieldGpuModule> | null = null;
let shell: Promise<typeof SpaceBackdropShellModule> | null = null;

/** StarfieldGpu 的 chunk（只下載一次）。SpaceBackdropShell 用它，不經過 React.lazy／Suspense */
export const loadStarfieldGpu = () => (starfield ??= import('./StarfieldGpu'));
/** 背景殼的 chunk（只下載一次）。layout/AppShell 用它，同樣不經過 React.lazy／Suspense */
export const loadSpaceBackdropShell = () => (shell ??= import('./SpaceBackdropShell'));

/** 主程式一開始就呼叫：會用到 3D 的話先把 worker、GPU 探測、StarfieldGpu 的 chunk 都開始準備 */
export function prewarmSpaceBackdrop() {
  if (early || typeof window === 'undefined' || typeof Worker === 'undefined') return;
  // 自動化測試（e2e）與爬蟲不載 three：沒有 GPU 的機器上多解析一次 three.js 是白花的，CI 曾因此逾時
  if (navigator.webdriver || isBotUserAgent(navigator.userAgent)) return;
  // 手機只在首頁跑 3D（SpaceBackdropShell）
  if (window.matchMedia('(max-width: 768px)').matches && stripLocalePrefix(window.location.pathname) !== '') return;
  void probeHardwareGpu();
  void loadSpaceBackdropShell().catch(() => undefined);
  void loadStarfieldGpu().catch(() => undefined);
  // StarfieldGpu 的 worker 路徑要能把 canvas 交出去；不行的話它在主執行緒跑，用不到 worker
  if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;
  try {
    // ⚠️ 必須是字面相對路徑：vite 靠靜態分析 `new URL(…, import.meta.url)` 認出 worker 進入點
    early = new Worker(new URL('../../workers/spaceGpuWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    early = null;
  }
}

/** StarfieldGpu 要 worker 時先拿提早建立的那個（只給一次），沒有就自己建一個新的 */
export function takeSpaceWorker(): Worker {
  const w = early;
  early = null;
  return w ?? new Worker(new URL('../../workers/spaceGpuWorker.ts', import.meta.url), { type: 'module' });
}

/** 確定用不到 3D（探測是軟體渲染）：把提早建立、還沒被拿走的 worker 收掉 */
export function dropSpaceWorker() {
  early?.terminate();
  early = null;
}
