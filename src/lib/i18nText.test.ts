// 站長填的多語文字：沒翻的語系要退回繁中，而不是顯示空白——空白在畫面上沒有任何症狀
import { describe, expect, it } from 'vite-plus/test';

import { pickText } from './i18nText';

describe('pickText', () => {
  it('有這個語系就用它', () => {
    expect(pickText({ 'zh-TW': '出生', en: 'Born' }, 'en')).toBe('Born');
  });

  it('沒填或填了空字串都退回繁中', () => {
    expect(pickText({ 'zh-TW': '出生' }, 'ja')).toBe('出生');
    expect(pickText({ 'zh-TW': '出生', ja: '' }, 'ja')).toBe('出生');
  });

  it('連繁中都沒有，就隨便一個有填的', () => {
    expect(pickText({ en: 'Born' }, 'ko')).toBe('Born');
  });

  it('什麼都沒有是空字串', () => {
    expect(pickText(undefined, 'en')).toBe('');
    expect(pickText({}, 'en')).toBe('');
  });
});
