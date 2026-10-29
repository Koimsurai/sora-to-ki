// 從文章原文抽出 <Sketch chart="…"> 的圖（伺服器畫圖用，見 lib/mdx/mermaidRender.ts）。
// 抽出來的字串要跟元件拿到的 prop 一字不差，對照表才查得到：MDX 會解碼屬性值裡的字元參照
// （`&amp;` → `&`、`&#35;` → `#`），這裡照同一個規則解碼，命名參照用的是 MDX 底層同一個套件。
import { decodeNamedCharacterReference } from 'decode-named-character-reference';

const decodeReferences = (value: string) =>
  value.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{0,31});/g, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const hex = ref[1] === 'x' || ref[1] === 'X';
      const cp = Number.parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    const named = decodeNamedCharacterReference(ref);
    return named === false ? whole : named;
  });

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/**
 * 運算式寫法 chart={"…"}／{'…'}／{`…`} 裡的 JS 字串字面值（元件拿到的是求值後的字串，跳脫要照 JS 解開）。
 * 不是單純的字串字面值（有 ${}、拼接、變數）就回 null
 */
function stringLiteral(expr: string): string | null {
  const m = /^\s*(["'`])([\s\S]*)\1\s*$/.exec(expr);
  if (!m || (m[1] === '`' && m[2].includes('${'))) return null;
  const quote = m[1];
  let out = '';
  for (let i = 0; i < m[2].length; i++) {
    const ch = m[2][i];
    if (ch === quote) return null; // 字面值中間出現沒跳脫的引號：不是單一字串
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = m[2][++i];
    if (next === 'u') {
      const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(m[2].slice(i + 1));
      const hex = braced ? braced[1] : m[2].slice(i + 1, i + 5);
      out += String.fromCodePoint(Number.parseInt(hex, 16));
      i += braced ? braced[0].length : 4;
    } else if (next === 'x') {
      out += String.fromCharCode(Number.parseInt(m[2].slice(i + 1, i + 3), 16));
      i += 2;
    } else if (next === '\n') {
      // 行尾的反斜線：接續下一行，本身不算字
    } else {
      out += ESCAPES[next] ?? next;
    }
  }
  return out;
}

/**
 * 每個 <Sketch> 的 chart 屬性：字串寫法 chart="…"／chart='…'，或運算式裡的單一字串字面值 chart={"…"}。
 * 其他運算式抽不到，元件會顯示錯誤框。屬性值裡可以有 `>`（`A --> B`），所以照屬性一個一個讀，
 * 不能用「讀到 > 為止」
 */
export function extractSketchCharts(content: string): string[] {
  const out: string[] = [];
  const tag = /<Sketch\b/g;
  for (let m = tag.exec(content); m; m = tag.exec(content)) {
    let i = m.index + m[0].length;
    while (i < content.length) {
      const rest = content.slice(i);
      if (/^\s*\/?>/.test(rest)) break;
      const attr = /^\s*([A-Za-z_][\w-]*)\s*=\s*(["'{])/.exec(rest);
      if (!attr) break;
      const [opening, name, open] = attr;
      i += opening.length;
      if (open !== '{') {
        // 字串屬性：值裡不能有同一種引號（JSX 的字串屬性沒有跳脫），直接找下一個
        const close = content.indexOf(open, i);
        if (close < 0) break;
        if (name === 'chart') out.push(decodeReferences(content.slice(i, close)));
        i = close + 1;
        continue;
      }
      // 運算式：括號配對找到結尾（字串裡的括號不算）
      const from = i;
      let depth = 1;
      let quote = '';
      while (i < content.length && depth > 0) {
        const ch = content[i];
        if (quote) {
          if (ch === '\\') i++;
          else if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      if (name === 'chart') {
        const value = stringLiteral(content.slice(from, i - 1));
        if (value !== null) out.push(value);
      }
    }
  }
  return out;
}
