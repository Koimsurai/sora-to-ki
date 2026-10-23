/**
 * 按頁裁字（思源宋體）：瀏覽器與伺服器共用的編碼。
 *
 * 思源宋體整套切片下載，連只有介面文字的頁面都要 1.4 MB（常用字散在各片裡）。改成按頁裁：
 * 瀏覽器收集畫面上的字，跟伺服器要一個只含這些字的小字型（server/routes/fonts/serif），
 * 換頁時只補新出現的字。字型網址由字集決定，同一組字永遠是同一個網址，所以能被 HTTP 快取。
 *
 * 字重只有兩個固定的：400 涵蓋所有字，600 只給標題與粗體裡的字。保留整條可變字重軸的話，
 * 一篇長文要 412 KB；兩個固定字重加起來約 250 KB。
 */

export const SERIF_FAMILY = 'Koim Serif';
const SERIF_WEIGHTS = [400, 600] as const;
export type SerifWeight = (typeof SERIF_WEIGHTS)[number];

/** 一次最多裁幾個字。正常的長文約一千個，上限只是擋住惡意的超大請求 */
export const MAX_CODEPOINTS = 4000;

/** 交給思源宋體的字：英數與拉丁補充（混排時用它自己配好的字形）、標點、注音、假名、中日韓漢字 */
export function isSerifCodepoint(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0x24f) ||
    (cp >= 0x2000 && cp <= 0x206f) ||
    (cp >= 0x2e80 && cp <= 0x2fdf) ||
    (cp >= 0x3000 && cp <= 0x31ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xffef)
  );
}

export function isSerifWeight(n: number): n is SerifWeight {
  return (SERIF_WEIGHTS as readonly number[]).includes(n);
}

/** 字集 → 網址上的 `c`：排序後第一個寫原值、之後寫差值，36 進位、用點隔開（一個字平均 2 到 3 個字元） */
function encodeCodepoints(cps: Iterable<number>): string {
  const sorted = [...new Set(cps)].sort((a, b) => a - b);
  let prev = 0;
  return sorted
    .map((cp) => {
      const d = cp - prev;
      prev = cp;
      return d.toString(36);
    })
    .join('.');
}

/** `c` → 字集。格式不對、沒有遞增、超過上限、或含有不該裁的字，一律回 null */
export function decodeCodepoints(c: string): number[] | null {
  if (!c || c.length > MAX_CODEPOINTS * 4 || !/^[0-9a-z]+(\.[0-9a-z]+)*$/.test(c)) return null;
  const parts = c.split('.');
  if (parts.length > MAX_CODEPOINTS) return null;
  const out: number[] = [];
  let cp = 0;
  for (const [i, part] of parts.entries()) {
    const d = parseInt(part, 36);
    if (!Number.isSafeInteger(d) || (i > 0 && d <= 0)) return null;
    cp += d;
    if (!isSerifCodepoint(cp)) return null;
    out.push(cp);
  }
  return out;
}

/** FNV-1a 32 位元，8 位十六進位。只當網址上好讀的鍵，伺服器會用 `c` 重算一次比對 */
export function keyOf(c: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < c.length; i++) {
    h ^= c.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function subsetUrl(weight: SerifWeight, cps: Iterable<number>): string {
  const c = encodeCodepoints(cps);
  return `/fonts/serif/${weight}/${keyOf(c)}.woff2?c=${c}`;
}

/** FontFace 的 unicode-range：連續的碼位併成一段 */
export function unicodeRangeOf(cps: Iterable<number>): string {
  const sorted = [...new Set(cps)].sort((a, b) => a - b);
  const hex = (n: number) => n.toString(16).toUpperCase();
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`);
    i = j + 1;
  }
  return out.join(',');
}
