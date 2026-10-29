// sketchCharts：從原文抽出來的 chart 必須跟 MDX 編譯後元件拿到的 prop 一字不差（對照表的鍵靠它），
// 所以直接拿真的 MDX 編譯結果比，不是比手寫的預期值。
import { describe, expect, it } from 'vite-plus/test';
import { compileMdxSource } from './mdx-compile-core';
import { sketchKey } from './mermaidFences';
import { extractSketchCharts } from './sketchCharts';

interface HastNode {
  name?: string;
  attributes?: { name: string; value: unknown }[];
  children?: HastNode[];
}
interface ExpressionValue {
  data?: {
    estree?: {
      body: { expression: { type: string; value?: unknown; quasis?: { value: { cooked: string } }[] } }[];
    };
  };
}

/**
 * 編譯後每個 <Sketch> 的 chart 值：字串屬性直接拿；運算式取 estree 裡的字面值，
 * 跟元件求值時一樣（packages/mdx-core 的 literalValue：Literal 取 value，沒有 ${} 的樣板字串取 cooked）
 */
async function compiledCharts(source: string): Promise<unknown[]> {
  const out: unknown[] = [];
  const walk = (n: HastNode) => {
    if (n.name === 'Sketch') {
      const chart = n.attributes?.find((a) => a.name === 'chart')?.value;
      if (typeof chart === 'string') out.push(chart);
      else {
        const expr = (chart as ExpressionValue).data?.estree?.body[0].expression;
        out.push(expr?.type === 'TemplateLiteral' ? expr.quasis?.[0].value.cooked : expr?.value);
      }
    }
    n.children?.forEach(walk);
  };
  walk(JSON.parse(await compileMdxSource(source)) as HastNode);
  return out;
}

describe('extractSketchCharts', () => {
  const cases = [
    '<Sketch chart="graph TD; A[開始] --> B[結束]" title="流程" />',
    // 字元參照：命名、十進位、十六進位都會被 MDX 解開
    '<Sketch chart="graph TD; A[a &amp; b &lt;x&gt; &quot;q&quot; &#35;9 &#x41; &copy;] --> B" />',
    '<Sketch chart=\'graph LR; A["雙引號"] --> B\' />',
    // 運算式裡的字串字面值：照 JS 的跳脫解開（種子文章就是這種寫法）
    '<Sketch title="流程" chart={"graph TD\\n  A[開始] --> B[結束]"} />',
    "<Sketch chart={'graph TD; A[\\'單\\'] --> B'} />",
    '<Sketch chart={`graph TD\n  A --> B`} />',
    // 屬性順序、換行、值裡的 >
    '<Sketch\n  title="x"\n  chart="graph LR; A -->|是| B; B --> C"\n/>',
    // 多行的圖寫在縮排、清單、引用裡：MDX 會拿掉續行開頭的縮排與前綴，抽出來的卻還帶著，
    // 兩邊先正規化（mermaidFences 的 normalizeSketchChart）再比鍵
    '<Sketch chart="graph TD\n  A --> B\n      C --> D" />',
    '<Sketch chart={`graph TD\n    A --> B\n\tC --> D`} />',
    '- item\n\n  <Sketch chart="graph TD\n    A --> B" />',
    '> <Sketch chart="graph TD\n>   A --> B" />',
  ];
  for (const source of cases) {
    it(`跟 MDX 編譯結果對得上：${source.slice(0, 48)}`, async () => {
      const expected = await compiledCharts(source);
      expect(expected).toHaveLength(1);
      const got = extractSketchCharts(source);
      expect(got).toHaveLength(1);
      expect(sketchKey(got[0])).toBe(sketchKey(String(expected[0])));
    });
  }

  it('單行的字串屬性抽出來一字不差', () => {
    expect(extractSketchCharts('<Sketch chart="graph TD; A[a &amp; b] --> B" />')).toEqual([
      'graph TD; A[a & b] --> B',
    ]);
  });

  it('一篇裡有多張、夾在別的內容中間', () => {
    const src =
      '前文\n\n<Sketch chart="graph TD; A --> B" />\n\n```js\nconst a = 1;\n```\n\n<Sketch chart="graph LR; C --> D" />';
    expect(extractSketchCharts(src)).toEqual(['graph TD; A --> B', 'graph LR; C --> D']);
  });

  it('不是單一字串字面值的運算式抽不到（元件會顯示錯誤框）', () => {
    expect(extractSketchCharts('<Sketch chart={`graph ${dir}`} />')).toEqual([]);
    expect(extractSketchCharts('<Sketch chart={"a" + "b"} />')).toEqual([]);
  });
});
