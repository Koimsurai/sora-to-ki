import { describe, expect, it } from 'vite-plus/test';

import type { PhotoManifest } from '@/types/photo';
import { framesOf } from './frames';

const photo = (id: string, shootTime: number | null): PhotoManifest => ({
  id,
  title: id,
  description: '',
  urls: { full: '', regular: '', small: '', thumb: '' },
  originalUrl: '',
  thumbnailUrl: '',
  width: 3,
  height: 2,
  aspectRatio: 1.5,
  size: 0,
  format: 'webp',
  thumbHash: null,
  exif: null,
  shootTime,
  tags: [],
  tagsEn: [],
  gps: null,
});

const ids = (photos: PhotoManifest[], featured?: string[]) =>
  framesOf(photos, featured && new Set(featured)).map((f) => f.photo.id);

describe('framesOf', () => {
  const photos = [photo('old', 1), photo('new', 3), photo('mid', 2), photo('undated', null)];

  it('由新到舊，沒有拍攝時間的排最後', () => {
    expect(ids(photos)).toEqual(['new', 'mid', 'old', 'undated']);
  });

  it('精選排最上面，精選之間也是由新到舊', () => {
    expect(ids(photos, ['old', 'mid'])).toEqual(['mid', 'old', 'new', 'undated']);
  });

  it('精選清單裡有不存在的 id 也不影響', () => {
    expect(ids(photos, ['gone'])).toEqual(['new', 'mid', 'old', 'undated']);
  });
});
