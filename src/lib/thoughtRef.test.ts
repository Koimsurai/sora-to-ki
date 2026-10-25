import { describe, expect, it } from 'vite-plus/test';
import type { ThoughtRef } from '@koimsurai/api-types';

import { defaultVerb, isThoughtVerb, safeHttp, thoughtCard } from './thoughtRef';

const ref = (r: Partial<ThoughtRef>): ThoughtRef => ({
  title: null,
  desc: null,
  image: null,
  site: null,
  kind: null,
  url: null,
  source: null,
  overview: null,
  genres: null,
  poster: null,
  mediaType: null,
  rating: null,
  year: null,
  tmdbId: null,
  creator: null,
  progress: null,
  key: null,
  ...r,
});

describe('thoughtCard', () => {
  it('沒附東西或認不得的種類就沒有卡片', () => {
    expect(thoughtCard({ ref: null, ref_type: null, ref_url: null })).toBeNull();
    expect(thoughtCard({ ref: ref({ title: 'x' }), ref_type: 'post', ref_url: '/blog/1' })).toBeNull();
  });

  it('連結沒抓到標題時寫網址本身，站名放第二行', () => {
    const c = thoughtCard({ ref: ref({ site: '某站' }), ref_type: 'link', ref_url: 'https://example.com/a' });
    expect(c).toMatchObject({ type: 'link', title: 'example.com/a', href: 'https://example.com/a', facts: ['某站'] });
  });

  it('作品的小字照年份、作者、評分、類型、進度排，空的不留位置', () => {
    const c = thoughtCard({
      ref: ref({
        kind: 'tv',
        title: '絕命毒師',
        year: '2008',
        rating: 8.9,
        genres: '劇情, 犯罪, 驚悚',
        poster: 'https://image.tmdb.org/p.jpg',
        url: 'https://www.themoviedb.org/tv/1396',
      }),
      ref_type: 'media',
      ref_url: null,
    });
    expect(c).toMatchObject({ kind: 'tv', title: '絕命毒師', poster: 'https://image.tmdb.org/p.jpg' });
    expect(c?.facts).toEqual(['2008', '★ 8.9', '劇情 / 犯罪']);
  });

  it('不是 http(s) 的連結與圖片不畫出來', () => {
    const c = thoughtCard({
      ref: ref({ kind: 'book', title: '書', url: 'javascript:alert(1)', poster: 'data:image/png;base64,x' }),
      ref_type: 'media',
      ref_url: null,
    });
    expect(c?.href).toBeUndefined();
    expect(c?.poster).toBeUndefined();
  });

  it('舊資料沒有 kind 也照樣畫，只是沒有種類', () => {
    const c = thoughtCard({ ref: ref({ title: '舊的' }), ref_type: 'media', ref_url: null });
    expect(c).toMatchObject({ kind: null, title: '舊的' });
  });
});

describe('動詞', () => {
  it('預設動詞跟著種類走', () => {
    expect(defaultVerb('book')).toBe('read');
    expect(defaultVerb('track')).toBe('listened');
    expect(defaultVerb('anime')).toBe('watched');
    expect(defaultVerb('link')).toBe('shared');
  });

  it('只認得後端存的那幾個 key', () => {
    expect(isThoughtVerb('watched')).toBe(true);
    expect(isThoughtVerb('看了')).toBe(false);
    expect(isThoughtVerb(null)).toBe(false);
  });
});

it('safeHttp 只放行 http 與 https', () => {
  expect(safeHttp('https://a.b')).toBe('https://a.b');
  expect(safeHttp('HTTP://a.b')).toBe('HTTP://a.b');
  expect(safeHttp('//a.b')).toBeUndefined();
  expect(safeHttp(null)).toBeUndefined();
});
