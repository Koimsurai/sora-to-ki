/**
 * 後端來的時間戳怎麼解析 —— **只有這裡一份**。
 *
 * SQLite 的 `CURRENT_TIMESTAMP` 存的是 **UTC**，但序列化出來長這樣：
 *
 *     "2026-08-04 09:37:31"
 *
 * 沒有 `T`、沒有 `Z`、沒有 offset。JS 的 `new Date()` 對這種格式會當成**本地時間**，
 * 於是在 UTC+8 的機器上每個時間都早八小時。症狀分兩種，都不會有錯誤訊息：
 *
 *   - 相對時間：所有東西都從「8 小時前」起跳（見 `relativeTime`）
 *   - 依月份分組：當地時間每月 1 號 0~8 點發的文章會被分到**上個月**
 *
 * 已經帶 `T` 或 `Z` 的（API 有些端點回 ISO 8601）不動它，避免重複加工。
 */
export function parseServerDate(value: string): Date {
  const hasZone = value.includes('T') || value.includes('Z');
  return new Date(hasZone ? value : `${value}Z`);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 全站的日期寫法：2026.07.19（不分語系）。版面放不下年份的地方（列表的左欄）用 short，
 * 只寫 07.19，年份另外放
 */
export function dotDate(d: Date, short = false): string {
  const md = `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  return short ? md : `${d.getFullYear()}.${md}`;
}

/**
 * 留言時間軸上的日期與時刻（07.19、14:02）：照後端的 UTC 原樣顯示、不換時區，
 * 伺服器與瀏覽器算出來一樣，不會水合不一致（版面標著 UTC）
 */
export function utcStamp(value: string): { date: string; time: string } {
  const m = /\d{4}-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return m ? { date: `${m[1]}.${m[2]}`, time: `${m[3]}:${m[4]}` } : { date: '', time: '' };
}
