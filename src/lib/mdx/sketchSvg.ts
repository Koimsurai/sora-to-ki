// Sketch 區塊：mermaid 語法 → 手繪風 SVG，在伺服器上畫好（原本是在讀者的瀏覽器裡載 Excalidraw 現畫，
// 有 Sketch 的文章要多下載約 10 MB 的程式）。只在伺服器用，由 lib/mdx/mermaidRender.ts 動態 import。
//
// 排版交給 pele，參數照 mermaid-to-excalidraw 3.x 呼叫 pele 的那一套（字級 20、間距放大 1.5 倍），
// 量字用手寫字型的字寬，框才剛好裝得下手寫字；框與線再用 rough.js（Excalidraw 也是用它）重畫成手繪。
//
// 字型：拉丁字是 Excalifont（public/excalifont，@font-face 在 components/mdx/SketchFonts.css），
// 中日韓字是小賴字體，按這張圖用到的字裁一個小檔（server/routes/fonts 的 hand 風格），
// 宣告寫在 SVG 自己的 <style> 裡，字族名每張圖不同（不同的圖裁出來的字不一樣）。
import { render } from 'pele';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import { isSerifCodepoint, subsetUrl } from '@/lib/serifSubset';
import { mermaidKey } from './mermaidFences';
import excalifontWidths from './sketchFontWidths.json';

const FONT_SIZE = 20;
/** 線的粗細與手繪的抖動程度（rough.js 的預設；Excalidraw 的「細」線是 1、「中」是 2） */
const STROKE_WIDTH = 2;
/**
 * 手繪圖的換行寬度。pele 預設 200px，但手寫字比較寬，照預設斷的話很多標籤會多斷一行
 * （例如「網際網路 讀者與掃描器」），放寬一點跟 Excalidraw 版的斷法接近
 */
const WRAPPING_WIDTH = 240;
/** 小賴字體的中日韓字寬度在 0.90 到 1.00 em 之間（中位數 0.924）；估 0.95，框不會比字窄到裝不下 */
const CJK_EM = 0.95;

const EX_WIDTHS: Record<string, number | undefined> = excalifontWidths;

/** 中日韓字、全形符號（交給小賴字體的那些） */
const isWideCodepoint = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x11ff) ||
  (cp >= 0x2e80 && cp <= 0x9fff) ||
  (cp >= 0xac00 && cp <= 0xd7af) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xffef);

/** pele 量字：Excalifont 有的字查它的字寬表，中日韓字估 CJK_EM，兩邊都沒有的估 0.6 em */
const measurer = {
  width(text: string, size: number): number {
    let em = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const w = EX_WIDTHS[cp];
      em += w !== undefined ? w / 1000 : isWideCodepoint(cp) ? CJK_EM : 0.6;
    }
    return em * size;
  },
};

/** 跟 mermaid-to-excalidraw 3.x 一樣：Excalidraw 的線較粗、箭頭較大，pele 預設的間距放大 1.5 倍 */
const spacing = (node: number, rank: number) => ({ nodeSpacing: node * 1.5, rankSpacing: rank * 1.5 });
const PELE_CONFIG = {
  flowchart: { curve: 'basis', wrappingWidth: WRAPPING_WIDTH, ...spacing(40, 48) },
  class: spacing(40, 56),
  er: spacing(48, 64),
  state: spacing(40, 44),
  sequence: { actorMargin: 60, messageMargin: 52.5 },
};

/** 同一張圖每次畫出來都一樣（伺服器重畫、快取過期都不會換抖法）：seed 由圖與元素的序號決定 */
const seedOf = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) % 2147483647 || 1;
};

const generator = rough.generator();
const INK = 'var(--sketch-ink, currentColor)';

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const num = (tag: string, name: string) => Number.parseFloat(attr(tag, name) ?? '0');
const pairs = (points: string): [number, number][] => {
  const n = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
};

type Drawable = ReturnType<typeof generator.path>;
const toSvg = (drawable: Drawable, extra = '') =>
  generator
    .toPaths(drawable)
    .map((p) => `<path d="${p.d}" stroke="${INK}" stroke-width="${p.strokeWidth}" fill="none"${extra}/>`)
    .join('');

