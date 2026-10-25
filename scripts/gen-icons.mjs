/**
 * 站台圖示（favicon / PWA / apple-touch-icon）全部從 scripts/icons/ 的原稿產生。
 *
 *   node scripts/gen-icons.mjs
 *
 * 原稿（2026-10 翻新後是同一個圖案：刷痕星球＋琥珀衛星，滿版，16px 時靠外形認）：
 *   icon.svg          放在站上底色上的版本。Google 搜尋、PWA、apple-touch-icon 用它
 *   tab-planet.svg    瀏覽器分頁列用的：不放底板，顏色跟著瀏覽器的深淺主題
 *
 * ⚠ 分頁列與 Google 搜尋是兩支檔案（圖案一樣，一支有底板、一支沒有）：
 *   · Google 只採用 Googlebot-Image 抓得到的圖示，所以 server/routes/robots.txt.ts 只對它擋掉
 *     favicon.svg 與 favicon.ico，它能選的就只剩 favicon-96.png。favicon.ico 也不放 48（多一道保險）
 *   · 分頁列：Chrome 有 SVG 就用 SVG；Firefox 取最後宣告的那支
 *     → __root.tsx 裡 favicon.svg 要宣告在**最後**
 *
 * 產出（都寫進 public/）：
 *   favicon.svg            tab-planet.svg 的副本（Chrome / Edge / Firefox 的分頁列）
 *   favicon.ico            16 + 32（行星，白線條），不吃 SVG 圖示的瀏覽器用。PNG 內嵌的 ICO
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
const tab = src('tab-planet.svg');

/** ico 沒辦法跟著主題變色，固定用暖白（多數分頁列是深色，淺色分頁列會比較淡）。 */
const tabWhite = tab.replace('.s { fill: #0a0a0c; }', '.s { fill: #f1ece3; }');
if (tabWhite === tab) throw new Error('tab-planet.svg 的預設顏色改了，favicon.ico 的換色沒有生效');

/** 滿版：拿掉底板的圓角。 */
const fullBleed = full.replace(/(<rect width="64" height="64") rx="14"/, '$1');
/** 可遮罩：滿版底板，圖案縮到 78% 置中。 */
const maskable = fullBleed.replace(
  /(<rect width="64" height="64" fill="#0a0a0c"\/>)([\s\S]*)(<\/svg>)/,
  '$1<g transform="translate(32 32) scale(0.78) translate(-32 -32)">$2</g>$3',
);
if (fullBleed === full || maskable === fullBleed)
  throw new Error('icon.svg 的底板格式變了，fullBleed / maskable 的替換沒有生效');

/** density 照 viewBox 換算（icon.svg 是 64、tab-planet.svg 是 32），先放大四倍再縮，邊緣才不會鋸齒。 */
const png = (svg, size, viewBox = 64) =>
  sharp(Buffer.from(svg), { density: 72 * (size / viewBox) * 4 })
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
    { size: 16, data: await png(tabWhite, 16, 32) },
    { size: 32, data: await png(tabWhite, 32, 32) },
  ]),
);
copyFileSync(path.join(root, 'scripts/icons/tab-planet.svg'), out('favicon.svg'));
writeFileSync(out('favicon-96.png'), await png(full, 96));
writeFileSync(out('apple-touch-icon.png'), await png(fullBleed, 180));
writeFileSync(out('pwa-192.png'), await png(full, 192));
writeFileSync(out('pwa-512.png'), await png(full, 512));
writeFileSync(out('pwa-maskable-512.png'), await png(maskable, 512));
copyFileSync(path.join(root, 'scripts/icons/icon.svg'), out('pwa-icon.svg'));
console.log('圖示已產生到 public/');
