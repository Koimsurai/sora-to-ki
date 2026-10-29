// format='markdown' 的文章改在伺服器編成 hast（原本是瀏覽器裡的 react-markdown + rehype-raw）。
import { describe, expect, it } from 'vite-plus/test';
import { compileMarkdownSource } from './mdx-compile-core';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}
const tree = async (md: string) => JSON.parse(await compileMarkdownSource(md)) as HastNode;
const all = (n: HastNode, out: HastNode[] = []): HastNode[] => {
  out.push(n);
  n.children?.forEach((c) => all(c, out));
  return out;
};
const tags = async (md: string) =>
  all(await tree(md))
    .filter((n) => n.type === 'element')
    .map((n) => n.tagName);

describe('compileMarkdownSource', () => {
  it('GFM：表格與刪除線', async () => {
    const t = await tags('| a | b |\n|---|---|\n| 1 | 2 |\n\n~~舊~~');
    expect(t).toContain('table');
    expect(t).toContain('del');
  });

  it('GitHub 式提示框變成 markdown-alert', async () => {
    const nodes = all(await tree('> [!NOTE]\n> 內文'));
    const alert = nodes.find((n) => {
      const cls = n.properties?.className;
      return Array.isArray(cls) && cls.includes('markdown-alert');
    });
    expect(alert).toBeDefined();
  });

  it('文中的 HTML 照樣解析成元素（同 rehype-raw）', async () => {
    const t = await tags('段落 <kbd>Ctrl</kbd>\n\n<details><summary>更多</summary>內容</details>');
    expect(t).toEqual(expect.arrayContaining(['kbd', 'details', 'summary']));
  });

  it('會自己執行的東西拿掉：<script> 與 on* 屬性（伺服器輸出的 HTML 會直接被瀏覽器執行）', async () => {
    const nodes = all(await tree('<script>alert(1)</script>\n\n<img src="/a.png" onerror="alert(1)" alt="x">'));
    expect(nodes.some((n) => n.tagName === 'script')).toBe(false);
    const img = nodes.find((n) => n.tagName === 'img');
    expect(img?.properties?.src).toBe('/a.png');
    expect(Object.keys(img?.properties ?? {}).some((k) => /^on/i.test(k))).toBe(false);
  });

  it('程式碼圍籬跟 MDX 一樣是 pre > code.language-xxx，結尾帶換行（CodeBlock 靠它分辨區塊與行內）', async () => {
    const code = all(await tree('```ts\nconst a = 1;\n```')).find((n) => n.tagName === 'code');
    expect(code?.properties?.className).toEqual(['language-ts']);
    expect(code?.children?.[0]?.value).toBe('const a = 1;\n');
  });
});