/** 一個形狀元素（rect／polygon／circle／ellipse／line／polyline／path）→ 手繪的路徑；認不得的回 null */
function roughShape(tag: string, options: Options): Drawable | null {
  const kind = /^<(\w+)/.exec(tag)?.[1];
  switch (kind) {
    case 'rect': {
      const [x, y, w, h] = [num(tag, 'x'), num(tag, 'y'), num(tag, 'width'), num(tag, 'height')];
      const r = Math.min(num(tag, 'rx'), w / 2, h / 2);
      // 圓角大的（體育場形、圓角矩形）照圓角畫；一般節點的小圓角（pele 的 --pele-radius）跟 Excalidraw 一樣畫成直角
      if (r > 6) {
        const d =
          `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}` +
          `A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}` +
          `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
        return generator.path(d, options);
      }
      return generator.rectangle(x, y, w, h, options);
    }
    case 'polygon':
      return generator.polygon(pairs(attr(tag, 'points') ?? ''), options);
    case 'polyline':
      return generator.linearPath(pairs(attr(tag, 'points') ?? ''), options);
    case 'circle':
      return generator.circle(num(tag, 'cx'), num(tag, 'cy'), num(tag, 'r') * 2, options);
    case 'ellipse':
      return generator.ellipse(num(tag, 'cx'), num(tag, 'cy'), num(tag, 'rx') * 2, num(tag, 'ry') * 2, options);
    case 'line':
      return generator.line(num(tag, 'x1'), num(tag, 'y1'), num(tag, 'x2'), num(tag, 'y2'), options);
    case 'path': {
      const d = attr(tag, 'd');
      return d ? generator.path(d, options) : null;
    }
    default:
      return null;
  }
}

/**
 * 箭頭：pele 畫的是實心三角形（marker），Excalidraw 是兩撇。從三角形的尖端往兩個底角各拉長畫一撇；
 * 不是三角形的（圓頭、叉叉）照原樣、塗成墨色
 */
function arrowHead(tag: string, options: Options): string {
  const pts = [...(attr(tag, 'd') ?? '').matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m): [number, number] => [
    Number(m[1]),
    Number(m[2]),
  ]);
  if (pts.length !== 3) return tag.replace(/\sfill="[^"]*"/, ` fill="${INK}"`);
  const [tip, a, b] = pts;
  const arm = (p: [number, number]): [number, number] => [
    tip[0] + (p[0] - tip[0]) * 1.9,
    tip[1] + (p[1] - tip[1]) * 1.9,
  ];
  return toSvg(generator.linearPath([arm(a), tip, arm(b)], { ...options, preserveVertices: true }));
}

/** 作者在圖裡標的顏色（classDef／style）拿掉：手繪圖是單色的，配色交給外層的 --sketch-ink */
const stripColors = (tag: string) =>
  tag.replace(/\sstyle="([^"]*)"/, (_all, css: string) => {
    const kept = css
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !/^(fill|stroke|color)\s*:/i.test(d));
    return kept.length ? ` style="${kept.join(';')}"` : '';
  });

const decodeText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** 這張圖裡要交給小賴字體的字（Excalifont 沒有、而且裁字路由收的那些） */
function wideCodepoints(svg: string): number[] {
  const out = new Set<number>();
  for (const m of svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]+)/g)) {
    for (const ch of decodeText(m[1])) {
      const cp = ch.codePointAt(0) ?? 0;
      if (EX_WIDTHS[cp] === undefined && isSerifCodepoint(cp)) out.add(cp);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** mermaid 語法 → 手繪風 SVG 字串。語法錯誤時丟出 pele 的錯誤（訊息照 mermaid 的格式） */
export function renderSketchSvg(chart: string): string {
  const key = mermaidKey(chart);
  let svg = render(chart, {
    measurer,
    fontSize: FONT_SIZE,
    fontFamily: 'Excalifont, Xiaolai, sans-serif',
    responsive: false,
    autoDirection: false,
    config: PELE_CONFIG,
  }).svg;

  let index = 0;
  const optionsFor = (dashed: boolean): Options => ({
    roughness: 1,
    bowing: 1,
    strokeWidth: STROKE_WIDTH,
    seed: seedOf(`${key}:${index++}`),
    ...(dashed ? { disableMultiStroke: true } : {}),
  });

  // 連線上的字的底框：只負責蓋住底下那段線，顏色跟背景一樣、不描邊
  svg = svg.replace(
    /(<g class="pele-edge-label"[^>]*>\s*<rect\b[^>]*?)\sfill="[^"]*"/g,
    '$1 fill="var(--sketch-bg, transparent)"',
  );

  // 其餘所有形狀改成手繪（字與連線上的字的底框除外）
  svg = svg.replace(/<(rect|polygon|polyline|circle|ellipse|line|path)\b[^>]*\/>/g, (tag) => {
    if (tag.includes('var(--sketch-bg')) return tag;
    const dashed = tag.includes('stroke-dasharray');
    const options = optionsFor(dashed);
    if (/class="[^"]*pele-marker/.test(tag)) return arrowHead(tag, options);
    // 只有填色、不描邊的小記號（圓點之類）照原樣，顏色改成墨色
    if (/\sstroke="none"/.test(tag)) return stripColors(tag).replace(/\sfill="[^"]*"/, ` fill="${INK}"`);
    const drawable = roughShape(tag, options);
    if (!drawable) return tag;
    const transform = attr(tag, 'transform');
    const dash = dashed ? ' stroke-dasharray="8 9"' : '';
    const paths = toSvg(drawable, dash);
    return transform ? `<g transform="${transform}">${paths}</g>` : paths;
  });

  // 字：作者標的字色拿掉，跟線同一個墨色
  svg = svg.replace(/<(text|tspan)\b[^>]*>/g, stripColors);

  // 根元素：pele 的配色變數全部指到墨色／背景，字型換成手寫字；寬度交給 CSS（.mdx-sketch svg）
  const family = `Sketch Hand ${key}`;
  const vars =
    `--pele-fg:${INK};--pele-line:${INK};--pele-border:${INK};--pele-muted:${INK};--pele-accent:${INK};` +
    `--pele-bg:var(--sketch-bg, transparent);--pele-surface:transparent;--pele-surface-alt:transparent;` +
    // 字族名用單引號：這串放在 style="…" 屬性裡，雙引號會把屬性提早截斷（後面的配色與字型全部遺失）
    `--pele-font:Excalifont, '${family}', sans-serif;`;
  svg = svg.replace(/^<svg\b[^>]*>/, (open) =>
    open
      .replace('class="pele ', 'class="pele mdx-sketch-svg ')
      .replace(/\sstyle="(?:max-width:100%;height:auto;)?/, ` style="${vars}`),
  );

  const cps = wideCodepoints(svg);
  if (cps.length) {
    const face = `@font-face{font-family:"${family}";src:url(${subsetUrl(400, cps, 'tc', 'hand')}) format("woff2");font-display:swap}`;
    svg = svg.replace(/^(<svg\b[^>]*>)/, `$1<style>${face}</style>`);
  }
  return svg;
}
