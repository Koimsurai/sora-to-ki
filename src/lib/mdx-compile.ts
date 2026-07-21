import { createServerFn } from '@tanstack/react-start';

// MDX 編譯是 server-only（@mdx-js/mdx 的 compiler = micromark + acorn，很重，不進 client bundle）。
// 用 createServerFn：SSR 時 in-process 跑；client 端導覽時走 RPC 回 server 拿編譯結果。
// 產出是 `function-body` 字串（可序列化、可 dehydrate），前端用 runSync 執行成 React 元件。
//
// ⚠️ 只給 format='mdx' 的文章用；內容是站長本人審過的（Agent 產 + 人工 review）。
export const compileMdx = createServerFn({ method: 'POST' })
  .validator((source: string) => source)
  .handler(async ({ data: source }): Promise<string> => {
    const { compile } = await import('@mdx-js/mdx');
    const remarkGfm = (await import('remark-gfm')).default;
    const compiled = await compile(source, {
      outputFormat: 'function-body',
      development: false,
      remarkPlugins: [remarkGfm],
    });
    return String(compiled);
  });
