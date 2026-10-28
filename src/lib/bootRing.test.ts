import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vite-plus/test';

import { BOOT_SCRIPT } from './bootRing';

/** 在一個假的瀏覽器環境裡跑 head 那段腳本，拿到它定義的 window.__bootP */
function load() {
  const attrs = new Map<string, string>();
  const win: Record<string, unknown> = {};
  const ctx = {
    window: win,
    navigator: { webdriver: false },
    location: { pathname: '/' },
    matchMedia: () => ({ matches: false }),
    sessionStorage: { getItem: () => null, setItem: () => undefined },
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        hasAttribute: (k: string) => attrs.has(k),
        removeAttribute: (k: string) => attrs.delete(k),
        querySelector: () => null,
      },
      addEventListener: () => undefined,
    },
    addEventListener: () => undefined,
    setTimeout: () => 0,
    Math,
  };
  runInNewContext(BOOT_SCRIPT, ctx);
  return { bootP: win.__bootP as ((p?: number) => void) & { angle: (p: number) => number }, attrs };
}

describe('開場環的進度（弧長 → 橢圓參數角）', () => {
  const { bootP, attrs } = load();

  it('掛上 data-boot，定義 __bootP', () => {
    expect(attrs.get('data-boot')).toBe('');
    expect(typeof bootP).toBe('function');
  });

  it('橢圓上下、左右對稱：弧長的四分點正好在 90° 的倍數', () => {
    expect(bootP.angle(0)).toBeCloseTo(0, 6);
    expect(bootP.angle(0.25)).toBeCloseTo(90, 6);
    expect(bootP.angle(0.5)).toBeCloseTo(180, 6);
    expect(bootP.angle(0.75)).toBeCloseTo(270, 6);
    expect(bootP.angle(1)).toBeCloseTo(360, 6);
  });

  it('照弧長走，不是照角度：長軸兩端每一度的弧很短，弧長走 1/8 時角度已經超過 45°', () => {
    // ds/dθ = √(sin²θ + 0.408²·cos²θ)：0° 時 0.408、90° 時 1
    expect(bootP.angle(0.125)).toBeGreaterThan(50);
    expect(bootP.angle(0.125)).toBeLessThan(70);
  });

  it('單調遞增；負的進度繞回最後面（筆尖後面那幾顆在起點時落在最後一段）', () => {
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const a = bootP.angle(i / 200);
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
    expect(bootP.angle(-0.02)).toBeCloseTo(bootP.angle(0.98), 6);
  });
});
