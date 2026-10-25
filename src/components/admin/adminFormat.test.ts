import { describe, expect, it } from 'vitest';

import { STATUS_LABEL, localInputToIso, parseDbTime, toLocalInput, trashDaysLeft } from './adminFormat';

// 排程時間錯了是「靜靜地錯」：DB 存 UTC 卻被當成本地時間，台灣就差八小時，
// 文章早八小時或晚八小時出去，而畫面上的數字看起來完全合理。
// 這些測試不依賴跑測試那台機器的時區：只比 UTC 的值，或是做來回換算。

describe('parseDbTime', () => {
  it('DB 的時間（沒有時區記號）是 UTC，不是本地時間', () => {
    expect(parseDbTime('2026-10-28 01:00:00').toISOString()).toBe('2026-10-28T01:00:00.000Z');
    expect(parseDbTime('2026-10-28 01:00').toISOString()).toBe('2026-10-28T01:00:00.000Z');
  });

  it('帶時區的 ISO 照它帶的時區', () => {
    expect(parseDbTime('2026-10-28T09:00:00+08:00').toISOString()).toBe('2026-10-28T01:00:00.000Z');
  });
});

describe('排程時間的來回換算', () => {
  it('DB → datetime-local → 送回後端，是同一個時刻', () => {
    const local = toLocalInput('2026-10-28 01:00:00');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputToIso(local)).toBe('2026-10-28T01:00:00.000Z');
  });

  it('空的或壞的輸入不送時間', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('不是時間')).toBe('');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('明天')).toBeNull();
  });
});

describe('trashDaysLeft', () => {
  const now = new Date('2026-10-25T12:00:00Z');

  it('剛丟的還有 30 天、放滿的是 0、不會變負的', () => {
    expect(trashDaysLeft('2026-10-25 12:00:00', now)).toBe(30);
    expect(trashDaysLeft('2026-10-15 12:00:00', now)).toBe(20);
    expect(trashDaysLeft('2026-09-25 12:00:00', now)).toBe(0);
    expect(trashDaysLeft('2026-01-01 00:00:00', now)).toBe(0);
  });

  it('頁面打開之後才丟的不會變成 31 天', () => {
    expect(trashDaysLeft('2026-10-25 12:05:00', now)).toBe(30);
  });

  it('不足一天的算一天（還剩 0.5 天不能說是 0 天）', () => {
    expect(trashDaysLeft('2026-09-26 00:00:00', now)).toBe(1);
  });
});

it('四種狀態都有中文名', () => {
  for (const s of ['published', 'draft', 'scheduled', 'trashed']) expect(STATUS_LABEL[s]).toBeTruthy();
});
