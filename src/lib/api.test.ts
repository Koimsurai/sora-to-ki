import { describe, expect, it } from 'vite-plus/test';
import { proxiedImage } from './api';

describe('proxiedImage', () => {
  it('外站圖片包成同源的 image-proxy，網址整串編碼', () => {
    expect(proxiedImage('http://books.google.com/x?id=1&zoom=1')).toBe(
      '/api/image-proxy?url=http%3A%2F%2Fbooks.google.com%2Fx%3Fid%3D1%26zoom%3D1',
    );
  });

  it('SSR 也回相對路徑——src 要跟 client 一致，hydrate 才不會對不上', () => {
    // vitest 的環境沒有 window，等同 SSR；apiUrl() 在這裡會吐絕對網址，proxiedImage 不該跟著變
    expect(proxiedImage('https://a.b/c.jpg').startsWith('/api/')).toBe(true);
  });

  it('沒有網址就回空字串', () => {
    expect(proxiedImage(null)).toBe('');
    expect(proxiedImage(undefined)).toBe('');
    expect(proxiedImage('')).toBe('');
  });
});
