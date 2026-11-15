import { describe, expect, it } from 'vite-plus/test';
import { linkify } from './linkify';

const hrefs = (s: string) => linkify(s).flatMap((p) => ('href' in p ? [p.href] : []));

describe('linkify', () => {
  it('沒有網址就整段原樣', () => {
    expect(linkify('只是一段話')).toEqual([{ text: '只是一段話', at: 0 }]);
    expect(linkify('')).toEqual([]);
  });

  it('切開前後的字，接回去跟原文一樣', () => {
    const s = '看這個 https://example.com/a?b=1#c 很好用';
    const parts = linkify(s);
    expect(parts.map((p) => p.text).join('')).toBe(s);
    expect(hrefs(s)).toEqual(['https://example.com/a?b=1#c']);
  });

  it('中文標點與全形括號不算進網址', () => {
    expect(hrefs('網址是https://example.com/x，你看看。')).toEqual(['https://example.com/x']);
    expect(hrefs('（https://example.com）')).toEqual(['https://example.com']);
  });

  it('結尾的英文標點剝掉，網址自己的括號留著', () => {
    expect(hrefs('see https://example.com/page.')).toEqual(['https://example.com/page']);
    expect(hrefs('(https://example.com/x)')).toEqual(['https://example.com/x']);
    expect(hrefs('https://en.wikipedia.org/wiki/Alien_(film)')).toEqual(['https://en.wikipedia.org/wiki/Alien_(film)']);
  });

  it('只認 http(s)，其他協定與沒有主機的不轉', () => {
    expect(hrefs('javascript:alert(1) ftp://x.com https://')).toEqual([]);
  });

  it('一段裡好幾個網址', () => {
    expect(hrefs('http://a.com 和 https://b.com/c\nhttps://d.com')).toEqual([
      'http://a.com',
      'https://b.com/c',
      'https://d.com',
    ]);
  });
});
