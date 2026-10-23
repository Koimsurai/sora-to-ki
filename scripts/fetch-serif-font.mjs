#!/usr/bin/env node
/**
 * 下載按頁裁字用的思源宋體原檔（Noto Serif TC，可變字重 200–900）。
 *
 * 字型太大（17 MB）不進 git；開發時跑一次，Docker 建置時在 builder 階段跑。
 * 網址釘在 google/fonts 的某一個提交、下載後比對 sha256：上游換檔或被竄改都會直接失敗，
 * 而不是把一個沒驗過的字型拿去裁。
 *
 * 用法：node scripts/fetch-serif-font.mjs [輸出路徑]
 * 預設輸出到 .cache/fonts/NotoSerifTC-wght.ttf（伺服器的 SERIF_FONT_PATH 沒設時也讀這裡）。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const COMMIT = '8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5';
const URL = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf`;
const SHA256 = '0077e18f57c6908f4a000969880940bdb0dad057c0e8d98b49dc364c3d1b09c6';
const out = resolve(process.argv[2] ?? '.cache/fonts/NotoSerifTC-wght.ttf');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

if (existsSync(out) && sha(await readFile(out)) === SHA256) {
  console.log(`已存在且校驗相符：${out}`);
  process.exit(0);
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`下載失敗 ${res.status}：${URL}`);
const buf = Buffer.from(await res.arrayBuffer());
const got = sha(buf);
if (got !== SHA256) throw new Error(`sha256 不符：預期 ${SHA256}，實際 ${got}`);

await mkdir(dirname(out), { recursive: true });
await writeFile(`${out}.tmp`, buf);
await rename(`${out}.tmp`, out);
console.log(`已下載 ${(buf.length / 1048576).toFixed(1)} MB → ${out}`);
