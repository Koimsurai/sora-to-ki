import { beforeAll, describe, expect, it } from 'vite-plus/test';
import type { AdminTrackItem, AdminWatchItem, BookRow } from '@koimsurai/api-types';

import { loadAdminI18n, setAdminLang } from '@/i18n/admin-i18n';
import { candidates, episodeProgress, fromBook, fromTrack, fromWatch } from './thoughtCandidates';

// 小字（種類、來源）走後台語系檔；下面比對的是繁中原稿
beforeAll(async () => {
  await loadAdminI18n();
  await setAdminLang('zh-TW');
});

const watch = (w: Partial<AdminWatchItem>): AdminWatchItem => ({
  kind: 'anime',
  key: '1',
  title: '芙莉蓮',
  cover: null,
  detail: null,
  watched_at: '2026-10-20 12:00:00',
  source: 'bahamut',
  tmdb_id: null,
  hidden: false,
  favorite_id: null,
  ...w,
});

const track = (t: Partial<AdminTrackItem>): AdminTrackItem => ({
  id: 't1',
  name: '夜に駆ける',
  artists: 'YOASOBI',
  cover: null,
  played_at: '2026-10-21T08:00:00Z',
  hidden: false,
  ...t,
});

const book = (b: Partial<BookRow>): BookRow => ({
  id: 7,
  isbn: null,
  title: '長日將盡',
  authors: '石黑一雄',
  publisher: null,
  published_date: '1989-05-01',
  description: null,
  cover_url: null,
  page_count: null,
  language: null,
  categories: null,
  reading_status: 'read',
  rating: null,
  personal_notes: null,
  date_added: null,
  date_updated: null,
  date_started: null,
  date_finished: '2026-10-19',
  ...b,
});

describe('episodeProgress', () => {
  it('巴哈的集數抓得到數字就寫成 EP n，抓不到照原樣', () => {
    expect(episodeProgress('[03]')).toBe('EP 3');
    expect(episodeProgress('12')).toBe('EP 12');
    expect(episodeProgress('特別篇')).toBe('特別篇');
    expect(episodeProgress(null)).toBeNull();
    expect(episodeProgress('  ')).toBeNull();
  });
});

describe('fromWatch', () => {
  it('對上 TMDb 的帶 tmdbId 與 mediaType，後端才會去補卡片', () => {
    const c = fromWatch(watch({ kind: 'film', key: '5', tmdb_id: 603, detail: '★ 5' }));
    expect(c?.ref.json).toMatchObject({ kind: 'film', key: 'film:5', tmdbId: 603, mediaType: 'movie' });
    // 電影的 detail 是自己的評分，不是進度
    expect(c?.ref.json.progress).toBeUndefined();
  });

  it('動畫帶看到的那一集；沒對上 TMDb 的不帶 tmdbId', () => {
    const c = fromWatch(watch({ detail: '[08]', cover: 'https://x/c.jpg' }));
    expect(c?.ref.json).toEqual({
      kind: 'anime',
      title: '芙莉蓮',
      key: 'anime:1',
      poster: 'https://x/c.jpg',
      progress: 'EP 8',
    });
    expect(c?.facts).toEqual(['動畫', '看到 [08]', '巴哈']);
  });

  it('不公開的不列出來', () => {
    expect(fromWatch(watch({ hidden: true }))).toBeNull();
  });
});

describe('fromTrack 與 fromBook', () => {
  it('歌帶歌手與 Spotify 的連結', () => {
    const c = fromTrack(track({}));
    expect(c?.ref).toEqual({
      type: 'media',
      url: 'https://open.spotify.com/track/t1',
      json: {
        kind: 'track',
        title: '夜に駆ける',
        creator: 'YOASOBI',
        key: 'track:t1',
        url: 'https://open.spotify.com/track/t1',
      },
    });
  });

  it('只有在讀與讀完的書；年份取出版日期的前四碼', () => {
    expect(fromBook(book({ reading_status: 'to-read' }))).toBeNull();
    const c = fromBook(book({}));
    expect(c?.ref.json).toMatchObject({ kind: 'book', creator: '石黑一雄', year: '1989', key: 'book:7' });
    expect(c?.when).toBe('2026-10-19');
  });
});

describe('candidates', () => {
  it('混在一起照時間新到舊，格式不同也排得對', () => {
    const list = candidates(
      [watch({ key: 'a', watched_at: '2026-10-21 09:00:00' })],
      [track({ played_at: '2026-10-21T08:30:00Z' })],
      [book({ date_finished: '2026-10-19' })],
    );
    // 同一天裡 'T' 比空白大，字串比較會把 08:30 的歌排到 09:00 的動畫前面
    expect(list.map((c) => c.key)).toEqual(['anime:a', 'track:t1', 'book:7']);
  });

  it('同一首歌重播只留一次；沒有時間的排最後', () => {
    const list = candidates(
      [watch({ key: 'x', watched_at: null })],
      [track({ played_at: '2026-10-22T00:00:00Z' }), track({ played_at: '2026-10-21T00:00:00Z' })],
      [],
    );
    expect(list.map((c) => c.key)).toEqual(['track:t1', 'anime:x']);
  });
});
