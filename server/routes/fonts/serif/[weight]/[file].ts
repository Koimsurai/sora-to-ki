import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nitro/h3';
// subset-font 要在執行期用 require.resolve 找 HarfBuzz 的 wasm，所以不能打包進來：
// vite.config.start.ts 的 traceDeps 讓 nitro 把它當外部相依，整包複製進 .output。
// 那個 require.resolve 指向的是 harfbuzzjs 的 .wasm，追蹤工具看不出那是一個相依，所以這裡明確
// import 一次，harfbuzzjs 整包（含 wasm）才會被帶進去。它的入口只定義工廠函式，不會實例化 wasm
import 'harfbuzzjs';
import subsetFont from 'subset-font';
import {
  decodeCodepoints,
  isSerifFace,
  isSerifWeight,
  keyOf,
  type SerifFace,
} from '../../../../../src/lib/serifSubset';

// 按頁裁字：GET /fonts/serif/<字重>/<鍵>.woff2?c=<字集>&f=<tc|sc|jp|kr>，回一個只含這些字的思源宋體。
// f 是哪一套（繁中、簡中、日文、韓文的字形不一樣），沒帶就是繁中。編碼與為什麼這樣做見 src/lib/serifSubset.ts。
//
// 原檔（四套合計約 79 MB）由 scripts/fetch-serif-font.mjs 下載，Docker 建置時放進映像；沒有原檔就回 404，
// 瀏覽器退回系統明體，頁面照常。
//
// 每次裁字都要把整個原檔複製進 HarfBuzz（wasm）再裁，一篇長文約 0.7 秒，所以：
//   - 結果先放記憶體、再寫磁碟，同一組字只裁一次
//   - 一次只裁一個（排隊），擋住一次湧進來的請求把 CPU 吃滿
//   - 回應標成永久快取：網址由字集決定，內容不會變

const FONT_DIR = resolve(process.env.SERIF_FONT_DIR ?? '.cache/fonts');
/** 檔名要跟 scripts/fetch-serif-font.mjs 一致 */
const FILES: Record<SerifFace, string> = {
  tc: 'NotoSerifTC-wght.ttf',
  sc: 'NotoSerifSC-wght.ttf',
  jp: 'NotoSerifJP-wght.ttf',
  kr: 'NotoSerifKR-wght.ttf',
};
const CACHE_DIR = resolve(process.env.SERIF_CACHE_DIR ?? join(process.env.TMPDIR ?? '/tmp', 'koim-serif-cache'));
const MEMORY_LIMIT = 64 * 1024 * 1024;

/** 原檔只在第一次被要到時讀進來（每套十幾到二十幾 MB，沒人看韓文頁就不佔記憶體） */
const sources = new Map<SerifFace, Promise<Buffer>>();

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

async function build(face: SerifFace, weight: number, cps: number[]): Promise<Buffer> {
  let source = sources.get(face);
  if (!source) {
    source = readFile(join(FONT_DIR, FILES[face]));
    sources.set(face, source);
  }
  const font = await source;
  return subsetFont(font, String.fromCodePoint(...cps), {
    targetFormat: 'woff2',
    variationAxes: { wght: weight },
  });
}

export default defineEventHandler(async (event) => {
  const weight = Number(getRouterParam(event, 'weight'));
  const file = getRouterParam(event, 'file') ?? '';
  const { c, f = 'tc' } = getQuery(event);
  const key = /^([0-9a-f]{8})\.woff2$/.exec(file)?.[1];
  if (!isSerifWeight(weight) || !key || typeof c !== 'string' || keyOf(c) !== key || !isSerifFace(f)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const cps = decodeCodepoints(c);
  if (!cps) throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  if (!existsSync(join(FONT_DIR, FILES[f]))) throw createError({ statusCode: 404, statusMessage: 'Not Found' });

  // 快取的鍵用完整字集的雜湊：網址上的 8 位鍵只是方便讀，可能撞
  const id = `${f}-${weight}-${createHash('sha256').update(c).digest('hex').slice(0, 32)}`;
  let buf = memory.get(id);
  if (!buf) {
    const onDisk = join(CACHE_DIR, `${id}.woff2`);
    if (existsSync(onDisk)) buf = await readFile(onDisk);
    else {
      // 正常瀏覽不會排到這麼長；排滿代表有人在灌不同的字集，先拒絕，瀏覽器會退回系統明體
      if (waiting >= MAX_WAITING) throw createError({ statusCode: 503, statusMessage: 'Busy' });
      buf = await serial(() => build(f, weight, cps));
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(`${onDisk}.tmp`, buf);
      await rename(`${onDisk}.tmp`, onDisk);
    }
    remember(id, buf);
  }

  event.res.headers.set('content-type', 'font/woff2');
  event.res.headers.set('cache-control', 'public, max-age=31536000, immutable');
  event.res.headers.set('x-robots-tag', 'noindex');
  return buf;
});
