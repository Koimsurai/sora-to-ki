#!/usr/bin/env node
/**
 * 下載按頁裁字用的字型原檔（server/routes/fonts/[style]/[weight]/[file].ts 的 FONTS 表）：
 *   宋體  思源宋體 Noto Serif TC／SC／JP／KR（可變字重）
 *   黑體  思源黑體 Noto Sans TC／SC／JP／KR（可變字重）
 *   楷    霞鶩文楷 TC、霞鶩文楷（簡）、Klee One（日）、Gowun Batang（韓）
 *   現代  MiSans（繁簡共用）、BIZ UDPGothic（日）、Pretendard（韓，可變字重）
 * 檔名沿用舊的 fetch-serif-font：Dockerfile 與 CI 的快取鍵都指著它。
 *
 * 字型太大（合計約 270 MB）不進 git；開發時跑一次，Docker 建置時在獨立的階段跑。
 * 每一支都比對 sha256：上游換檔或被竄改都會直接失敗，而不是把一個沒驗過的字型拿去裁。
 * 來源都釘在不會變的位置：google/fonts 的某一個提交、GitHub release 的某一個版本（發布超過兩週）、
 * MiSans 官方壓縮檔（網址不帶版本，所以整個壓縮檔也比對 sha256，小米換了檔這裡就會停下來）。
 *
 * 授權：MiSans 以外都是 OFL。MiSans 是小米的免費商用字型，嵌入使用要註明（寫在此站點頁）。
 *
 * 用法：node scripts/fetch-serif-font.mjs [輸出目錄]
 * 預設輸出到 .cache/fonts/（伺服器的 SERIF_FONT_DIR 沒設時也讀這裡）。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const GF = 'https://raw.githubusercontent.com/google/fonts/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl';
const gf = (folder, file) => `${GF}/${folder}/${file.replace('[', '%5B').replace(']', '%5D')}`;

/** 直接下載的：[輸出檔名, 網址, sha256] */
const FILES = [
  [
    'NotoSerifTC-wght.ttf',
    gf('notoseriftc', 'NotoSerifTC[wght].ttf'),
    '0077e18f57c6908f4a000969880940bdb0dad057c0e8d98b49dc364c3d1b09c6',
  ],
  [
    'NotoSerifSC-wght.ttf',
    gf('notoserifsc', 'NotoSerifSC[wght].ttf'),
    '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9',
  ],
  [
    'NotoSerifJP-wght.ttf',
    gf('notoserifjp', 'NotoSerifJP[wght].ttf'),
    '2fd527ba12b6a44ec30d796d633360da0aeba6c5d4af1304ce12bb4dc15a7dfc',
  ],
  [
    'NotoSerifKR-wght.ttf',
    gf('notoserifkr', 'NotoSerifKR[wght].ttf'),
    '11f8d5de6f1b79195efba3828aaa2ec95c1178f5ae976fb23c8d53250a9938f3',
  ],
  [
    'NotoSansTC-wght.ttf',
    gf('notosanstc', 'NotoSansTC[wght].ttf'),
    '864727d210d54f2537bbe23b3a839436c3992af72de9322af5270897246bd44f',
  ],
  [
    'NotoSansSC-wght.ttf',
    gf('notosanssc', 'NotoSansSC[wght].ttf'),
    'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da',
  ],
  [
    'NotoSansJP-wght.ttf',
    gf('notosansjp', 'NotoSansJP[wght].ttf'),
    'c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f',
  ],
  [
    'NotoSansKR-wght.ttf',
    gf('notosanskr', 'NotoSansKR[wght].ttf'),
    '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
  ],
  [
    'LXGWWenKaiTC-Regular.ttf',
    gf('lxgwwenkaitc', 'LXGWWenKaiTC-Regular.ttf'),
    '4fcc5aec11cbbf737b0cfab7b63796f7f280087a7a656b2f13342cd5e5318d95',
  ],
  [
    'LXGWWenKaiTC-Bold.ttf',
    gf('lxgwwenkaitc', 'LXGWWenKaiTC-Bold.ttf'),
    '5c9feadfd928f3ae3860e7d001ad3d0d0c55b0157fff08cd4d51b51aca677f23',
  ],
  [
    'KleeOne-Regular.ttf',
    gf('kleeone', 'KleeOne-Regular.ttf'),
    'bf4063f030cc2ae6adf0a11424a1888e5c0eb4438f1f6d02f52294af868e9b3a',
  ],
  [
    'KleeOne-SemiBold.ttf',
    gf('kleeone', 'KleeOne-SemiBold.ttf'),
    'b031ec426c23ca1143ef1f7d58bee7a79efe119ed654152f121c922202b303fd',
  ],
  [
    'GowunBatang-Regular.ttf',
    gf('gowunbatang', 'GowunBatang-Regular.ttf'),
    '466c593e7147412e748af4856d5ad14709b5a860bdf62b9c2546f2c5874e9849',
  ],
  [
    'GowunBatang-Bold.ttf',
    gf('gowunbatang', 'GowunBatang-Bold.ttf'),
    'dbfcaa646e5831e7478524924f02906f550285a5050699b4e38c9950b3ec4b94',
  ],
  [
    'BIZUDPGothic-Regular.ttf',
    gf('bizudpgothic', 'BIZUDPGothic-Regular.ttf'),
    '258d7156c165f2ff774b6efee637c22c3b950de0d8a10e501137061bc8085d01',
  ],
  [
    'BIZUDPGothic-Bold.ttf',
    gf('bizudpgothic', 'BIZUDPGothic-Bold.ttf'),
    '30eba52fc837e8b62c97d4b82e6706583149fb7294e3712dd71a655eaea80a90',
  ],
  // 霞鶩文楷（簡）不在 google/fonts：GitHub release。v1.530 才發兩週不到，先用 v1.522
  [
    'LXGWWenKai-Regular.ttf',
    'https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf',
    '39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009',
  ],
  [
    'LXGWWenKai-Medium.ttf',
    'https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Medium.ttf',
    'd4bdeb38a39151d74d084cba5090f8cb7d20bf83eedb78c35939ae70b9f4e3f6',
  ],
];

