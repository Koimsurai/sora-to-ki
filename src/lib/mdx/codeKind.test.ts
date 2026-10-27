import { describe, expect, it } from 'vite-plus/test';
import { compileMdxSource } from './mdx-compile-core';
import { isBlockCode } from './codeKind';

describe('區塊還是行內程式碼', () => {
  it('行內的 `flowchart LR` 不是區塊：不能被當成 mermaid 圖去畫', () => {
    expect(isBlockCode('flowchart LR')).toBe(false);
  });

  it('圍籬裡的圖是區塊，即使只有一行', () => {
    expect(isBlockCode('flowchart LR\n')).toBe(true);
    expect(isBlockCode('flowchart LR\n  A --> B\n')).toBe(true);
  });
});

/**
 * 判準靠的是編譯器的行為（圍籬轉出來的內容以換行結尾、行內的不會），
 * 直接拿站上真的 MDX 編譯鏈驗一次：哪天編譯器改了行為，這條會紅，而不是前台靜靜地又把行內程式碼畫成圖
 */
describe('實際的 MDX 編譯結果', () => {
  it('圍籬的內容以換行結尾、行內的沒有', async () => {
    const src = '一樣是 `flowchart LR`。\n\n```\nflowchart LR\n  A --> B\n```\n';
    const code = await compileMdxSource(src);
    expect(code).toContain('"flowchart LR"');
    expect(code).toMatch(/"flowchart LR\\n {2}A --> B\\n"/);
  });
});
