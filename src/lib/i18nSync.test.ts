import { describe, expect, it } from 'vite-plus/test';
import { SYNC_KEY, fingerprint, isStale, markSynced as mark, staleCounts } from './i18nSync';

// 測試裡的欄位都當成一般的多語欄位（語系 → 字），才查得到 _src
const markSynced = (v: Record<string, string>, lang: string, base: string) => mark(v, lang, base);

describe('譯文跟不跟得上原文', () => {
  it('寫譯文時記下原文指紋，原文沒改就不算過期', () => {
    const v = markSynced({ 'zh-TW': '出生', en: 'Born' }, 'en', 'zh-TW');
    expect(v[SYNC_KEY]).toBe(`en:${fingerprint('出生')}`);
    expect(isStale(v, 'en', 'zh-TW')).toBe(false);
  });

  it('原文改了，對著舊版翻的語系就是可能過期；重新對過就好了', () => {
    const v = markSynced({ 'zh-TW': '出生', en: 'Born' }, 'en', 'zh-TW');
    const edited = { ...v, 'zh-TW': '2004 年，雲林。' };
    expect(isStale(edited, 'en', 'zh-TW')).toBe(true);
    expect(isStale(markSynced(edited, 'en', 'zh-TW'), 'en', 'zh-TW')).toBe(false);
  });

  it('沒有指紋的舊譯文、沒有譯文、原文自己，都不算過期', () => {
    expect(isStale({ 'zh-TW': '新的', en: 'old' }, 'en', 'zh-TW')).toBe(false);
    expect(isStale({ 'zh-TW': '新的', [SYNC_KEY]: 'en:00000000' }, 'en', 'zh-TW')).toBe(false);
    expect(isStale({ 'zh-TW': '新的' }, 'zh-TW', 'zh-TW')).toBe(false);
  });

  it('前後空白不算改過', () => {
    expect(fingerprint(' 出生 ')).toBe(fingerprint('出生'));
  });

  it('整份內容數出每個語系有幾格過期，不把 _src 或一般字串當成多語欄位', () => {
    const synced = markSynced({ 'zh-TW': 'A', en: 'a', ja: 'あ' }, 'en', 'zh-TW');
    const content = {
      chapters: [
        { year: '2004', title: { ...synced, 'zh-TW': 'A2' } },
        { year: 'NOW', title: { 'zh-TW': 'B', en: 'b' } },
      ],
      quote: { text: 'Stay hungry', cite: 'Jobs' },
    };
    expect(staleCounts(content, ['en', 'ja'], 'zh-TW')).toEqual({ en: 1, ja: 0 });
  });
});
