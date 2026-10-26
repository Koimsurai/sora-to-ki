import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nitro/h3';
// subset-font 要在執行期用 require.resolve 找 HarfBuzz 的 wasm，所以不能打包進來：
// vite.config.start.ts 的 traceDeps 讓 nitro 把它當外部相依，整包複製進 .output。
// 那個 require.resolve 指向的是 harfbuzzjs 的 .wasm，追蹤工具看不出那是一個相依，所以這裡明確
// import 它，harfbuzzjs 整包（含 wasm）才會被帶進去。它的入口在 import 時就會實例化 wasm（top-level await），
// 這裡也直接用它讀字型有哪些字（繁中缺字的備援，見 coverageOf）
import { Blob as HbBlob, Face as HbFace } from 'harfbuzzjs';
import subsetFont from 'subset-font';
import {
  decodeCodepoints,
  isFontStyle,
  isSerifFace,
  isSerifWeight,
  keyOf,
  type FontStyle,
  type SerifFace,
  type SerifWeight,
} from '../../../../../src/lib/serifSubset';

// 按頁裁字：GET /fonts/<風格>/<字重>/<鍵>.woff2?c=<字集>&f=<tc|sc|jp|kr>[&x=<tc|sc|jp|kr>]，回一個只含這些字的字型。
// 風格是宋體（站上的主字型）、黑體、楷（手寫味）、現代無襯線（後三種是文章的「字體」切換）；
// f 是哪一套語系（同一種風格在各語系配的是不同的字，見 FONTS），沒帶就是繁中。編碼見 src/lib/serifSubset.ts。
// x 是「只裁 x 那一套沒有的字」：繁中頁面上的簡體字（留言）用簡中那套補，見 serifSubset 的 fallbackFamilyOf。
//
// 原檔由 scripts/fetch-serif-font.mjs 下載，Docker 建置時放進映像；沒有原檔就回 404，
// 瀏覽器退回堆疊裡的下一個字型，頁面照常。
//
// 每次裁字都要把整個原檔複製進 HarfBuzz（wasm）再裁，一篇長文約 0.7 秒，所以：
//   - 結果先放記憶體、再寫磁碟，同一組字只裁一次
//   - 一次只裁一個（排隊），擋住一次湧進來的請求把 CPU 吃滿
//   - 回應標成永久快取：網址由字集決定，內容不會變

const FONT_DIR = resolve(process.env.SERIF_FONT_DIR ?? '.cache/fonts');

/**
 * 每種風格在各語系用哪一支字。可變字重的一個檔（`wght` 軸上取 400／600），
 * 其他的兩個字重各一個檔（600 用最接近的那個：Bold、SemiBold 或 Medium）。
 * 檔名要跟 scripts/fetch-serif-font.mjs 一致。
 */
type Source = { file: string } | Record<SerifWeight, string>;
const FONTS: Record<FontStyle, Record<SerifFace, Source>> = {
  // 思源宋體（Noto Serif，四套各依各地的字形）
  serif: {
    tc: { file: 'NotoSerifTC-wght.ttf' },
    sc: { file: 'NotoSerifSC-wght.ttf' },
    jp: { file: 'NotoSerifJP-wght.ttf' },
    kr: { file: 'NotoSerifKR-wght.ttf' },
  },
  // 思源黑體（Noto Sans）
  sans: {
    tc: { file: 'NotoSansTC-wght.ttf' },
    sc: { file: 'NotoSansSC-wght.ttf' },
    jp: { file: 'NotoSansJP-wght.ttf' },
    kr: { file: 'NotoSansKR-wght.ttf' },
  },
  // 手寫味：霞鶩文楷（繁、簡各一套）；日文是它的源頭 Klee One；韓文沒有文楷，用同樣溫暖的 Gowun Batang
  kai: {
    tc: { 400: 'LXGWWenKaiTC-Regular.ttf', 600: 'LXGWWenKaiTC-Bold.ttf' },
    sc: { 400: 'LXGWWenKai-Regular.ttf', 600: 'LXGWWenKai-Medium.ttf' },
    jp: { 400: 'KleeOne-Regular.ttf', 600: 'KleeOne-SemiBold.ttf' },
    kr: { 400: 'GowunBatang-Regular.ttf', 600: 'GowunBatang-Bold.ttf' },
  },
  // 現代無襯線：MiSans（繁、簡共用一套，站上文章用到的繁體字它都有）；日文 BIZ UDPゴシック；韓文 Pretendard
  modern: {
    tc: { 400: 'MiSans-Regular.ttf', 600: 'MiSans-Semibold.ttf' },
    sc: { 400: 'MiSans-Regular.ttf', 600: 'MiSans-Semibold.ttf' },
    jp: { 400: 'BIZUDPGothic-Regular.ttf', 600: 'BIZUDPGothic-Bold.ttf' },
    kr: { file: 'PretendardVariable.ttf' },
  },
};

const fileOf = (src: Source, weight: SerifWeight) => ('file' in src ? src.file : src[weight]);

const CACHE_DIR = resolve(process.env.SERIF_CACHE_DIR ?? join(process.env.TMPDIR ?? '/tmp', 'koim-serif-cache'));
const MEMORY_LIMIT = 64 * 1024 * 1024;

