// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { DEFAULT_PALETTE, channels, hex, palette } from './palette';

describe('palette', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--amber-rgb');
  });

  it('讀不到 CSS 變數時退回預設值', () => {
    expect(palette()).toEqual(DEFAULT_PALETTE);
  });

  it('讀 :root 的 -rgb 變數，蓋掉哪個就換哪個', () => {
    document.documentElement.style.setProperty('--amber-rgb', ' 1, 2, 3 ');
    expect(palette()).toEqual({ ...DEFAULT_PALETTE, amber: '1, 2, 3' });
  });

  it('預設值跟 index.css 的原始層一字不差（改了一邊沒改另一邊，canvas 的退回值就會跟頁面不同色）', () => {
    // jsdom 底下 import.meta.url 不是 file:，從 repo 根目錄（測試的工作目錄）讀
    const css = readFileSync('src/index.css', 'utf8');
    for (const key of ['ground', 'paper', 'amber', 'flare'] as const) {
      const rgb = new RegExp(`--${key}-rgb:\\s*([^;]+);`).exec(css)?.[1]?.trim();
      const solid = new RegExp(`--${key}:\\s*(#[0-9a-f]{6});`, 'i').exec(css)?.[1]?.toLowerCase();
      expect(rgb, `--${key}-rgb`).toBe(DEFAULT_PALETTE[key]);
      expect(solid, `--${key}`).toBe(hex(DEFAULT_PALETTE[key]));
    }
  });

  it('channels 拆成三個數字', () => {
    expect(channels('233, 193, 122')).toEqual([233, 193, 122]);
    expect(channels('233,193,122')).toEqual([233, 193, 122]);
  });
});
