// 站台身分：別人架起來的站不能還帶著原作者的名字與網址，而這些地方（標題、canonical、
// 站內連結判斷）錯了都沒有任何症狀。
import { describe, expect, it } from 'vite-plus/test';

import { isOriginSite, isOwnHost, isOwnUrl, setSiteIdentity, siteHost, siteTitle, siteUrl } from './siteIdentity';

const config = (over: Partial<Parameters<typeof setSiteIdentity>[0]> = {}) => ({
  url: 'https://www.example.com/',
  name: '某某的站',
  author: '某某',
  description: '',
  disabled_pages: [],
  email: '',
  github: '',
  default_locale: 'zh-TW',
  locales: ['zh-TW'],
  theme: 'saturn',
  page_descriptions: {},
  ...over,
});

describe('siteIdentity', () => {
  it('還沒拿到設定前是中性的預設，不是原作者的站', () => {
    expect(siteTitle()).toBe('My Site');
    expect(siteUrl()).not.toContain('koimsurai');
  });

  it('網址去掉結尾的 /，host 去掉 www.', () => {
    setSiteIdentity(config());
    expect(siteUrl()).toBe('https://www.example.com');
    expect(siteHost()).toBe('example.com');
  });

  it('作者跟站名一樣時標題不重複', () => {
    setSiteIdentity(config({ name: '同名', author: '同名' }));
    expect(siteTitle()).toBe('同名');
    setSiteIdentity(config());
    expect(siteTitle()).toBe('某某的站 · 某某');
  });

  it('站名是空的（後端連不上）就不採用', () => {
    setSiteIdentity(config({ name: '留著的站' }));
    setSiteIdentity(config({ name: '', url: 'https://other.example' }));
    expect(siteTitle()).toContain('留著的站');
    expect(siteUrl()).toBe('https://www.example.com');
  });

  it('自己的站含子網域，長得像的別人網域不算', () => {
    setSiteIdentity(config());
    expect(isOwnHost('example.com')).toBe(true);
    expect(isOwnHost('www.example.com')).toBe(true);
    expect(isOwnHost('archive.example.com')).toBe(true);
    expect(isOwnHost('notexample.com')).toBe(false);
    expect(isOwnUrl('https://example.com/blog/1')).toBe(true);
    expect(isOwnUrl('/blog/1')).toBe(false);
    expect(isOwnUrl('https://github.com/example.com')).toBe(false);
  });

  it('只有原站會把讀者導去這套程式的 Issues', () => {
    expect(isOriginSite('Koimsurai')).toBe(true);
    expect(isOriginSite('someone-else')).toBe(false);
    expect(isOriginSite('')).toBe(false);
  });
});
