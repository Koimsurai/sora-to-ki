// 建一個 WebGL context 看它是硬體還是軟體渲染。主執行緒與 gpuProbeWorker 共用這一份——
// 拆成獨立檔是因為 worker 不能 import webglSupport.ts（那裡有 `new Worker(new URL(...))`，
// worker 自己 import 它會讓 vite 試圖把 worker 再包進 worker 裡）。

/** SwiftShader / llvmpipe / WARP 等 CPU 光柵化器的 renderer 字串特徵 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render|software|微软基本呈现/i;

/** none：拿不到 context。software：拿得到但是 CPU 光柵化。hardware：真的有 GPU。 */
export type WebGLVerdict = 'none' | 'software' | 'hardware';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export function inspectWebGL(canvas: HTMLCanvasElement | OffscreenCanvas): WebGLVerdict {
  // 兩種 canvas 的 getContext 多載不相容，合成聯集後 TS 叫不動，這裡只需要 webgl 那兩條
  const get = canvas.getContext.bind(canvas) as (type: 'webgl2' | 'webgl') => GL | null;
  const gl = get('webgl2') ?? get('webgl');
  if (!gl) return 'none';
  // UNMASKED_RENDERER 才看得到真實裝置名；擴充被擋掉時退回 RENDERER（多半是 "WebKit WebGL"，
  // 認不出軟體渲染，那就當它是硬體——寧可誤放也不要誤殺有 GPU 的機器）
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const names: unknown[] = [dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, gl.getParameter(gl.RENDERER)];
  const name = names.map((n) => (typeof n === 'string' ? n : '')).find((n) => n !== '') ?? '';
  // 釋放探測用 context（瀏覽器對同時存活的 WebGL context 數量有上限）
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return SOFTWARE_RENDERER.test(name) ? 'software' : 'hardware';
}
