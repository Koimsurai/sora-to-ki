import { parseServerDate } from '@/lib/serverDate';

/** 相對時間的分類。實際文案由呼叫端（通常是 useTimeAgo）對應 i18n key。 */
export type RelativeTime =
  | { kind: 'justNow' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'days'; count: number }
  | { kind: 'absolute'; date: Date };

export interface RelativeTimeOptions {
  /** 多久之內算「剛剛」：`minute`（預設，一分鐘內）或 `hour`（一小時內，不顯示「N 分鐘前」）。 */
  justNowWithin?: 'minute' | 'hour';
  /** 幾天之後改顯示日期，預設 7。 */
  absoluteAfterDays?: number;
}

/**
 * 把時間分類成「剛剛／N 分鐘前／N 小時前／N 天前／絕對日期」。全站只有這一份——
 * 以前留言、碎念、首頁近況、Activity、音樂各寫一份，門檻不一樣，Activity 還把中文寫死在裡面。
 *
 * ⚠ SQLite 的 `CURRENT_TIMESTAMP` 存的是 **UTC**，但字串長得像 `2026-08-05 12:00:00`
 * ——沒有時區標記。JS 的 `new Date()` 遇到這種格式會當成**本地時間**，於是在 UTC+8
 * 的機器上每一則留言都會早八小時，畫面上就是「8 小時前」起跳。parseServerDate 會補 `Z`；
 * 已經有 `T` 或 `Z` 的（API 回的 ISO 格式）就不動。
 *
 * `now` 由呼叫端傳入而不是在函式裡取——這樣才測得動。
 */
export function relativeTime(
  dateStr: string,
  now: Date,
  { justNowWithin = 'minute', absoluteAfterDays = 7 }: RelativeTimeOptions = {},
): RelativeTime {
  const date = parseServerDate(dateStr);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1 || (justNowWithin === 'hour' && hrs < 1)) return { kind: 'justNow' };
  if (mins < 60) return { kind: 'minutes', count: mins };
  if (hrs < 24) return { kind: 'hours', count: hrs };
  if (days < absoluteAfterDays) return { kind: 'days', count: days };
  return { kind: 'absolute', date };
}
