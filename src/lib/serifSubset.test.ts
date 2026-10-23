import { describe, expect, it } from 'vite-plus/test';
import { decodeCodepoints, isSerifCodepoint, keyOf, MAX_CODEPOINTS, subsetUrl, unicodeRangeOf } from './serifSubset';

// 按碼位拆字是刻意的：伺服器要的就是碼位，不是使用者看到的字素
const cps = (s: string) => Array.from(s, (c) => c.codePointAt(0) ?? 0);
const cOf = (url: string) => new URL(url, 'https://x').searchParams.get('c') ?? '';

describe('按頁裁字的網址', () => {
  it('同一組字不管順序、重複，網址都一樣（才能被快取）', () => {
    expect(subsetUrl(400, cps('手記碎念'))).toBe(subsetUrl(400, cps('念碎記手手')));
  });

  it('網址上的鍵是 c 的雜湊，伺服器拿它比對', () => {
    const url = subsetUrl(600, cps('宙と木'));
    const [, weight, key] = /\/fonts\/serif\/(\d+)\/([0-9a-f]{8})\.woff2\?c=/.exec(url) ?? [];
    expect(weight).toBe('600');
    expect(key).toBe(keyOf(cOf(url)));
  });

  it('解得回原本的字集', () => {
    const text = 'Koimsurai 宙と木，2026.10.23「手記」';
    expect(decodeCodepoints(cOf(subsetUrl(400, cps(text))))).toEqual([...new Set(cps(text))].sort((a, b) => a - b));
  });
});

describe('decodeCodepoints 擋掉不該裁的請求', () => {
  it.each([
    ['空字串', ''],
    ['不是 36 進位', '4e00.!'],
    ['沒有遞增（差值為 0）', '4e00.0'],
    ['不在字型範圍裡的字（emoji）', (0x1f600).toString(36)],
    ['控制字元', '1'],
  ])('%s → null', (_name, c) => {
    expect(decodeCodepoints(c)).toBeNull();
  });

  it('超過字數上限 → null', () => {
    const many = Array.from({ length: MAX_CODEPOINTS + 1 }, (_, i) => 0x4e00 + i);
    expect(decodeCodepoints(cOf(subsetUrl(400, many)))).toBeNull();
  });
});

describe('其他', () => {
  it('unicode-range 把連續的碼位併成一段', () => {
    expect(unicodeRangeOf([0x4e03, 0x4e00, 0x4e01, 0x4e02, 0x41])).toBe('U+41,U+4E00-4E03');
  });

  it('英數、標點、漢字、假名要裁；emoji 與控制字元不裁', () => {
    for (const ch of 'aZ0，。「永ア') expect(isSerifCodepoint(ch.codePointAt(0) ?? 0)).toBe(true);
    for (const cp of [0x0a, 0x1f600]) expect(isSerifCodepoint(cp)).toBe(false);
  });
});