/** 壓縮檔裡取出來的：{ 網址, 壓縮檔的 sha256, 要的檔案 [壓縮檔裡的路徑, 輸出檔名, sha256] } */
const ZIPS = [
  {
    url: 'https://github.com/orioncactus/pretendard/releases/download/v1.3.9/Pretendard-1.3.9.zip',
    sha: '04be351a74d6bf7d60c480a3087e51d185485d35a52023142af1df19eb8c428a',
    files: [
      [
        'public/variable/PretendardVariable.ttf',
        'PretendardVariable.ttf',
        '3090ccde0442bb347aa7685d9ba8b17436a60682df6e8f92a9a670de14056e22',
      ],
    ],
  },
  {
    // 官方壓縮檔約 228 MB（含所有字重與格式），只取兩個 ttf
    url: 'https://hyperos.mi.com/font-download/MiSans.zip',
    sha: 'b6aa1fc827035922612df8edf36e5609bca1c5441e25cd57572204569b7b81d9',
    files: [
      [
        'MiSans/ttf/MiSans-Regular.ttf',
        'MiSans-Regular.ttf',
        '9c120f0a849bc0aa5048daae2a3c0f6eecd828b5b33fce682a9622833f5feea6',
      ],
      [
        'MiSans/ttf/MiSans-Semibold.ttf',
        'MiSans-Semibold.ttf',
        '77c23f31ae124867778344970155a0c8d34a89897dedaab81aeee82ff00a4ce6',
      ],
    ],
  },
];

const dir = resolve(process.argv[2] ?? '.cache/fonts');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const ok = async (name, expected) => {
  const out = join(dir, name);
  return existsSync(out) && sha(await readFile(out)) === expected;
};

async function download(url, expected, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗 ${res.status}：${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== expected) throw new Error(`sha256 不符（${label}）：預期 ${expected}，實際 ${got}`);
  return buf;
}

async function save(name, buf) {
  const out = join(dir, name);
  await writeFile(`${out}.tmp`, buf);
  await rename(`${out}.tmp`, out);
  console.log(`已寫入 ${(buf.length / 1048576).toFixed(1)} MB → ${out}`);
}

/**
 * 從 zip 取出一個檔案。只讀中央目錄找到那一筆，再照本地標頭找資料的位置；支援不壓縮（0）與 deflate（8），
 * 這兩個壓縮檔都只用到這兩種。為了這一件事不值得多一個相依
 */
function unzip(zip, path) {
  // 中央目錄的結尾記錄：從檔尾往前找簽章 0x06054b50（後面可能接最多 64 KB 的註解）
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('不是 zip（找不到中央目錄）');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('zip 的中央目錄壞了');
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLen);
    if (name === path) {
      const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(dataAt, dataAt + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip 裡的 ${path} 用了不支援的壓縮方式 ${method}`);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`zip 裡沒有 ${path}`);
}

await mkdir(dir, { recursive: true });
for (const [name, url, expected] of FILES) {
  if (await ok(name, expected)) {
    console.log(`已存在且校驗相符：${name}`);
    continue;
  }
  await save(name, await download(url, expected, name));
}
for (const zip of ZIPS) {
  const missing = [];
  for (const f of zip.files) if (!(await ok(f[1], f[2]))) missing.push(f);
  if (!missing.length) {
    console.log(`已存在且校驗相符：${zip.files.map((f) => f[1]).join('、')}`);
    continue;
  }
  const buf = await download(zip.url, zip.sha, zip.url);
  for (const [path, name, expected] of missing) {
    const file = unzip(buf, path);
    const got = sha(file);
    if (got !== expected) throw new Error(`sha256 不符（${name}）：預期 ${expected}，實際 ${got}`);
    await save(name, file);
  }
}
