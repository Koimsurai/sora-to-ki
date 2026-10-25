/**
 * 按頁裁字：瀏覽器與伺服器共用的編碼。站上的主字型是思源宋體，文章另外可以換成黑體、
 * 手寫味的楷體、現代無襯線（`FontStyle`），四種都用同一套機制，各語系各配一支字（伺服器的 FONTS 表）。
 *
 * 思源宋體整套切片下載，連只有介面文字的頁面都要 1.4 MB（常用字散在各片裡）。改成按頁裁：
 * 瀏覽器收集畫面上的字，跟伺服器要一個只含這些字的小字型（server/routes/fonts/serif），
 * 換頁時只補新出現的字。字型網址由字集決定，同一組字永遠是同一個網址，所以能被 HTTP 快取。
 *
 * 字重只有兩個固定的：400 涵蓋所有字，600 只給標題與粗體裡的字。保留整條可變字重軸的話，
 * 一篇長文要 412 KB；兩個固定字重加起來約 250 KB。
 */

const SERIF_FAMILY = 'Koim Serif';

/** 哪一套思源宋體：繁中、簡中、日文、韓文的字形各依各地的寫法（同一個漢字在四套裡長得不一樣） */
const SERIF_FACES = ['tc', 'sc', 'jp', 'kr'] as const;
export type SerifFace = (typeof SERIF_FACES)[number];

export function isSerifFace(v: unknown): v is SerifFace {
  return typeof v === 'string' && (SERIF_FACES as readonly string[]).includes(v);
}

/**
 * 字型的四種風格：宋體（站上的主字型）、黑體、手寫味（楷）、現代無襯線。文章的「字體」切換用後三種。
 * 每種在各語系配的是哪一支字，見伺服器的 server/routes/fonts/[style]/[weight]/[file].ts
 */
const FONT_STYLES = ['serif', 'sans', 'kai', 'modern'] as const;
export type FontStyle = (typeof FONT_STYLES)[number];

export function isFontStyle(v: unknown): v is FontStyle {
  return typeof v === 'string' && (FONT_STYLES as readonly string[]).includes(v);
}

/**
 * 字族名的前半：Koim Serif／Koim Sans／Koim Kai／Koim Modern（宋體沿用原本的名字，CSS 不用改）。
 * 每一套語系各自一個字族名（CSS 的 :lang() 堆疊裡放對應的那個），站內切語系時兩套不會搶同一個名字
 */
const STYLE_FAMILY: Record<FontStyle, string> = {
  serif: SERIF_FAMILY,
  sans: 'Koim Sans',
  kai: 'Koim Kai',
  modern: 'Koim Modern',
};

/** 某種風格、某一套語系的字族名（繁中不加後綴，其他加 SC／JP／KR；同 SERIF_FACE_FAMILY 的規則） */
export function familyOf(style: FontStyle, face: SerifFace): string {
  const base = STYLE_FAMILY[style];
  return face === 'tc' ? base : `${base} ${face.toUpperCase()}`;
}

/** 元素的 font-family 第一個字族 → 它是哪一種風格的裁字字型；不是裁字字型回 null */
export function styleOfFamily(first: string): FontStyle | null {
  const name = first.trim().replace(/^["']|["']$/g, '');
  for (const style of FONT_STYLES) {
    const base = STYLE_FAMILY[style];
    if (name === base || name.startsWith(`${base} `)) return style;
  }
  return null;
}

/** 頁面的語系 → 裁哪一套。英文頁也用繁中那套（拉丁字形四套一樣，繁中那套快取最熱） */
export function serifFaceOf(lang: string): SerifFace {
  if (/^zh-(CN|Hans|SG)/i.test(lang)) return 'sc';
  if (/^ja/i.test(lang)) return 'jp';
  if (/^ko/i.test(lang)) return 'kr';
  return 'tc';
}
const SERIF_WEIGHTS = [400, 600] as const;
export type SerifWeight = (typeof SERIF_WEIGHTS)[number];

/** 一次最多裁幾個字。正常的長文約一千個，上限只是擋住惡意的超大請求 */
export const MAX_CODEPOINTS = 4000;

/** 交給思源宋體的字：英數與拉丁補充（混排時用它自己配好的字形）、標點、注音、假名、中日韓漢字、韓文 */
export function isSerifCodepoint(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0x24f) ||
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
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

export function subsetUrl(
  weight: SerifWeight,
  cps: Iterable<number>,
  face: SerifFace = 'tc',
  style: FontStyle = 'serif',
): string {
  const c = encodeCodepoints(cps);
  // 繁中不帶 f：網址跟以前一樣，已經在瀏覽器與伺服器快取裡的字型照用
  return `/fonts/${style}/${weight}/${keyOf(c)}.woff2?c=${c}${face === 'tc' ? '' : `&f=${face}`}`;
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
