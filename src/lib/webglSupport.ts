// 3D 背景掛載前的 GPU 探測：這台機器有沒有「硬體加速的 WebGL」。
//
// 背景：Chromium 137 移除了 SwiftShader WebGL fallback——硬體 context 建立失敗時
// `getContext()` 直接回 null（不再靜默降到 CPU 渲染）。加速被停用的機器（驅動
// blocklist / GPU process 崩潰過多 / 手動關閉）上，THREE.WebGLRenderer 會直接 throw。
// 官方建議：網站自行測試並處理 context 建立失敗（blink-dev "Intent to Remove:
// SwiftShader Fallback"）。
//
// 但「context 建得起來」不等於「跑得動」：使用者在瀏覽器設定裡關掉硬體加速時，
// Chrome/Edge 仍會給一個由 SwiftShader（純 CPU 光柵化）撐起來的 WebGL context。
// 兩萬多顆 instanced 星星在上面是個位數 fps——這時候降低星星數量救不了，唯一正解是
// 完全不掛 3D、直接走 DOM 特效。所以連 renderer 字串一起看：軟體渲染 → 視同不可用。
//
// ⚠️ 探測一定要在 worker 裡做，不要搬回主執行緒同步呼叫。建 WebGL context 要同步等 GPU
// 行程初始化：實測首頁載入時這一個呼叫在內顯上卡住主執行緒 96ms（瀏覽器已開著）到
// 382ms（冷啟動），正好壓在 hydration 那一幀裡，是載入期最長的一段。頁面載完之後再建
// 只要 4–6ms，所以平常量不到它。搬進 worker 之後主執行緒的幀間隔維持 17ms。
//
// 瀏覽器不支援 worker 裡的 WebGL（OffscreenCanvas 不存在，或 worker 裡拿不到 context）時，
// 退回主執行緒探測，但延到閒置時做。「worker 裡拿不到」分不出是沒有 GPU 還是不支援，
// 所以也走主執行緒再確認一次——只有真的沒有 GPU 的機器會付這個成本。
//
// 結果快取（加速狀態在分頁生命週期內不會自己好轉；真的變了重整即可）。
import { inspectWebGL } from './webglRenderer';

const WORKER_TIMEOUT_MS = 4000;

let pending: Promise<boolean> | null = null;

/** true = 有硬體加速的 WebGL。false = 拿不到 context，或拿到的是 CPU 光柵化。 */
export function probeHardwareGpu(): Promise<boolean> {
  pending ??= runProbe();
  return pending;
}

function probeOnMainThread(): boolean {
  try {
    return inspectWebGL(document.createElement('canvas')) === 'hardware';
  } catch {
    return false;
  }
}

function probeWhenIdle(): Promise<boolean> {
  return new Promise((resolve) => {
    const run = () => resolve(probeOnMainThread());
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else setTimeout(run, 0);
  });
}

async function runProbe(): Promise<boolean> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return probeWhenIdle();
  try {
    const verdict = await new Promise<unknown>((resolve) => {
      const worker = new Worker(new URL('../workers/gpuProbeWorker.ts', import.meta.url), { type: 'module' });
      const done = (v: unknown) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(v);
      };
      const timer = setTimeout(() => done('timeout'), WORKER_TIMEOUT_MS);
      worker.onmessage = (e: MessageEvent<unknown>) => done(e.data);
      worker.onerror = () => done('error');
    });
    if (verdict === 'hardware') return true;
    if (verdict === 'software') return false;
  } catch {
    // worker 建不起來（CSP、舊瀏覽器）→ 下面退回主執行緒
  }
  return probeWhenIdle();
}
