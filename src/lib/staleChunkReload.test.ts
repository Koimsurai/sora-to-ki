import { describe, expect, it } from 'vite-plus/test';
import { isStaleChunkError, shouldReload } from './staleChunkReload';

describe('部署後載不到舊 chunk 時重整', () => {
  it('沒重整過就重整', () => {
    expect(shouldReload(null, 1_000_000)).toBe(true);
  });

  it('剛重整過又失敗就不再重整：那是真的載不到，不是版本換了', () => {
    expect(shouldReload(1_000_000, 1_000_000 + 5_000)).toBe(false);
  });

  it('過了冷卻時間又遇到新的部署，可以再重整一次', () => {
    expect(shouldReload(1_000_000, 1_000_000 + 60_000)).toBe(true);
  });

  it('存的值壞掉（不是數字）當成沒重整過', () => {
    expect(shouldReload(Number('abc'), 1_000_000)).toBe(true);
  });
});

describe('哪些錯誤算「舊分頁載不到 chunk」', () => {
  it('認得 GlitchTip 上出現過的幾種寫法', () => {
    for (const msg of [
      'Failed to fetch dynamically imported module: https://koimsurai.com/assets/BlogPost-pu7Ls.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://koimsurai.com/assets/Notes-x.js',
      'Unable to preload CSS for https://koimsurai.com/assets/BlogPost-CsX4Mula.css',
    ])
      expect(isStaleChunkError(msg)).toBe(true);
  });

  it('其他錯誤照常回報', () => {
    expect(isStaleChunkError("Failed to execute 'createRadialGradient'")).toBe(false);
    expect(isStaleChunkError('')).toBe(false);
  });
});
