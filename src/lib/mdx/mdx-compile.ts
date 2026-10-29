import { createServerFn } from '@tanstack/react-start';

// 文章內文的編譯是 server-only（@mdx-js/mdx 的 compiler = micromark + acorn，很重，不進 client bundle）。
// 用 createServerFn：SSR 時 in-process 跑；client 端導覽時走 RPC 回 server 拿編譯結果。
// 產出是序列化的 hast 樹（可 dehydrate），前端用 components/mdx/MdxContent 渲染。
// 兩種格式都在這裡編：MDX（compileMdx）與純 markdown（compileMarkdown），瀏覽器不必帶任何解析器。
// 程式碼也在這裡上好色（lib/mdx/codeHighlightTree），瀏覽器不必載高亮器。
//
// 實際的編譯設定在 @koimsurai/mdx-core（沒有框架相依），這樣 scripts/check-mdx.ts 與 MCP 的驗證
// 能用**同一組 plugin**，不會兩邊各抄一份而漂掉。
export const compileMdx = createServerFn({ method: 'POST' })
  .validator((source: string) => source)
  .handler(async ({ data: source }): Promise<string> => {
    const [{ compileMdxSource }, { highlightTree }] = await Promise.all([
      import('./mdx-compile-core'),
      import('./codeHighlightTree'),
    ]);
    return highlightTree(await compileMdxSource(source));
  });

export const compileMarkdown = createServerFn({ method: 'POST' })
  .validator((source: string) => source)
  .handler(async ({ data: source }): Promise<string> => {
    const [{ compileMarkdownSource }, { highlightTree }] = await Promise.all([
      import('./mdx-compile-core'),
      import('./codeHighlightTree'),
    ]);
    return highlightTree(await compileMarkdownSource(source));
  });
