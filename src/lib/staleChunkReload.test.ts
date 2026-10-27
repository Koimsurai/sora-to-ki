import { describe, expect, it } from 'vite-plus/test';
import { shouldReload } from './staleChunkReload';

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
