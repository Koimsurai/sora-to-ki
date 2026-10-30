import { describe, expect, it } from 'vite-plus/test';
import { createSpiral } from './worksSky';

// 新站的作品頁一件都沒有：曾經每一幀都在 moonOf 讀 undefined.moons 而丟錯，畫布整片停住
describe('作品頁螺旋：一件都沒有', () => {
  const spiral = createSpiral([]);

  it('琥珀點停在起點，航線長度是 0', () => {
    expect(spiral.tLast).toBe(0);
    expect(spiral.moonOf(spiral.newest, 800, 600, 0)).toEqual(spiral.point(800, 600, 0, 0));
  });

  it('畫一幀不丟錯，也沒有任何一件', () => {
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, key) => (key === 'createRadialGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined),
      set: () => true,
    });
    const frame = { w: 800, h: 600, t: 1, dt: 0.016, near: -1, grow: 1, erase: 0, settle: 0 };
    expect(spiral.draw(ctx, frame)).toEqual([]);
  });
});
