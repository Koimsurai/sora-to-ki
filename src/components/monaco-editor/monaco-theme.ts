import type * as Monaco from 'monaco-editor';

// Monaco 的「夜」主題（2026-10 後台提案）：跟後台同一套材料——夜色底、墨色字、琥珀只給游標（你在哪裡）。
// 行號與捲軸的顏色也在這裡給：原本是在 CSS 裡用 !important 硬蓋 Monaco 注入的顏色，
// 主題本身給對了就不用跟它搶。
//
// Monaco 的主題吃的是 hex（可帶 alpha），不吃 CSS 變數，所以從 lib/palette 讀了再換成 hex；
// alpha 照透明度梯子（10 → 1a、15 → 26…）。
import { hex, palette } from '@/lib/palette';

export const SORA_NIGHT = 'sora-night';

const COLORS = palette();
const GROUND = hex(COLORS.ground);
const PAPER = hex(COLORS.paper);
const AMBER = hex(COLORS.amber);
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** 墨色加上透明度（alpha 是 0–1，落在透明度梯子上）。給 `colors`：介面顏色吃 #rrggbbaa */
const ink = (alpha: number) => `${PAPER}${hex2(alpha * 255)}`;

/**
 * 墨色以這個透明度疊在夜色上之後的實色（不帶 #）。給語法上色的 `rules`：
 * token 的前景色不保證吃得下 alpha，所以先自己疊好。
 */
function solid(alpha: number): string {
  const channels = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [g, p] = [channels(GROUND), channels(PAPER)];
  return p.map((c, i) => hex2(c * alpha + g[i] * (1 - alpha))).join('');
}

export function defineSoraNight(monaco: typeof Monaco) {
  monaco.editor.defineTheme(SORA_NIGHT, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: PAPER.slice(1) },
      // Markdown：標題實墨加粗，標記符號（# - > ```）退到淡墨，連結與行內程式碼墨 70%
      { token: 'keyword.md', foreground: solid(0.55) },
      { token: 'markup.heading', foreground: PAPER.slice(1), fontStyle: 'bold' },
      { token: 'strong', fontStyle: 'bold' },
      { token: 'emphasis', fontStyle: 'italic' },
      { token: 'string.link', foreground: solid(0.7) },
      { token: 'string.link.md', foreground: solid(0.7) },
      { token: 'variable', foreground: solid(0.7) },
      { token: 'variable.source', foreground: solid(0.7) },
      { token: 'comment', foreground: solid(0.4), fontStyle: 'italic' },
      // MDX 的 JSX 標籤：淡墨，讓內文比標籤顯眼
      { token: 'tag', foreground: solid(0.55) },
      { token: 'attribute.name', foreground: solid(0.55) },
      { token: 'attribute.value', foreground: solid(0.7) },
    ],
    colors: {
      'editor.background': GROUND,
      'editor.foreground': PAPER,
      'editorCursor.foreground': AMBER,
      'editor.lineHighlightBackground': ink(0.04),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': ink(0.15),
      'editor.inactiveSelectionBackground': ink(0.08),
      'editor.findMatchBackground': ink(0.25),
      'editor.findMatchHighlightBackground': ink(0.1),
      'editorLineNumber.foreground': ink(0.3),
      'editorLineNumber.activeForeground': ink(0.7),
      'editorIndentGuide.background1': ink(0.08),
      'editorWhitespace.foreground': ink(0.15),
      'editorGutter.background': GROUND,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': ink(0.15),
      'scrollbarSlider.hoverBackground': ink(0.25),
      'scrollbarSlider.activeBackground': ink(0.4),
      'minimap.background': GROUND,
      'editorWidget.background': GROUND,
      'editorWidget.border': ink(0.15),
      'editorSuggestWidget.background': GROUND,
      'editorSuggestWidget.border': ink(0.15),
      'editorSuggestWidget.selectedBackground': ink(0.08),
      'editorHoverWidget.background': GROUND,
      'editorHoverWidget.border': ink(0.15),
      focusBorder: ink(0.4),
    },
  });
}