/**
 * 讀進記憶體的原檔（一支 5 到 26 MB）。只在第一次被要到時讀；十幾支全讀進來會吃掉兩三百 MB，
 * 所以只留最近用過的幾支（多數訪客只看預設的宋體，其他風格偶爾才有人點）
 */
const sources = new Map<string, Promise<Buffer>>();
const SOURCES_KEPT = 4;
function sourceOf(file: string): Promise<Buffer> {
  let src = sources.get(file);
  if (src) sources.delete(file);
  else src = readFile(join(FONT_DIR, file));
  // 重新放到最後：Map 照插入順序，最前面的就是最久沒用的
  sources.set(file, src);
  for (const old of sources.keys()) {
    if (sources.size <= SOURCES_KEPT) break;
    sources.delete(old);
  }
  return src;
}

const memory = new Map<string, Buffer>();
let memoryBytes = 0;
const remember = (id: string, buf: Buffer) => {
  memory.set(id, buf);
  memoryBytes += buf.length;
  // 最舊的先丟（Map 照插入順序）
  for (const [k, v] of memory) {
    if (memoryBytes <= MEMORY_LIMIT) break;
    memory.delete(k);
    memoryBytes -= v.length;
  }
};

let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;
const MAX_WAITING = 24;
const serial = <T>(job: () => Promise<T>): Promise<T> => {
  waiting++;
  const run = queue.then(job, job).finally(() => {
    waiting--;
  });
  queue = run.catch(() => undefined);
  return run;
};

/** 原檔有哪些字（一支約 30 ms 算一次，之後留著；一套兩萬到三萬個碼位） */
const coverages = new Map<string, Promise<Set<number>>>();
function coverageOf(file: string): Promise<Set<number>> {
  let cov = coverages.get(file);
  if (!cov) {
    cov = sourceOf(file).then((buf) => new Set(new HbFace(new HbBlob(buf)).collectUnicodes()));
    // 讀失敗就別記著，下次再試
    cov.catch(() => coverages.delete(file));
    coverages.set(file, cov);
  }
  return cov;
}

async function build(src: Source, weight: SerifWeight, cps: number[]): Promise<Buffer> {
  const font = await sourceOf(fileOf(src, weight));
  // 備援請求裡的字可能全都在繁中那套裡（沒有缺字）：裁一個只有空白的字型，瀏覽器照樣載得起來
  return subsetFont(font, cps.length ? String.fromCodePoint(...cps) : ' ', {
    targetFormat: 'woff2',
    // 可變字重的檔才有 wght 軸；兩個檔的那種，字重已經由選哪個檔決定了
    ...('file' in src ? { variationAxes: { wght: weight } } : {}),
  });
}

export default defineEventHandler(async (event) => {
  const style = getRouterParam(event, 'style');
  const weight = Number(getRouterParam(event, 'weight'));
  const file = getRouterParam(event, 'file') ?? '';
  const { c, f = 'tc', x } = getQuery(event);
  const key = /^([0-9a-f]{8})\.woff2$/.exec(file)?.[1];
  if (
    !isFontStyle(style) ||
    !isSerifWeight(weight) ||
    !key ||
    typeof c !== 'string' ||
    keyOf(c) !== key ||
    !isSerifFace(f) ||
    (x !== undefined && (!isSerifFace(x) || x === f))
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  let cps = decodeCodepoints(c);
  if (!cps) throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  const src = FONTS[style][f];
  if (!existsSync(join(FONT_DIR, fileOf(src, weight))))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  if (x !== undefined) {
    const other = fileOf(FONTS[style][x], weight);
    if (!existsSync(join(FONT_DIR, other))) throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    const has = await coverageOf(other);
    cps = cps.filter((cp) => !has.has(cp));
  }

  // 快取的鍵用完整字集的雜湊：網址上的 8 位鍵只是方便讀，可能撞。
  // 宋體不帶風格前綴：磁碟上已經裁好的那些照用
  const prefix = style === 'serif' ? '' : `${style}-`;
  const hash = createHash('sha256').update(c).digest('hex').slice(0, 32);
  const id = `${prefix}${f}-${x ? `x${x}-` : ''}${weight}-${hash}`;
  let buf = memory.get(id);
  if (!buf) {
    const onDisk = join(CACHE_DIR, `${id}.woff2`);
    if (existsSync(onDisk)) buf = await readFile(onDisk);
    else {
      // 正常瀏覽不會排到這麼長；排滿代表有人在灌不同的字集，先拒絕，瀏覽器會退回下一個字型
      if (waiting >= MAX_WAITING) throw createError({ statusCode: 503, statusMessage: 'Busy' });
      buf = await serial(() => build(src, weight, cps));
      await mkdir(CACHE_DIR, { recursive: true });
      // 暫存檔名每次不同：同一組字的兩個請求可能同時排到這裡（第一個還沒寫完，第二個沒看到檔案），
      // 共用一個 .tmp 的話後改名的那個會 ENOENT（CI 的 e2e 日誌裡看過）
      const tmp = `${onDisk}.${randomUUID()}.tmp`;
      await writeFile(tmp, buf);
      await rename(tmp, onDisk);
    }
    remember(id, buf);
  }

  event.res.headers.set('content-type', 'font/woff2');
  event.res.headers.set('cache-control', 'public, max-age=31536000, immutable');
  event.res.headers.set('x-robots-tag', 'noindex');
  return buf;
});
