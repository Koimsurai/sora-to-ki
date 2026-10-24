import { describe, expect, it } from 'vite-plus/test';
import { sameTitle } from './pageTitle';

describe('sameTitle', () => {
  it('標題已經寫著那個英文名就不重複', () => {
    expect(sameTitle('Collection', 'Collection')).toBe(true);
    expect(sameTitle('Flight log', 'Log')).toBe(true);
    expect(sameTitle('收藏', 'Collection')).toBe(false);
    expect(sameTitle('コレクション', 'Collection')).toBe(false);
  });
});
