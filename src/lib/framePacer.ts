// 背景渲染迴圈的節拍：決定「這個 vsync 要不要畫」。用在 starfieldGpu.ts 的渲染迴圈。
//
// ⚠ 用「每 N 個 vsync 畫一次」而不是時間門檻。門檻寫成「距上次 ≥ 16.7ms 才畫」的話，
//   144Hz（6.94ms 一格）要等到第 3 格（20.8ms）才過——實際只剩 48fps，而且要是門檻放寬讓它
//   有時 2 格、有時 3 格，間隔就忽長忽短，比穩定的低幀率更像卡頓。取整數倍則每幀間隔一致：
//   144Hz → 每 2 格（72fps）、120Hz → 2（60）、165Hz → 3（55）、240Hz → 4（60）、60Hz → 1。
//
// 單獨成檔是為了能測：starfieldGpu.ts 一 import 就要載入 three/webgpu。

export interface FramePacer {
  /** 每個 rAF 都呼叫。targetMs 是想要的幀間隔（例如 1000/60）。 */
  shouldRender(now: number, targetMs: number): boolean;
  /** 暫停後恢復時呼叫：下一次一定畫，暫停期間的空檔不算進 vsync 估計 */
  reset(): void;
  /** 目前估到的 vsync 間隔（?debug=perf 用） */
  readonly vsyncMs: number;
}

export function createFramePacer(): FramePacer {
  /** vsync 間隔的移動平均（rAF 的呼叫間隔，含沒畫的那些） */
  let vsyncMs = 1000 / 60;
  let lastTick = -1;
  let ticksSinceRender = 0;
  let pendingFirst = true;
  return {
    shouldRender(now, targetMs) {
      // 只取像 vsync 的間隔：分頁切回或掉幀時的大間隔不算進去
      if (lastTick >= 0) {
        const tick = now - lastTick;
        if (tick > 2 && tick < 40) vsyncMs = vsyncMs * 0.95 + tick * 0.05;
      }
      lastTick = now;
      ticksSinceRender += 1;
      const every = Math.max(1, Math.round(targetMs / vsyncMs));
      if (!pendingFirst && ticksSinceRender < every) return false;
      pendingFirst = false;
      ticksSinceRender = 0;
      return true;
    },
    reset() {
      lastTick = -1;
      ticksSinceRender = 0;
      pendingFirst = true;
    },
    get vsyncMs() {
      return vsyncMs;
    },
  };
}
