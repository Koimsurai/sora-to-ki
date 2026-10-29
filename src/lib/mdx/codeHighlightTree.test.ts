// 伺服器上色：哪些地方要上色、上色結果要跟瀏覽器端 highlightCode 一模一樣（元件拿到就直接用）。
// 直接跑真的 @pierre/highlights，不 mock。
import { describe, expect, it } from 'vite-plus/test';
import { highlightCode } from './codeHighlight';
import { highlightTree } from './codeHighlightTree';
import { compileMdxSource } from './mdx-compile-core';

interface HastNode {
  type: string;
  tagName?: string;
  name?: string;
  properties?: Record<string, unknown>;
  attributes?: { name?: string; value?: unknown }[];
  children?: HastNode[];
}
const all = (n: HastNode, out: HastNode[] = []): HastNode[] => {
  out.push(n);
  n.children?.forEach((c) => all(c, out));
  return out;
};
const run = async (mdx: string) => all(JSON.parse(await highlightTree(await compileMdxSource(mdx))) as HastNode);
const codes = (nodes: HastNode[]) => nodes.filter((n) => n.tagName === 'code');

describe('highlightTree', () => {
  it('程式碼區塊：data-highlighted 就是瀏覽器端 highlightCode 的結果', async () => {
    const [code] = codes(await run('```ts\nconst a: number = 1;\n```'));
    expect(code.properties?.dataHighlighted).toBe(await highlightCode('const a: number = 1;', 'ts'));
  });

  it('行內程式碼、沒有語言的區塊、mermaid 都不上色（跟 CodeBlock 的判斷一樣）', async () => {
    const nodes = await run('行內 `const a = 1` 字\n\n```\n純文字\n```\n\n```mermaid\ngraph TD; A-->B\n```');
    expect(codes(nodes).every((c) => c.properties?.dataHighlighted === undefined)).toBe(true);
  });

  it('<Diff>：highlighted 屬性是去掉 +/- 標記後的碼的高亮', async () => {
    const nodes = await run('<Diff lang="ts" code={`-const a = 1\n+const a = 2`} />');
    const diff = nodes.find((n) => n.name === 'Diff');
    const highlighted = diff?.attributes?.find((a) => a.name === 'highlighted')?.value;
    expect(highlighted).toBe(await highlightCode('const a = 1\nconst a = 2', 'ts'));
  });

  it('作者自己在文章裡寫的同名屬性會被換掉（這個值會當 HTML 插進頁面）', async () => {
    const nodes = await run('<Diff lang="ts" code="+x" highlighted="<img src=x onerror=alert(1)>" />');
    const values = nodes.find((n) => n.name === 'Diff')?.attributes?.filter((a) => a.name === 'highlighted');
    expect(values).toHaveLength(1);
    expect(String(values?.[0]?.value)).not.toContain('onerror');
  });
});
