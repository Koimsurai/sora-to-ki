#!/usr/bin/env node
/**
 * 下載按頁裁字用的思源宋體原檔（Noto Serif TC／SC／JP／KR，可變字重 200–900）。
 * 繁中、簡中、日文、韓文各用自己的那一套（字形各依各地的寫法），網址的 `f` 決定裁哪一套。
 *
 * 字型太大（四套合計約 79 MB）不進 git；開發時跑一次，Docker 建置時在 builder 階段跑。
 * 網址釘在 google/fonts 的某一個提交、下載後比對 sha256：上游換檔或被竄改都會直接失敗，
 * 而不是把一個沒驗過的字型拿去裁。
 *
 * 用法：node scripts/fetch-serif-font.mjs [輸出目錄]
 * 預設輸出到 .cache/fonts/（伺服器的 SERIF_FONT_DIR 沒設時也讀這裡）。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const COMMIT = '8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5';
/** 檔名要跟 server/routes/fonts/serif 的 FILES 一致 */
const FONTS = [
  ['notoseriftc', 'NotoSerifTC', '0077e18f57c6908f4a000969880940bdb0dad057c0e8d98b49dc364c3d1b09c6'],
  ['notoserifsc', 'NotoSerifSC', '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9'],
  ['notoserifjp', 'NotoSerifJP', '2fd527ba12b6a44ec30d796d633360da0aeba6c5d4af1304ce12bb4dc15a7dfc'],
  ['notoserifkr', 'NotoSerifKR', '11f8d5de6f1b79195efba3828aaa2ec95c1178f5ae976fb23c8d53250a9938f3'],
];
const dir = resolve(process.argv[2] ?? '.cache/fonts');

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

await mkdir(dir, { recursive: true });
for (const [folder, name, expected] of FONTS) {
  const out = join(dir, `${name}-wght.ttf`);
  if (existsSync(out) && sha(await readFile(out)) === expected) {
    console.log(`已存在且校驗相符：${out}`);
    continue;
  }
  const url = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/${folder}/${name}%5Bwght%5D.ttf`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗 ${res.status}：${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== expected) throw new Error(`sha256 不符（${name}）：預期 ${expected}，實際 ${got}`);
  await writeFile(`${out}.tmp`, buf);
  await rename(`${out}.tmp`, out);
  console.log(`已下載 ${(buf.length / 1048576).toFixed(1)} MB → ${out}`);
}
