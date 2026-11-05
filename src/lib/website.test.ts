import { describe, expect, it } from 'vite-plus/test';

import { websiteHref } from './website';

describe('websiteHref', () => {
  it('只填網域的補上 https://，不會變成站內的相對路徑', () => {
    expect(websiteHref('ikuka.blog')).toBe('https://ikuka.blog/');
    expect(websiteHref(' www.example.com/about ')).toBe('https://www.example.com/about');
    expect(websiteHref('//example.com')).toBe('https://example.com/');
    expect(websiteHref('example.com:8080/x')).toBe('https://example.com:8080/x');
  });

  it('本來就是 http(s) 的原樣', () => {
    expect(websiteHref('https://wind.ink')).toBe('https://wind.ink/');
    expect(websiteHref('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
  });

  it('不是網站的不給連結', () => {
    expect(websiteHref('')).toBeNull();
    expect(websiteHref(null)).toBeNull();
    expect(websiteHref('javascript:alert(1)')).toBeNull();
    expect(websiteHref('data:text/html,hi')).toBeNull();
    expect(websiteHref('mailto:a@b.com')).toBeNull();
    expect(websiteHref('我的部落格')).toBeNull();
    expect(websiteHref('localhost')).toBeNull();
  });
});
