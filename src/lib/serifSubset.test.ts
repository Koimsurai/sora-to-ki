import { describe, expect, it } from 'vite-plus/test';
import {
  decodeCodepoints,
  familyOf,
  styleOfFamily,
  isSerifCodepoint,
  isSerifFace,
  keyOf,
  MAX_CODEPOINTS,
  serifFaceOf,
  subsetUrl,
  unicodeRangeOf,
} from './serifSubset';

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

  it('英數、標點、漢字、假名、韓文要裁；emoji 與控制字元不裁', () => {
    for (const ch of 'aZ0，。「永ア한글') expect(isSerifCodepoint(ch.codePointAt(0) ?? 0)).toBe(true);
    for (const cp of [0x0a, 0x1f600]) expect(isSerifCodepoint(cp)).toBe(false);
  });
});

describe('四套字形', () => {
  it('語系對到哪一套：簡中、日文、韓文各自一套，繁中與其他語系用繁中那套', () => {
    expect(serifFaceOf('zh-TW')).toBe('tc');
    expect(serifFaceOf('en')).toBe('tc');
    expect(serifFaceOf('zh-CN')).toBe('sc');
    expect(serifFaceOf('ja')).toBe('jp');
    expect(serifFaceOf('ko')).toBe('kr');
  });

  it('繁中的網址跟以前一樣（不帶 f），其他套帶 f；伺服器只收認得的那幾套', () => {
    expect(subsetUrl(400, cps('永'))).not.toContain('&f=');
    expect(new URL(subsetUrl(400, cps('永'), 'jp'), 'https://x').searchParams.get('f')).toBe('jp');
    expect(['tc', 'sc', 'jp', 'kr'].every(isSerifFace)).toBe(true);
    for (const v of ['', 'TC', 'zh', undefined, 1]) expect(isSerifFace(v)).toBe(false);
  });
});

describe('四種字型風格', () => {
  it('宋體的網址跟以前一樣（瀏覽器與伺服器快取裡的照用），其他風格換路徑', () => {
    expect(subsetUrl(400, cps('宙'))).toMatch(/^\/fonts\/serif\/400\//);
    expect(subsetUrl(600, cps('宙'), 'jp', 'kai')).toMatch(/^\/fonts\/kai\/600\/[0-9a-f]{8}\.woff2\?c=[^&]+&f=jp$/);
  });

  it('字族名：繁中不加後綴，其他加語系；宋體沿用原本的 Koim Serif', () => {
    expect(familyOf('serif', 'tc')).toBe('Koim Serif');
    expect(familyOf('kai', 'kr')).toBe('Koim Kai KR');
    expect(familyOf('modern', 'sc')).toBe('Koim Modern SC');
  });

  it('從 font-family 的第一個字族認得出是哪一種（含引號），別的字型不算', () => {
    expect(styleOfFamily('"Koim Sans JP"')).toBe('sans');
    expect(styleOfFamily(' Koim Kai')).toBe('kai');
    expect(styleOfFamily('"Koim Serif"')).toBe('serif');
    expect(styleOfFamily('"Koim Serifish"'), '名字開頭一樣但不是同一個字族').toBeNull();
    expect(styleOfFamily('"Fira Code"')).toBeNull();
  });
});

describe('哪些字交給裁字字型', () => {
  it('箭頭與數學符號也要（「查看原文 →」「⋯」原本每次都退回系統字型）', () => {
    for (const ch of '→⋯×') expect(isSerifCodepoint(ch.codePointAt(0) ?? 0), ch).toBe(true);
  });
});
