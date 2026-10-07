/**
 * 站台圖示（favicon / PWA / apple-touch-icon）全部從 scripts/icons/ 的兩張 SVG 產生。
 *
 *   node scripts/gen-icons.mjs
 *
 * 兩張原稿：
 *   icon.svg        完整版（新月 + 樹 + 星點），48px 以上都用它
 *   icon-small.svg  16 / 32px 專用：同一個構圖、去掉星點與細節。完整版縮到 16px 時月亮和樹會糊在一起
 *
 * 產出（都寫進 public/）：
 *   favicon.ico            16 + 32（小尺寸版）與 48（完整版），PNG 內嵌的 ICO
 *   favicon-96.png         給 Google 搜尋結果——它要 48 的倍數，而且優先取 <link rel="icon"> 宣告的那支
 *   apple-touch-icon.png   180，**滿版沒有圓角**：iOS 自己會裁圓角，透明的角會被填成黑色
 *   pwa-192.png / pwa-512.png      完整版
 *   pwa-maskable-512.png   滿版底色、圖案縮到 78%：Android 的遮罩只保證中間 80% 圓形一定看得到
 *   pwa-icon.svg           完整版原稿的副本
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const src = (f) => readFileSync(path.join(root, 'scripts/icons', f), 'utf8');
const out = (f) => path.join(root, 'public', f);

const full = src('icon.svg');
const small = src('icon-small.svg');

/** 滿版：拿掉底板的圓角。 */
const fullBleed = full.replace(/(<rect width="64" height="64") rx="14"/, '$1');
/** 可遮罩：滿版底板，圖案縮到 78% 置中。 */
const maskable = fullBleed.replace(
  /(<rect width="64" height="64" fill="url\(#bg\)"\/>)([\s\S]*)(<\/svg>)/,
  '$1<g transform="translate(32 32) scale(0.78) translate(-32 -32)">$2</g>$3',
);
if (fullBleed === full || maskable === fullBleed)
  throw new Error('icon.svg 的底板格式變了，fullBleed / maskable 的替換沒有生效');

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 72 * (size / 64) * 4 })
    .resize(size, size)
    .png()
    .toBuffer();

/** PNG 內嵌的 ICO（Vista 起所有瀏覽器都支援）：6 bytes 檔頭 + 每張 16 bytes 目錄 + PNG 本體。 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images.map((i) => i.data)]);
}

writeFileSync(
  out('favicon.ico'),
  ico([
    { size: 16, data: await png(small, 16) },
    { size: 32, data: await png(small, 32) },
    { size: 48, data: await png(full, 48) },
  ]),
);
writeFileSync(out('favicon-96.png'), await png(full, 96));
writeFileSync(out('apple-touch-icon.png'), await png(fullBleed, 180));
writeFileSync(out('pwa-192.png'), await png(full, 192));
writeFileSync(out('pwa-512.png'), await png(full, 512));
writeFileSync(out('pwa-maskable-512.png'), await png(maskable, 512));
copyFileSync(path.join(root, 'scripts/icons/icon.svg'), out('pwa-icon.svg'));
console.log('圖示已產生到 public/');
