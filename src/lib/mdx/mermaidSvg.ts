// mermaid 語法 → SVG 字串。單獨一個模組是為了讓它能被「只在伺服器用」地引用：
// 元件裡的 SSR 分支靜態 import 它，client 分支改成動態 import，rollup 才切得開。
import { render } from 'pele';

/**
 * 產出**不含顏色**的 SVG：幾何交給 pele（Obsidian 開源的 mermaid 渲染器），配色全部留給 CSS。
 *
 * pele 的輸出用 `var(--pele-fg)`、`var(--pele-surface)` 這類變數上色，沒給值時才退回它自己的預設。
 * 變數由外層 `.mm-theme-*` 提供（見 blog/MermaidBlock.css）——換主題只是換一個 class，
 * 不需要重新渲染，client 端也就不需要渲染器。它同步、沒有執行期相依，也不碰 DOM，
 * 所以在伺服器端直接跑；輸出沒有 <script>、沒有對外請求。
 *
 * 作者在圖裡自己標的顏色（classDef / style）不照原色畫，改成站上的語言（見 nodeRoles）。
 */
export function renderMermaidSvg(body: string): string {
  return nodeRoles(render(body).svg);
}

/** 節點的角色：作者標的顏色歸成四類，畫法在 MermaidBlock.css 的 .mm-role-* */
export type NodeRole = 'ok' | 'bad' | 'mark' | 'alt';

/**
 * 顏色 → 角色。看的是色相：綠＝成立、紅＝排除、黃橙＝重點、藍紫＝次要；
 * 灰階（飽和度太低）與認不得的寫法（色名、rgb()）不算，照預設畫。
 */
export function roleOfColor(color: string): NodeRole | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).replace(/./g, '$&$&');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return null;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return 'bad';
  if (h < 70) return 'mark';
  if (h < 170) return 'ok';
  return 'alt';
}

const NODE_OPEN = '<g class="pele-node';
/** 節點本身的開頭（外層裝所有節點的是 `pele-nodes`，開頭一樣，要排除） */
const NODE_AT = /<g class="pele-node(?=[ "])/g;

/** 節點外框的左上角（節點自己的座標）：矩形讀 x/y，多邊形取所有頂點的最小值；其他形狀量不到 */
function cornerOf(node: string): { x: number; y: number } | null {
  const rect = /<rect\b[^>]*\bx="(-?[\d.]+)"[^>]*\by="(-?[\d.]+)"/.exec(node);
  if (rect) return { x: Number(rect[1]), y: Number(rect[2]) };
  const poly = /<polygon\b[^>]*\bpoints="([^"]+)"/.exec(node);
  if (!poly) return null;
  const nums = poly[1]
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return xs.length ? { x: Math.min(...xs), y: Math.min(...ys) } : null;
}
/** 拿掉 style 裡的 fill / stroke / color，其他（例如圓角）留著；整段空了就把 style 屬性拿掉 */
const stripColors = (tag: string) =>
  tag.replace(/\sstyle="([^"]*)"/, (_all, css: string) => {
    const kept = css
      .split(';')
      .map((d) => d.trim())
      .filter((d) => d && !/^(fill|stroke|color)\s*:/i.test(d));
    return kept.length ? ` style="${kept.join(';')};"` : '';
  });

/**
 * 每個節點：讀出作者標的填色（沒填色就看框色）→ 歸類 → 拿掉原本的顏色、掛上 `mm-role-*`。
 * 「重點」一張圖只留第一個（站上琥珀只標一個點），其餘的當成「成立」那種亮框。
 */
export function nodeRoles(svg: string): string {
  let out = '';
  let from = 0;
  let marked = false;
  const nextNode = (pos: number) => {
    NODE_AT.lastIndex = pos;
    return NODE_AT.exec(svg)?.index ?? -1;
  };
  for (let at = nextNode(0); at >= 0; at = nextNode(from)) {
    // 找這個節點的 </g>（節點裡可能還有巢狀的 <g>）
    let depth = 0;
    let end = at;
    const tag = /<\/?g\b[^>]*>/g;
    tag.lastIndex = at;
    for (let t = tag.exec(svg); t; t = tag.exec(svg)) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    if (end === at) break;
    const node = svg.slice(at, end);
    const color =
      /style="[^"]*\bfill:\s*([^;"]+)/i.exec(node)?.[1] ?? /style="[^"]*\bstroke:\s*([^;"]+)/i.exec(node)?.[1];
    let role = color ? roleOfColor(color) : null;
    if (role === 'mark') {
      if (marked) role = 'ok';
      marked = true;
    }
    let next = node;
    if (color) {
      next = next.replace(/<(rect|path|polygon|circle|ellipse|text|line|polyline)\b[^>]*>/g, stripColors);
    }
    if (role === 'mark') {
      const corner = cornerOf(next);
      if (corner) {
        const dot = `<circle class="mm-mark-dot" cx="${corner.x}" cy="${corner.y}" r="3.5"/>`;
        next = next.slice(0, -'</g>'.length) + dot + '</g>';
      }
    }
    if (role) next = next.replace(NODE_OPEN, `${NODE_OPEN} mm-role-${role}`);
    out += svg.slice(from, at) + next;
    from = end;
  }
  return out + svg.slice(from);
}
