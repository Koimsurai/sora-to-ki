import { describe, expect, it } from 'vite-plus/test';
import { createFramePacer } from './framePacer';

const ACTIVE = 1000 / 60;
const IDLE = 1000 / 30;

/** 以固定更新率跑 seconds 秒，回傳實際畫了幾幀與畫的幀之間的間隔種類 */
function run(hz: number, targetMs: number, seconds = 3) {
  const pacer = createFramePacer();
  const vsync = 1000 / hz;
  const rendered: number[] = [];
  // 前 1 秒讓 vsync 估計收斂，不計入
  for (let i = 0; i * vsync < (seconds + 1) * 1000; i++) {
    const now = i * vsync;
    if (pacer.shouldRender(now, targetMs) && now >= 1000) rendered.push(now);
  }
  const gaps = new Set(rendered.slice(1).map((t, i) => Math.round((t - rendered[i]) * 10) / 10));
  return { fps: rendered.length / seconds, gaps: [...gaps] };
}

describe('framePacer', () => {
  it.each([
    [60, 60],
    [75, 75],
    [120, 60],
    [144, 72],
    [165, 55],
    [240, 60],
  ])('活動時 %iHz → %ifps，且每幀間隔一致', (hz, fps) => {
    const r = run(hz, ACTIVE);
    expect(r.fps).toBeCloseTo(fps, 0);
    expect(r.gaps).toHaveLength(1);
  });

  it.each([
    [60, 30],
    [120, 30],
    [144, 28.8],
    [240, 30],
  ])('閒置時 %iHz → %ffps', (hz, fps) => {
    expect(run(hz, IDLE).fps).toBeCloseTo(fps, 0);
  });

  it('第一個 rAF 一定畫，reset 之後也是', () => {
    const p = createFramePacer();
    expect(p.shouldRender(0, IDLE)).toBe(true);
    expect(p.shouldRender(16.7, IDLE)).toBe(false);
    p.reset();
    expect(p.shouldRender(5000, IDLE)).toBe(true);
  });

  it('暫停的空檔不會被當成 vsync 間隔', () => {
    const p = createFramePacer();
    for (let t = 0; t < 1000; t += 1000 / 144) p.shouldRender(t, ACTIVE);
    p.reset();
    // 恢復後 144Hz 仍維持每 2 格畫一次
    const base = 60_000;
    const out = Array.from({ length: 8 }, (_, i) => p.shouldRender(base + (i * 1000) / 144, ACTIVE));
    expect(out).toEqual([true, false, true, false, true, false, true, false]);
  });
});
