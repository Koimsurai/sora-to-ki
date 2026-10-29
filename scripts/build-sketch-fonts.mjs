#!/usr/bin/env node
/**
 * Sketch 區塊的手寫字型（Excalifont）：從 public/excalifont/ 的分檔產生兩份檔案，換字型分檔時重跑一次。
 *
 *   src/lib/mdx/sketchFontWidths.json     每個字的寬度（千分之一 em）。伺服器排版時量字用
 *                                         （lib/mdx/sketchSvg.ts），框的大小才剛好裝得下手寫字
 *   src/components/mdx/SketchFonts.css    每個分檔的 @font-face 與 unicode-range，瀏覽器只下載用到的分檔
 *
 * 分檔取自 Excalidraw（OFL-1.1，見 public/excalifont/OFL.txt）。中日韓字用的 Xiaolai 不在這裡：
 * 它由 scripts/fetch-serif-font.mjs 下載完整檔，交給按頁裁字（server/routes/fonts，風格 hand）。
 *
 * 用法：node scripts/build-sketch-fonts.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'package.json'));
// wawoff2 是 subset-font（經 fontverter）的相依，不是直接相依：從它們的位置解析
const fontverter = createRequire(createRequire(require.resolve('subset-font')).resolve('fontverter'));
const wawoff2 = fontverter('wawoff2');
const hb = await import(require.resolve('harfbuzzjs'));

const DIR = join(root, 'public/excalifont');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.woff2'))
  .sort();

/** 連續的碼位併成一段 */
const rangesOf = (cps) => {
  const sorted = [...cps].sort((a, b) => a - b);
  const hex = (n) => n.toString(16).toUpperCase();
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `U+${hex(sorted[i])}` : `U+${hex(sorted[i])}-${hex(sorted[j])}`);
    i = j + 1;
  }
  return out.join(', ');
};

const widths = {};
let css =
  '/* 由 scripts/build-sketch-fonts.mjs 產生，不要手改。Sketch 區塊的手寫字型（Excalifont，OFL-1.1）：\n' +
  '   每個分檔各自一段 unicode-range，瀏覽器只下載圖裡用到的那幾個 */\n';
for (const f of files) {
  const ttf = await wawoff2.decompress(readFileSync(join(DIR, f)));
  const face = new hb.Face(new hb.Blob(ttf), 0);
  const font = new hb.Font(face);
  // collectUnicodes 回的是 wasm 記憶體上的視圖，之後一 shape 就會失效：先複製
  const cps = Array.from(face.collectUnicodes());
  for (const cp of cps) {
    if (cp in widths) continue;
    const buf = new hb.Buffer();
    buf.addText(String.fromCodePoint(cp));
    buf.guessSegmentProperties();
    hb.shape(font, buf);
    const advance = buf.getGlyphPositions().reduce((sum, p) => sum + p.xAdvance, 0);
    widths[cp] = Math.round((advance / face.upem) * 1000);
  }
  css +=
    `\n@font-face {\n  font-family: Excalifont;\n  src: url("/excalifont/${f}") format("woff2");\n` +
    `  unicode-range: ${rangesOf(cps)};\n  font-display: swap;\n}\n`;
}

writeFileSync(join(root, 'src/lib/mdx/sketchFontWidths.json'), `${JSON.stringify(widths)}\n`);
const cssPath = join(root, 'src/components/mdx/SketchFonts.css');
writeFileSync(cssPath, css);
// 排成 Biome 要的樣子（長的 unicode-range 會折行），產物才過得了 pnpm lint:css
execFileSync('pnpm', ['exec', 'biome', 'format', '--write', '--config-path=.config/biome.json', cssPath], {
  cwd: root,
  stdio: 'ignore',
});
console.log(`Excalifont：${files.length} 個分檔、${Object.keys(widths).length} 個字`);
