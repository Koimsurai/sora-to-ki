// mermaid 圍籬的**共用判準**：伺服器端要抽出哪些程式碼區塊去渲染、client 端要用什麼鍵
// 去查對照表，兩邊必須完全一致，否則會靜靜地查不到（圖就變回 client 端自己渲染）。
// 這個模組刻意零相依，server function 與元件都能引用。

/** 沒有 language tag 時，用開頭關鍵字判定是不是 mermaid。與 BlogPost.tsx 的 CodeBlock 同一條。 */
const MERMAID_START =
  /^(---|graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|sankey)/m;

function looksLikeMermaid(body: string): boolean {
  return MERMAID_START.test(body.trim());
}

/**
 * 對照表的鍵。用 FNV-1a 的 32-bit 變體：夠短（8 個十六進位字元）、純函式、
 * 兩端算出來一定一樣。拿圖的原始碼當輸入，前後空白先 trim 掉——
 * client 端拿到的 `code` 已經被 `.replace(/\n$/, '')` 過，跟伺服器抽出來的尾端不一致。
 */
export function mermaidKey(body: string): string {
  let h = 0x811c9dc5;
  const s = body.trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 從文章原文抽出所有 mermaid 圍籬的內容（markdown 與 mdx 都適用）。 */
export function extractMermaidFences(content: string): string[] {
  const out: string[] = [];
  const fence = /^[ \t]*```([^\n`]*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  for (const m of content.matchAll(fence)) {
    const lang = m[1].trim().toLowerCase();
    const body = m[2];
    // `lang === ''` 對應 CodeBlock 的「沒有 language tag」；'text' 是它明確也會偵測的那條。
    if (lang === 'mermaid' || ((lang === '' || lang === 'text') && looksLikeMermaid(body))) {
      out.push(body.replace(/\n$/, ''));
    }
  }
  return out;
}

/**
 * Sketch 的圖去掉每行開頭的空白與引用符號（`>`）。多行的 chart 寫在清單、引用或縮排裡時，
 * MDX 會拿掉續行開頭的縮排與容器前綴，但字串屬性與運算式拿掉的方式不一樣；伺服器從原文抽出來的
 * 卻還帶著。mermaid 本來就不看行首的縮排，兩邊都先正規化，畫出來的圖與對照表的鍵才會一樣
 */
export const normalizeSketchChart = (chart: string) =>
  chart
    .split('\n')
    .map((line) => line.replace(/^[\s>]+/, '').trimEnd())
    .join('\n')
    .trim();

/** Sketch 區塊的圖在對照表裡的鍵（跟 mermaid 圍籬共用一張表，加前綴分開） */
export const sketchKey = (chart: string) => `sketch:${mermaidKey(normalizeSketchChart(chart))}`;

/** 畫不出來的 Sketch：錯誤訊息存在這個鍵底下，元件照樣顯示錯誤框 */
export const sketchErrorKey = (chart: string) => `sketch-error:${mermaidKey(normalizeSketchChart(chart))}`;
