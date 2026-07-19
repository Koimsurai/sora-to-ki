// WebGL 可用性 pre-flight probe。
//
// 背景：Chromium 137 移除了 SwiftShader WebGL fallback——硬體 context 建立失敗時
// `getContext()` 直接回 null（不再靜默降到 CPU 渲染）。加速被停用的機器（驅動
// blocklist / GPU process 崩潰過多 / 手動關閉）上，THREE.WebGLRenderer 會直接 throw。
// 官方建議：網站自行測試並處理 context 建立失敗（blink-dev "Intent to Remove:
// SwiftShader Fallback"）。
//
// 用法：掛任何 R3F <Canvas> 前先呼叫；false → 不掛 WebGL、走純 DOM 特效降級。
// 結果快取（加速狀態在分頁生命週期內不會自己好轉；真的變了重整即可）。

let cached: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cached = gl !== null;
    // 釋放探測用 context（瀏覽器對同時存活的 WebGL context 數量有上限）
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
