// GPU 探測 worker：建一次 WebGL context、回報結果就結束。用法與理由見 lib/webglSupport.ts。
import { inspectWebGL } from '../lib/webglRenderer';

let verdict: string;
try {
  verdict = typeof OffscreenCanvas === 'undefined' ? 'unsupported' : inspectWebGL(new OffscreenCanvas(1, 1));
} catch {
  verdict = 'unsupported';
}
self.postMessage(verdict);
