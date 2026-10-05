import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { cn } from './utils';

describe('cn 認得字級尺的 text-fs-*', () => {
  it('跟顏色並存時不會把字級刪掉', () => {
    // 預設的 tailwind-merge 會把 text-fs-11 當成顏色，這裡會只剩 text-red-400。
    expect(cn('text-fs-11 text-red-400')).toBe('text-fs-11 text-red-400');
  });

  it('跟 Tailwind 內建字級衝突時後者勝', () => {
    expect(cn('text-sm text-fs-11')).toBe('text-fs-11');
    expect(cn('text-fs-11 text-xs')).toBe('text-xs');
  });

  it('index.css 的每一格都認得（加新格忘了改 utils.ts 會在這裡紅）', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    const keys = [...css.matchAll(/--text-(fs-\d+):/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(cn('text-sm', `text-${k}`), k).toBe(`text-${k}`);
  });
});
