/**
 * 預先壓縮的靜態資產（`.br` / `.gz`）重新對齊原檔。
 *
 * ## 為什麼需要
 *
 * nitro 在 build 的時候就把 `/assets` 的 JS、CSS 壓好 brotli 與 gzip（vite.config.start.ts 的
 * compressPublicAssets），供應時照 Accept-Encoding 挑一個送。可是 Dockerfile 在 build **之後**
 * 才跑 `sentry-cli sourcemaps inject`，往每支 JS 尾端寫 debug id。壓縮檔是 inject 之前的內容，
 * 而現代瀏覽器幾乎都拿 `.br`：讀者執行的 JS 沒有 debug id，GlitchTip 上的錯誤就對不回原始碼。
 * 頁面照樣正常，所以沒有人會發現。
 *
 * 所以在 inject 之後、對齊 nitro 資產清單（scripts/sync-nitro-asset-manifest.mjs）之前跑這支：
 * 解開每個壓縮檔跟原檔比，對不上的照原檔重壓。原檔已經不在的（後處理刪掉的）壓縮檔一併刪掉。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = '.output/public';

const CODECS = {
  '.br': {
    decode: (buf) => zlib.brotliDecompressSync(buf),
    encode: (buf) =>
      zlib.brotliCompressSync(buf, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
        },
      }),
  },
  '.gz': {
    decode: (buf) => zlib.gunzipSync(buf),
    encode: (buf) => zlib.gzipSync(buf, { level: zlib.constants.Z_BEST_COMPRESSION }),
  },
};

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

if (!fs.existsSync(ROOT)) {
  console.error(`找不到 ${ROOT} —— 這支腳本要在 pnpm build 之後跑`);
  process.exit(1);
}

let checked = 0;
let rewritten = 0;
let removed = 0;
for (const file of walk(ROOT)) {
  const ext = path.extname(file);
  const codec = CODECS[ext];
  if (!codec) continue;
  const original = file.slice(0, -ext.length);
  checked++;
  if (!fs.existsSync(original)) {
    fs.rmSync(file);
    removed++;
    continue;
  }
  const source = fs.readFileSync(original);
  if (codec.decode(fs.readFileSync(file)).equals(source)) continue;
  fs.writeFileSync(file, codec.encode(source));
  rewritten++;
}

console.log(`預先壓縮的資產已對齊：檢查 ${checked} 個，重壓 ${rewritten} 個，移除原檔已不在的 ${removed} 個`);
