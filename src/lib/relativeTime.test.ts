import { describe, expect, it } from 'vite-plus/test';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  const NOW = new Date('2026-08-05T12:00:00Z');

  it('一分鐘內是「剛剛」', () => {
    expect(relativeTime('2026-08-05T11:59:30Z', NOW)).toEqual({ kind: 'justNow' });
  });

  it('依序落到分鐘、小時、天', () => {
    expect(relativeTime('2026-08-05T11:30:00Z', NOW)).toEqual({ kind: 'minutes', count: 30 });
    expect(relativeTime('2026-08-05T09:00:00Z', NOW)).toEqual({ kind: 'hours', count: 3 });
    expect(relativeTime('2026-08-03T12:00:00Z', NOW)).toEqual({ kind: 'days', count: 2 });
  });

  it('超過七天改用絕對日期', () => {
    const r = relativeTime('2026-07-01T12:00:00Z', NOW);
    expect(r.kind).toBe('absolute');
  });

  it('邊界：59 分鐘還是分鐘、60 分鐘變小時；6 天還是天、7 天變絕對', () => {
    expect(relativeTime('2026-08-05T11:01:00Z', NOW).kind).toBe('minutes');
    expect(relativeTime('2026-08-05T11:00:00Z', NOW).kind).toBe('hours');
    expect(relativeTime('2026-07-30T12:00:00Z', NOW).kind).toBe('days');
    expect(relativeTime('2026-07-29T12:00:00Z', NOW).kind).toBe('absolute');
  });

  // 這條是重點：SQLite 的 CURRENT_TIMESTAMP 存 UTC，但字串沒有時區標記。
  // 不補 `Z` 的話 JS 會當成本地時間，在 UTC+8 的機器上每則留言都早八小時，
  // 畫面上就是所有留言都「8 小時前」起跳——而且不會有任何錯誤。
  it('SQLite 的無時區字串當成 UTC 解析', () => {
    expect(relativeTime('2026-08-05 11:30:00', NOW)).toEqual({ kind: 'minutes', count: 30 });
  });

  it('已經有時區標記的不會被重複加工', () => {
    expect(relativeTime('2026-08-05T11:30:00Z', NOW)).toEqual({ kind: 'minutes', count: 30 });
    expect(relativeTime('2026-08-05T19:30:00+08:00', NOW)).toEqual({ kind: 'minutes', count: 30 });
  });

  // Stryker 指出來的：`< 1` / `< 24` 換成 `<= ` 沒有任何測試會紅——邊界值本身沒測到。
  it('剛好一分鐘不是「剛剛」，是 1 分鐘前', () => {
    expect(relativeTime('2026-08-05T11:59:00Z', NOW)).toEqual({ kind: 'minutes', count: 1 });
  });

  it('剛好 24 小時不是小時，是 1 天前', () => {
    expect(relativeTime('2026-08-04T12:00:00Z', NOW)).toEqual({ kind: 'days', count: 1 });
  });

  it('未來時間（時鐘有偏差）當成剛剛，不會變成負數', () => {
    expect(relativeTime('2026-08-05T12:05:00Z', NOW)).toEqual({ kind: 'justNow' });
  });

  // 首頁近況要「一小時內都算剛剛」，不顯示「N 分鐘前」
  it('justNowWithin: hour——一小時內都是剛剛，剛好一小時變 1 小時前', () => {
    const opts = { justNowWithin: 'hour' as const };
    expect(relativeTime('2026-08-05T11:01:00Z', NOW, opts)).toEqual({ kind: 'justNow' });
    expect(relativeTime('2026-08-05T11:00:00Z', NOW, opts)).toEqual({ kind: 'hours', count: 1 });
  });

  // 碎念與首頁近況是 30 天，音樂的「上次播放」是 1 天（超過就直接寫日期）
  it('absoluteAfterDays 改變改顯示日期的門檻', () => {
    expect(relativeTime('2026-07-10T12:00:00Z', NOW, { absoluteAfterDays: 30 })).toEqual({ kind: 'days', count: 26 });
    expect(relativeTime('2026-07-06T12:00:00Z', NOW, { absoluteAfterDays: 30 }).kind).toBe('absolute');
    expect(relativeTime('2026-08-04T11:00:00Z', NOW, { absoluteAfterDays: 1 }).kind).toBe('absolute');
    expect(relativeTime('2026-08-04T13:00:00Z', NOW, { absoluteAfterDays: 1 }).kind).toBe('hours');
  });
});
